import { isFieldVisible, type FormAnswers, type FormField } from '@design-review/shared';
export type FieldPath = Array<string | number>;
export interface FieldNode { field: FormField; path: FieldPath; key: string; rowIndex?: number; repeatPath?: FieldPath; depth: number }
export function getValue(data: FormAnswers, path: FieldPath): unknown { return path.reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, data); }
export function setValue(data: FormAnswers, path: FieldPath, value: unknown): FormAnswers {
  const clone = JSON.parse(JSON.stringify(data));
  let target = clone;
  for (const [index, key] of path.slice(0, -1).entries()) { if (!target[key]) target[key] = typeof path[index + 1] === 'number' ? [] : {}; target = target[key]; }
  target[path[path.length - 1]] = value;
  return clone;
}
export function defaultAnswers(fields: FormField[]): FormAnswers {
  return Object.fromEntries(fields.map(field => {
    if (field.kind === 'repeat') {
      const count = Math.max(0, field.minItems ?? 0, field.required ? 1 : 0);
      return [field.key, Array.from({ length: count }, () => defaultAnswers(field.children || []))];
    }
    return [field.key, field.defaultValue];
  }).filter(([, value]) => value !== undefined));
}
/** Fill defaults recursively without overwriting answers already entered by the user. */
export function mergeFormDefaults(fields: FormField[], answers: FormAnswers = {}): FormAnswers {
  const result = { ...defaultAnswers(fields), ...answers };
  for (const field of fields) {
    if (field.kind !== 'repeat') continue;
    const rows = Array.isArray(answers[field.key]) ? answers[field.key] as FormAnswers[] : result[field.key] as FormAnswers[];
    result[field.key] = rows.map(row => mergeFormDefaults(field.children || [], row && typeof row === 'object' ? row : {}));
  }
  return result;
}

/** Validate visible fields recursively, including repeat rows and choice/image values. */
export function validateFormAnswers(fields: FormField[], answers: FormAnswers): string | null {
  for (const field of fields) {
    if (!isFieldVisible(field, answers)) continue;
    const value = answers[field.key];
    const label = field.label || '未命名字段';
    if (field.kind === 'repeat') {
      const rows = Array.isArray(value) ? value as FormAnswers[] : [];
      const minimum = Math.max(field.minItems ?? 0, field.required ? 1 : 0);
      if (rows.length < minimum) return `「${label}」至少添加 ${minimum} 项`;
      if (field.maxItems !== undefined && rows.length > field.maxItems) return `「${label}」最多添加 ${field.maxItems} 项`;
      for (let index = 0; index < rows.length; index += 1) {
        const issue = validateFormAnswers(field.children || [], rows[index] || {});
        if (issue) return `「${label}」第 ${index + 1} 项：${issue}`;
      }
      continue;
    }
    if (['section', 'divider', 'paragraph'].includes(field.kind)) continue;
    const empty = value === undefined || value === null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && value.length === 0);
    if (field.required && empty) return `请填写「${label}」`;
    if (empty) continue;
    if (field.kind === 'image' || field.kind === 'file') {
      const files = Array.isArray(value) ? value : [value];
      if (field.maxFiles !== null && files.length > (field.maxFiles ?? 1)) return `「${label}」最多上传 ${field.maxFiles ?? 1} 个文件`;
      if (files.some(file => typeof file !== 'string' || !file.trim())) return `「${label}」包含无效文件`;
      continue;
    }
    if (field.kind === 'switch') {
      if (typeof value !== 'boolean') return `「${label}」必须选择开启或关闭`;
      continue;
    }
    if (field.kind === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) return `「${label}」请输入有效数字`;
      if (field.min !== undefined && value < field.min) return `「${label}」不能小于 ${field.min}`;
      if (field.max !== undefined && value > field.max) return `「${label}」不能大于 ${field.max}`;
      continue;
    }
    if (field.kind === 'select' || field.kind === 'radio' || field.kind === 'checkbox') {
      const choices = new Set((field.options || []).map(option => option.value));
      if (field.kind === 'checkbox') {
        if (!Array.isArray(value) || value.some(option => typeof option !== 'string' || !choices.has(option))) return `「${label}」包含无效选项`;
      } else if (typeof value !== 'string' || !choices.has(value)) return `「${label}」请选择有效选项`;
      continue;
    }
    if (typeof value !== 'string') return `「${label}」格式不正确`;
    if (field.minLength !== undefined && value.length < field.minLength) return `「${label}」至少填写 ${field.minLength} 个字符`;
    if (field.maxLength !== undefined && value.length > field.maxLength) return `「${label}」不能超过 ${field.maxLength} 个字符`;
    if (field.pattern) {
      try { if (!new RegExp(field.pattern).test(value)) return `「${label}」格式不正确`; }
      catch { /* Ignore malformed legacy patterns instead of blocking form submission. */ }
    }
    if (field.kind === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `「${label}」请输入有效邮箱`;
    if (field.kind === 'phone' && !field.pattern && !/^1[3-9]\d{9}$/.test(value)) return `「${label}」请输入有效手机号`;
    if (field.kind === 'url' && !/^https?:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(value)) return `「${label}」请输入以 http:// 或 https:// 开头的网址`;
    if (field.kind === 'date') {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : new Date(NaN);
      if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return `「${label}」请选择有效日期`;
    }
    if (field.kind === 'time' && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(value)) return `「${label}」请选择有效时间`;
    if (field.kind === 'datetime' && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) || Number.isNaN(Date.parse(value)))) return `「${label}」请选择有效日期时间`;
  }
  return null;
}
/** Flat native render tree: no DOM, dynamic components or recursive mini-program templates. */
export function flattenFields(fields: FormField[], data: FormAnswers, prefix: FieldPath = [], depth = 0): FieldNode[] {
  const nodes: FieldNode[] = [];
  for (const field of fields) {
    if (!isFieldVisible(field, data)) continue;
    const path = [...prefix, field.key];
    nodes.push({ field, path, key: path.join('.'), depth });
    if (field.kind === 'repeat') {
      const rows = Array.isArray(data[field.key]) ? data[field.key] as FormAnswers[] : [];
      rows.forEach((row, rowIndex) => {
        nodes.push({ field: { ...field, kind: 'section', label: `第 ${rowIndex + 1} 项` }, path: [...path, rowIndex], key: `${path.join('.')}.${rowIndex}.row`, rowIndex, repeatPath: path, depth: depth + 1 });
        nodes.push(...flattenFields(field.children || [], row, [...path, rowIndex], depth + 1));
      });
    }
  }
  return nodes;
}
