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
  return Object.fromEntries(fields.filter(field => field.defaultValue !== undefined).map(field => [field.key, field.defaultValue]));
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
