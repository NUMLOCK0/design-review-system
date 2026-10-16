import assert from 'node:assert/strict';
import test from 'node:test';
import type { FormField } from '@design-review/shared';
import { checklistAnswerImages, formatChecklistAnswer } from './chat-form-answer';

const repeatField: FormField = {
  id: 'repeat', key: 'details', kind: 'repeat', label: '可增删子表单', width: 100,
  children: [{ id: 'child', key: 'field_1', kind: 'text', label: '核心卖点（最多3条）', width: 100 }],
};

test('submitted repeat answers display child labels instead of field keys', () => {
  const result = formatChecklistAnswer({ schema: repeatField }, '[{"field_1":"321额外大大"}]');
  assert.equal(result, '第 1 项：核心卖点（最多3条）：321额外大大');
  assert.doesNotMatch(result, /field_1/);
});

test('legacy answers without a field schema remain readable', () => {
  assert.equal(formatChecklistAnswer(undefined, '普通回答'), '普通回答');
});

test('uploaded images are found in image fields and repeat rows', () => {
  const first = `/api/upload/previews/asset_${'a'.repeat(32)}`;
  const second = `/api/upload/previews/asset_${'b'.repeat(32)}`;
  const nested: FormField = { ...repeatField, children: [{ id: 'photo', key: 'photo', kind: 'image', label: '参考图', width: 100 }] };
  assert.deepEqual(checklistAnswerImages({ schema: nested }, JSON.stringify([{ photo: first }, { photo: [second] }])), [
    { label: '可增删子表单 · 第 1 项 · 参考图', url: first },
    { label: '可增删子表单 · 第 2 项 · 参考图', url: second },
  ]);
  assert.deepEqual(checklistAnswerImages({ kind: 'image' }, first), [{ label: '上传图片', url: first }]);
  assert.deepEqual(checklistAnswerImages({ kind: 'image' }, 'https://example.com/image.png'), []);
});
