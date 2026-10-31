import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { matchDesignSkills } from './image-studio-skill-match.js';

const ids = ['builtin_logo_design_brief', 'builtin_logo_concept_vector_workflow', 'builtin_logo_direction_critique', 'builtin_logo_prompt_direction', 'builtin_ecommerce_visual_brief', 'builtin_taobao_tmall_product_visual', 'builtin_design_reference_research'];
const skills = ids.map((id) => ({ id, name: id, category: 'design' }));

test('matches logo work without automatically enabling web search', () => {
  const result = matchDesignSkills(skills, { text: '咖啡品牌 Logo 给我三个不同的设计方向', mode: 'brand', selectedIds: [] });
  assert.deepEqual(result, ids.slice(0, 4));
  assert.ok(!result.includes('builtin_design_reference_research'));
});

test('respects enabled skills, existing selections and the five-skill limit', () => {
  const result = matchDesignSkills(skills.filter((skill) => skill.id !== 'builtin_logo_direction_critique'), {
    text: '淘宝商品主图与 Logo', mode: 'product', selectedIds: ['custom-1', 'custom-2', 'builtin_logo_design_brief'],
  });
  assert.deepEqual(result, ['builtin_logo_concept_vector_workflow', 'builtin_logo_prompt_direction']);
  assert.deepEqual(matchDesignSkills(skills, { text: '你好', mode: 'brand', selectedIds: [] }), []);
});
