import { createHash, randomUUID } from 'node:crypto';
import { dbPool } from '../config/database.js';
import type { AuthUserPayload } from '../middleware/auth.middleware.js';
import { imageStudioDesignPlanSchema, type ImageStudioDesignPlan } from './image-studio-design-agent.js';
import { validateOrchestrationGraph, type OrchestrationTask } from './image-studio-orchestration-graph.js';
import { studioAgentForTask, studioAgents } from './image-studio-agent-registry.js';

const fail = (message: string, status: number, code: string): never => { throw Object.assign(new Error(message), { status, code }); };
const parse = (value: unknown): any => typeof value === 'string' ? JSON.parse(value) : value;

export function buildOrchestrationDraftGraph(plan: ImageStudioDesignPlan): OrchestrationTask[] {
  const tasks = plan.logoExploration ? plan.taskGraph.filter((task) => task.id === plan.logoExploration!.taskId) : plan.taskGraph;
  if (plan.logoExploration && (tasks.length !== 1 || tasks[0].kind !== 'image_generation' || tasks[0].dependsOn.length)) fail('Logo 候选制作任务无效', 409, 'ORCHESTRATION_INVALID_LOGO_CANDIDATES');
  const graph: OrchestrationTask[] = tasks.map((task) => ({ id: task.id, dependsOn: task.dependsOn, status: 'pending',
    approval: task.kind === 'review' ? 'none' : task.reviewPolicy !== 'automatic' || ['manual', 'delivery', 'image_generation'].includes(task.kind) ? 'required' : 'none', approved: false }));
  validateOrchestrationGraph(graph);
  return graph;
}

/** Create a durable draft only. No task is dispatched and no model is called. */
export async function createOrchestrationDraft(projectId: string, user: AuthUserPayload, input: { planVersion: number; idempotencyKey: string }) {
  if (!dbPool) fail('生图工作台需要可用的数据库', 503, 'IMAGE_STUDIO_DATABASE_UNAVAILABLE');
  if (!/^[\w-]{1,64}$/.test(projectId) || !Number.isSafeInteger(input.planVersion) || input.planVersion < 1 || input.idempotencyKey.length < 16 || input.idempotencyKey.length > 128)
    fail('调度请求参数无效', 400, 'ORCHESTRATION_INVALID_REQUEST');
  const requestHash = createHash('sha256').update(JSON.stringify({ projectId, planVersion: input.planVersion })).digest('hex');
  const connection = await dbPool!.getConnection();
  try {
    await connection.beginTransaction();
    // Serialise same-owner idempotency checks before inserting the unique key.
    const [users]: any = await connection.query('SELECT id FROM users WHERE id=? FOR UPDATE', [user.id]);
    if (!users[0]) fail('用户不存在', 403, 'ORCHESTRATION_FORBIDDEN');
    const [existing]: any = await connection.query('SELECT id,project_id,request_hash,status FROM image_studio_orchestration_runs WHERE owner_id=? AND idempotency_key=?', [user.id, input.idempotencyKey]);
    if (existing[0]) {
      if (String(existing[0].request_hash) !== requestHash || String(existing[0].project_id) !== projectId) fail('幂等键已用于其他请求', 409, 'ORCHESTRATION_IDEMPOTENCY_CONFLICT');
      await connection.commit();
      return { id: String(existing[0].id), status: String(existing[0].status), duplicate: true };
    }
    const [projects]: any = await connection.query('SELECT workflow_json FROM image_studio_projects WHERE id=? AND owner_id=? AND deleted_at IS NULL FOR UPDATE', [projectId, user.id]);
    if (!projects[0]) fail('项目不存在或无权访问', 404, 'ORCHESTRATION_PROJECT_NOT_FOUND');
    const saved = parse(projects[0].workflow_json)?.designAgent;
    if (!saved || saved.version !== input.planVersion) fail('设计方案已变化，请刷新后重试', 409, 'ORCHESTRATION_PLAN_CHANGED');
    if (saved.status !== 'approved') fail('请先确认设计方案', 409, 'ORCHESTRATION_PLAN_NOT_APPROVED');
    const [active]: any = await connection.query("SELECT status FROM image_studio_orchestration_runs WHERE project_id=? AND owner_id=? AND status IN ('running','waiting_user','cancelling') LIMIT 1", [projectId, user.id]);
    if (active.length) fail(active[0].status === 'waiting_user' ? '当前制作计划正在等待确认，请在后台制作计划中确认后继续' : '当前已有制作计划正在执行，请在后台制作计划中查看进度', 409, 'ORCHESTRATION_ACTIVE_RUN');
    const plan = imageStudioDesignPlanSchema.parse(saved.plan);
    if (!plan.logoExploration && (!plan.selectedDirectionId || !plan.directions.some((direction) => direction.id === plan.selectedDirectionId))) fail('请先选择有效的设计方向', 409, 'ORCHESTRATION_DIRECTION_REQUIRED');
    const graph = buildOrchestrationDraftGraph(plan);
    const runId = randomUUID(); const timestamp = new Date();
    await connection.query(`INSERT INTO image_studio_orchestration_runs (id,project_id,owner_id,idempotency_key,request_hash,status,plan_version,plan_snapshot_json,created_at,updated_at)
      VALUES (?,?,?,?,?,'draft',?,?,?,?)`, [runId, projectId, user.id, input.idempotencyKey, requestHash, input.planVersion, JSON.stringify(saved), timestamp, timestamp]);
    for (const task of plan.taskGraph.filter((item) => graph.some((entry) => entry.id === item.id))) {
      const entry = graph.find((item) => item.id === task.id)!;
      await connection.query(`INSERT INTO image_studio_orchestration_tasks (id,run_id,project_id,owner_id,task_key,kind,status,approval_required,approved,depends_on_json,input_snapshot_json,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'pending',?,FALSE,?,?,?,?)`, [randomUUID(), runId, projectId, user.id, task.id, task.kind, entry.approval === 'required', JSON.stringify(task.dependsOn), JSON.stringify(task), timestamp, timestamp]);
    }
    await connection.query(`INSERT INTO image_studio_orchestration_events (run_id,project_id,owner_id,event_type,payload_json,created_at)
      VALUES (?,?,?,'run.draft_created',?,?)`, [runId, projectId, user.id, JSON.stringify({ planVersion: input.planVersion, taskCount: graph.length }), timestamp]);
    await connection.commit();
    return { id: runId, status: 'draft' as const, duplicate: false };
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}

export async function getOrchestrationDraft(projectId: string, runId: string, user: AuthUserPayload) {
  if (!dbPool) fail('生图工作台需要可用的数据库', 503, 'IMAGE_STUDIO_DATABASE_UNAVAILABLE');
  const [runs]: any = await dbPool!.query(`SELECT r.id,r.status,r.plan_version,r.created_at,r.updated_at FROM image_studio_orchestration_runs r
    JOIN image_studio_projects p ON p.id=r.project_id AND p.owner_id=r.owner_id AND p.deleted_at IS NULL
    WHERE r.id=? AND r.project_id=? AND r.owner_id=? LIMIT 1`, [runId, projectId, user.id]);
  if (!runs[0]) fail('调度任务不存在或无权访问', 404, 'ORCHESTRATION_NOT_FOUND');
  const [tasks]: any = await dbPool!.query(`SELECT t.task_key,t.kind,t.status,t.approval_required,t.approved,t.depends_on_json,t.input_snapshot_json,t.job_id,t.error_code,t.error_message,j.result_json,j.request_json
    FROM image_studio_orchestration_tasks t LEFT JOIN image_studio_jobs j ON j.id=t.job_id AND j.owner_id=t.owner_id
    WHERE t.run_id=? AND t.project_id=? AND t.owner_id=? ORDER BY t.created_at,t.id`, [runId, projectId, user.id]);
  return { id: String(runs[0].id), status: String(runs[0].status), planVersion: Number(runs[0].plan_version),
    tasks: tasks.map((task: any) => ({ id: String(task.task_key), title: parse(task.input_snapshot_json)?.title || String(task.task_key), kind: String(task.kind), agentName: (() => { const role = studioAgentForTask(String(task.kind)); return role ? studioAgents[role as keyof typeof studioAgents].name : null; })(), status: String(task.status), approvalRequired: Boolean(task.approval_required),
      approved: Boolean(task.approved), dependsOn: parse(task.depends_on_json), jobId: task.job_id || null, result: parse(task.result_json) || (parse(task.input_snapshot_json)?.resultSummary ? { summary: parse(task.input_snapshot_json).resultSummary } : null),
      downloadUrl: task.kind === 'delivery' && task.status === 'completed' && parse(task.request_json)?.exportId ? `/api/image-studio/exports/${encodeURIComponent(parse(task.request_json).exportId)}/download` : null,
      errorCode: task.error_code || null, errorMessage: task.error_message || null })) };
}
