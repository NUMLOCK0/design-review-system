import type { FormField, FormTemplate } from './form-config';
export type FormAnswers = Record<string, unknown>;
export type ConfirmationPolicy = 'brand' | 'both';
export type CollaborationFormStatus = 'sent' | 'filling' | 'submitted' | 'returned';
export interface CollaborationForm {
    id: string;
    orderId: string;
    template: FormTemplate;
    assigneeId: string;
    createdBy: string;
    answers: FormAnswers;
    revision: number;
    lockVersion: number;
    status: CollaborationFormStatus;
    comment: string;
    submittedAt: string | null;
    createdAt: string;
    updatedAt: string;
}
export interface RequirementSource {
    formId: string;
    submissionId: string;
    revision: number;
    templateId: string;
    templateVersion: number;
    title: string;
    fields: FormField[];
    answers: FormAnswers;
}
export interface RequirementContent {
    title: string;
    orderNo: string;
    category: string;
    platform: string;
    deadline: string | null;
    requiresPsd: boolean;
    originalRequirements: string;
    sources: RequirementSource[];
}
export interface RequirementApprover {
    userId: string;
    name: string;
    role: 'brand' | 'designer';
    decision: 'pending' | 'confirmed' | 'rejected';
    comment: string;
    actedAt: string | null;
}
export interface RequirementCandidate {
    id: string;
    orderId: string;
    policy: ConfirmationPolicy;
    content: RequirementContent;
    contentHash: string;
    approvers: RequirementApprover[];
    status: 'confirming' | 'confirmed' | 'rejected' | 'superseded';
    createdAt: string;
    createdBy: string;
    requirementVersionId: string | null;
}
export interface RequirementVersion {
    id: string;
    orderId: string;
    requirementNo: string;
    version: number;
    candidateId: string;
    content: RequirementContent;
    contentHash: string;
    approvers: RequirementApprover[];
    createdAt: string;
}
export interface CollaborationWorkspace {
    orderId: string;
    title: string;
    orderNo: string;
    creatorId: string;
    designerId: string | null;
    status: string;
    forms: CollaborationForm[];
    candidates: RequirementCandidate[];
    requirements: RequirementVersion[];
    execution: {
        requirementVersionId: string;
        taskId: string;
        startedAt: string;
    } | null;
}
export interface CollaborationOrderSummary {
    orderId: string;
    orderNo: string;
    title: string;
    status: string;
    counterpartName: string;
    formCount: number;
    pendingForms: number;
    pendingConfirmations: number;
    requirementVersion: number;
}
export interface WorkflowMessage {
    kind: 'form' | 'confirmation' | 'requirement' | 'execution';
    entityId: string;
    title: string;
    description: string;
}
export declare const WORKFLOW_MESSAGE_PREFIX = "COZI_WORKFLOW_V1:";
export declare function parseWorkflowMessage(body: string): WorkflowMessage | null;
export declare function isFieldVisible(field: FormField, answers: FormAnswers): boolean;
/** Omit hidden answers from submitted/confirmed content; defaults never replace existing answers. */
export declare function prepareFormAnswers(fields: FormField[], answers: FormAnswers): FormAnswers;
export declare function formatAnswer(value: unknown): string;
export interface RequirementChange {
    label: string;
    before: string;
    after: string;
}
export declare function formatFieldAnswer(field: FormField | undefined, value: unknown): string;
export declare function requirementChanges(previous: RequirementContent | undefined, next: RequirementContent): RequirementChange[];
/** Editor-neutral DAG contract: coordinates are presentation, edges express execution dependencies. */
export interface DesignWorkflowPlan {
    schemaVersion: 1;
    requirementVersionId: string;
    nodes: Array<{
        id: string;
        kind: 'brief' | 'reference' | 'generate' | 'compose' | 'review' | 'delivery';
        title: string;
        position: {
            x: number;
            y: number;
        };
        config: Record<string, unknown>;
        inputBindings: Array<{
            input: string;
            requirementPath?: string;
            sourceNodeId?: string;
            output?: string;
        }>;
    }>;
    edges: Array<{
        id: string;
        source: string;
        target: string;
        sourcePort?: string;
        targetPort?: string;
    }>;
}
export declare function workflowPlanError(plan: DesignWorkflowPlan): string | null;
