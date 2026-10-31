import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { Agent } from '@mastra/core/agent';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { z } from 'zod';
import { buildDesignPlanMessages, readDesignPlanProductImages } from './services/image-studio-plan-images.js';

const user = { id: 'owner', email: 'test@example.com', name: 'Test', role: 'customer_service' as const };
const rows = [{ id: 'product-image', kind: 'image', role: 'product', filename: 'product.png', object_key: 'private/product.png' }];
const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: '#eeaa00' } }).png().toBuffer();

function loaders(overrides: Partial<Parameters<typeof readDesignPlanProductImages>[3]> = {}) {
  return {
    list: async () => [...rows, { ...rows[0], id: 'competitor', role: 'competitor' }],
    assets: async (projectId: string, ownerId: string, ids: string[]) => {
      assert.equal(projectId, 'project'); assert.equal(ownerId, user.id); assert.deepEqual(ids, ['product-image']); return rows;
    },
    object: async (key: string) => { assert.equal(key, 'private/product.png'); return { content: await png() } as any; },
    ...overrides,
  };
}

test('legacy requests include project product images only, read from private OSS and encoded as image content', async () => {
  const images = await readDesignPlanProductImages('project', user, undefined, loaders());
  assert.equal(images.length, 1);
  assert.equal(images[0].id, 'product-image');
  assert.equal(images[0].mediaType, 'image/jpeg');
  assert.equal((await sharp(Buffer.from(images[0].data, 'base64')).metadata()).width, 8);
});

test('explicit references are deduplicated; empty references preserve text-only requests', async () => {
  assert.equal((await readDesignPlanProductImages('project', user, ['product-image', 'product-image'], loaders())).length, 1);
  assert.deepEqual(await readDesignPlanProductImages('project', user, [], loaders()), []);
  assert.equal(buildDesignPlanMessages('text only', []), 'text only');
});

test('invalid, foreign, non-product and excessive references fail before OSS access', async () => {
  const object = async () => { throw new Error('Must not read invalid assets'); };
  for (const assets of [[], [{ ...rows[0], role: 'competitor' }], [{ ...rows[0], kind: 'video' }]]) {
    await assert.rejects(readDesignPlanProductImages('project', user, ['product-image'], loaders({ assets: async () => assets, object })), (error: any) => error.code === 'IMAGE_STUDIO_ASSET_INVALID');
  }
  await assert.rejects(readDesignPlanProductImages('project', user, Array.from({ length: 13 }, (_, i) => `image-${i}`), loaders({ object })), (error: any) => error.code === 'IMAGE_STUDIO_REFERENCE_LIMIT');
});

test('Mastra and the compatible provider send actual image_url content to the upstream model', async () => {
  const images = await readDesignPlanProductImages('project', user, undefined, loaders());
  let upstream: any;
  const provider = createOpenAICompatible({ name: 'test', baseURL: 'https://mock.invalid/v1', apiKey: 'test', supportsStructuredOutputs: false, fetch: async (_url, init) => {
    upstream = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ id: 'test', object: 'chat.completion', created: 0, model: 'vision-test',
      choices: [{ index: 0, message: { role: 'assistant', content: '{"summary":"已读取商品图"}' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }), { headers: { 'Content-Type': 'application/json' } });
  } });
  const agent = new Agent({ id: 'test-plan-images', name: 'Test', instructions: 'Read the product image.', model: provider.chatModel('vision-test') as any });
  const result = await agent.generate(buildDesignPlanMessages('根据商品图设计方案', images), {
    maxSteps: 1, structuredOutput: { schema: z.object({ summary: z.string() }), jsonPromptInjection: 'system' },
  });
  assert.equal(result.object.summary, '已读取商品图');
  const message = upstream.messages.find((item: any) => item.role === 'user');
  assert.equal(message.content[0].text, '根据商品图设计方案');
  assert.equal(message.content[1].type, 'image_url');
  assert.equal(message.content[1].image_url.url, `data:${images[0].mediaType};base64,${images[0].data}`);
});
