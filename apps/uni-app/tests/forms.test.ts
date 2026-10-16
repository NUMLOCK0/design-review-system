import assert from 'node:assert/strict';
import test from 'node:test';
import { createFormField, FORM_FIELD_KINDS, type FormAnswers, type FormField, type FormFieldKind } from '@design-review/shared';
import { defaultAnswers, flattenFields, mergeFormDefaults, validateFormAnswers } from '../src/lib/forms';
import { configuredChecklistField, decodeChecklistAnswer, encodeChecklistAnswer } from '../src/lib/chat-form-schema';

function field(kind: FormFieldKind, key: string, patch: Partial<FormField> = {}): FormField {
  return { ...createFormField(kind, 1), key, label: key, ...patch };
}

test('all 19 configurable field kinds can appear in a mini-program form', () => {
  const samples: Record<FormFieldKind, unknown> = {
    text: '需求', textarea: '详细说明', email: 'a@example.com', phone: '13800138000', url: 'https://example.com',
    number: 2, select: 'option_1', radio: 'option_1', checkbox: ['option_1'], switch: true,
    date: '2026-10-16', time: '12:30', datetime: '2026-10-16T12:30:00.000Z',
    image: '/api/upload/previews/asset_0123456789abcdef0123456789abcdef', file: '/api/upload/assets/asset_0123456789abcdef0123456789abcdef',
    section: undefined, divider: undefined, paragraph: undefined, repeat: [{ child: '内容' }],
  };
  const fields = FORM_FIELD_KINDS.map(({ kind }) => field(kind, kind, kind === 'repeat' ? { children: [field('text', 'child', { required: true })] } : {}));
  assert.equal(fields.length, 19);
  assert.equal(validateFormAnswers(fields, samples as FormAnswers), null);
  assert.deepEqual(flattenFields(fields, samples as FormAnswers).filter(node => node.depth === 0).map(node => node.field.kind), FORM_FIELD_KINDS.map(item => item.kind));
});

test('repeat defaults include required rows and recursively fill child defaults', () => {
  const fields = [field('repeat', 'items', { required: true, minItems: 0, children: [field('text', 'name', { defaultValue: '默认名称' })] })];
  assert.deepEqual(defaultAnswers(fields), { items: [{ name: '默认名称' }] });
  assert.deepEqual(mergeFormDefaults(fields, { items: [{ name: '已填写' }, {}] }), { items: [{ name: '已填写' }, { name: '默认名称' }] });
  assert.equal(validateFormAnswers(fields, { items: [] }), '「items」至少添加 1 项');
  assert.equal(flattenFields(fields, { items: [{ name: '已填写' }] }).some(node => node.key === 'items.0.name'), true);
});

test('conditional fields are rendered and validated only when their condition matches', () => {
  const fields = [field('select', 'mode'), field('text', 'detail', { required: true, condition: { fieldKey: 'mode', operator: 'equals', value: 'option_1' } })];
  assert.equal(flattenFields(fields, { mode: 'option_2' }).some(node => node.field.key === 'detail'), false);
  assert.equal(validateFormAnswers(fields, { mode: 'option_2' }), null);
  assert.equal(validateFormAnswers(fields, { mode: 'option_1' }), '请填写「detail」');
});

test('field-specific validation covers formats, choices, limits and nested rows', () => {
  assert.match(validateFormAnswers([field('email', 'email')], { email: 'bad' }) || '', /有效邮箱/);
  assert.match(validateFormAnswers([field('phone', 'phone')], { phone: '123' }) || '', /有效手机号/);
  assert.match(validateFormAnswers([field('url', 'url')], { url: 'example.com' }) || '', /http:\/\//);
  assert.match(validateFormAnswers([field('date', 'date')], { date: '2026-02-31' }) || '', /有效日期/);
  assert.match(validateFormAnswers([field('number', 'number', { min: 1, max: 3 })], { number: 4 }) || '', /不能大于 3/);
  assert.match(validateFormAnswers([field('select', 'select')], { select: 'unknown' }) || '', /有效选项/);
  assert.match(validateFormAnswers([field('checkbox', 'checkbox')], { checkbox: ['unknown'] }) || '', /无效选项/);
  assert.match(validateFormAnswers([field('image', 'image', { maxFiles: 1 })], { image: ['a', 'b'] }) || '', /最多上传 1 个文件/);
  assert.equal(validateFormAnswers([field('file', 'file', { maxFiles: null })], { file: ['a', 'b'] }), null);
  assert.match(validateFormAnswers([field('repeat', 'items', { children: [field('text', 'child', { required: true })] })], { items: [{}] }) || '', /第 1 项/);
});

test('Web checklist preserves every published component type for the mini-program', () => {
  for (const { kind } of FORM_FIELD_KINDS) {
    const source = field(kind, `key_${kind}`, kind === 'repeat' ? { children: [field('image', 'reference', { maxFiles: null })] } : {});
    const parsed = configuredChecklistField(source, `配置的${kind}`, 0);
    assert.equal(parsed?.kind, kind);
    assert.equal(parsed?.label, `配置的${kind}`);
    if (kind === 'repeat') assert.equal(parsed?.children?.[0].kind, 'image');
  }
  assert.equal(configuredChecklistField(undefined, '旧版题目', 0), null);
  assert.throws(() => configuredChecklistField({ kind: 'unknown', key: 'bad' }, '错误题目', 0));
});

test('checklist answer messages round-trip structured field values', () => {
  const samples: Array<[FormFieldKind, unknown]> = [
    ['number', 12.5], ['switch', false], ['checkbox', ['option_1']],
    ['repeat', [{ child: '内容', images: ['/api/upload/previews/a'] }]],
    ['image', ['/api/upload/previews/a', '/api/upload/previews/b']], ['file', ['/api/upload/assets/a']],
    ['text', '123'],
  ];
  for (const [kind, value] of samples) assert.deepEqual(decodeChecklistAnswer(field(kind, kind), encodeChecklistAnswer(value)), value);
});
