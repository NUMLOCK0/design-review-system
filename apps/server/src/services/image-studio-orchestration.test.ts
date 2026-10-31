import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildOrchestrationDraftGraph } from './image-studio-orchestration.js';
import type { ImageStudioDesignPlan } from './image-studio-design-agent.js';
import { nextOrchestrationTasks } from './image-studio-orchestration-graph.js';

test('drafts do not pre-approve image generation or manual checkpoints', () => {
  const plan = { taskGraph: [
    { id: 'text', kind: 'copywriting', dependsOn: [], reviewPolicy: 'automatic' },
    { id: 'image', kind: 'image_generation', dependsOn: ['text'], reviewPolicy: 'automatic' },
    { id: 'review', kind: 'review', dependsOn: ['image'], reviewPolicy: 'automatic' },
  ] } as ImageStudioDesignPlan;
  const graph = buildOrchestrationDraftGraph(plan);
  assert.deepEqual(graph.map((task) => task.approval), ['none', 'required', 'none']);
  graph[0].status = 'completed';
  assert.deepEqual(nextOrchestrationTasks(graph, 2), { ready: [], waitingUser: ['image'], blocked: [{ id: 'review', dependencies: ['image'] }] });
});

test('draft rejects malformed task dependencies', () => {
  const plan = { taskGraph: [{ id: 'image', kind: 'image_generation', dependsOn: ['missing'], reviewPolicy: 'automatic' }] } as ImageStudioDesignPlan;
  assert.throws(() => buildOrchestrationDraftGraph(plan), /依赖不存在/);
});
