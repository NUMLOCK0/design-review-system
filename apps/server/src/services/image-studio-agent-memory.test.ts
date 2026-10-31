import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { Agent } from '@mastra/core/agent';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { agentTurnOutputSchema, applyAgentTurn, buildAgentChatContext, carryAgentTaskStates, seedAgentMemory, type AgentMessage } from './image-studio-agent-memory.js';
import type { SavedImageStudioDesignPlan } from './image-studio-design-agent.js';
import { addInitialLogoExploration, advanceConfirmedChoices, generateAgentConversationTurn, generateLogoCandidateTurn, requestedLogoCandidateCount } from './image-studio-agent-chat.js';
import { buildOrchestrationDraftGraph } from './image-studio-orchestration.js';

export function savedFixture(): SavedImageStudioDesignPlan {
  const direction = (id: string) => ({ id, name: id === 'natural' ? '山野自然' : '现代精品', concept: '保持清晰自然的品牌识别',
    positioning: '精品咖啡', audience: '年轻人', keywords: ['自然'], palette: ['#123456', '#ABCDEF', '#FFFFFF'].map((hex) => ({ name: hex, hex, usage: '品牌配色' })),
    typography: '无衬线', imagery: '简洁构图', rationale: '符合品牌定位', deliverables: ['包装'], logoConcept: '山形线条' });
  return { version: 4, mode: 'brand', status: 'approved', inputBrief: '给年轻人的精品咖啡品牌设计', answers: { budget: '2000元' }, selectedSkillIds: [],
    plan: { summary: '山野咖啡品牌方案', brief: { brandName: '山野', productOrService: '咖啡', positioning: '精品咖啡', targetAudience: '年轻人',
      marketAndChannel: '线上', businessGoal: '建立品牌识别', knownFacts: ['提供精品咖啡'], constraints: ['保留现有 Logo', '不使用荧光色'], factsToConfirm: [] },
    questions: [], recommendedSkills: [], directions: [direction('natural'), direction('modern')], selectedDirectionId: 'natural', nextSteps: ['制作包装'],
    taskGraph: [
      { id: 'logo', title: 'Logo 概念', kind: 'image_generation', reason: '建立识别', dependsOn: [], skillIds: [], inputs: [], outputs: ['Logo'], reviewPolicy: 'confirm' },
      { id: 'packaging', title: '包装效果图', kind: 'image_generation', reason: '展示包装', dependsOn: ['logo'], skillIds: [], inputs: [], outputs: ['包装图'], reviewPolicy: 'confirm' },
      { id: 'review', title: '包装审稿', kind: 'review', reason: '检查包装', dependsOn: ['packaging'], skillIds: [], inputs: [], outputs: [], reviewPolicy: 'confirm' },
    ] }, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' };
}
const turn = (value: unknown) => agentTurnOutputSchema.parse(value);

test('Logo 候选保留原计划，单独调度六个方向并引用所选图片', async () => {
  assert.equal(requestedLogoCandidateCount('基于这个 logo，帮我发散6款不同风格的logo设计。'), 6);
  assert.equal(requestedLogoCandidateCount('制作 6 张包装图'), null);
  assert.equal(requestedLogoCandidateCount('不要生成方向，先讨论 6 款 logo 风格'), null);
  const candidates = Array.from({ length: 6 }, (_, i) => ({ id: `candidate-${i}`, name: `风格 ${i}`, concept: `概念 ${i}`, imagery: `图形 ${i}`, typography: `字体 ${i}`, palette: `配色 ${i}` }));
  const fakeAgent = { generate: async () => ({ object: { reply: '已规划六个方向。', candidates } }) } as unknown as Agent;
  const output = await generateLogoCandidateTurn(fakeAgent, '{}', [], 6);
  const previous = savedFixture();
  const result = applyAgentTurn({ previous, output, memory: seedAgentMemory(previous), userMessage: { id: 'user-1', seq: 10, text: '6 款 Logo' },
    mode: 'brand', selectedSkillIds: [], confirmedAnswers: {}, now: '2026-10-30T00:00:00Z', logoReferenceAssetIds: ['reference-logo'] });
  assert.equal(result.savedPlan?.status, 'needs_review');
  assert.deepEqual(result.savedPlan?.plan.directions, previous.plan.directions);
  assert.deepEqual(result.savedPlan?.plan.taskGraph.slice(0, previous.plan.taskGraph.length), previous.plan.taskGraph);
  assert.equal(result.savedPlan?.plan.logoExploration?.candidates.length, 6);
  assert.deepEqual(result.savedPlan?.plan.logoExploration?.referenceAssetIds, ['reference-logo']);
  assert.deepEqual(buildOrchestrationDraftGraph(result.savedPlan!.plan).map((task) => task.id), [result.savedPlan!.plan.logoExploration!.taskId]);
  await assert.rejects(generateLogoCandidateTurn({ generate: async () => ({ object: { reply: '不足', candidates: candidates.slice(0, 5) } }) } as unknown as Agent, '{}', [], 6), /没有返回完整/);
});

test('新品牌需求确认后也可以先制作六个候选，而不预先选择方向', () => {
  const plan = structuredClone(savedFixture().plan);
  plan.directions = Array.from({ length: 6 }, (_, i) => ({ ...plan.directions[i % 2], id: `direction-${i}`, name: `方向 ${i}` }));
  addInitialLogoExploration(plan, 6, ['source-logo']);
  assert.equal(plan.selectedDirectionId, null);
  assert.equal(plan.logoExploration?.candidates.length, 6);
  assert.deepEqual(buildOrchestrationDraftGraph(plan).map((task) => task.id), ['logo_candidates_v1']);
});

test('候选规划请求把参考图片发送给视觉模型并解析六个独立方向', async () => {
  let body: any;
  const candidates = Array.from({ length: 6 }, (_, i) => ({ id: `style-${i}`, name: `风格 ${i}`, concept: `概念 ${i}`, imagery: `图形 ${i}`, typography: '', palette: '' }));
  const provider = createOpenAICompatible({ name: 'candidate-test', baseURL: 'https://mock.invalid/v1', apiKey: 'test', supportsStructuredOutputs: false,
    fetch: async (_url, init) => { body = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ id: 'mock', object: 'chat.completion', created: 0, model: 'test',
      choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify({ reply: '已规划。', candidates }) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { headers: { 'Content-Type': 'application/json' } }); } });
  const agent = new Agent({ id: 'candidate-test', name: 'Test', instructions: 'Plan the candidates.', model: provider.chatModel('test') as any });
  const data = (await sharp({ create: { width: 8, height: 8, channels: 3, background: '#abcdef' } }).jpeg().toBuffer()).toString('base64');
  const output = await generateLogoCandidateTurn(agent, '{}', [{ mediaType: 'image/jpeg', data }], 6);
  assert.equal(output.patch?.logoCandidates?.length, 6);
  assert.ok(body.messages.some((message: any) => message.role === 'user' && Array.isArray(message.content)
    && message.content.some((item: any) => item.type === 'image_url' && item.image_url.url === `data:image/jpeg;base64,${data}`)));
});

test('six style directions survive creation and incremental exploration without being selected', () => {
  const plan = structuredClone(savedFixture().plan);
  plan.directions = Array.from({ length: 6 }, (_, index) => ({ ...plan.directions[index % 2], id: `style-${index}`, name: `风格 ${index}` }));
  plan.selectedDirectionId = null;
  const output = turn({ intent: 'create_plan', reply: '请比较六个方向。', createPlan: plan });
  const result = applyAgentTurn({ previous: null, output, memory: { fields: {} },
    userMessage: { id: 'explore', seq: 1, text: '发散六个风格' }, mode: 'brand', selectedSkillIds: [], confirmedAnswers: {}, now: '2026-10-30T00:00:00Z' });
  assert.equal(result.savedPlan?.plan.directions.length, 6);
  assert.equal(result.savedPlan?.status, 'needs_review');
  assert.equal(result.savedPlan?.plan.selectedDirectionId, null);
  const next = applyAgentTurn({ previous: result.savedPlan!, output: turn({ intent: 'refine', reply: '加入融合方向。', patch: { directions: [{ ...plan.directions[0], id: 'fusion', name: '融合风格' }] } }),
    memory: result.memory, userMessage: { id: 'refine', seq: 2, text: '融合两个方向' }, mode: 'brand', selectedSkillIds: [], confirmedAnswers: {}, now: '2026-10-30T00:00:00Z' });
  assert.equal(next.savedPlan?.plan.directions.length, 7);
  assert.equal(next.savedPlan?.plan.selectedDirectionId, null);
});

test('confirmed choices advance to a plan without starting image production', async () => {
  const first = turn({ intent: 'select', reply: '已记录选择。' });
  let calls = 0;
  const result = await advanceConfirmedChoices({ output: first, hasPlan: false, confirmedAnswers: { direction: '自然' },
    generateNext: async () => { calls++; return turn({ intent: 'create_plan', reply: '已整理方案。', createPlan: savedFixture().plan,
      productionRequests: [{ taskId: '*', instruction: '制作', label: '制作', slotKeys: [] }] }); } });
  assert.equal(calls, 1);
  assert.equal(result.intent, 'create_plan');
  assert.ok(result.createPlan);
  assert.deepEqual(result.productionRequests, []);
});

test('automatic continuation is bounded and preserves the choice on failure', async () => {
  const first = turn({ intent: 'select', reply: '已记录选择。' });
  let calls = 0;
  const generateNext = async () => { calls++; throw new Error('unavailable'); };
  const skipped = await advanceConfirmedChoices({ output: first, hasPlan: true, confirmedAnswers: { direction: '自然' }, generateNext });
  assert.equal(skipped, first);
  assert.equal(calls, 0);
  const failed = await advanceConfirmedChoices({ output: first, hasPlan: false, confirmedAnswers: { direction: '自然' }, generateNext });
  assert.equal(calls, 1);
  assert.match(failed.reply, /自动整理下一步未完成/);
  assert.equal(failed.intent, 'select');
});

test('reports an upstream timeout even when the agent returns no structured object', async () => {
  const agent = { generate: async () => ({ object: undefined }) } as unknown as Agent;
  await assert.rejects(generateAgentConversationTurn(agent, '{}', [], () => true), /模型服务响应超时/);
  await assert.rejects(generateAgentConversationTurn(agent, '{}', [], () => false), /模型未返回完整/);
});

test('accepts an explicit null form and preserves a confirmed choice without a plan', () => {
  const output = turn({ intent: 'select', reply: '已记录你的选择。', skillConfirmationForm: null,
    patch: { selectedDirectionId: 'direction_a', answers: { form_1: '毛球与星球' } } });
  const result = applyAgentTurn({ previous: null, output, memory: { fields: {} },
    userMessage: { id: 'message-1', seq: 1, text: '选择毛球与星球' }, mode: 'brand', selectedSkillIds: [],
    confirmedAnswers: { form_1: '毛球与星球' }, confirmedAnswerLabels: { form_1: '设计方向' }, now: '2026-10-29T00:00:00Z' });
  assert.equal(output.skillConfirmationForm, null);
  assert.equal(result.memory.fields['answer.form_1'].value, '毛球与星球');
  assert.equal(result.memory.fields['answer.form_1'].status, 'confirmed');
  assert.equal(result.savedPlan, null);
});
const userMessage = { id: 'message-current', seq: 31, text: '包装简单一点，Logo 保留' };
function apply(output: unknown, previous = savedFixture(), memory = seedAgentMemory(previous)) {
  return applyAgentTurn({ previous, output: turn(output), memory, userMessage, mode: 'brand', selectedSkillIds: previous.selectedSkillIds,
    confirmedAnswers: {}, now: '2026-10-28T00:00:00Z' });
}

test('an explanation does not replace a plan, reset its direction, or create a revision', () => {
  const previous = savedFixture();
  const result = apply({ intent: 'explain', reply: '这个字体更适合小尺寸包装阅读。', patch: { brief: { brandName: '不应覆盖' }, selectedDirectionId: 'modern' }, affectedTaskIds: ['logo'] }, previous);
  assert.equal(result.changed, false);
  assert.deepEqual(result.savedPlan, previous);
  assert.deepEqual(result.affectedTaskIds, []);
});

test('a local packaging change preserves the logo, selected direction, previous answers and unrelated completed work', () => {
  const previous = savedFixture();
  const task = { ...previous.plan.taskGraph[1], reason: '包装使用更少图案与更多留白' };
  const result = apply({ intent: 'refine', reply: '已简化包装，保留现有 Logo。', patch: { tasks: [task] }, affectedTaskIds: ['packaging'] }, previous);
  assert.equal(result.savedPlan?.version, 5);
  assert.equal(result.savedPlan?.plan.selectedDirectionId, 'natural');
  assert.deepEqual(result.savedPlan?.answers, previous.answers);
  assert.deepEqual(result.savedPlan?.plan.taskGraph[0], previous.plan.taskGraph[0]);
  assert.deepEqual(new Set(result.affectedTaskIds), new Set(['packaging', 'review']));
  const original = { '4:logo': { status: 'completed', jobId: 'logo-job' }, '4:packaging': { status: 'running', jobId: 'packaging-job' } };
  const states = carryAgentTaskStates(original, previous, result.savedPlan!, result.affectedTaskIds);
  assert.equal(states['5:logo'].status, 'completed');
  assert.equal(states['5:logo'].jobId, 'logo-job');
  assert.equal(states['5:packaging'].status, 'stale');
  assert.equal(states['5:packaging'].jobId, undefined);
  assert.equal(states['5:packaging'].previousJobId, 'packaging-job');
  assert.deepEqual(states['4:packaging'], original['4:packaging']);
});

test('partial direction and task patches preserve all omitted fields', () => {
  const previous = savedFixture();
  const palette = previous.plan.directions[0].palette.map((color, index) => index === 0 ? { ...color, hex: '#1F4D3A' } : color);
  const result = apply({ intent: 'refine', reply: '主色改为深绿色，包装留白增加。', patch: {
    directions: [{ id: 'natural', palette }], tasks: [{ id: 'packaging', reason: '包装增加留白' }],
  }, affectedTaskIds: ['packaging'] }, previous);
  assert.deepEqual(result.savedPlan?.plan.directions[0], { ...previous.plan.directions[0], palette });
  assert.deepEqual(result.savedPlan?.plan.taskGraph[1], { ...previous.plan.taskGraph[1], reason: '包装增加留白' });
  assert.equal(result.savedPlan?.plan.selectedDirectionId, 'natural');
  assert.throws(() => apply({ intent: 'refine', reply: '新增任务', patch: { tasks: [{ id: 'incomplete-new-task', title: '缺少执行字段' }] } }, previous));
});

test('new requirements append without discarding old constraints, and explicit replacements keep their history', () => {
  const previous = savedFixture();
  const memory = { fields: { 'visual.color': { value: '橙色', label: '主色', status: 'confirmed' as const, sourceMessageId: 'old-user-message', sourceSeq: 1 } } };
  const result = apply({ intent: 'refine', reply: '已换成深绿色。', patch: { brief: { constraints: ['使用深绿色'] } }, memoryUpdates: [
    { key: 'visual.color', label: '主色', value: '深绿色', status: 'confirmed', evidenceMessageIds: [userMessage.id] },
  ] }, previous, memory);
  assert.deepEqual(result.savedPlan?.plan.brief.constraints, ['保留现有 Logo', '不使用荧光色', '使用深绿色']);
  assert.equal(result.memory.fields['visual.color'].value, '深绿色');
  assert.equal(result.events[0].before?.value, '橙色');
  assert.equal(result.events[0].after.sourceMessageId, userMessage.id);
  assert.equal(memory.fields['visual.color'].value, '橙色');
});

test('a model recommendation cannot replace an explicitly confirmed project fact', () => {
  const memory = { fields: { 'visual.color': { value: '深绿色', label: '主色', status: 'confirmed' as const, sourceMessageId: 'original-user', sourceSeq: 1 } } };
  const result = apply({ intent: 'refine', reply: '可以再讨论配色。', memoryUpdates: [
    { key: 'visual.color', label: '主色', value: '橙色', status: 'confirmed', evidenceMessageIds: ['assistant-recommendation'] },
  ] }, savedFixture(), memory);
  assert.equal(result.memory.fields['visual.color'].value, '深绿色');
  assert.equal(result.events.length, 0);
});

test('a memory-only constraint update is merged into the canonical plan and preserves earlier decisions', () => {
  const previous = savedFixture();
  const result = apply({ intent: 'refine', reply: '主色改为深绿色，保留原有要求。', patch: { summary: '深绿色品牌方案' }, memoryUpdates: [
    { key: 'brief.constraints', label: '设计约束', value: '主色调整为深绿色', status: 'confirmed', evidenceMessageIds: [userMessage.id] },
  ] }, previous);
  assert.deepEqual(result.savedPlan?.plan.brief.constraints, ['保留现有 Logo', '不使用荧光色', '主色调整为深绿色']);
  assert.equal(result.memory.fields['brief.constraints'].value, '保留现有 Logo；不使用荧光色；主色调整为深绿色');
});

test('an older user message cannot override a newer confirmed project fact', () => {
  const previous = savedFixture();
  const memory = { fields: { 'visual.color': { value: '深绿色', label: '主色', status: 'confirmed' as const, sourceMessageId: 'newer-user', sourceSeq: 20 } } };
  const result = applyAgentTurn({ previous, memory, userMessage, mode: 'brand', selectedSkillIds: [], confirmedAnswers: {}, now: '2026-10-28T00:00:00Z',
    evidenceMessages: [{ id: 'older-user', seq: 1, role: 'user' }], output: turn({ intent: 'refine', reply: '保持已经确认的最新配色。', memoryUpdates: [
      { key: 'visual.color', label: '主色', value: '橙色', status: 'confirmed', evidenceMessageIds: ['older-user'] },
    ] }) });
  assert.equal(result.memory.fields['visual.color'].value, '深绿色');
  assert.equal(result.changed, false);
});

test('prefilled recommendations do not resolve questions until the user actually answers them', () => {
  const previous = savedFixture();
  previous.plan.questions = [{ id: 'channel', label: '渠道', prompt: '用于哪个渠道？', required: true, answerType: 'select', options: ['淘宝', '京东'], recommendation: '淘宝' }];
  const result = apply({ intent: 'refine', reply: '请确认渠道。', patch: { resolvedQuestionIds: ['channel'] } }, previous);
  assert.equal(result.savedPlan?.plan.questions.length, 1);
  const answered = apply({ intent: 'refine', reply: '已记录淘宝。', patch: { answers: { channel: '淘宝' }, resolvedQuestionIds: ['channel'] } }, previous);
  assert.equal(answered.savedPlan?.plan.questions.length, 0);
  assert.equal(answered.savedPlan?.answers.channel, '淘宝');
});

test('invalid cyclic task changes fail without mutating the existing plan', () => {
  const previous = savedFixture(); const original = structuredClone(previous);
  assert.throws(() => apply({ intent: 'refine', reply: '更新任务', patch: { tasks: [{ ...previous.plan.taskGraph[0], dependsOn: ['review'] }] } }, previous), /循环依赖/);
  assert.deepEqual(previous, original);
});

test('explicitly removing an obsolete constraint works without rewriting the full brief', () => {
  const previous = savedFixture();
  const result = apply({ intent: 'refine', reply: '已取消禁用荧光色的要求，Logo 仍保留。', patch: { removedConstraints: ['不使用荧光色'] } }, previous);
  assert.deepEqual(result.savedPlan?.plan.brief.constraints, ['保留现有 Logo']);
});

test('switching a selected skill changes subsequent task standards while preserving task IDs', () => {
  const previous = savedFixture(); previous.selectedSkillIds = ['old-skill']; previous.plan.taskGraph[0].skillIds = ['old-skill'];
  const result = apply({ intent: 'refine', reply: '后续采用新的品牌设计领域标准。', patch: { selectedSkillIds: ['new-skill'] } }, previous);
  assert.deepEqual(result.savedPlan?.selectedSkillIds, ['new-skill']);
  assert.equal(result.savedPlan?.plan.taskGraph[0].id, 'logo');
  assert.deepEqual(result.savedPlan?.plan.taskGraph[0].skillIds, ['new-skill']);
  assert.ok(result.affectedTaskIds.includes('logo'));
});

test('long conversations retain the initial confirmed constraints and newest message within a token budget', () => {
  const saved = savedFixture(); const memory = seedAgentMemory(saved);
  const messages: AgentMessage[] = Array.from({ length: 70 }, (_, index) => ({ id: `message-${index}`, seq: index + 1, role: index % 2 ? 'assistant' : 'user',
    text: index === 0 ? '必须保留现有 Logo，不使用荧光色' : index === 69 ? '包装调整时保留哪些要求？' : `第 ${index} 轮讨论${'细节'.repeat(100)}`,
    attachments: [], selectedNodeIds: [], createdAt: '2026-10-28T00:00:00Z' }));
  const result = buildAgentChatContext({ current: { plan: saved.plan }, memory, summary: { text: '已经确认品牌定位、受众与视觉方向', throughSeq: 40 }, messages, budget: 5000 });
  assert.equal(result.context.projectMemory.fields['brief.constraints'].value, '保留现有 Logo；不使用荧光色');
  assert.equal(result.context.messages.at(-1)?.id, 'message-69');
  assert.ok(result.context.messages.length < messages.length);
  assert.ok(result.estimatedInputTokens <= 5000);
  assert.equal(messages.length, 70);
});

test('the actual agent adapter returns the model reply and structured patch', async () => {
  const output = turn({ intent: 'explain', reply: '已选的深绿色能强化自然定位，Logo 保持不变。', conversationSummary: '品牌为山野咖啡，保留既有 Logo。' });
  const provider = createOpenAICompatible({ name: 'memory-test', baseURL: 'https://mock.invalid/v1', apiKey: 'test', supportsStructuredOutputs: false,
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.ok(body.messages.some((message: any) => JSON.stringify(message).includes('memoryUpdates')));
      return new Response(JSON.stringify({ id: 'mock', model: 'mock', object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(output) }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { headers: { 'Content-Type': 'application/json' } });
    } });
  const agent = new Agent({ id: 'agent-memory-test', name: 'Test', instructions: '基于当前项目回复。', model: provider.chatModel('mock') as any });
  const result = await generateAgentConversationTurn(agent, JSON.stringify({ currentPlan: savedFixture() }), []);
  assert.equal(result.reply, output.reply);
  assert.equal(result.intent, 'explain');
});

test('plain model answers to explicit read-only questions are accepted without inventing plan changes', async () => {
  const agent = { generate: async () => { throw Object.assign(new Error('structured output validation failed'), {
    id: 'STRUCTURED_OUTPUT_SCHEMA_VALIDATION_FAILED', details: { value: '主色是深绿色，禁用荧光色。方案保持不变。' },
  }); } } as unknown as Agent;
  const result = await generateAgentConversationTurn(agent, JSON.stringify({ current: { currentUserText: '刚才确定的主色和禁用元素是什么？只回答，保持方案不变。' } }), []);
  assert.equal(result.intent, 'explain');
  assert.equal(result.patch, undefined);
  assert.equal(result.reply, '主色是深绿色，禁用荧光色。方案保持不变。');
  await assert.rejects(generateAgentConversationTurn(agent, JSON.stringify({ current: { currentUserText: '主色调整为深绿色，现在重新生成图片。' } }), []), /未返回完整的对话结果/);
});
