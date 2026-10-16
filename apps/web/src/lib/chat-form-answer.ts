import { formatFieldAnswer, type FormField } from '@design-review/shared';

/** Display a chat checklist answer using the field definition sent with the form. */
export function formatChecklistAnswer(field: { schema?: FormField } | undefined, raw: string): string {
  const schema = field?.schema;
  if (!schema) return raw;

  let value: unknown = raw;
  if (['repeat', 'checkbox', 'image', 'file'].includes(schema.kind) && raw.trim().startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) value = parsed;
    } catch { /* Keep malformed legacy answers readable as sent. */ }
  } else if (schema.kind === 'switch' && (raw === 'true' || raw === 'false')) {
    value = raw === 'true';
  }

  return formatFieldAnswer(schema, value);
}

const IMAGE_URL = /^\/api\/upload\/previews\/asset_[a-f0-9]{32}$/;

/** Resolve uploaded images in a submitted checklist, including nested repeat rows. */
export function checklistAnswerImages(field: { schema?: FormField; kind?: 'image' } | undefined, raw: string): Array<{ label: string; url: string }> {
  if (!field?.schema && field?.kind !== 'image') return [];
  let value: unknown = raw;
  if (raw.trim().startsWith('[')) {
    try { value = JSON.parse(raw) as unknown; } catch { return []; }
  }
  const images: Array<{ label: string; url: string }> = [];
  function collect(schema: Pick<FormField, 'kind' | 'label' | 'children'>, answer: unknown, label: string) {
    if (schema.kind === 'image') {
      const urls = Array.isArray(answer) ? answer : [answer];
      for (const url of urls) if (typeof url === 'string' && IMAGE_URL.test(url)) images.push({ label, url });
      return;
    }
    if (schema.kind !== 'repeat' || !Array.isArray(answer)) return;
    answer.forEach((row, index) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) return;
      for (const child of schema.children || []) collect(child, (row as Record<string, unknown>)[child.key], `${label} · 第 ${index + 1} 项 · ${child.label}`);
    });
  }
  collect(field.schema || { kind: 'image', label: '上传图片' }, value, field.schema?.label || '上传图片');
  return images;
}
