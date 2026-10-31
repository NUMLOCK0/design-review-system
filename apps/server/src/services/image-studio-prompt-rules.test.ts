import assert from 'node:assert/strict';
import test from 'node:test';
import { appendSingleLogoRule, SINGLE_LOGO_RULE } from './image-studio-prompt-rules.js';

test('单 Logo 限制在 Skill 指导之后，长提示词也不会截掉该限制', () => {
  const prompt = appendSingleLogoRule(`${'x'.repeat(32_000)}\nSkill：提出多个方向`, true);
  assert.ok(prompt.endsWith(SINGLE_LOGO_RULE));
  assert.ok(prompt.length <= 32_000);
  assert.match(prompt, /禁止多个候选方案/);
  assert.equal(appendSingleLogoRule('品牌名片', false), '品牌名片');
});

test('图形与文字分开制作时，最终限制优先于 Skill 指导且不影响其他作品', () => {
  const symbol = '本图只生成一个独立的 Logo 图形，不要任何文字\nSkill：可以加品牌名称';
  assert.match(appendSingleLogoRule(symbol, true), /最终文字要求：只生成图形/);
  assert.match(appendSingleLogoRule(symbol, false), /最终文字要求：只生成图形/);
  assert.doesNotMatch(appendSingleLogoRule('品牌名片', false), /最终文字要求/);
});
