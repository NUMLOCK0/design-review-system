import type { FormField, FormTemplate } from './form-config';

export type FormAnswers = Record<string, unknown>;
export type ConfirmationPolicy = 'brand' | 'both';
export type CollaborationFormStatus = 'sent' | 'filling' | 'submitted' | 'returned';
export interface CollaborationForm {
  id: string; orderId: string; template: FormTemplate; assigneeId: string; createdBy: string;
  answers: FormAnswers; revision: number; lockVersion: number; status: CollaborationFormStatus;
  comment: string; submittedAt: string | null; createdAt: string; updatedAt: string;
}
export interface RequirementSource {
  formId: string; submissionId: string; revision: number; templateId: string; templateVersion: number;
  title: string; fields: FormField[]; answers: FormAnswers;
}
export interface RequirementContent {
  title: string; orderNo: string; category: string; platform: string; deadline: string | null;
  requiresPsd: boolean; originalRequirements: string; sources: RequirementSource[];
}
export interface RequirementApprover {
  userId: string; name: string; role: 'brand' | 'designer';
  decision: 'pending' | 'confirmed' | 'rejected'; comment: string; actedAt: string | null;
}
export interface RequirementCandidate {
  id: string; orderId: string; policy: ConfirmationPolicy; content: RequirementContent; contentHash: string;
  approvers: RequirementApprover[]; status: 'confirming' | 'confirmed' | 'rejected' | 'superseded';
  createdAt: string; createdBy: string; requirementVersionId: string | null;
}
export interface RequirementVersion {
  id: string; orderId: string; requirementNo: string; version: number; candidateId: string;
  content: RequirementContent; contentHash: string; approvers: RequirementApprover[];
  createdAt: string;
}
export interface CollaborationWorkspace {
  orderId: string; title: string; orderNo: string; creatorId: string; designerId: string | null;
  status: string; forms: CollaborationForm[]; candidates: RequirementCandidate[]; requirements: RequirementVersion[];
  execution: { requirementVersionId: string; taskId: string; startedAt: string } | null;
}
export interface CollaborationOrderSummary {
  orderId: string; orderNo: string; title: string; status: string; counterpartName: string;
  formCount: number; pendingForms: number; pendingConfirmations: number; requirementVersion: number;
}
export interface WorkflowMessage {
  kind: 'form' | 'confirmation' | 'requirement' | 'execution';
  entityId: string; title: string; description: string;
}
export const WORKFLOW_MESSAGE_PREFIX = 'COZI_WORKFLOW_V1:';
export function parseWorkflowMessage(body: string): WorkflowMessage | null {
  if (!body.startsWith(WORKFLOW_MESSAGE_PREFIX)) return null;
  try {
    const value = JSON.parse(body.slice(WORKFLOW_MESSAGE_PREFIX.length));
    return value && ['form', 'confirmation', 'requirement', 'execution'].includes(value.kind) &&
      ['entityId', 'title', 'description'].every(key => typeof value[key] === 'string') ? value : null;
  } catch { return null; }
}

export function isFieldVisible(field: FormField, answers: FormAnswers): boolean {
  const rule = field.condition;
  if (!rule) return true;
  const value = answers[rule.fieldKey];
  if (value === undefined) return false;
  if (rule.operator === 'notEmpty') return value !== null && value !== '';
  return rule.operator === 'equals' ? value === rule.value : value !== rule.value;
}

/** Omit hidden answers from submitted/confirmed content; defaults never replace existing answers. */
export function prepareFormAnswers(fields: FormField[], answers: FormAnswers): FormAnswers {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return answers;
  const result: FormAnswers = {};
  for (const field of fields) {
    if (['section', 'paragraph', 'divider'].includes(field.kind) || !isFieldVisible(field, answers)) continue;
    const value = answers[field.key] ?? field.defaultValue;
    if (value === undefined || value === '') continue;
    result[field.key] = field.kind === 'repeat' && Array.isArray(value)
      ? value.map(item => prepareFormAnswers(field.children || [], item as FormAnswers)) : value;
  }
  return result;
}

export function formatAnswer(value: unknown): string {
  if (value === null || value === undefined || value === '') return '未填写';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return value.map(item => typeof item === 'object' ? JSON.stringify(item) : String(item)).join('、');
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

export interface RequirementChange { label: string; before: string; after: string }
export function formatFieldAnswer(field: FormField | undefined, value: unknown): string {
  if (!field || value === undefined || value === null || value === '') return formatAnswer(value);
  if (field.options?.length) {
    const label = (item: unknown) => field.options!.find(option => option.value === item)?.label || formatAnswer(item);
    return Array.isArray(value) ? value.map(label).join('、') : label(value);
  }
  if (field.kind === 'image' || field.kind === 'file') return `已上传${field.kind === 'image' ? '图片' : '文件'}${Array.isArray(value) ? ` ${value.length} 个` : ''}`;
  if (field.kind === 'repeat' && Array.isArray(value)) return value.map((row, index) => `第 ${index + 1} 项：${(field.children || []).filter(child => !['section', 'paragraph', 'divider'].includes(child.kind) && isFieldVisible(child, row)).map(child => `${child.label}：${formatFieldAnswer(child, row[child.key])}`).join('；')}`).join('\n');
  return formatAnswer(value);
}
export function requirementChanges(previous: RequirementContent | undefined, next: RequirementContent): RequirementChange[] {
  if (!previous) return [];
  function entries(content: RequirementContent) {
    const result = new Map<string, { label: string; value: unknown; field?: FormField }>();
    for (const key of ['title', 'category', 'platform', 'deadline', 'requiresPsd', 'originalRequirements'] as const) result.set(key, { label: ({ title: '项目名称', category: '交付类型', platform: '平台', deadline: '交付时间', requiresPsd: '源文件要求', originalRequirements: '原始需求' })[key], value: content[key] });
    for (const source of content.sources) {
      for (const field of source.fields) {
        if (['section', 'divider', 'paragraph'].includes(field.kind)) continue;
        result.set(`${source.formId}:${field.key}`, { label: `${source.title} / ${field.label}`, value: source.answers[field.key], field });
      }
    }
    return result;
  }
  const before = entries(previous); const after = entries(next);
  return [...new Set([...before.keys(), ...after.keys()])].filter(key => JSON.stringify(before.get(key)?.value) !== JSON.stringify(after.get(key)?.value))
    .map(key => ({ label: after.get(key)?.label || before.get(key)!.label, before: formatFieldAnswer(before.get(key)?.field, before.get(key)?.value), after: formatFieldAnswer(after.get(key)?.field, after.get(key)?.value) }));
}

/** Editor-neutral DAG contract: coordinates are presentation, edges express execution dependencies. */
export interface DesignWorkflowPlan {
  schemaVersion: 1; requirementVersionId: string;
  nodes: Array<{ id: string; kind: 'brief' | 'reference' | 'generate' | 'compose' | 'review' | 'delivery';
    title: string; position: { x: number; y: number }; config: Record<string, unknown>;
    inputBindings: Array<{ input: string; requirementPath?: string; sourceNodeId?: string; output?: string }> }>;
  edges: Array<{ id: string; source: string; target: string; sourcePort?: string; targetPort?: string }>;
}
export function workflowPlanError(plan: DesignWorkflowPlan): string | null {
  const ids = new Set(plan.nodes.map(node => node.id));
  if (ids.size !== plan.nodes.length) return '工作流节点 ID 重复';
  if (new Set(plan.edges.map(edge => edge.id)).size !== plan.edges.length) return '工作流连线 ID 重复';
  const adjacency = new Map<string, string[]>(plan.nodes.map(node => [node.id, []]));
  for (const edge of plan.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) return '连线引用了不存在的节点';
    if (edge.source === edge.target) return '节点不能连接自身';
    adjacency.get(edge.source)!.push(edge.target);
  }
  const visiting = new Set<string>(); const visited = new Set<string>();
  function cyclic(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    if (adjacency.get(id)!.some(cyclic)) return true;
    visiting.delete(id); visited.add(id); return false;
  }
  if (plan.nodes.some(node => cyclic(node.id))) return '工作流存在循环依赖';
  for (const node of plan.nodes) {
    for (const binding of node.inputBindings) {
      if (binding.sourceNodeId && (!ids.has(binding.sourceNodeId) || !plan.edges.some(edge => edge.source === binding.sourceNodeId && edge.target === node.id))) return '输入绑定必须来自已连接的前置节点';
      if (Boolean(binding.requirementPath) === Boolean(binding.sourceNodeId)) return '输入绑定必须指定需求路径或前置节点之一';
    }
  }
  return null;
}
