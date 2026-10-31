import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlanCanvasNodes, imageNodeId, imageTaskWaitMessage, isLogoConceptSlot, promptNodeId, readConnectedPrompt, taskSlots } from './canvas-plan';
import type { DesignTask, SavedPlan } from './design-plan-agent';

const task: DesignTask = { id: 'images', title: '品牌物料', kind: 'image_generation', reason: '保持品牌统一', dependsOn: [], skillIds: [], inputs: [], outputs: ['Logo', '名片'], reviewPolicy: 'confirm' };
const plan: SavedPlan = {
  version: 3, mode: 'brand', status: 'approved', inputBrief: '', answers: {}, selectedSkillIds: [], createdAt: '', updatedAt: '',
  plan: { summary: '品牌方案', brief: { brandName: '测试品牌', productOrService: '', positioning: '简洁', targetAudience: '青年', marketAndChannel: '', businessGoal: '', knownFacts: [], constraints: ['黑白'], factsToConfirm: [] }, questions: [], recommendedSkills: [], nextSteps: [], selectedDirectionId: 'a', directions: [{ id: 'a', name: '现代', concept: '几何', positioning: '', audience: '', rationale: '', keywords: [], palette: [], typography: '无衬线', imagery: '简约', deliverables: ['Logo', '名片'] }] },
};

test('调查确认的清单逐项生成槽位，标题中的数量不会改变总张数', () => {
  const planned = { ...task, id: 'product_images_1', outputs: ['主图：包含 3 张图片的产品包装', '详情模块：规格说明'] };
  assert.equal(taskSlots(planned, plan).length, 2);
  const result = createPlanCanvasNodes(plan, [planned], [], { x: 0, y: 0 }, true);
  assert.equal(result.nodes.filter((node) => node.metadata?.artifactType === 'image-prompt').length, 2);
});

test('开始制作后每张图对应一个文本节点和生图节点，已编辑节点不会被覆盖', () => {
  const result = createPlanCanvasNodes(plan, [task], [], { x: 200, y: 200 }, true);
  assert.equal(result.nodes.length, 4);
  assert.equal(result.connections.length, 2);
  for (const slot of taskSlots(task, plan)) {
    assert.ok(result.nodes.some((node) => node.id === imageNodeId(3, slot.slotKey) && node.metadata?.status === 'idle'));
    assert.ok(result.connections.some((link) => link.fromNodeId === promptNodeId(3, slot.slotKey) && link.toNodeId === imageNodeId(3, slot.slotKey)));
  }
  assert.deepEqual(taskSlots(task, plan).map((slot) => slot.slotKey), ['images-1', 'images-2']);
  const edited = result.nodes.map((node) => node.id === promptNodeId(3, 'images-1') ? { ...node, metadata: { ...node.metadata, content: '用户编辑的 Logo 要求' } } : node);
  const first = readConnectedPrompt(plan, 'images-1', edited, result.connections);
  assert.match(first, /用户编辑的 Logo 要求/);
  assert.doesNotMatch(first, /交付内容：名片/);
  const restored = createPlanCanvasNodes(plan, [task], edited, { x: 0, y: 0 }, true);
  assert.equal(restored.nodes.length, 0);
  assert.equal(restored.connections.length, 0);
});

test('断开逐图连接或清空提示词时不能生图，恢复时不擅自重连', () => {
  const result = createPlanCanvasNodes(plan, [task], [], { x: 200, y: 200 }, true);
  assert.throws(() => readConnectedPrompt(plan, 'images-1', result.nodes, []), /未连接/);
  const empty = result.nodes.map((node) => node.id === promptNodeId(3, 'images-1') ? { ...node, metadata: { ...node.metadata, content: ' ' } } : node);
  assert.throws(() => readConnectedPrompt(plan, 'images-1', empty, result.connections), /为空/);
  assert.equal(createPlanCanvasNodes(plan, [task], result.nodes, { x: 0, y: 0 }, true).connections.length, 0);
});

test('需求收集、待确认方案、已确认但尚未开始制作均不创建画布节点', () => {
  const draft = { ...plan, status: 'needs_review' as const };
  const draftResult = createPlanCanvasNodes(draft, [task], [], { x: 200, y: 200 });
  assert.equal(draftResult.nodes.length, 0);
  assert.equal(draftResult.connections.length, 0);
  const approved = createPlanCanvasNodes(plan, [task], draftResult.nodes, { x: 200, y: 200 });
  assert.equal(approved.nodes.length, 0);
  assert.equal(createPlanCanvasNodes(draft, [task], [], { x: 0, y: 0 }, true).nodes.length, 0);
});

test('多款 Logo 拆成独立画面，品牌应用物料不强加单标志限制', () => {
  const logoTask = { ...task, title: '制作副形概念探索稿', outputs: ['3 款 Logo 方案'] };
  const slots = taskSlots(logoTask, plan);
  assert.equal(slots.length, 3);
  assert.deepEqual(slots.map((slot) => slot.deliverable), ['Logo 方案 · 方案 1', 'Logo 方案 · 方案 2', 'Logo 方案 · 方案 3']);
  const result = createPlanCanvasNodes(plan, [logoTask], [], { x: 200, y: 200 }, true);
  assert.equal(result.nodes.filter((node) => node.metadata?.artifactType === 'image-prompt').length, 3);
  assert.ok(result.nodes.filter((node) => node.metadata?.artifactType === 'image-prompt').every((node) => node.metadata?.content?.includes('只呈现一个完整的 Logo 方案')));
  assert.equal(isLogoConceptSlot(task, '名片', plan), false);
  assert.equal(isLogoConceptSlot(task, 'Logo', plan), true);
});

test('独立文字排版模式只影响新建 Logo 提示词，不覆盖已编辑内容及应用物料', () => {
  const options = { logoSymbolOnly: true };
  const result = createPlanCanvasNodes(plan, [task], [], { x: 0, y: 0 }, true, {}, options);
  const logo = result.nodes.find((node) => node.id === promptNodeId(3, 'images-1'))!;
  const card = result.nodes.find((node) => node.id === promptNodeId(3, 'images-2'))!;
  assert.match(logo.metadata!.content!, /不要任何文字/);
  assert.doesNotMatch(card.metadata!.content!, /不要任何文字/);
  const edited = { ...logo, metadata: { ...logo.metadata, content: '用户修改过的提示词' } };
  assert.ok(!createPlanCanvasNodes(plan, [task], [edited], { x: 0, y: 0 }, true, {}, options).nodes.some((node) => node.id === edited.id));
  const product = createPlanCanvasNodes({ ...plan, mode: 'product' }, [task], [], { x: 0, y: 0 }, true, {}, options);
  assert.ok(product.nodes.every((node) => !node.metadata?.content?.includes('不要任何文字')));
});

test('未派发应用图明确显示人工确认及前置依赖，不把节点创建当成已出图', () => {
  const manual: DesignTask = { ...task, id: 'identity', title: '品牌识别规范', kind: 'manual', outputs: [] };
  const dependent = { ...task, dependsOn: ['identity'] };
  const states = { '3:identity': { status: 'blocked' }, '3:images': { status: 'pending' } };
  const message = imageTaskWaitMessage(3, dependent, [manual, dependent], states);
  assert.match(message, /等待确认：品牌识别规范/);
  assert.match(message, /后台制作计划/);
  const nodes = createPlanCanvasNodes(plan, [manual, dependent], [], { x: 0, y: 0 }, true, states).nodes.filter((node) => node.metadata?.artifactType === 'generated-image');
  assert.equal(nodes.length, 2);
  assert.ok(nodes.every((node) => node.metadata?.status === 'idle' && !node.metadata.content && node.metadata.workbenchStatusMessage === message));
  assert.equal(imageTaskWaitMessage(3, dependent, [manual, dependent], { '3:identity': { status: 'completed' } }), '等待调度生成');
});

test('逐图状态可区分生成中、加载结果、前置失败和间接人工阻塞', () => {
  const manual = { ...task, id: 'review', title: '确认规范', kind: 'manual' as const };
  const intermediate = { ...task, id: 'layout', title: '应用规划', dependsOn: ['review'] };
  const dependent = { ...task, dependsOn: ['layout'] };
  assert.match(imageTaskWaitMessage(3, dependent, [manual, intermediate, dependent], { '3:review': { status: 'waiting_user' } }), /等待确认：确认规范/);
  assert.match(imageTaskWaitMessage(3, task, [task], { '3:images': { status: 'running' } }), /等待模型返回/);
  assert.match(imageTaskWaitMessage(3, task, [task], { '3:images': { status: 'completed' } }), /正在加载结果/);
  assert.match(imageTaskWaitMessage(3, dependent, [intermediate, dependent], { '3:layout': { status: 'failed' } }), /前置任务失败：应用规划/);
});

test('六款 Logo 候选各有独立风格和单图节点，不受原有选中方向覆盖', () => {
  const candidates = Array.from({ length: 6 }, (_, index) => ({ id: `style-${index}`, name: `风格 ${index + 1}`, concept: `概念 ${index + 1}`, imagery: `图形 ${index + 1}`, typography: `字体 ${index + 1}`, palette: `配色 ${index + 1}` }));
  const candidateTask = { ...task, id: 'logo_candidates_v4', title: '多风格 Logo 候选', outputs: candidates.map((item) => item.name) };
  const candidatePlan = { ...plan, plan: { ...plan.plan, logoExploration: { taskId: candidateTask.id, candidates, referenceAssetIds: ['logo-ref'] } } };
  const result = createPlanCanvasNodes(candidatePlan, [candidateTask], [], { x: 0, y: 0 }, true);
  assert.equal(result.nodes.length, 12);
  assert.equal(result.connections.length, 6);
  taskSlots(candidateTask, candidatePlan).forEach((slot, index) => {
    const prompt = readConnectedPrompt(candidatePlan, slot.slotKey, result.nodes, result.connections);
    assert.match(prompt, new RegExp(`图形 ${index + 1}`));
    assert.match(prompt, /只呈现一个完整的 Logo 方案/);
    assert.doesNotMatch(prompt, /已选方向：现代/);
  });
  assert.equal(createPlanCanvasNodes(candidatePlan, [candidateTask], [], { x: 0, y: 0 }, false).nodes.length, 0);
});
