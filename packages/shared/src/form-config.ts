/** Persisted, renderer-independent form definition shared by web, API and mini program. */
export type FormFieldKind = 'text' | 'textarea' | 'email' | 'phone' | 'url' | 'number' | 'select' | 'radio' | 'checkbox' | 'switch' | 'date' | 'time' | 'datetime' | 'image' | 'file' | 'section' | 'divider' | 'paragraph' | 'repeat';
export type FormFieldWidth = number;
export type FormMobileStyle = 'comfortable' | 'compact' | 'large';
export const DEFAULT_FORM_MOBILE_STYLE: FormMobileStyle = 'comfortable';
export const FORM_MOBILE_STYLES: Array<{ value: FormMobileStyle; label: string; description: string }> = [
  { value: 'comfortable', label: '标准舒适', description: '均衡的字号与间距，适合大多数表单。' },
  { value: 'compact', label: '紧凑高效', description: '缩小字段间距，减少长表单的滚动距离。' },
  { value: 'large', label: '大字易读', description: '加大文字与触控区域，阅读和选择更轻松。' },
];
export type FormCondition = { fieldKey: string; operator: 'equals' | 'notEquals' | 'notEmpty'; value?: string };
export type FormOption = { label: string; value: string };

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

export const FORM_FIELD_KINDS: Array<{ kind: FormFieldKind; label: string; group: string }> = [
  { kind: 'text', label: '单行文本', group: '基础字段' },
  { kind: 'textarea', label: '多行文本', group: '基础字段' },
  { kind: 'number', label: '数字', group: '基础字段' },
  { kind: 'email', label: '邮箱', group: '基础字段' },
  { kind: 'phone', label: '手机号', group: '基础字段' },
  { kind: 'url', label: '网址', group: '基础字段' },
  { kind: 'select', label: '下拉单选', group: '选择字段' },
  { kind: 'radio', label: '单选按钮', group: '选择字段' },
  { kind: 'checkbox', label: '多选', group: '选择字段' },
  { kind: 'switch', label: '开关', group: '选择字段' },
  { kind: 'date', label: '日期', group: '日期时间' },
  { kind: 'time', label: '时间', group: '日期时间' },
  { kind: 'datetime', label: '日期时间', group: '日期时间' },
  { kind: 'image', label: '图片上传', group: '附件与布局' },
  { kind: 'file', label: '文件上传', group: '附件与布局' },
  { kind: 'section', label: '分组标题', group: '附件与布局' },
  { kind: 'paragraph', label: '说明文字', group: '附件与布局' },
  { kind: 'divider', label: '分割线', group: '附件与布局' },
  { kind: 'repeat', label: '可增删子表单', group: '高级字段' },
];

export function createFormField(kind: FormFieldKind, index: number): FormField {
  const label = FORM_FIELD_KINDS.find((item) => item.kind === kind)?.label || '字段';
  const id = `field_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id, key: `field_${index}`, kind, label, width: kind === 'section' || kind === 'divider' || kind === 'paragraph' || kind === 'repeat' ? 100 : 50,
    ...(kind === 'select' || kind === 'radio' || kind === 'checkbox' ? { options: [{ label: '选项一', value: 'option_1' }, { label: '选项二', value: 'option_2' }] } : {}),
    ...(kind === 'image' || kind === 'file' ? { maxFiles: 1 } : {}),
    ...(kind === 'repeat' ? { children: [createFormField('text', 1)], minItems: 0, maxItems: 10 } : {}),
  };
}

export interface GeneratedFormSchema {
  schema: { type: 'object'; properties: Record<string, unknown>; required: string[]; allOf?: Array<Record<string, unknown>>; additionalProperties: false };
  uischema: { type: 'PercentGrid'; elements: Array<Record<string, unknown>> };
}

export function buildFormSchema(fields: FormField[]): GeneratedFormSchema {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const allOf: Array<Record<string, unknown>> = [];
  const elements: Array<Record<string, unknown>> = [];
  for (const field of fields) {
    if (field.kind === 'section' || field.kind === 'divider' || field.kind === 'paragraph') {
      elements.push({ type: 'FormDecor', options: { kind: field.kind, label: field.label, help: field.help, widthPercent: field.width } });
      continue;
    }
    const base: Record<string, unknown> = { title: field.label, description: field.help || undefined };
    if (field.kind === 'number') Object.assign(base, { type: 'number', minimum: field.min, maximum: field.max });
    else if (field.kind === 'switch') Object.assign(base, { type: 'boolean' });
    else if (field.kind === 'checkbox') Object.assign(base, { type: 'array', uniqueItems: true, items: { type: 'string', enum: (field.options || []).map((o) => o.value) } });
    else if (field.kind === 'repeat') {
      const child = buildFormSchema(field.children || []);
      Object.assign(base, { type: 'array', items: child.schema, minItems: field.minItems, maxItems: field.maxItems });
    } else if (field.kind === 'image' || field.kind === 'file') {
      // Existing submissions store one URL as a string; multi-upload stores URL arrays.
      Object.assign(base, { type: ['string', 'array'], minLength: field.required ? 1 : 0,
        items: { type: 'string', minLength: 1 }, minItems: field.required ? 1 : 0,
        ...(field.maxFiles === null ? {} : { maxItems: field.maxFiles ?? 1 }) });
    } else {
      Object.assign(base, { type: 'string', minLength: field.minLength, maxLength: field.maxLength, pattern: field.pattern || undefined });
      if (field.kind === 'time') base.pattern = '^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$';
      if (field.kind === 'email' || field.kind === 'url' || field.kind === 'date' || field.kind === 'datetime') {
        base.format = field.kind === 'url' ? 'uri' : field.kind === 'datetime' ? 'date-time' : field.kind;
      }
      if (field.kind === 'phone') base.pattern = field.pattern || '^1[3-9]\\d{9}$';
      if (field.kind === 'select' || field.kind === 'radio') base.oneOf = (field.options || []).map((o) => ({ const: o.value, title: o.label }));
    }
    if (field.defaultValue !== undefined && field.defaultValue !== '') base.default = field.defaultValue;
    properties[field.key] = base;
    if (field.required && !field.condition) required.push(field.key);
    const element: Record<string, unknown> = { type: 'Control', scope: `#/properties/${field.key}`, options: { kind: field.kind, placeholder: field.placeholder, widthPercent: field.width, choices: field.options, presets: field.presets, children: field.children, required: field.required, maxFiles: field.maxFiles } };
    if (field.condition?.fieldKey) {
      const condition = field.condition;
      element.rule = { effect: 'SHOW', condition: {
        scope: `#/properties/${condition.fieldKey}`,
        schema: condition.operator === 'notEmpty' ? { not: { enum: ['', null] } } : condition.operator === 'notEquals' ? { not: { const: condition.value } } : { const: condition.value },
        failWhenUndefined: true,
      } };
      if (field.required) allOf.push({ if: { properties: { [condition.fieldKey]: condition.operator === 'notEmpty' ? { not: { enum: ['', null] } } : condition.operator === 'notEquals' ? { not: { const: condition.value } } : { const: condition.value } }, required: [condition.fieldKey] }, then: { required: [field.key] } });
    }
    elements.push(element);
  }
  return { schema: { type: 'object', properties, required, ...(allOf.length ? { allOf } : {}), additionalProperties: false }, uischema: { type: 'PercentGrid', elements } };
}
