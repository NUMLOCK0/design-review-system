import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { parseLogoTextResponse, recognizeLogoText } from './logo-text-recognition.js';

test('recognition returns bounded suggestions without automatically selecting or inventing a name', () => {
  assert.deepEqual(parseLogoTextResponse('```json\n{"candidates":[" 毛球星球 ","毛球星球","","PETS"]}\n```').candidates, ['毛球星球', 'PETS']);
  assert.deepEqual(parseLogoTextResponse('{"candidates":[]}').candidates, []);
  assert.deepEqual(parseLogoTextResponse(JSON.stringify({ candidates: Array.from({ length: 9 }, (_, i) => `文字${i}`) })).candidates.length, 5);
  assert.throws(() => parseLogoTextResponse('无法识别'), /格式无效/);
});

test('recognition uses the explicitly selected vision profile and owned source', async () => {
  const source = await sharp({ create: { width: 5, height: 5, channels: 3, background: '#ffffff' } }).png().toBuffer();
  let requested = false;
  const deps = {
    getProject: async () => ({ workflow: {} }),
    resolveModel: async (_workflow: unknown, profile: string, _loaders: unknown, requireVision: boolean) => {
      assert.equal(profile, 'vision-1'); assert.equal(requireVision, true);
      return { baseUrl: 'https://example.com/v1', apiKey: 'secret', model: 'vision', configId: 'config', profileId: profile };
    },
    loadSource: async (projectId: string, user: { id: string }, input: { assetId: string }) => { assert.equal(projectId, 'project'); assert.equal(user.id, 'owner'); assert.equal(input.assetId, 'asset'); return source; },
    fetchJson: async (url: string, init: RequestInit) => {
      requested = true; assert.equal(url, 'https://example.com/v1/chat/completions');
      const body = JSON.parse(String(init.body));
      assert.equal(body.model, 'vision'); assert.match(body.messages[1].content[1].image_url.url, /^data:image\/png;base64,/);
      return { response: { ok: true }, data: { choices: [{ message: { content: '{"candidates":["毛球星球"]}' } }] } };
    },
  };
  const result = await recognizeLogoText('project', { id: 'owner', email: '', name: '', role: 'advertiser' }, { assetId: 'asset', source: 'studio', mode: 'ocr', visionProfileId: 'vision-1' }, 'job', deps as any);
  assert.equal(requested, true); assert.deepEqual(result.candidates, ['毛球星球']);
  await assert.rejects(recognizeLogoText('project', { id: 'owner', email: '', name: '', role: 'advertiser' }, { assetId: 'asset', source: 'studio', mode: 'ocr' }, 'job', deps as any), /图片理解模型/);
});
