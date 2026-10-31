import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readStudioModelPreference, resolveStudioModels, saveStudioModelPreference } from './image-studio-models';

test('model preferences survive reload and project choices retain precedence', () => {
  const items = new Map<string, string>();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => items.set(key, value),
  } });
  try {
    assert.equal(readStudioModelPreference(), null);
    const chosen = { textProfileId: 'text-2', visionProfileId: 'vision-2', imageProfileId: 'image-2' };
    saveStudioModelPreference(chosen);
    assert.deepEqual(readStudioModelPreference(), chosen);
    assert.deepEqual(resolveStudioModels([], readStudioModelPreference()), chosen);
    assert.equal(resolveStudioModels([], { ...chosen, imageProfileId: 'project-image' }).imageProfileId, 'project-image');
    items.set('image-studio:last-model-selection:v1', '{bad');
    assert.equal(readStudioModelPreference(), null);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
