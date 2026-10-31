import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveImageStudioTextModel } from './services/image-studio-model-selection.js';

test('explicit model selection overrides the project choice and preserves provider identity', async () => {
  const selected = await resolveImageStudioTextModel({ modelProfiles: { textProfileId: 'saved-model' } }, 'chosen-model', {
    profile: async (id, capabilities) => {
      assert.equal(id, 'chosen-model');
      assert.deepEqual(capabilities, ['text', 'vision']);
      return { id, configId: 'chosen-provider', name: 'Selected', capability: 'text', model: 'upstream-model', baseUrl: 'https://provider.example/v1', apiKey: 'test-key' };
    },
    legacy: async () => { throw new Error('Must not use a different model'); },
  });
  assert.equal(selected?.model, 'upstream-model');
  assert.equal(selected?.configId, 'chosen-provider');
  assert.equal(selected?.profileId, 'chosen-model');
});

test('project model choice is used when callers do not supply an override', async () => {
  let requested = '';
  await assert.rejects(resolveImageStudioTextModel({ modelProfiles: { textProfileId: 'saved-model' } }, undefined, {
    profile: async (id) => { requested = id; return null; },
    legacy: async () => { throw new Error('Must not silently fall back'); },
  }), (error: any) => error.status === 409 && error.code === 'IMAGE_STUDIO_SELECTED_MODEL_UNAVAILABLE');
  assert.equal(requested, 'saved-model');
});

test('legacy projects retain a default only when no model has been selected', async () => {
  const selected = await resolveImageStudioTextModel({}, undefined, {
    profile: async () => { throw new Error('No explicit profile expected'); },
    legacy: async () => ({ id: 'legacy-config', baseUrl: 'https://provider.example/v1', apiKey: 'test-key', model: 'legacy-model' }),
  });
  assert.equal(selected?.profileId, null);
  assert.equal(selected?.model, 'legacy-model');
});

test('product-image planning uses the saved vision profile and never falls back to text', async () => {
  await assert.rejects(resolveImageStudioTextModel({ modelProfiles: { textProfileId: 'text', visionProfileId: 'vision' } }, undefined, {
    profile: async (id, capabilities) => { assert.equal(id, 'vision'); assert.deepEqual(capabilities, ['vision']); return null; },
    legacy: async () => { throw new Error('Must not fall back to text'); },
  }, true), (error: any) => error.status === 409);
  await assert.rejects(resolveImageStudioTextModel({}, undefined, {
    profile: async () => null, legacy: async () => { throw new Error('Must not fall back'); },
  }, true), (error: any) => error.status === 409);
});
