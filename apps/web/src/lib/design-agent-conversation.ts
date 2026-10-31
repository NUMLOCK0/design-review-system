import type { Project, SavedPlan } from '@/components/image-studio/design-plan-agent';

export type DesignAgentAction = { taskId: string; slotKeys: string[]; instruction: string; label: string };
export type DesignAgentSkillQuestion = { id: string; label: string; prompt: string; required: boolean; answerType: 'text' | 'textarea' | 'select'; options: string[]; recommendation?: string };
export type DesignAgentSkillForm = { id: string; purpose?: 'requirements_confirmation'; title: string; intro: string; skillIds: string[]; questions: DesignAgentSkillQuestion[] };
export type DesignReference = { id: string; imageUrl: string; title: string; description: string; sourceUrl?: string; licenseStatus: 'unknown' };
export type DesignAgentMessage = {
  id: string; seq?: number; role: 'user' | 'assistant'; text: string; createdAt?: string;
  attachments?: Array<{ assetId: string; title: string; previewUrl: string }>;
  selectedNodeIds?: string[]; runId?: string; runStatus?: string; error?: string;
  changes?: string[]; actions?: DesignAgentAction[]; skillConfirmationForm?: DesignAgentSkillForm; planSnapshot?: SavedPlan; roundSkillIds?: string[]; toolEvents?: Array<{ type: 'skill_read'; names: string[] }>;
  designReferences?: DesignReference[]; referenceSearchQuery?: string; referenceSearchError?: string;
};
export type DesignAgentInputs = { skillIds: string[]; confirmedAnswers: Record<string, string>; confirmSkillSelection?: boolean };
export type DesignAgentFact = { label: string; value: string; status: 'confirmed' | 'suggested'; sourceMessageId: string; sourceSeq: number };
export type DesignAgentSnapshot = {
  project: Project; revision: number; memory: { fields: Record<string, DesignAgentFact> };
  requirements?: Record<string, { confirmed?: boolean }>;
  messages: DesignAgentMessage[]; hasMore: boolean; beforeSeq: number | null; activeRunId: string | null;
  runId?: string; status?: string; error?: string; actions?: DesignAgentAction[]; autoExecute?: boolean;
};
export type DesignAgentRevision = { version: number; savedPlan: SavedPlan; changes: string[]; createdAt: string };
