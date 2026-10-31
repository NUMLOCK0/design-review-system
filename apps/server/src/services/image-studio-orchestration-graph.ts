/** Pure scheduling policy. Persistence and dispatch must atomically claim its decisions. */
export type OrchestrationStatus = 'pending' | 'queued' | 'running' | 'waiting_user' | 'completed' | 'failed' | 'cancelled' | 'stale';
export type OrchestrationTask = {
  id: string;
  dependsOn: string[];
  status: OrchestrationStatus;
  approval: 'none' | 'required';
  approved: boolean;
};
export type ScheduleDecision = { ready: string[]; waitingUser: string[]; blocked: Array<{ id: string; dependencies: string[] }> };

/** Reject invalid graphs before they can enter a durable queue. */
export function validateOrchestrationGraph(tasks: OrchestrationTask[]): void {
  if (!tasks.length || tasks.length > 128) throw new Error('任务图必须包含 1 至 128 个任务');
  const byId = new Map<string, OrchestrationTask>();
  for (const task of tasks) {
    if (!/^[\w-]{1,64}$/.test(task.id) || byId.has(task.id)) throw new Error('任务 ID 无效或重复');
    if (new Set(task.dependsOn).size !== task.dependsOn.length) throw new Error('任务依赖重复');
    byId.set(task.id, task);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error('任务依赖存在循环');
    if (visited.has(id)) return;
    const task = byId.get(id);
    if (!task) throw new Error('任务依赖不存在');
    visiting.add(id);
    for (const dependency of task.dependsOn) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const task of tasks) visit(task.id);
}

/** No side effects: never dispatch queued, failed, stale or running tasks again. */
export function nextOrchestrationTasks(tasks: OrchestrationTask[], maxConcurrent: number): ScheduleDecision {
  validateOrchestrationGraph(tasks);
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 128) throw new Error('并发数量无效');
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const capacity = Math.max(0, maxConcurrent - tasks.filter((task) => task.status === 'queued' || task.status === 'running').length);
  const ready: string[] = [];
  const waitingUser: string[] = [];
  const blocked: ScheduleDecision['blocked'] = [];
  for (const task of tasks) {
    if (task.status !== 'pending') continue;
    const dependencies = task.dependsOn.filter((id) => byId.get(id)?.status !== 'completed');
    if (dependencies.length) { blocked.push({ id: task.id, dependencies }); continue; }
    if (task.approval === 'required' && !task.approved) { waitingUser.push(task.id); continue; }
    if (ready.length < capacity) ready.push(task.id);
  }
  return { ready, waitingUser, blocked };
}

/** Invalidation propagates only from changed tasks to their dependants. */
export function affectedOrchestrationTasks(tasks: OrchestrationTask[], changedIds: string[]): string[] {
  validateOrchestrationGraph(tasks);
  const ids = new Set(tasks.map((task) => task.id));
  if (changedIds.some((id) => !ids.has(id))) throw new Error('受影响任务不存在');
  const affected = new Set(changedIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of tasks) if (!affected.has(task.id) && task.dependsOn.some((id) => affected.has(id))) { affected.add(task.id); changed = true; }
  }
  return tasks.filter((task) => affected.has(task.id)).map((task) => task.id);
}
