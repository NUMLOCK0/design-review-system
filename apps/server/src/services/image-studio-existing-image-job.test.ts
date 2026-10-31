import assert from 'node:assert/strict';
import test from 'node:test';
import { canReuseImageJob } from './image-studio-orchestration-runtime.js';

const expectedSlots = ['applications-1', 'applications-2'];
const completed = expectedSlots.map((slot_key) => ({ slot_key, status: 'completed', output_asset_id: `asset-${slot_key}` }));
const input = { expectedSlots, generations: completed, status: 'completed', taskId: 'applications', planVersion: 2, context: { taskId: 'applications', planVersion: 2 } };

test('reuse only a matching complete batch for the same task and approved plan', () => {
  assert.equal(canReuseImageJob(input), true);
  assert.equal(canReuseImageJob({ ...input, generations: completed.slice(0, 1) }), false);
  assert.equal(canReuseImageJob({ ...input, generations: [completed[0], completed[0]] }), false);
  assert.equal(canReuseImageJob({ ...input, generations: [completed[0], { ...completed[1], output_asset_id: null }] }), false);
  assert.equal(canReuseImageJob({ ...input, context: { taskId: 'other', planVersion: 2 } }), false);
  assert.equal(canReuseImageJob({ ...input, context: { taskId: 'applications', planVersion: 3 } }), false);
  assert.equal(canReuseImageJob({ ...input, status: 'failed' }), false);
});

test('reuse an already queued matching batch without resubmitting it', () => {
  assert.equal(canReuseImageJob({ ...input, status: 'queued', generations: completed.map((item) => ({ ...item, status: 'queued', output_asset_id: null })) }), true);
});
