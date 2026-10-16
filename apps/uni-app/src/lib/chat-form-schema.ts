import { FORM_FIELD_KINDS, type FormField } from '@design-review/shared';

/** New checklist messages carry the published field definition; old messages have no schema. */
export function configuredChecklistField(value: unknown, label: string, index: number): FormField | null {
  if (value === undefined) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('表单字段配置无效');
  const schema = value as Partial<FormField>;
  if (typeof schema.key !== 'string' || !schema.key || typeof schema.kind !== 'string' || !FORM_FIELD_KINDS.some(item => item.kind === schema.kind)) throw new Error('表单字段类型无效');
  if (schema.kind === 'repeat' && !Array.isArray(schema.children)) throw new Error('子表单字段配置无效');
  return { ...schema, label, id: typeof schema.id === 'string' ? schema.id : `chat_field_${index}`, required: Boolean(schema.required), width: typeof schema.width === 'number' ? schema.width : 100 } as FormField;
}

export function encodeChecklistAnswer(value: unknown): string {
  return value === undefined || value === null ? '' : typeof value === 'string' ? value.trim() : JSON.stringify(value);
}

export function decodeChecklistAnswer(field: FormField, raw: string): unknown {
  if (!raw) return '';
  if (field.kind === 'number') return Number.isFinite(Number(raw)) ? Number(raw) : raw;
  if (field.kind === 'switch') return raw === 'true' ? true : raw === 'false' ? false : raw;
  if (field.kind === 'checkbox' || field.kind === 'repeat' || ((field.kind === 'image' || field.kind === 'file') && raw.startsWith('['))) {
    try { const value: unknown = JSON.parse(raw); return Array.isArray(value) ? value : raw; } catch { return raw; }
  }
  return raw;
}
