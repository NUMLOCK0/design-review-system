import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { choiceFormFromReply } from './image-studio-choice-form.js';

test('turns enumerated and quoted direction choices into forms', () => {
  const numbered = choiceFormFromReply('原创方向供你比较：①圆润几何；②动物徽章；③柔和字标。你可以选一个方向。');
  assert.deepEqual(numbered?.questions[0].options, ['圆润几何', '动物徽章', '柔和字标']);
  const quoted = choiceFormFromReply('「毛球星球」适合现代风格。你更偏好「几何图形」「动物轮廓」还是「纯字标」？');
  assert.deepEqual(quoted?.questions[0].options, ['几何图形', '动物轮廓', '纯字标']);
  assert.deepEqual(quoted?.skillIds, []);
});

test('does not manufacture options from ordinary conversation', () => {
  assert.equal(choiceFormFromReply('已经调整配色，请继续告诉我你的想法。'), undefined);
  assert.equal(choiceFormFromReply('「山」与「海」都可以用于自然风格。'), undefined);
});
