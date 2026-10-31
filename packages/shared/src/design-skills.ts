export type DesignSkillCategory = 'brand_identity' | 'ecommerce' | 'social_media' | 'packaging' | 'design_review' | 'other';

export type DesignSkillQuestionKind = 'text' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox' | 'date' | 'image' | 'file';

/** A structured intake question owned by a design Skill. The key is stable for answer extraction. */
export interface DesignSkillQuestion {
  id: string;
  key: string;
  label: string;
  prompt: string;
  kind: DesignSkillQuestionKind;
  required: boolean;
  priority: number;
  placeholder?: string;
  options?: string[];
}

export interface DesignSkillInput {
  name: string;
  category: DesignSkillCategory;
  description: string;
  instructions: string;
  completionCriteria: string;
  questions: DesignSkillQuestion[];
}

export interface DesignSkillSource {
  name: string;
  url: string;
  license: string;
  note?: string;
}

export interface DesignSkill extends DesignSkillInput {
  id: string;
  version: number;
  isEnabled: boolean;
  createdById: string;
  createdByName: string;
  createdByRole: 'admin' | 'customer_service';
  updatedByName: string;
  /** Optional provenance for curated starter Skills. */
  source?: DesignSkillSource;
  createdAt: string;
  updatedAt: string;
}
