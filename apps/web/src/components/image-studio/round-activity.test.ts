import assert from 'node:assert/strict';
import test from 'node:test';
import { getRoundActivity, type RoundExecution, type RoundJob } from './round-activity';

test('后台任务更新只出现在所属轮次，旧任务不会被猜测归属', () => {
  const executions: RoundExecution[] = [{ roundId: 'round-1', taskId: 'direction', taskTitle: '规划方向', status: 'completed', updatedAt: '2026-01-01T00:00:00Z' }];
  const jobs: RoundJob[] = [
    { id: 'job-2', status: 'running', progress: 35, createdAt: '2026-01-01T00:02:00Z', context: { roundId: 'round-2', taskId: 'image', taskTitle: '生成图片' } },
    { id: 'job-1', status: 'completed', progress: 100, createdAt: '2026-01-01T00:01:00Z', context: { roundId: 'round-1', taskId: 'image', taskTitle: '生成图片' } },
    { id: 'old-job', status: 'completed', progress: 100, context: { taskId: 'image' } },
  ];
  assert.deepEqual(getRoundActivity('round-1', executions, jobs).map((entry) => entry.key), ['direction:2026-01-01T00:00:00Z', 'job-1']);
  assert.deepEqual(getRoundActivity('round-2', executions, jobs).map((entry) => [entry.key, entry.progress]), [['job-2', 35]]);
  jobs[1].status = 'failed';
  assert.equal(getRoundActivity('round-1', executions, jobs)[1].status, 'failed');
  assert.equal(getRoundActivity('round-2', executions, jobs)[0].status, 'running');
});
