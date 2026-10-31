import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanDesignChoices, normalizeDesignChoiceQuestion } from '@design-review/shared';
import { ensureDesignQuestionOptions } from './image-studio-question-options.js';
import type { AgentTurnOutput } from './image-studio-agent-memory.js';

type Form = NonNullable<AgentTurnOutput['skillConfirmationForm']>;
const question = { id: 'style', label: '品牌气质', prompt: '希望体现什么气质？', required: true, answerType: 'textarea' as const, options: [] as string[] };
const form: Form = { title: '补充品牌设计需求', intro: '先收集需求', skillIds: [], questions: [question] };

test('AI 补齐具体选项，保留原问题与必填规则，只取建议的答案', async () => {
  let calls = 0;
  const result = await ensureDesignQuestionOptions(form, 'brand', async (missing) => {
    calls++;
    assert.deepEqual(missing.map((item) => item.id), ['style']);
    return { ...form, questions: [{ ...question, label: '不应覆盖', required: false, options: ['温暖亲和', '极简专业', '活泼有趣', '其他'], recommendation: '温暖亲和' }] };
  });
  assert.equal(calls, 1);
  assert.equal(result.questions[0].answerType, 'select');
  assert.equal(result.questions[0].label, question.label);
  assert.equal(result.questions[0].required, true);
  assert.deepEqual(result.questions[0].options, ['温暖亲和', '极简专业', '活泼有趣']);
  assert.equal(result.questions[0].recommendation, '温暖亲和');
  assert.deepEqual(form.questions[0].options, [], 'Do not mutate saved questions');
});

test('已有具体选项时不增加模型调用，文本题也统一为选择题', async () => {
  const existing = { ...form, questions: [{ ...question, options: ['现代几何', '温暖手绘', '经典字标'] }] };
  const result = await ensureDesignQuestionOptions(existing, 'brand', async () => { throw new Error('must not call'); });
  assert.equal(result.questions[0].answerType, 'select');
  assert.deepEqual(result.questions[0].options, existing.questions[0].options);
});

test('修复失败只尝试一次，历史空选项问题仍提供可选答案', async () => {
  let calls = 0;
  const result = await ensureDesignQuestionOptions(form, 'brand', async () => { calls++; throw new Error('timeout'); });
  assert.equal(calls, 1);
  assert.ok(result.questions[0].options.length >= 3);
  assert.equal(result.questions[0].answerType, 'select');
  assert.equal(result.questions[0].id, question.id);
});

test('修复结果的无关 ID 不会覆盖问题或沿用错误建议', async () => {
  const result = await ensureDesignQuestionOptions(form, 'brand', async () => ({ ...form, questions: [{ ...question, id: 'other_question', options: ['错误甲', '错误乙'] }] }));
  assert.ok(result.questions[0].options.length >= 3);
  assert.ok(!result.questions[0].options.includes('错误甲'));
});

test('其他由界面管理，去重清理后不把其他或空白作为已选答案', () => {
  assert.deepEqual(cleanDesignChoices([' 温暖 ', '温暖', '', '其他', '其他（请填写）', 'Other', '专业']), ['温暖', '专业']);
  const normalized = normalizeDesignChoiceQuestion({ ...question, options: ['A', 'B', '其他'], recommendation: '其他' });
  assert.deepEqual(normalized.options, ['A', 'B']);
  assert.equal(normalized.recommendation, undefined);
});

test('按题目含义兼容旧表单，保留推荐项并限制选项数量', () => {
  const quantity = normalizeDesignChoiceQuestion({ ...question, label: '图片数量', prompt: '几张图？' });
  assert.ok(quantity.options.every((option) => /张/.test(option)));
  const channel = normalizeDesignChoiceQuestion({ ...question, label: '应用平台', prompt: '' }, 'product');
  assert.deepEqual(channel.options, ['淘宝/天猫', '京东', '拼多多', '抖音电商']);
  const supplied = normalizeDesignChoiceQuestion({ ...question, options: ['A', 'B', 'C', 'D', 'E', 'F'], recommendation: 'C' });
  assert.equal(supplied.options[0], 'C');
  assert.equal(supplied.options.length, 5);
  const long = normalizeDesignChoiceQuestion({ ...question, recommendation: '建议'.repeat(80) });
  assert.ok(long.options.every((option) => option.length <= 100));
  assert.equal(long.recommendation, long.options[0]);
});
