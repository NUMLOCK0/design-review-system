import assert from 'node:assert/strict';
import test from 'node:test';
import { createFormField } from '@design-review/shared';
import { CARD_PREFIX, parseCard } from './services/chat';

test('chat checklist accepts full published field metadata', () => {
  const child = { ...createFormField('image', 1), maxFiles: null };
  const schema = { ...createFormField('repeat', 1), children: [child], required: true };
  const card = parseCard(`${CARD_PREFIX}${JSON.stringify({
    kind: 'work_card', templateId: 'intake_checklist', title: '完整需求表单',
    fields: [{ label: '商品明细', value: '请品牌方填写', schema }], attachments: [],
  })}`);
  assert.equal(card?.kind, 'work_card');
  if (card?.kind === 'work_card') {
    assert.equal(card.fields[0].schema?.kind, 'repeat');
    assert.equal((card.fields[0].schema?.children as Array<{ maxFiles: number | null }>)[0].maxFiles, null);
  }
});

test('chat form answers allow structured values longer than the legacy 200-character limit', () => {
  const value = JSON.stringify([{ notes: '需求详情'.repeat(60) }]);
  const card = parseCard(`${CARD_PREFIX}${JSON.stringify({
    kind: 'form_answers', formMessageId: '00000000-0000-4000-8000-000000000001',
    answers: [{ fieldIndex: 0, value }, { fieldIndex: 1, value: '' }],
  })}`);
  assert.equal(card?.kind, 'form_answers');
  if (card?.kind === 'form_answers') assert.equal(card.answers[0].value, value);
});
