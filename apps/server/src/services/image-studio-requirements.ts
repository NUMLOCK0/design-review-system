import type { AgentMemory, AgentTurnOutput } from './image-studio-agent-memory.js';

type Form = NonNullable<AgentTurnOutput['skillConfirmationForm']>;
export type RequirementsState = { confirmed: boolean; pendingForm?: Form };
export const CONFIRM_REQUIREMENTS = '需求已完整，生成设计方案';

export function assertDesignProductionApproval(context: Record<string, unknown> | undefined, workflow: Record<string, any>) {
  // Ordinary image generation also uses these APIs, without a design-agent plan.
  if (context?.planVersion === undefined) return;
  const saved = workflow.designAgent;
  if (!saved || saved.status !== 'approved') throw Object.assign(new Error('请先确认设计方案，再开始制作'), { status: 409, code: 'DESIGN_AGENT_PLAN_NOT_APPROVED' });
  if (typeof context.planVersion !== 'number' || saved.version !== context.planVersion) throw Object.assign(new Error('设计方案已变化，请重新确认并开始制作'), { status: 409, code: 'DESIGN_AGENT_VERSION_CONFLICT' });
}

export function requirementsConfirmed(state: RequirementsState, answers: Record<string, string>) {
  return state.confirmed || Boolean(state.pendingForm?.purpose === 'requirements_confirmation'
    && state.pendingForm.questions.every((question) => answers[question.id]?.trim() === CONFIRM_REQUIREMENTS));
}

/** Keep this gate outside the model: an early plan/tool request cannot bypass unanswered questions. */
export function gateDesignRequirements(input: {
  output: AgentTurnOutput; state: RequirementsState; answers: Record<string, string>; memory: AgentMemory; hasPlan: boolean;
}) {
  const output = structuredClone(input.output);
  // Only the application may issue the final requirements confirmation form.
  if (output.skillConfirmationForm) delete output.skillConfirmationForm.purpose;
  if (input.hasPlan) return { output, state: input.state, reuseForm: false };
  const answered = (id: string) => (input.answers[id] || input.memory.fields[`answer.${id}`]?.value || '').trim();
  const pending = input.state.pendingForm;
  const missing = pending?.questions.filter((question) => question.required && !answered(question.id)) || [];
  const answeredLabels = new Set(Object.values(input.memory.fields).filter((fact) => fact.status === 'confirmed').map((fact) => fact.label));
  for (const question of pending?.questions || []) if (answered(question.id)) answeredLabels.add(question.label);
  const planQuestions = output.createPlan?.questions.filter((question) => question.required && !answered(question.id) && !answeredLabels.has(question.label)) || [];
  if (output.skillConfirmationForm) {
    output.skillConfirmationForm.questions = output.skillConfirmationForm.questions.filter((question) => !answered(question.id) && !answeredLabels.has(question.label));
    if (!output.skillConfirmationForm.questions.length) output.skillConfirmationForm = undefined;
  }
  let confirmed = requirementsConfirmed(input.state, input.answers);
  let form: Form | undefined;
  let reuseForm = false;
  if (missing.length) {
    form = { ...pending!, questions: missing };
    reuseForm = true;
  } else if (pending?.purpose === 'requirements_confirmation' && !confirmed) {
    form = { title: '继续补充需求', intro: '补充完成后再整理方案。', skillIds: [], questions: [
      { id: 'additional_requirements', label: '补充需求', prompt: '还有哪些希望补充或修改的要求？', required: true, answerType: 'textarea', options: [] },
    ] };
  } else if (planQuestions.length) {
    form = { title: '补齐设计需求', intro: '请先补齐这些信息，再整理正式设计方案。', skillIds: [], questions: planQuestions.slice(0, 5) };
    confirmed = false;
  } else if (output.skillConfirmationForm) {
    form = output.skillConfirmationForm;
    confirmed = false;
  } else if (!confirmed && (output.createPlan || Object.keys(input.answers).length || output.intent !== 'explain')) {
    const brief = output.createPlan?.brief;
    const facts = Object.values(input.memory.fields).filter((fact) => fact.status === 'confirmed').map((fact) => `${fact.label}：${fact.value}`);
    for (const question of pending?.questions || []) if (answered(question.id)) facts.push(`${question.label}：${answered(question.id)}`);
    const summary = [...new Set(facts)].join('；').slice(0, 220)
      || (brief ? [brief.brandName, brief.productOrService, brief.targetAudience, brief.marketAndChannel, ...brief.constraints].filter(Boolean).join('；').slice(0, 220) : '');
    form = { purpose: 'requirements_confirmation', title: '确认需求已收集完整', intro: summary || '请确认已提供全部需求。确认后将整理方案，方案仍需单独确认才可开始制作。', skillIds: [], questions: [
      { id: 'requirements_ready', label: '需求是否完整', prompt: '信息完整后生成方案；还需补充时继续收集。', required: true, answerType: 'select', options: [CONFIRM_REQUIREMENTS, '还需补充，继续收集'] },
    ] };
  }
  if (form || !confirmed) {
    const blocked = Boolean(output.createPlan || output.productionRequests.length || output.intent === 'create_plan' || output.intent === 'generate');
    output.createPlan = undefined;
    output.patch = undefined;
    output.productionRequests = [];
    output.intent = output.memoryUpdates.length || Object.keys(input.answers).length ? 'select' : 'clarify';
    output.skillConfirmationForm = form;
    if (blocked || missing.length || form?.purpose) output.reply = form?.purpose
      ? '已整理本轮需求。请确认信息已完整，再生成设计方案。'
      : '先补齐本轮需求，完成收集后再整理设计方案。';
    return { output, state: { confirmed: false, ...(form ? { pendingForm: form } : {}) }, reuseForm };
  }
  if (output.createPlan) {
    output.createPlan.selectedDirectionId = null;
    output.intent = 'create_plan';
  } else if (output.intent === 'generate' || output.productionRequests.length) {
    output.intent = 'clarify';
    output.reply = '需求已确认，请先整理并确认设计方案，再开始制作。';
  }
  output.productionRequests = [];
  return { output, state: { confirmed: true }, reuseForm: false };
}
