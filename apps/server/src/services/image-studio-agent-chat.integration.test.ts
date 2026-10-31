import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { dbPool } from '../config/database.js';
import { ensureImageStudioSchema } from '../config/image-studio-schema.js';
import { createImageStudioGenerationJob, createImageStudioProject, createImageStudioTextJob } from './image-studio.js';
import { agentChatInputSchema, getAgentConversation, getAgentPlanHistory, retryAgentChatMessage, sendAgentChatMessage } from './image-studio-agent-chat.js';
import { agentTurnOutputSchema } from './image-studio-agent-memory.js';
import { CONFIRM_REQUIREMENTS } from './image-studio-requirements.js';
import { generateImageStudioDesignPlan, saveImageStudioDesignPlan } from './image-studio-design-agent.js';
import type { AuthUserPayload } from '../middleware/auth.middleware.js';
import type { Agent } from '@mastra/core/agent';

// Opt in: exercises the real transaction/pagination/locking path with mocked model replies.
test('database-backed conversations survive 30 turns, retries, duplicate requests and project isolation', { skip: process.env.IMAGE_STUDIO_RUN_DB_TESTS !== '1' }, async () => {
  assert.ok(dbPool, 'MYSQL_URL is required for the opt-in integration test');
  const pool = dbPool!;
  const created: string[] = [];
  try {
    await ensureImageStudioSchema(pool);
    const [projects]: any = await pool.query(`SELECT p.workflow_json,p.owner_id FROM image_studio_projects p JOIN users u ON u.id=p.owner_id
      WHERE u.role='customer_service' AND p.deleted_at IS NULL AND JSON_EXTRACT(p.workflow_json,'$.modelProfiles.textProfileId') IS NOT NULL
      AND JSON_EXTRACT(p.workflow_json,'$.designAgent') IS NOT NULL ORDER BY p.updated_at DESC LIMIT 1`);
    assert.ok(projects[0], 'An existing development project with a text model is required');
    const source = typeof projects[0].workflow_json === 'string' ? JSON.parse(projects[0].workflow_json) : projects[0].workflow_json;
    const [users]: any = await pool.query('SELECT id,email,name,role FROM users WHERE id=?', [projects[0].owner_id]);
    const user = users[0] as AuthUserPayload;
    const saved = structuredClone(source.designAgent);
    delete saved.sourceConversation;
    saved.selectedSkillIds = [];
    saved.plan.recommendedSkills = [];
    saved.plan.taskGraph.forEach((task: any) => { task.skillIds = []; });
    const create = async () => {
      const project = await createImageStudioProject(user, { name: `agent-memory-integration-${randomUUID()}`, workflow: { modelProfiles: source.modelProfiles, designAgent: saved } });
      created.push(project.id); return project;
    };
    const project = await create();
    const candidateProject = await create();
    const candidateItems = Array.from({ length: 6 }, (_, index) => ({ id: `candidate-${index}`, name: `风格 ${index + 1}`,
      concept: `概念 ${index + 1}`, imagery: `图形 ${index + 1}`, typography: `字体 ${index + 1}`, palette: `配色 ${index + 1}` }));
    const candidateInput = agentChatInputSchema.parse({ clientMessageId: randomUUID(), text: '基于这个 logo，帮我发散6款不同风格的logo设计。', mode: 'brand', skillIds: [] });
    const failedCandidate = await sendAgentChatMessage(candidateProject.id, user, candidateInput, undefined, async () => { throw new Error('候选规划失败'); });
    assert.equal(failedCandidate.status, 'failed');
    const failedCandidateMessage = failedCandidate.messages.find((item) => item.runId === failedCandidate.runId && item.role === 'user')!;
    const candidateReply = await retryAgentChatMessage(candidateProject.id, failedCandidateMessage.id, user, undefined, async (_agent, _prompt, _images, count) => {
      assert.equal(count, 6);
      return agentTurnOutputSchema.parse({ intent: 'refine', reply: '已规划六款候选。', patch: { logoCandidates: candidateItems } });
    });
    assert.equal(candidateReply.status, 'completed', candidateReply.error);
    const candidateSaved = (candidateReply.project.workflow as any).designAgent;
    assert.equal(candidateSaved.plan.logoExploration.candidates.length, 6);
    assert.equal(candidateSaved.status, 'needs_review');
    assert.equal(candidateReply.messages.filter((item) => item.text === candidateInput.text).length, 1);
    assert.equal((candidateReply.project.workflow as any).workbench?.productionStarts?.[candidateSaved.version], undefined);
    candidateSaved.plan.selectedDirectionId = null;
    const approvedCandidates = await saveImageStudioDesignPlan(candidateProject.id, user, { version: candidateReply.project.version, planVersion: candidateSaved.version, plan: candidateSaved.plan, answers: candidateSaved.answers, approve: true });
    assert.equal(approvedCandidates.designPlan.status, 'approved');
    assert.equal((approvedCandidates.project.workflow as any).workbench?.productionStarts?.[approvedCandidates.designPlan.version], undefined);
    let snapshot = await getAgentConversation(project.id, user);
    let calls = 0;
    const generate = async (_agent: Agent, prompt: string) => {
      calls++;
      const context = JSON.parse(prompt);
      if (calls === 1) return agentTurnOutputSchema.parse({ intent: 'refine', reply: '已记录全程保留 Logo，禁止荧光色。',
        patch: { brief: { constraints: ['禁止荧光色'] } }, memoryUpdates: [{ key: 'design.avoid', label: '禁用元素', value: '荧光色', status: 'confirmed', evidenceMessageIds: [context.current.currentUserMessageId] }],
        conversationSummary: '用户已确认：保留现有 Logo，禁止荧光色。' });
      assert.equal(context.projectMemory.fields['design.avoid'].value, '荧光色');
      return agentTurnOutputSchema.parse({ intent: 'explain', reply: '沿用原有 Logo 和禁用荧光色的要求，包装留白让信息更清楚。', conversationSummary: '用户已确认：保留现有 Logo，禁止荧光色；后续对话主要解释包装留白。' });
    };
    let lastInput: ReturnType<typeof agentChatInputSchema.parse> | null = null;
    const firstDirection = saved.plan.selectedDirectionId;
    let revisedVersion = 0;
    for (let index = 0; index < 30; index++) {
      lastInput = agentChatInputSchema.parse({ clientMessageId: randomUUID(), text: index === 0 ? '全程保留现有 Logo，禁止荧光色。' : `第 ${index + 1} 轮：解释当前包装的留白。`,
        revision: snapshot.revision, mode: saved.mode || 'product', skillIds: [], sourceConversation: null });
      const response = await sendAgentChatMessage(project.id, user, lastInput, generate);
      assert.equal(response.status, 'completed', response.error);
      snapshot = response;
      if (index === 0) revisedVersion = (response.project.workflow as any).designAgent.version;
      assert.equal((response.project.workflow as any).designAgent.version, revisedVersion, 'Explanation turns must not create new plan revisions');
      assert.equal((response.project.workflow as any).designAgent.plan.selectedDirectionId, firstDirection);
    }
    assert.equal(snapshot.memory.fields['design.avoid'].value, '荧光色');
    assert.equal(snapshot.messages.length, 60);
    assert.equal(snapshot.hasMore, true);
    const earlier = await getAgentConversation(project.id, user, snapshot.beforeSeq!);
    assert.ok(earlier.messages.length > 0);
    const callCount = calls;
    const duplicate = await sendAgentChatMessage(project.id, user, lastInput!, generate);
    assert.equal(duplicate.status, 'completed');
    assert.equal(calls, callCount, 'Duplicate client message IDs must not call the model again');
    assert.equal(duplicate.revision, snapshot.revision);

    const failedInput = agentChatInputSchema.parse({ clientMessageId: randomUUID(), text: '验证失败后的消息重试', revision: snapshot.revision, mode: saved.mode || 'product', skillIds: [] });
    const failed = await sendAgentChatMessage(project.id, user, failedInput, async () => { throw new Error('Integration simulated failure'); });
    assert.equal(failed.status, 'failed');
    assert.equal(failed.revision, snapshot.revision);
    assert.deepEqual(failed.memory, snapshot.memory);
    assert.equal((failed.project.workflow as any).designAgent.version, revisedVersion);
    const failedMessage = failed.messages.find((message) => message.runId === failed.runId && message.role === 'user')!;
    const retried = await retryAgentChatMessage(project.id, failedMessage.id, user, generate);
    assert.equal(retried.status, 'completed', retried.error);
    assert.equal(retried.messages.filter((message) => message.text === failedInput.text && message.role === 'user').length, 1);
    assert.equal(retried.messages.find((message) => message.id === failedMessage.id)?.runStatus, 'completed');

    let release!: () => void; let entered!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });
    const first = sendAgentChatMessage(project.id, user, agentChatInputSchema.parse({ clientMessageId: randomUUID(), text: '并发测试第一条', mode: saved.mode || 'product', skillIds: [] }), async (agent, prompt) => {
      entered(); await releasePromise; return generate(agent, prompt);
    });
    await enteredPromise;
    try {
      await assert.rejects(sendAgentChatMessage(project.id, user, agentChatInputSchema.parse({ clientMessageId: randomUUID(), text: '并发测试第二条', mode: saved.mode || 'product', skillIds: [] }), generate), /正在回复/);
    } finally { release(); }
    assert.equal((await first).status, 'completed');

    const isolated = await create();
    const isolatedSnapshot = await getAgentConversation(isolated.id, user);
    assert.equal(isolatedSnapshot.memory.fields['design.avoid'], undefined);
    const revisions = await getAgentPlanHistory(project.id, user);
    assert.equal(revisions.length, 2, 'Only the imported plan and the actual requirement change should create revisions');
    // A new project must finish its persisted interview before a plan can be created.
    const collecting = await createImageStudioProject(user, { name: `agent-memory-integration-${randomUUID()}`, workflow: { modelProfiles: source.modelProfiles } });
    created.push(collecting.id);
    await assert.rejects(generateImageStudioDesignPlan(collecting.id, user, { brief: '请立即生成品牌设计方案', mode: 'brand', skillIds: [], answers: {} }), /完成需求收集/);
    const eagerPlan = structuredClone(saved.plan);
    eagerPlan.questions = [];
    eagerPlan.selectedDirectionId = eagerPlan.directions[0].id;
    const eager = async () => agentTurnOutputSchema.parse({ intent: 'create_plan', reply: '已提前生成方案并制作', createPlan: eagerPlan,
      productionRequests: [{ taskId: '*', instruction: '立即制作', label: '制作', slotKeys: [] }] });
    const message = (text: string, answers: Record<string, string> = {}, labels: Record<string, string> = {}) => agentChatInputSchema.parse({ clientMessageId: randomUUID(), text, mode: 'brand', skillIds: [], confirmedAnswers: answers, confirmedAnswerLabels: labels });
    const ask = await sendAgentChatMessage(collecting.id, user, message('设计毛球星球宠物用品品牌'), async () => agentTurnOutputSchema.parse({ intent: 'clarify', reply: '先收集需求', skillConfirmationForm: { title: '设计需求', intro: '', skillIds: [], questions: [
      { id: 'audience', label: '目标人群', prompt: '面向谁？', required: true, answerType: 'text', options: [] },
      { id: 'count', label: '图片数量', prompt: '几张图？', required: true, answerType: 'text', options: [] },
    ] } }));
    assert.equal(ask.status, 'completed', ask.error);
    const questions = ask.messages.at(-1)!.skillConfirmationForm!.questions;
    assert.ok(questions.every((question) => question.answerType === 'select' && question.options.length >= 3), 'Free-text model questions must become choice forms before saving');
    const early = await sendAgentChatMessage(collecting.id, user, message('先生成方案开始制作'), eager);
    assert.equal((early.project.workflow as any).designAgent, undefined);
    assert.deepEqual(early.actions, []);
    assert.equal(early.messages.at(-1)!.skillConfirmationForm!.questions[0].id, questions[0].id, 'Pending question IDs survive resume');
    assert.deepEqual(early.messages.at(-1)!.skillConfirmationForm!.questions[0].options, questions[0].options, 'Recommended choices survive resume');
    const partial = await sendAgentChatMessage(collecting.id, user, message('确认目标人群', { [questions[0].id]: '年轻养宠人群' }, { [questions[0].id]: '目标人群' }), eager);
    assert.equal((partial.project.workflow as any).designAgent, undefined);
    assert.equal(partial.messages.at(-1)!.skillConfirmationForm!.questions[0].id, questions[1].id);
    const full = await sendAgentChatMessage(collecting.id, user, message('确认图片数量', { [questions[1].id]: '3张独立Logo' }, { [questions[1].id]: '图片数量' }), eager);
    const confirmation = full.messages.at(-1)!.skillConfirmationForm!;
    assert.equal(confirmation.purpose, 'requirements_confirmation');
    assert.equal((full.project.workflow as any).designAgent, undefined);
    const ready = await sendAgentChatMessage(collecting.id, user, message('确认需求完整', { [confirmation.questions[0].id]: CONFIRM_REQUIREMENTS }), eager);
    assert.equal(ready.status, 'completed', ready.error);
    const draftPlan = (ready.project.workflow as any).designAgent;
    assert.equal(draftPlan.status, 'needs_review');
    assert.equal(draftPlan.plan.selectedDirectionId, null);
    assert.deepEqual(ready.actions, []);
    const imageRequest = { idempotencyKey: randomUUID(), modelProfileId: 'qa-no-model-call', context: { planVersion: draftPlan.version },
      generations: [{ slotKey: 'images-1', prompt: 'QA', referenceAssetIds: [], parameters: {} }] };
    await assert.rejects(createImageStudioGenerationJob(collecting.id, user, imageRequest), /请先确认设计方案/);
    await assert.rejects(createImageStudioTextJob(collecting.id, user, { idempotencyKey: randomUUID(), modelProfileId: 'qa-no-model-call', operation: 'prompt_generate', context: { planVersion: draftPlan.version }, referenceAssetIds: [] }), /请先确认设计方案/);
    draftPlan.plan.selectedDirectionId = draftPlan.plan.directions[0].id;
    const approved = await saveImageStudioDesignPlan(collecting.id, user, { version: ready.project.version, planVersion: draftPlan.version, plan: draftPlan.plan, answers: {}, approve: true });
    assert.equal(approved.designPlan.status, 'approved');
    assert.equal((approved.project.workflow as any).workbench?.productionStarts, undefined, 'Approving the plan must not start production');
    await assert.rejects(createImageStudioGenerationJob(collecting.id, user, imageRequest), /设计方案已变化/);
    assert.ok(ready.requirements.brand.confirmed);
    console.log('Verified: 30 turns, persistence, pagination, idempotency, failed-turn retry, concurrency, plan history, and project isolation.');
  } finally {
    if (created.length) {
      const placeholders = created.map(() => '?').join(',');
      for (const table of ['image_studio_agent_memory_events', 'image_studio_agent_messages', 'image_studio_agent_runs', 'image_studio_agent_plan_revisions', 'image_studio_agent_sessions', 'image_studio_audit_logs']) {
        await pool.query(`DELETE FROM ${table} WHERE project_id IN (${placeholders})`, created);
      }
      await pool.query(`DELETE FROM image_studio_projects WHERE id IN (${placeholders}) AND name LIKE 'agent-memory-integration-%'`, created);
    }
    await pool.end();
  }
});
