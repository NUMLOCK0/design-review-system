import type { DesignTask } from './design-plan-agent';

export function isProductionComplete(input: {
  planVersion?: number; productionStarted: boolean; completedRunVersion: number | null; isRunning: boolean;
  tasks: Array<Pick<DesignTask, 'id' | 'kind'>>; taskStates: Record<string, { status?: string }>;
}) {
  if (!input.planVersion || input.isRunning) return false;
  if (input.completedRunVersion === input.planVersion) return true;
  const productionTasks = input.tasks.filter((task) => task.kind !== 'delivery');
  return input.productionStarted && productionTasks.length > 0
    && productionTasks.every((task) => input.taskStates[`${input.planVersion}:${task.id}`]?.status === 'completed');
}
