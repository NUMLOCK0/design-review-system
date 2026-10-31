import assert from 'node:assert/strict';
import test from 'node:test';
import { validatePerImagePrompts } from './image-studio-prompt-output.js';
import { validateStudioSvg } from './image-studio-svg-output.js';
import { studioAgentForTask } from './image-studio-agent-registry.js';
import { designReviewOutputSchema } from './image-studio-review-output.js';

test('per-image prompt output must match every planned slot exactly', () => {
  const slots = [{ slotKey: 'a-1' }, { slotKey: 'a-2' }];
  assert.equal(validatePerImagePrompts({ prompts: slots.map((s) => ({ ...s, prompt: '一个标志' })) }, slots).prompts.length, 2);
  assert.throws(() => validatePerImagePrompts({ prompts: [{ slotKey: 'a-1', prompt: 'x' }] }, slots));
  assert.throws(() => validatePerImagePrompts({ prompts: [{ slotKey: 'a-1', prompt: 'x' }, { slotKey: 'a-1', prompt: 'x' }] }, slots));
});
test('SVG validator accepts native vectors and rejects embedded assets or executable elements', async () => {
  const result = await validateStudioSvg({ svg: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#123456"/></svg>' });
  assert.equal(result.validation.parsed, true);
  await assert.rejects(validateStudioSvg({ svg: '<svg><script>alert(1)</script></svg>' }));
  await assert.rejects(validateStudioSvg({ svg: '<svg><image href="https://example.com/a.png"/></svg>' }));
});
test('agent roles are explicit and review does not substitute for user acceptance', () => {
  assert.equal(studioAgentForTask('image_generation'), 'image');
  assert.equal(studioAgentForTask('review'), 'review');
  assert.equal(studioAgentForTask('analysis'), 'brief');
  assert.equal(studioAgentForTask('storyboard'), 'visual');
  assert.equal(studioAgentForTask('copywriting'), 'copy');
  assert.equal(studioAgentForTask('prompting'), 'prompt');
  assert.equal(studioAgentForTask('not_supported'), null);
  assert.equal(designReviewOutputSchema.safeParse({ summary: '没有读到图片', checks: [], suggestions: [] }).success, false);
});
