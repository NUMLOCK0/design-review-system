import assert from 'node:assert/strict';
import test from 'node:test';
import { isProductionComplete } from './production-completion';

const tasks = [{ id: 'logo', kind: 'image_generation' as const }, { id: 'review', kind: 'review' as const }, { id: 'export', kind: 'delivery' as const }];
const base = { planVersion: 3, productionStarted: true, completedRunVersion: null, isRunning: false, tasks, taskStates: { '3:logo': { status: 'completed' }, '3:review': { status: 'completed' }, '3:export': { status: 'pending' } } };

test('成功生成和复核后置灰，待选择成品导出不影响制作完成', () => {
  assert.equal(isProductionComplete(base), true);
  assert.equal(isProductionComplete({ ...base, productionStarted: false }), false);
  assert.equal(isProductionComplete({ ...base, isRunning: true }), false);
});

test('失败、部分完成或新方案不会被旧版成功状态锁住', () => {
  assert.equal(isProductionComplete({ ...base, taskStates: { ...base.taskStates, '3:logo': { status: 'failed' } } }), false);
  assert.equal(isProductionComplete({ ...base, taskStates: { ...base.taskStates, '3:logo': { status: 'partial' } } }), false);
  assert.equal(isProductionComplete({ ...base, planVersion: 4 }), false);
  assert.equal(isProductionComplete({ ...base, tasks: [] }), false);
});

test('后台成功结果可恢复完成状态，运行中不误判完成', () => {
  assert.equal(isProductionComplete({ ...base, productionStarted: false, taskStates: {}, completedRunVersion: 3 }), true);
  assert.equal(isProductionComplete({ ...base, taskStates: {}, completedRunVersion: 2 }), false);
  assert.equal(isProductionComplete({ ...base, completedRunVersion: 3, isRunning: true }), false);
});
