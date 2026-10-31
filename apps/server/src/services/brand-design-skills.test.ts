import assert from 'node:assert/strict';
import test from 'node:test';
import { brandDesignSkillSeeds } from '../config/brand-design-skill-seeds.js';

// Never touch a developer's database when testing the in-memory seed path.
process.env.MYSQL_URL = '';

test('brand skills are seeded with provenance, loaded as model guidance, and do not overwrite edits', async () => {
  const { dbPool } = await import('../config/database.js');
  assert.equal(dbPool, null);
  const { ensureDefaultDesignSkills, getDesignSkill, listDesignSkills, updateDesignSkill } = await import('./design-skills.js');
  const { selectedDesignSkillContext } = await import('./image-studio-design-agent.js');
  await ensureDefaultDesignSkills();
  assert.equal(new Set(brandDesignSkillSeeds.map((skill) => skill.id)).size, 7);
  const skills = await listDesignSkills(false);
  assert.ok(skills.some((skill) => skill.id === 'builtin_design_reference_research' && skill.instructions.includes('searchDesignReferences')));
  for (const seed of brandDesignSkillSeeds) {
    const stored = skills.find((skill) => skill.id === seed.id);
    assert.ok(stored, `${seed.id} should be available`);
    assert.equal(stored.source?.url, seed.source.url);
    assert.equal(stored.source?.license, 'MIT');
    assert.ok(stored.instructions.length > 30);
  }
  const [logo, color] = [brandDesignSkillSeeds[0], brandDesignSkillSeeds[4]];
  const context = selectedDesignSkillContext(skills, [color.id, logo.id, color.id, 'missing']);
  assert.deepEqual(context.map((item) => item.id), [color.id, logo.id]);
  assert.match(context[0].instructions, /保留/);
  assert.match(context[1].instructions, /SVG/);
  assert.ok(context[1].questions.some((question) => question.label === '标志类型'));

  const existing = (await getDesignSkill(logo.id))!;
  await updateDesignSkill(logo.id, { ...existing, name: '用户修改的 Logo Skill', instructions: '保留管理员调整。' }, { id: 'admin', name: '管理员', role: 'admin' });
  await ensureDefaultDesignSkills();
  const after = await getDesignSkill(logo.id);
  assert.equal(after?.name, '用户修改的 Logo Skill');
  assert.equal(after?.instructions, '保留管理员调整。');
});

test('selected skills follow a new plan into generation tasks and confirmed changes replace prior selections', async () => {
  const { agentTurnOutputSchema, applyAgentTurn } = await import('./image-studio-agent-memory.js');
  const direction = (id: string) => ({ id, name: id, concept: '几何与自然的原创符号', positioning: '', audience: '', keywords: [],
    palette: ['#111111', '#eeeeee', '#334455'].map((hex) => ({ name: hex, hex, usage: '' })), typography: '', imagery: '', rationale: '', deliverables: [] });
  const plan = { summary: '品牌方案', brief: { brandName: '测试品牌', productOrService: '', positioning: '', targetAudience: '', marketAndChannel: '', businessGoal: '', knownFacts: [], constraints: [], factsToConfirm: [] },
    questions: [], recommendedSkills: [], directions: [direction('a'), direction('b')], nextSteps: [], selectedDirectionId: null,
    taskGraph: [
      { id: 'logo', title: '生成标志概念', kind: 'image_generation', reason: '', dependsOn: [], skillIds: [], inputs: [], outputs: [], reviewPolicy: 'confirm' },
      { id: 'svg', title: '制作矢量标志', kind: 'svg_generation', reason: '', dependsOn: ['logo'], skillIds: ['other'], inputs: [], outputs: [], reviewPolicy: 'confirm' },
      { id: 'research', title: '资料调研', kind: 'research', reason: '', dependsOn: [], skillIds: [], inputs: [], outputs: [], reviewPolicy: 'automatic' },
    ] };
  const chosen = [brandDesignSkillSeeds[0].id, brandDesignSkillSeeds[2].id];
  const base = { memory: { fields: {} }, userMessage: { id: 'message-1', seq: 1, text: '设计 Logo' }, mode: 'brand' as const, confirmedAnswers: {}, now: '2026-10-28T00:00:00Z' };
  const created = applyAgentTurn({ ...base, previous: null, selectedSkillIds: chosen,
    output: agentTurnOutputSchema.parse({ intent: 'create_plan', reply: '已规划。', createPlan: plan }) });
  assert.deepEqual(created.savedPlan?.plan.taskGraph[0].skillIds, chosen);
  assert.deepEqual(created.savedPlan?.plan.taskGraph[1].skillIds, [...chosen, 'other']);
  assert.deepEqual(created.savedPlan?.plan.taskGraph[2].skillIds, []);

  const next = [brandDesignSkillSeeds[4].id];
  const changed = applyAgentTurn({ ...base, previous: created.savedPlan!, memory: created.memory, selectedSkillIds: next, confirmSkillSelection: true,
    output: agentTurnOutputSchema.parse({ intent: 'refine', reply: '已更新。', patch: { tasks: [{ id: 'logo', reason: '使用新配色' }] } }) });
  assert.deepEqual(changed.savedPlan?.selectedSkillIds, next);
  assert.deepEqual(changed.savedPlan?.plan.taskGraph[0].skillIds, next);
  assert.deepEqual(changed.savedPlan?.plan.taskGraph[1].skillIds, [...next, 'other']);
});
