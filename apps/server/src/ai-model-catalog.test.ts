import assert from 'node:assert/strict';
import test from 'node:test';
import { aiModelsEndpoint, parseProviderModels } from './services/ai-model-catalog.js';
import { defaultAiTextModel, type AiConfiguredModel } from './services/ai-config.js';

test('model discovery resolves roots, versioned bases and explicit operation URLs', () => {
  for (const base of ['https://provider.example', 'https://provider.example/v1/', 'https://provider.example/v1/chat/completions', 'https://provider.example/v1/images/generations', 'https://provider.example/v1/models']) {
    assert.equal(aiModelsEndpoint(base), 'https://provider.example/v1/models');
  }
  assert.equal(aiModelsEndpoint('https://provider.example/openai/v1'), 'https://provider.example/openai/v1/models');
  assert.equal(aiModelsEndpoint('http://127.0.0.1:1234'), 'http://127.0.0.1:1234/v1/models');
  for (const base of ['file:///etc/passwd', 'http://provider.example', 'https://secret@provider.example', 'https://provider.example?key=secret']) assert.throws(() => aiModelsEndpoint(base));
});

test('model catalogs deduplicate valid identifiers without assuming model capabilities', () => {
  assert.deepEqual(parseProviderModels({ data: [{ id: ' model-b ', owned_by: 'provider' }, { id: 'model-a' }, { id: 'model-b' }, { id: 123 }, null, {}, { id: '' }, { id: 'bad\nmodel' }] }), [
    { id: 'model-a' }, { id: 'model-b', ownedBy: 'provider' },
  ]);
  assert.deepEqual(parseProviderModels({ models: ['image-a', 'chat-b'] }), [{ id: 'chat-b' }, { id: 'image-a' }]);
  assert.deepEqual(parseProviderModels({ data: [] }), []);
  assert.throws(() => parseProviderModels({ error: 'invalid key' }), /有效的模型列表/);
});

test('legacy text tasks keep legacy models and never select an image-only profile', () => {
  const image: AiConfiguredModel = { id: 'image', name: 'image', model: 'image-model', capability: 'image', protocol: 'openai-images', enabled: true };
  const text: AiConfiguredModel = { id: 'text', name: 'chat', model: 'chat-model', capability: 'text', protocol: 'openai-chat', enabled: true };
  assert.equal(defaultAiTextModel({ model: 'legacy-chat', models: [] }), 'legacy-chat');
  assert.equal(defaultAiTextModel({ model: 'legacy-chat', models: [image] }), 'legacy-chat');
  assert.equal(defaultAiTextModel({ model: 'image-model', models: [image] }), null);
  assert.equal(defaultAiTextModel({ model: 'image-model', models: [image, text] }), 'chat-model');
  assert.equal(defaultAiTextModel({ model: 'image-model', models: [image, { ...text, enabled: false }] }), null);
});
