import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { affectedOrchestrationTasks, nextOrchestrationTasks, validateOrchestrationGraph, type OrchestrationTask } from './image-studio-orchestration-graph.js';

const task = (id: string, dependsOn: string[] = [], overrides: Partial<OrchestrationTask> = {}): OrchestrationTask => ({ id, dependsOn, status: 'pending', approval: 'none', approved: false, ...overrides });

test('only schedules completed dependencies and respects approvals and concurrency', () => {
  const tasks = [task('brief', [], { status: 'completed' }), task('style', ['brief'], { approval: 'required' }), task('prompt', ['style']), task('other', [], { status: 'running' }), task('ready')];
  assert.deepEqual(nextOrchestrationTasks(tasks, 2), { ready: ['ready'], waitingUser: ['style'], blocked: [{ id: 'prompt', dependencies: ['style'] }] });
  assert.deepEqual(nextOrchestrationTasks(tasks, 1).ready, []);
  assert.deepEqual(nextOrchestrationTasks([task('a', [], { status: 'failed' }), task('b', ['a'])], 2).blocked, [{ id: 'b', dependencies: ['a'] }]);
});

test('rejects duplicate, missing and cyclic dependencies', () => {
  assert.throws(() => validateOrchestrationGraph([task('a'), task('a')]));
  assert.throws(() => validateOrchestrationGraph([task('a', ['missing'])]));
  assert.throws(() => validateOrchestrationGraph([task('a', ['b']), task('b', ['a'])]));
  assert.throws(() => validateOrchestrationGraph([task('a', ['a'])]));
});

test('invalidates only changed tasks and transitive dependants', () => {
  const graph = [task('brief'), task('logo', ['brief']), task('package', ['logo']), task('separate')];
  assert.deepEqual(affectedOrchestrationTasks(graph, ['logo']), ['logo', 'package']);
  assert.throws(() => affectedOrchestrationTasks(graph, ['missing']));
});
