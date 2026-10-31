import test from 'node:test';
import assert from 'node:assert/strict';
import { applyInvestigationToPlan, gateProductInvestigation, generateProductInvestigation, investigationSchema, productInvestigationContextHash } from './product-investigation.js';
import type { ImageStudioDesignPlan } from './image-studio-design-agent.js';

const task = (id: string, kind: 'analysis' | 'image_generation' | 'review', dependsOn: string[] = []) => ({ id, title: id, kind, reason: '', dependsOn, skillIds: [], inputs: [], outputs: [], reviewPolicy: 'automatic' as const });
const plan: ImageStudioDesignPlan = { summary: '商品方案', brief: { brandName: '', productOrService: '零食', positioning: '', targetAudience: '', marketAndChannel: '', businessGoal: '', knownFacts: [], constraints: [], factsToConfirm: [] }, questions: [], recommendedSkills: [], directions: [], nextSteps: [], selectedDirectionId: null, taskGraph: [task('analysis', 'analysis'), task('old', 'image_generation', ['analysis']), task('review', 'review', ['old'])] };
const data = investigationSchema.parse({ productType: '零食', summary: '建议清单', items: Array.from({ length: 11 }, (_, i) => ({ id: `item-${i}`, kind: i < 5 ? 'main' : 'detail', title: `图片${i}`, purpose: `目的${i}`, requiredMaterials: [] })), missingMaterials: [], cautions: [] });
test('未确认图片清单时拦截提前返回的方案和制作请求', () => {
  const output: any = { intent: 'create_plan', reply: '方案', createPlan: plan, productionRequests: [{ taskId: '*', slotKeys: [], instruction: '', label: '开始' }], memoryUpdates: [], affectedTaskIds: [] };
  const blocked = gateProductInvestigation(output, null);
  assert.equal(blocked.createPlan, undefined); assert.deepEqual(blocked.productionRequests, []); assert.match(blocked.reply, /确认图片清单/);
  const allowed = gateProductInvestigation(output, data);
  assert.equal(allowed.createPlan!.taskGraph.filter((task) => task.kind === 'image_generation').flatMap((task) => task.outputs).length, 11);
});
test('确认清单转成逐图任务并保留分析与审稿依赖', () => {
  const result = applyInvestigationToPlan(plan, data);
  const images = result.taskGraph.filter((task) => task.kind === 'image_generation');
  assert.deepEqual(images.map((task) => task.outputs.length), [8, 3]);
  assert.equal(images.flatMap((task) => task.outputs).length, 11);
  assert.deepEqual(images[0].dependsOn, ['analysis']);
  assert.deepEqual(result.taskGraph.find((task) => task.id === 'review')!.dependsOn, images.map((task) => task.id));
  assert.equal(plan.taskGraph[1].id, 'old');
});
test('拒绝重复 ID 和会引入循环的任务图', () => {
  assert.equal(investigationSchema.safeParse({ ...data, items: [data.items[0], data.items[0]] }).success, false);
  assert.throws(() => applyInvestigationToPlan({ ...plan, taskGraph: [task('old', 'image_generation', ['review']), task('review', 'review', ['old'])] }, data), /循环/);
});
test('上下文哈希忽略顺序，但需求或素材变动会使调查失效', () => {
  const memory = { fields: { a: { status: 'confirmed', label: '类型', value: '零食' } } };
  const assets = [{ id: '1', role: 'product', kind: 'image', filename: 'a.png' }, { id: '2', role: 'report', kind: 'document', filename: 'a.pdf' }];
  const hash = productInvestigationContextHash(memory, assets, '淘宝');
  assert.equal(hash, productInvestigationContextHash(memory, [...assets].reverse(), '淘宝'));
  assert.notEqual(hash, productInvestigationContextHash(memory, assets.slice(0, 1), '淘宝'));
  assert.notEqual(hash, productInvestigationContextHash(memory, assets, '京东'));
});

test('需求确认后调查读取报告及公开资料，记录来源且不把报告设为确认事实', async () => {
  const project = { id: 'p', version: 1, platform: '淘宝', workflow: {} };
  const conversation = { project, revision: 1, requirements: { product: { confirmed: true } }, memory: { fields: { x: { label: '类型', value: '零食', status: 'confirmed' } } } };
  const assets = [{ id: 'p1', role: 'product', kind: 'image', filename: '商品.png' }, { id: 'd1', role: 'report', kind: 'document', filename: '报告.pdf' }];
  let sent: any;
  const deps = {
    getConversation: async () => conversation,
    listAssets: async () => assets,
    resolveModel: async (_w: unknown, id: string, _l: unknown, vision: boolean) => { assert.equal(id, 'vision'); assert.equal(vision, true); return { model: 'model', baseUrl: 'https://example.com', apiKey: 'secret', profileId: 'vision', configId: 'c' }; },
    readImages: async (_p: string, _u: unknown, ids: string[]) => { assert.deepEqual(ids, ['p1']); return [{ id: 'p1', mediaType: 'image/png', data: 'aGVsbG8=' }]; },
    readReports: async () => ({ pages: [{ assetId: 'd1', filename: '报告.pdf', page: 1, text: '检测数据', source: 'pdf_text' }], statuses: [{ assetId: 'd1', filename: '报告.pdf', status: 'read' }], scannedImages: [] }),
    searchSources: async () => ({ status: 'complete', sources: [{ title: '公开资料', url: 'https://example.com/reference', excerpt: '商品展示参考' }] }),
    fetchJson: async (_url: string, init: RequestInit) => { sent = JSON.parse(String(init.body)); return { response: { ok: true }, data: { choices: [{ message: { content: JSON.stringify({ ...data, items: data.items.map(({ id: _id, ...item }) => item) }) } }] } }; },
    updateProject: async (_id: string, _user: unknown, input: any) => ({ ...project, version: 2, workflow: input.workflow }),
  };
  const user = { id: 'user', email: '', name: '', role: 'customer_service' as const };
  const result = await generateProductInvestigation('p', user, { productType: '零食', visionProfileId: 'vision' }, deps as any);
  assert.equal(result.investigation.status, 'draft'); assert.equal(result.investigation.data.items.length, 11);
  assert.equal(sent.messages[1].content[2].type, 'image_url');
  assert.match(sent.messages[0].content, /待人工核对/);
  assert.equal(result.investigation.data.reportPages[0].page, 1);
  assert.equal(result.investigation.data.webResearch.sources[0].url, 'https://example.com/reference');
  await assert.rejects(generateProductInvestigation('p', user, { productType: '零食' }, { ...deps, getConversation: async () => ({ ...conversation, requirements: {} }) } as any), /确认商品需求/);
});

test('扫描页只接受实际发送页面的 OCR，搜索未配置时保留跳过状态', async () => {
  const project = { id: 'p', version: 1, platform: null, workflow: {} };
  const conversation = { project, requirements: { product: { confirmed: true } }, memory: { fields: {} } };
  const assets = [{ id: 'd1', role: 'report', kind: 'document', mimeType: 'application/pdf', filename: '报告.pdf' }];
  const deps = { getConversation: async () => conversation, listAssets: async () => assets,
    resolveModel: async () => ({ model: 'v', baseUrl: 'https://example.com', apiKey: 'key', profileId: 'v', configId: 'c' }), readImages: async () => [],
    readReports: async () => ({ pages: [], statuses: [{ assetId: 'd1', filename: '报告.pdf', status: 'read' }], scannedImages: [{ assetId: 'd1', page: 1, mediaType: 'image/png', data: 'aGVsbG8=' }] }),
    searchSources: async () => ({ status: 'not_configured', sources: [] }),
    fetchJson: async () => ({ response: { ok: true }, data: { choices: [{ message: { content: JSON.stringify({ ...data, items: data.items.map(({ id: _id, ...item }) => item), reportOcr: [{ assetId: 'd1', page: 1, text: '识别的文字' }, { assetId: 'other', page: 1, text: '不应接受' }] }) } }] } }),
    updateProject: async (_id: string, _user: unknown, input: any) => ({ ...project, workflow: input.workflow }), };
  const result = await generateProductInvestigation('p', { id: 'u', email: '', name: '', role: 'customer_service' }, { productType: '零食', visionProfileId: 'v' }, deps as any);
  assert.equal(result.investigation.data.reportPages.length, 1); assert.equal(result.investigation.data.reportPages[0].source, 'vision_ocr');
  assert.equal(result.investigation.data.webResearch.status, 'not_configured');
});
