import assert from 'node:assert/strict';
import test from 'node:test';
import { Agent } from '@mastra/core/agent';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import sharp from 'sharp';
import { generateDesignPlanOutput, type ImageStudioDesignPlan } from './services/image-studio-design-agent.js';
import { buildDesignPlanMessages } from './services/image-studio-plan-images.js';

const direction = (id: string) => ({
  id, name: '黑橙运动风', concept: '根据商品实拍规划', positioning: '', audience: '', keywords: ['黑橙'],
  palette: ['#17191C', '#F05A24', '#F4F5F6'].map((hex) => ({ name: hex, hex, usage: '参考配色' })),
  typography: '无衬线', imagery: '商品实拍', rationale: '呼应商品颜色', deliverables: ['商品主图'],
});
const plan: ImageStudioDesignPlan = {
  summary: '基于商品图规划淘宝套图',
  brief: { brandName: '', productOrService: '护膝', positioning: '', targetAudience: '', marketAndChannel: '淘宝', businessGoal: '', knownFacts: ['黑橙外观'], constraints: [], factsToConfirm: ['材质待确认'] },
  questions: [{ id: 'material', label: '材质', prompt: '请确认商品材质', required: true, answerType: 'text', options: [] }],
  recommendedSkills: [], directions: [direction('direction-1'), direction('direction-2')],
  nextSteps: ['确认商品信息'], selectedDirectionId: null,
  taskGraph: [{ id: 'generate', title: '生成套图', kind: 'image_generation', reason: '依据确认方向生成', dependsOn: [], skillIds: [], inputs: ['商品图'], outputs: ['商品主图'], reviewPolicy: 'confirm' }],
};

function mockAgent(content: unknown, inspect?: (request: any) => void) {
  const provider = createOpenAICompatible({
    name: 'test-design-plan', baseURL: 'https://mock.invalid/v1', apiKey: 'test', supportsStructuredOutputs: false,
    fetch: async (_url, init) => {
      inspect?.(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: 'test', object: 'chat.completion', created: 0, model: 'mock-vision',
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(content) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }), { headers: { 'Content-Type': 'application/json' } });
    },
  });
  return new Agent({ id: 'design-output-test', name: 'Test', instructions: '用中文生成设计方案。', model: provider.chatModel('mock-vision') as any });
}

test('production plan generation injects the complete schema alongside product image content', async () => {
  const data = (await sharp({ create: { width: 8, height: 8, channels: 3, background: '#f05a24' } }).png().toBuffer()).toString('base64');
  const agent = mockAgent(plan, (request) => {
    const system = request.messages.filter((message: any) => message.role === 'system').map((message: any) => message.content).join('\n');
    for (const field of ['brandName', 'knownFacts', 'factsToConfirm', 'answerType', 'palette', 'usage', 'recommendedSkills', 'reviewPolicy', 'automatic']) {
      assert.ok(system.includes(field), `Model must receive schema field/enum: ${field}`);
    }
    const parts = request.messages.filter((message: any) => message.role === 'user').flatMap((message: any) => Array.isArray(message.content) ? message.content : []);
    assert.equal(parts.find((part: any) => part.type === 'image_url')?.image_url.url, `data:image/png;base64,${data}`);
  });
  const result = await generateDesignPlanOutput(agent, buildDesignPlanMessages('规划护膝淘宝商品图', [{ mediaType: 'image/png', data }]));
  assert.deepEqual(result, plan);
});

test('a malformed provider plan becomes a readable 502 response instead of a raw 500 schema error', async () => {
  // Matches the reported response shape: colors/question and narrative reviewPolicy.
  const agent = mockAgent({ brief: { projectName: '商品套图' }, questions: [{ question: '商品材质？' }],
    directions: [{ colors: ['#17191C'] }], taskGraph: [{ reviewPolicy: '请客户确认' }] });
  await assert.rejects(generateDesignPlanOutput(agent, '生成商品设计方案'), (error: any) =>
    error.status === 502 && error.code === 'DESIGN_AGENT_OUTPUT_INVALID' && !error.message.includes('Required'));
});

test('schema repair normalizes common model aliases and noncanonical review policies', async () => {
  const agent = mockAgent({ summary: '品牌识别方案', brief: { projectName: '山野咖啡', product: '精品咖啡' },
    questions: [{ question: '主要销售渠道？', options: ['线上', '线下'] }], recommendedSkills: [],
    directions: [
      { title: '山野自然', description: '使用自然有机的图形与色彩', colors: ['#234567', '#89ABCD', '#F1F2F3'] },
      { title: '现代精品', description: '以简约排版强化品质感', colors: ['#112233', '#445566', '#778899'] },
    ], nextSteps: ['确认方向'], taskGraph: [{ title: '客户审核', kind: 'review', reviewPolicy: '请客户确认' }] });
  const result = await generateDesignPlanOutput(agent, '生成品牌设计方案');
  assert.equal(result.brief.brandName, '山野咖啡');
  assert.equal(result.questions[0].prompt, '主要销售渠道？');
  assert.equal(result.directions.length, 2);
  assert.equal(result.directions[0].palette[0].hex, '#234567');
  assert.equal(result.taskGraph[0].reviewPolicy, 'confirm');
});

test('generation timeouts become a readable 504 response', async () => {
  const agent = { generate: async () => { throw new DOMException('Request timed out', 'TimeoutError'); } } as unknown as Agent;
  await assert.rejects(generateDesignPlanOutput(agent, '生成商品设计方案'), (error: any) => error.status === 504 && error.code === 'DESIGN_AGENT_TIMEOUT');
});
