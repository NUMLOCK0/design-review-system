import assert from 'node:assert/strict';
import test from 'node:test';
import { agentTurnOutputSchema, applyAgentTurn, type AgentTurnOutput } from './image-studio-agent-memory.js';
import { assertDesignProductionApproval, CONFIRM_REQUIREMENTS, gateDesignRequirements, requirementsConfirmed, type RequirementsState } from './image-studio-requirements.js';
import { imageStudioDesignPlanSchema } from './image-studio-design-agent.js';

const plan = imageStudioDesignPlanSchema.parse({ summary: '宠物品牌方案', brief: { brandName: '毛球星球', productOrService: '宠物用品', positioning: '可爱但不幼稚', targetAudience: '年轻养宠人群', marketAndChannel: '电商', businessGoal: '品牌识别', knownFacts: [], constraints: [], factsToConfirm: [] }, questions: [], recommendedSkills: [], directions: ['a', 'b'].map((id) => ({ id, name: id, concept: '清晰图形', positioning: '', audience: '', keywords: [], palette: ['#123456', '#ABCDEF', '#FFFFFF'].map((hex) => ({ name: hex, hex, usage: '' })), typography: '无衬线', imagery: '简洁', rationale: '', deliverables: ['Logo'] })), nextSteps: [], selectedDirectionId: 'a', taskGraph: [] });
const turn = (extra: Partial<AgentTurnOutput> = {}) => agentTurnOutputSchema.parse({ intent: 'create_plan', reply: '方案已生成并开始制作', createPlan: plan, productionRequests: [{ taskId: '*', slotKeys: [], label: '制作', instruction: '立即出图' }], ...extra });
const gate = (output: AgentTurnOutput, state: RequirementsState = { confirmed: false }, answers: Record<string, string> = {}) => gateDesignRequirements({ output, state, answers, memory: { fields: {} }, hasPlan: false });

test('提前返回的方案和制作请求被拦截，先确认需求完整性', () => {
  const result = gate(turn());
  assert.equal(result.output.createPlan, undefined);
  assert.deepEqual(result.output.productionRequests, []);
  assert.doesNotMatch(result.output.reply, /方案已生成|开始制作/);
  assert.equal(result.output.skillConfirmationForm?.purpose, 'requirements_confirmation');
  assert.equal(result.state.confirmed, false);
});

test('尚未提交的必填表单不能被新方案覆盖，部分回答保留未答项的稳定 ID', () => {
  const pendingForm = { title: '需求', intro: '', skillIds: [], questions: ['audience', 'channel'].map((id) => ({ id, label: id, prompt: id, required: true, answerType: 'text' as const, options: [] })) };
  const result = gate(turn(), { confirmed: false, pendingForm }, { audience: '年轻人' });
  assert.equal(result.output.createPlan, undefined);
  assert.equal(result.reuseForm, true);
  assert.deepEqual(result.output.skillConfirmationForm?.questions.map((q) => q.id), ['channel']);
});

test('确认需求后可生成待审方案，不能自动选择方向或制作', () => {
  const first = gate(turn());
  const answers = { requirements_ready: CONFIRM_REQUIREMENTS };
  assert.equal(requirementsConfirmed(first.state, answers), true);
  const next = gate(turn(), first.state, answers);
  assert.ok(next.output.createPlan);
  assert.equal(next.output.createPlan.selectedDirectionId, null);
  assert.deepEqual(next.output.productionRequests, []);
  const applied = applyAgentTurn({ previous: null, output: next.output, memory: { fields: {} }, userMessage: { id: 'user', seq: 1, text: '确认需求' }, mode: 'brand', selectedSkillIds: [], confirmedAnswers: answers, now: new Date().toISOString() });
  assert.equal(applied.savedPlan?.status, 'needs_review');
});

test('选择继续补充不会确认需求；确认后发现新必填问题仍回到收集', () => {
  const first = gate(turn());
  const more = gate(turn(), first.state, { requirements_ready: '还需补充，继续收集' });
  assert.equal(more.output.createPlan, undefined);
  assert.equal(more.output.skillConfirmationForm?.title, '继续补充需求');
  const missing = structuredClone(plan);
  missing.questions = [{ id: 'count', label: '数量', prompt: '制作几张图？', required: true, answerType: 'text', options: [] }];
  const blocked = gate(turn({ createPlan: missing }), { confirmed: true });
  assert.equal(blocked.output.createPlan, undefined);
  assert.equal(blocked.state.confirmed, false);
  assert.equal(blocked.output.skillConfirmationForm?.questions[0].id, 'count');
});

test('需求已确认仍不能以制作请求代替方案；已有答案不再重复追问', () => {
  const skipped = gate(turn({ createPlan: undefined, intent: 'generate' }), { confirmed: true });
  assert.deepEqual(skipped.output.productionRequests, []);
  assert.doesNotMatch(skipped.output.reply, /已提前|已生成并开始/);
  const pendingForm = { title: '需求', intro: '', skillIds: [], questions: [{ id: 'count', label: '数量', prompt: '几张？', required: true, answerType: 'text' as const, options: [] }] };
  const ready = gate(turn({ createPlan: undefined, intent: 'select', productionRequests: [], skillConfirmationForm: pendingForm }), { confirmed: false, pendingForm }, { count: '3张' });
  assert.equal(ready.output.skillConfirmationForm?.purpose, 'requirements_confirmation');
});

test('在聊天中选定方向不自动审批方案', () => {
  const approved = { version: 1, mode: 'brand' as const, status: 'approved' as const, inputBrief: '', answers: {}, selectedSkillIds: [], plan, createdAt: '', updatedAt: '', approvedAt: 'old' };
  const result = applyAgentTurn({ previous: approved, output: turn({ intent: 'select', createPlan: undefined, productionRequests: [], patch: { selectedDirectionId: 'b', resolvedQuestionIds: [], removedTaskIds: [], removedConstraints: [], removedKnownFacts: [], removedFactsToConfirm: [], removedQuestionIds: [] } }), memory: { fields: {} }, userMessage: { id: 'u', seq: 1, text: '选b' }, mode: 'brand', selectedSkillIds: [], confirmedAnswers: {}, now: new Date().toISOString() });
  assert.equal(result.savedPlan?.status, 'needs_review');
  assert.equal(result.savedPlan?.approvedAt, undefined);
});

test('旧生图和文字任务接口必须校验方案审批及版本，普通出图不受影响', () => {
  assert.doesNotThrow(() => assertDesignProductionApproval({}, {}));
  assert.throws(() => assertDesignProductionApproval({ planVersion: 1 }, {}), /先确认/);
  assert.throws(() => assertDesignProductionApproval({ planVersion: 1 }, { designAgent: { version: 1, status: 'needs_review' } }), /先确认/);
  assert.throws(() => assertDesignProductionApproval({ planVersion: 1 }, { designAgent: { version: 2, status: 'approved' } }), /方案已变化/);
  assert.doesNotThrow(() => assertDesignProductionApproval({ planVersion: 2 }, { designAgent: { version: 2, status: 'approved' } }));
});
