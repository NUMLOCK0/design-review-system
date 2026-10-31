import { createHash } from 'node:crypto';
import { z } from 'zod';
import { imageStudioDesignPlanSchema, logoCandidateSchema, type ImageStudioDesignPlan, type SavedImageStudioDesignPlan } from './image-studio-design-agent.js';
import type { DesignReference } from './image-studio-reference-search.js';

export type AgentFact = { value: string; label: string; status: 'confirmed' | 'suggested'; sourceMessageId: string; sourceSeq: number };
export type AgentMemory = { fields: Record<string, AgentFact> };
export type AgentMessage = {
  id: string; seq: number; role: 'user' | 'assistant'; text: string; createdAt: string;
  attachments: Array<{ assetId: string; title: string; previewUrl: string }>;
  selectedNodeIds: string[]; runId?: string; runStatus?: string; error?: string;
  changes?: string[]; actions?: AgentProductionRequest[]; skillConfirmationForm?: AgentSkillConfirmationForm;
  planSnapshot?: SavedImageStudioDesignPlan; roundSkillIds?: string[]; toolEvents?: Array<{ type: 'skill_read'; names: string[] }>;
  designReferences?: DesignReference[]; referenceSearchQuery?: string; referenceSearchError?: string;
};
export type AgentProductionRequest = { taskId: string; slotKeys: string[]; instruction: string; label: string };
export type AgentSkillConfirmationForm = { id: string; purpose?: 'requirements_confirmation'; title: string; intro: string; skillIds: string[]; questions: Array<{
  id: string; label: string; prompt: string; required: boolean; answerType: 'text' | 'textarea' | 'select'; options: string[]; recommendation?: string;
}> };

const planShape = imageStudioDesignPlanSchema.shape;
export const agentPlanPatchSchema = z.object({
  summary: z.string().min(1).max(800).optional(),
  brief: planShape.brief.partial().optional(),
  directions: planShape.directions.element.partial().required({ id: true }).array().max(8).optional(),
  selectedDirectionId: z.string().max(64).nullable().optional(),
  questions: planShape.questions.optional(),
  resolvedQuestionIds: z.array(z.string().max(64)).max(30).default([]),
  answers: z.record(z.string().max(1200)).optional(),
  tasks: planShape.taskGraph.removeDefault().element.partial().required({ id: true }).array().max(12).optional(),
  removedTaskIds: z.array(z.string().max(64)).max(12).default([]),
  removedConstraints: z.array(z.string().max(240)).max(12).default([]),
  removedKnownFacts: z.array(z.string().max(240)).max(12).default([]),
  removedFactsToConfirm: z.array(z.string().max(240)).max(12).default([]),
  nextSteps: planShape.nextSteps.optional(),
  recommendedSkills: planShape.recommendedSkills.optional(),
  selectedSkillIds: z.array(z.string().min(1).max(64)).max(5).optional(),
  logoCandidates: z.array(logoCandidateSchema).min(2).max(8).optional(),
  removedQuestionIds: z.array(z.string().max(64)).max(10).default([]),
}).strict();

export const agentTurnOutputSchema = z.object({
  intent: z.enum(['explain', 'clarify', 'refine', 'select', 'create_plan', 'generate']),
  reply: z.string().min(1).max(5000),
  createPlan: imageStudioDesignPlanSchema.nullable().optional(),
  patch: agentPlanPatchSchema.nullable().optional(),
  skillConfirmationForm: z.object({
    purpose: z.literal('requirements_confirmation').optional(),
    title: z.string().min(1).max(100), intro: z.string().max(300),
    skillIds: z.array(z.string().min(1).max(64)).max(5),
    questions: planShape.questions.element.array().min(1).max(5),
  }).strict().nullable().optional(),
  memoryUpdates: z.array(z.object({
    key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.:-]{0,95}$/), label: z.string().max(100), value: z.string().max(1200),
    status: z.enum(['confirmed', 'suggested']), evidenceMessageIds: z.array(z.string().max(64)).max(6),
  }).strict()).max(30).default([]),
  affectedTaskIds: z.array(z.string().max(64)).max(12).default([]),
  productionRequests: z.array(z.object({
    taskId: z.string().max(64), slotKeys: z.array(z.string().max(128)).max(20).default([]),
    instruction: z.string().max(2000), label: z.string().max(100),
  }).strict()).max(12).default([]),
  conversationSummary: z.string().max(4000).optional(),
}).strict();
export type AgentTurnOutput = z.infer<typeof agentTurnOutputSchema>;

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

export function taskFingerprint(task: unknown) { return createHash('sha256').update(stableJson(task)).digest('hex'); }

const briefLabels: Record<string, string> = {
  brandName: '品牌名称', productOrService: '商品或业务', positioning: '品牌定位', targetAudience: '目标人群',
  marketAndChannel: '销售渠道', businessGoal: '设计目标', knownFacts: '已知信息', constraints: '设计约束', factsToConfirm: '待确认信息',
};

export function seedAgentMemory(saved?: SavedImageStudioDesignPlan | null): AgentMemory {
  const fields: Record<string, AgentFact> = {};
  if (!saved) return { fields };
  for (const [key, value] of Object.entries(saved.plan.brief)) {
    const text = Array.isArray(value) ? value.join('；') : value;
    if (text) fields[`brief.${key}`] = { label: briefLabels[key], value: text, status: key === 'factsToConfirm' || saved.status !== 'approved' || /待确认|待核实|尚未确认|未知/.test(text) ? 'suggested' : 'confirmed', sourceMessageId: 'legacy-plan', sourceSeq: 0 };
  }
  for (const [key, value] of Object.entries(saved.answers || {})) {
    if (value) fields[`answer.${key}`] = { label: saved.plan.questions.find((question) => question.id === key)?.label || key, value,
      status: saved.status === 'approved' ? 'confirmed' : 'suggested', sourceMessageId: 'legacy-plan', sourceSeq: 0 };
  }
  return { fields };
}

function mergeItems<T extends { id: string }>(old: T[], updates: Array<Partial<T> & Pick<T, 'id'>> = [], removed: string[] = []): T[] {
  const byId = new Map(updates.map((item) => [item.id, item]));
  // A patch only replaces supplied properties. New entries must still pass the
  // complete plan schema after merging; an incomplete new task is not accepted.
  return [...old.filter((item) => !removed.includes(item.id)).map((item) => ({ ...item,
    ...Object.fromEntries(Object.entries(byId.get(item.id) || {}).filter(([, value]) => value !== undefined)),
  })), ...updates.filter((item) => !old.some((previous) => previous.id === item.id))] as T[];
}

export function applyAgentTurn(input: {
  previous: SavedImageStudioDesignPlan | null; output: AgentTurnOutput; memory: AgentMemory;
  userMessage: Pick<AgentMessage, 'id' | 'seq' | 'text'>; mode: 'brand' | 'product';
  selectedSkillIds: string[]; confirmedAnswers: Record<string, string>; confirmedAnswerLabels?: Record<string, string>; now: string;
  confirmSkillSelection?: boolean; logoReferenceAssetIds?: string[]; logoCandidateSkillIds?: string[];
  evidenceMessages?: Array<Pick<AgentMessage, 'id' | 'seq' | 'role'>>;
}) {
  const { previous, output, userMessage, now } = input;
  const fields = structuredClone(input.memory.fields);
  const changes: string[] = [];
  const events: Array<{ key: string; before: AgentFact | null; after: AgentFact }> = [];
  const putFact = (key: string, fact: Omit<AgentFact, 'sourceMessageId' | 'sourceSeq'>, source = userMessage) => {
    const before = fields[key];
    // A model suggestion must never replace an explicit user decision.
    if (before?.status === 'confirmed' && fact.status === 'suggested') return;
    if (before?.status === 'confirmed' && before.sourceSeq > source.seq) return;
    if (before?.value === fact.value && before?.status === fact.status) return;
    const after = { ...fact, sourceMessageId: source.id, sourceSeq: source.seq };
    fields[key] = after; events.push({ key, before: before || null, after });
  };
  const readOnly = output.intent === 'explain' || output.intent === 'clarify';
  const selectedSkillIds = input.confirmSkillSelection ? input.selectedSkillIds
    : readOnly && previous ? previous.selectedSkillIds : output.patch?.selectedSkillIds ?? input.selectedSkillIds;
  if (!readOnly) for (const update of output.memoryUpdates) {
    const sources = [...(input.evidenceMessages || []).filter((message) => message.role === 'user'), { ...userMessage, role: 'user' as const }];
    const source = sources.filter((message) => update.evidenceMessageIds.includes(message.id)).sort((a, b) => b.seq - a.seq)[0];
    const status = update.status === 'confirmed' && source ? 'confirmed' : 'suggested';
    putFact(update.key, { label: update.label, value: update.value, status }, source ? { ...userMessage, id: source.id, seq: source.seq } : userMessage);
  }
  for (const [id, value] of Object.entries(input.confirmedAnswers)) {
    putFact(`answer.${id}`, { label: input.confirmedAnswerLabels?.[id] || previous?.plan.questions.find((question) => question.id === id)?.label || id, value, status: 'confirmed' });
  }
  let plan = previous?.plan ? structuredClone(previous.plan) : null;
  const patch = readOnly ? null : output.patch;
  if (!plan && output.createPlan && !readOnly) {
    plan = imageStudioDesignPlanSchema.parse(output.createPlan);
    if (selectedSkillIds.length) plan.taskGraph = plan.taskGraph.map((task) =>
      ['analysis', 'storyboard', 'copywriting', 'prompting', 'image_generation', 'svg_generation'].includes(task.kind)
        ? { ...task, skillIds: [...new Set([...selectedSkillIds, ...task.skillIds])].slice(0, 5) }
        : task);
    changes.push('已建立设计方案');
  } else if (plan && patch) {
    if (patch.summary !== undefined) plan.summary = patch.summary;
    if (patch.brief || patch.removedConstraints.length || patch.removedKnownFacts.length || patch.removedFactsToConfirm.length) {
      const oldBrief = structuredClone(plan.brief);
      plan.brief = { ...plan.brief, ...patch.brief };
      for (const key of ['knownFacts', 'constraints', 'factsToConfirm'] as const) {
        const removed = key === 'constraints' ? patch.removedConstraints : key === 'knownFacts' ? patch.removedKnownFacts : patch.removedFactsToConfirm;
        plan.brief[key] = [...new Set([...oldBrief[key], ...(patch.brief?.[key] || [])])].filter((item) => !removed.includes(item));
      }
      for (const key of Object.keys(plan.brief)) {
        if (stableJson(oldBrief[key as keyof typeof oldBrief]) !== stableJson(plan.brief[key as keyof typeof oldBrief])) changes.push(`已更新${briefLabels[key] || key}`);
      }
    }
    plan.directions = mergeItems(plan.directions, patch.directions);
    if (patch.selectedDirectionId !== undefined) plan.selectedDirectionId = patch.selectedDirectionId;
    const answeredIds = new Set([...Object.keys(input.confirmedAnswers), ...Object.keys(patch.answers || {})]);
    const resolvedIds = [...new Set([...answeredIds, ...patch.resolvedQuestionIds.filter((id) => fields[`answer.${id}`]?.status === 'confirmed')])];
    plan.questions = mergeItems(plan.questions, patch.questions, [...resolvedIds, ...patch.removedQuestionIds]);
    plan.taskGraph = mergeItems(plan.taskGraph, patch.tasks, patch.removedTaskIds);
    if (patch.nextSteps) plan.nextSteps = patch.nextSteps;
    if (patch.recommendedSkills) plan.recommendedSkills = patch.recommendedSkills;
    if (patch.logoCandidates) {
      const oldCandidateTask = plan.logoExploration?.taskId;
      const taskId = `logo_candidates_v${(previous?.version || 0) + 1}`;
      // Candidate exploration is its own round; leave the existing plan and its
      // finished tasks intact while creating a separate, dependency-free task.
      plan.taskGraph = plan.taskGraph.filter((task) => task.id !== oldCandidateTask);
      if (plan.taskGraph.length >= 12 || plan.taskGraph.some((task) => task.dependsOn.includes(oldCandidateTask || '') || task.id === taskId)) {
        throw Object.assign(new Error('当前方案的任务已满或存在关联，请先整理制作计划再规划 Logo 候选'), { status: 409 });
      }
      plan.taskGraph.push({ id: taskId, title: '多风格 Logo 候选', kind: 'image_generation',
        reason: '逐个生成不同方向的 Logo，供用户选择后再做品牌延展。', dependsOn: [],
        skillIds: [...new Set([...(input.logoCandidateSkillIds || []), ...selectedSkillIds])].slice(0, 5), inputs: ['品牌需求与参考 Logo'],
        outputs: patch.logoCandidates.map((candidate) => candidate.name), reviewPolicy: 'select' });
      plan.logoExploration = { taskId, candidates: patch.logoCandidates, referenceAssetIds: input.logoReferenceAssetIds || [] };
      changes.push(`已规划 ${patch.logoCandidates.length} 款独立 Logo 候选`);
    }
  }
  if (!plan) return { savedPlan: previous, memory: { fields }, changes, events, affectedTaskIds: [] as string[], changed: false };
  // Compatible models sometimes put an explicit requirement only in memoryUpdates.
  // Reflect those canonical fields in the plan; list fields append rather than erase old decisions.
  const canonicalUpdateKeys = [...new Set([...events.map((event) => event.key), ...output.memoryUpdates
    .filter((update) => fields[update.key]?.status === 'confirmed' && fields[update.key]?.value === update.value).map((update) => update.key)])];
  if (!readOnly) for (const key of canonicalUpdateKeys) {
    if (!key.startsWith('brief.') || fields[key]?.status !== 'confirmed') continue;
    const field = key.slice(6) as keyof typeof plan.brief;
    if (!(field in plan.brief) || patch?.brief?.[field] !== undefined) continue;
    if (['knownFacts', 'constraints', 'factsToConfirm'].includes(field)) {
      const listKey = field as 'knownFacts' | 'constraints' | 'factsToConfirm';
      const additions = fields[key].value.split(/[；;\n]/).map((item) => item.trim()).filter(Boolean);
      const removed = listKey === 'constraints' ? patch?.removedConstraints : listKey === 'knownFacts' ? patch?.removedKnownFacts : patch?.removedFactsToConfirm;
      plan.brief[listKey] = [...new Set([...plan.brief[listKey], ...additions])].filter((item) => !removed?.includes(item));
    } else {
      (plan.brief as Record<string, unknown>)[field] = fields[key].value;
    }
  }
  if (plan.selectedDirectionId && !plan.directions.some((direction) => direction.id === plan!.selectedDirectionId)) {
    throw Object.assign(new Error('回复引用的视觉方向不存在，请重试本条消息'), { status: 502, code: 'DESIGN_AGENT_INVALID_DIRECTION' });
  }
  if (previous && stableJson(previous.selectedSkillIds) !== stableJson(selectedSkillIds)) {
    const explicitlyUpdated = new Set(patch?.tasks?.map((task) => task.id) || []);
    plan.taskGraph = plan.taskGraph.map((task) => (explicitlyUpdated.has(task.id) && !input.confirmSkillSelection) || ['manual', 'direction', 'review', 'delivery'].includes(task.kind) ? task : {
      ...task, skillIds: [...new Set([...selectedSkillIds, ...task.skillIds.filter((id) => !previous.selectedSkillIds.includes(id))])].slice(0, 5),
    });
    changes.push('已更新设计领域');
  }
  const taskIds = new Set(plan.taskGraph.map((task) => task.id));
  if (taskIds.size !== plan.taskGraph.length || plan.taskGraph.some((task) => task.dependsOn.some((id) => !taskIds.has(id) || id === task.id))) {
    throw Object.assign(new Error('制作计划存在无效的任务依赖，请重试本条消息'), { status: 502, code: 'DESIGN_AGENT_INVALID_TASKS' });
  }
  const visited = new Set<string>(); const visiting = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw Object.assign(new Error('制作计划存在循环依赖，请重试'), { status: 502, code: 'DESIGN_AGENT_INVALID_TASKS' });
    if (visited.has(id)) return;
    visiting.add(id); plan!.taskGraph.find((task) => task.id === id)?.dependsOn.forEach(visit); visiting.delete(id); visited.add(id);
  };
  plan.taskGraph.forEach((task) => visit(task.id));
  plan = imageStudioDesignPlanSchema.parse(plan);
  if (!readOnly) for (const [key, value] of Object.entries(plan.brief)) {
    if (stableJson(value) === stableJson(previous?.plan.brief[key as keyof typeof plan.brief]) && !canonicalUpdateKeys.includes(`brief.${key}`)) continue;
    const existing = fields[`brief.${key}`];
    putFact(`brief.${key}`, { label: briefLabels[key], value: Array.isArray(value) ? value.join('；') : value,
      status: key === 'factsToConfirm' ? 'suggested' : existing?.status || 'suggested' });
  }
  const answers = { ...(previous?.answers || {}), ...(!readOnly ? patch?.answers || {} : {}), ...input.confirmedAnswers };
  for (const [key, value] of Object.entries(patch?.answers || {})) putFact(`answer.${key}`, { label: previous?.plan.questions.find((question) => question.id === key)?.label || key, value, status: 'confirmed' });
  if (!readOnly) {
    const answeredLabels = new Set(Object.entries(fields).filter(([key, fact]) => key.startsWith('answer.') && fact.status === 'confirmed').map(([, fact]) => fact.label.trim()));
    plan.questions = plan.questions.filter((question) => fields[`answer.${question.id}`]?.status !== 'confirmed' && !answeredLabels.has(question.label.trim()));
  }
  const memoryChanged = events.some((event) => event.after.status === 'confirmed' && event.before?.value !== event.after.value);
  if (memoryChanged) changes.push(...events.filter((event) => event.after.status === 'confirmed').map((event) => `已记录${event.after.label}`));
  const changed = !previous || stableJson(previous.plan) !== stableJson(plan) || stableJson(previous.answers) !== stableJson(answers) || memoryChanged
    || stableJson(previous.selectedSkillIds) !== stableJson(selectedSkillIds);
  const affected = new Set<string>();
  if (changed && previous) {
    for (const id of output.affectedTaskIds) if (taskIds.has(id)) affected.add(id);
    if (memoryChanged && !affected.size) {
      const scoped = events.filter((event) => event.key.startsWith('slot.'));
      if (scoped.length === events.length) for (const task of plan.taskGraph) {
        if (scoped.some((event) => event.key.slice(5).startsWith(`${task.id}-`))) affected.add(task.id);
      }
      else for (const task of plan.taskGraph) if (!['research', 'direction', 'manual'].includes(task.kind)) affected.add(task.id);
    }
    for (const task of plan.taskGraph) if (taskFingerprint(task) !== taskFingerprint(previous.plan.taskGraph.find((old) => old.id === task.id))) affected.add(task.id);
    const visualChanged = stableJson(previous.plan.directions.find((item) => item.id === previous.plan.selectedDirectionId)) !== stableJson(plan.directions.find((item) => item.id === plan!.selectedDirectionId));
    const globalBriefChanged = ['brandName', 'productOrService', 'positioning', 'targetAudience', 'marketAndChannel', 'businessGoal'].some((key) =>
      stableJson(previous.plan.brief[key as keyof typeof plan.brief]) !== stableJson(plan!.brief[key as keyof typeof plan.brief]));
    const constraintsChanged = stableJson(previous.plan.brief) !== stableJson(plan.brief);
    const skillsChanged = stableJson(previous.selectedSkillIds) !== stableJson(selectedSkillIds);
    if (visualChanged || globalBriefChanged || skillsChanged || (constraintsChanged && !affected.size)) for (const task of plan.taskGraph) if (!['research', 'direction', 'manual'].includes(task.kind)) affected.add(task.id);
    for (let pass = 0; pass < plan.taskGraph.length; pass++) for (const task of plan.taskGraph) if (task.dependsOn.some((id) => affected.has(id))) affected.add(task.id);
  }
  if (!changed) return { savedPlan: previous, memory: { fields }, changes: [] as string[], events, affectedTaskIds: [] as string[], changed: false };
  if (previous && stableJson(previous.plan.directions) !== stableJson(plan.directions)) changes.push('已更新视觉方向');
  if (previous && previous.plan.selectedDirectionId !== plan.selectedDirectionId) changes.push('已记录选择的视觉方向');
  if (affected.size) changes.push(`${affected.size} 项制作任务待更新`);
  // Selecting a direction in chat never substitutes for the explicit plan approval action.
  const status = previous?.status === 'approved' && stableJson(previous.plan) === stableJson(plan)
    && stableJson(previous.selectedSkillIds) === stableJson(selectedSkillIds) ? 'approved' : 'needs_review';
  return {
    savedPlan: { ...previous, version: (previous?.version || 0) + 1, mode: input.mode, inputBrief: previous?.inputBrief || userMessage.text,
      plan, answers, selectedSkillIds, status, createdAt: previous?.createdAt || now, updatedAt: now,
      approvedAt: status === 'approved' ? previous?.approvedAt : undefined } as SavedImageStudioDesignPlan,
    memory: { fields }, changes: [...new Set(changes)], events, affectedTaskIds: [...affected], changed: true,
  };
}

export function carryAgentTaskStates(states: Record<string, any>, before: SavedImageStudioDesignPlan | null, after: SavedImageStudioDesignPlan, affected: string[]) {
  const next = { ...states };
  if (!before || before.version === after.version) return next;
  for (const task of after.plan.taskGraph) {
    const old = states[`${before.version}:${task.id}`];
    if (!old) continue;
    next[`${after.version}:${task.id}`] = affected.includes(task.id)
      ? { status: 'stale', previousJobId: old.jobId || old.previousJobId, previousPlanVersion: before.version, updatedAt: new Date().toISOString() }
      : { ...old, sourcePlanVersion: old.sourcePlanVersion || before.version };
  }
  return next;
}

export function estimatedTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  let units = 0;
  for (const char of text) units += char.charCodeAt(0) > 127 ? 1.5 : 0.3;
  return Math.ceil(units);
}

/** Keep authoritative requirements intact; use relevance and a token budget for raw history. */
export function buildAgentChatContext(input: {
  current: unknown; memory: AgentMemory; summary: { text?: string; throughSeq?: number }; messages: AgentMessage[]; budget?: number;
}) {
  const budget = input.budget || 24000;
  const context = { current: input.current, projectMemory: input.memory, conversationSummary: input.summary, messages: [] as AgentMessage[] };
  let used = estimatedTokens(context);
  if (used > budget - 1500) throw Object.assign(new Error('项目资料超过当前对话容量，请缩减过长的资料或切换更大上下文的模型'), { status: 413, code: 'DESIGN_AGENT_CONTEXT_LIMIT' });
  const latest = input.messages.at(-1);
  const terms = [...new Set((latest?.text || '').toLowerCase().match(/[a-z0-9_-]{3,}|[\u4e00-\u9fff]{2,6}/g) || [])];
  const recent = input.messages.slice(-16).reverse();
  const older = input.messages.slice(0, -16).map((message) => ({ message, score: terms.filter((term) => message.text.toLowerCase().includes(term)).length }))
    .filter((item) => item.score > 0).sort((a, b) => b.score - a.score || b.message.seq - a.message.seq).map((item) => item.message);
  for (const message of [...recent, ...older]) {
    const cost = estimatedTokens(message);
    if (used + cost <= budget) { context.messages.push(message); used += cost; }
  }
  if (latest && !context.messages.some((message) => message.id === latest.id)) throw Object.assign(new Error('本条消息内容过长，请拆分后发送'), { status: 413 });
  context.messages.sort((a, b) => a.seq - b.seq);
  return { context, estimatedInputTokens: used };
}
