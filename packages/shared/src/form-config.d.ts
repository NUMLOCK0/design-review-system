/** Persisted, renderer-independent form definition shared by web, API and mini program. */
export type FormFieldKind = 'text' | 'textarea' | 'email' | 'phone' | 'url' | 'number' | 'select' | 'radio' | 'checkbox' | 'switch' | 'date' | 'time' | 'datetime' | 'image' | 'file' | 'section' | 'divider' | 'paragraph' | 'repeat';
export type FormFieldWidth = number;
export type FormMobileStyle = 'comfortable' | 'compact' | 'large';
export declare const DEFAULT_FORM_MOBILE_STYLE: FormMobileStyle;
export declare const FORM_MOBILE_STYLES: Array<{
    value: FormMobileStyle;
    label: string;
    description: string;
}>;
export type FormCondition = {
    fieldKey: string;
    operator: 'equals' | 'notEquals' | 'notEmpty';
    value?: string;
};
export type FormOption = {
    label: string;
    value: string;
};
export interface FormField {
    id: string;
    key: string;
    kind: FormFieldKind;
    label: string;
    width: FormFieldWidth;
    required?: boolean;
    placeholder?: string;
    help?: string;
    defaultValue?: string | number | boolean | string[];
    options?: FormOption[];
    presets?: string[];
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    condition?: FormCondition;
    children?: FormField[];
    minItems?: number;
    maxItems?: number;
    /** Undefined keeps legacy single-file behavior; null means no form-level limit. */
    maxFiles?: number | null;
}
export interface FormTemplate {
    id: string;
    name: string;
    description: string;
    target: 'order' | 'general';
    category?: string;
    tag?: string;
    presetId?: string;
    /** Mini-program form density and touch-target style. Missing legacy values use the comfortable default. */
    mobileStyle?: FormMobileStyle;
    fields: FormField[];
    version: number;
    publishedVersion: number;
    status: 'draft' | 'published' | 'archived';
    createdAt: string;
    updatedAt: string;
}
export declare const FORM_FIELD_KINDS: Array<{
    kind: FormFieldKind;
    label: string;
    group: string;
}>;
export declare function createFormField(kind: FormFieldKind, index: number): FormField;
export interface GeneratedFormSchema {
    schema: {
        type: 'object';
        properties: Record<string, unknown>;
        required: string[];
        allOf?: Array<Record<string, unknown>>;
        additionalProperties: false;
    };
    uischema: {
        type: 'PercentGrid';
        elements: Array<Record<string, unknown>>;
    };
}
export declare function buildFormSchema(fields: FormField[]): GeneratedFormSchema;
