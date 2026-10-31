import { randomUUID } from 'node:crypto';
import type { PoolConnection } from 'mysql2/promise';
import { dbPool } from '../config/database.js';
import type { AuthUserPayload } from '../middleware/auth.middleware.js';
import { createOrchestrationDraft, getOrchestrationDraft } from './image-studio-orchestration.js';
import { nextOrchestrationTasks, type OrchestrationTask } from './image-studio-orchestration-graph.js';
import { cancelImageStudioJob, createImageStudioExport, createImageStudioGenerationJob, createImageStudioTextJob, getImageStudioJob, getImageStudioProject, listImageStudioAssets, listImageStudioModelProfiles } from './image-studio.js';
import { isDesignReferenceSearchConfigured, searchDesignReferences } from './image-studio-reference-search.js';
import { listDesignSkills } from './design-skills.js';
import { z } from 'zod';
import { studioAgentForTask } from './image-studio-agent-registry.js';
import { stableJson } from './image-studio-agent-memory.js';
import { isUsableGenerationReference } from './image-studio-generation-references.js';

const parse = (v: any) => typeof v === 'string' ? JSON.parse(v) : v;
const fail = (message: string, code = 'ORCHESTRATION_CONFLICT', status = 409): never => { throw Object.assign(new Error(message), { status, code }); };
export const orchestrationStartSchema = z.object({ planVersion: z.number().int().positive(), idempotencyKey: z.string().min(16).max(128),
  roundId: z.string().max(64).optional(),
  prompts: z.array(z.object({ taskId: z.string().min(1).max(64), slotKey: z.string().min(1).max(128), prompt: z.string().min(1).max(20000) }).strict()).max(64),
}).strict();
export const orchestrationEnabled = () => process.env.IMAGE_STUDIO_ORCHESTRATION_ENABLED === 'true';

async function locked<T>(runId: string, fn: (connection: PoolConnection, row: any) => Promise<T>): Promise<T | undefined> {
  if (!dbPool) fail('数据库不可用', 'ORCHESTRATION_DATABASE_UNAVAILABLE', 503);
  const connection = await dbPool!.getConnection(); let acquired = false;
  try {
    const [locks]: any = await connection.query('SELECT GET_LOCK(?,2) AS acquired', [`studio-orchestration:${runId}`]);
    acquired = Number(locks[0]?.acquired) === 1;
    if (!acquired) return undefined;
    const [rows]: any = await connection.query('SELECT * FROM image_studio_orchestration_runs WHERE id=?', [runId]);
    if (!rows[0]) fail('调度任务不存在', 'ORCHESTRATION_NOT_FOUND', 404);
    return await fn(connection, rows[0]);
  } finally {
    if (acquired) await connection.query('SELECT RELEASE_LOCK(?)', [`studio-orchestration:${runId}`]).catch(() => undefined);
    connection.release();
  }
}
async function event(c: PoolConnection, run: any, type: string, payload: unknown, taskId?: string) {
  await c.query('INSERT INTO image_studio_orchestration_events (run_id,project_id,owner_id,task_id,event_type,payload_json,created_at) VALUES (?,?,?,?,?,?,NOW(3))', [run.id, run.project_id, run.owner_id, taskId || null, type, JSON.stringify(payload)]);
}
function owner(run: any, projectId: string, user: AuthUserPayload) {
  if (String(run.owner_id) !== user.id || String(run.project_id) !== projectId) fail('调度任务不存在或无权访问', 'ORCHESTRATION_NOT_FOUND', 404);
}
export async function startOrchestration(projectId: string, user: AuthUserPayload, raw: z.infer<typeof orchestrationStartSchema>) {
  const input = orchestrationStartSchema.parse(raw);
  const project = await getImageStudioProject(projectId, user);
  const saved: any = project.workflow && (project.workflow as any).designAgent;
  if (saved?.version !== input.planVersion || saved?.status !== 'approved') fail('方案已变化或尚未确认');
  const imageTasks = saved.plan.taskGraph.filter((task: any) => task.kind === 'image_generation'
    && (!saved.plan.logoExploration || task.id === saved.plan.logoExploration.taskId));
  if (new Set(input.prompts.map((p) => p.slotKey)).size !== input.prompts.length) fail('图片槽位重复');
  if (input.prompts.some((p) => !imageTasks.some((task: any) => task.id === p.taskId) || !p.slotKey.startsWith(`${p.taskId}-`))) fail('图片不属于当前方案');
  if (imageTasks.some((task: any) => !input.prompts.some((p) => p.taskId === task.id))) fail('方案中的生图任务缺少提示词');
  if (saved.plan.logoExploration && (imageTasks.length !== 1 || input.prompts.length !== saved.plan.logoExploration.candidates.length)) fail('Logo 候选数量与方案不一致，请刷新后重试');
  if (Buffer.byteLength(JSON.stringify(input), 'utf8') > 300000) fail('制作提示词过大');
  const draft = await createOrchestrationDraft(projectId, user, input);
  const result = await locked(draft.id, async (c, run) => {
    owner(run, projectId, user);
    if (run.status !== 'draft') {
      const existing = parse(run.plan_snapshot_json)?.execution;
      if (stableJson(existing?.prompts) !== stableJson(input.prompts) || existing?.roundId !== input.roundId) fail('本次制作内容已变化，请在后台查看已有计划；如需按新内容制作，请先结束当前计划', 'ORCHESTRATION_IDEMPOTENCY_CONFLICT');
      return true;
    }
    const [other]: any = await c.query("SELECT id FROM image_studio_orchestration_runs WHERE project_id=? AND owner_id=? AND id<>? AND status IN ('running','waiting_user','cancelling') LIMIT 1", [projectId, user.id, run.id]);
    if (other.length) fail('当前已有制作计划，请在后台制作计划中确认或查看进度');
    const fresh: any = await getImageStudioProject(projectId, user);
    if (fresh.workflow?.designAgent?.version !== run.plan_version) fail('方案已变化，请重新开始');
    const profiles = await listImageStudioModelProfiles();
    const models: any = fresh.workflow?.modelProfiles || {};
    const assets = await listImageStudioAssets(projectId, user);
    const mode = saved.mode || 'product';
    if (imageTasks.length && !profiles.some((p: any) => p.id === models.imageProfileId && p.capability === 'image')) fail('请选择可用的图片生成模型');
    if (mode === 'product' && imageTasks.length && !assets.some((a: any) => a.kind === 'image' && a.role === 'product')) fail('请先上传商品原图');
    const skills = await listDesignSkills(false);
    const snapshot = parse(run.plan_snapshot_json);
    const brandAssets = new Set((fresh.workflow?.brandKit?.assets || []).map((asset: any) => asset.assetId));
    const candidateRefs: string[] = saved.plan.logoExploration?.referenceAssetIds || [];
    if (candidateRefs.some((id) => !assets.some((asset: any) => asset.id === id && isUsableGenerationReference(asset)))) fail('Logo 参考图片不存在或不可用，请重新选择');
    snapshot.execution = { ...input, models, mode, autoContinue: true, testOnly: process.env.IMAGE_STUDIO_RUN_ORCHESTRATION_DB_TESTS === '1', referenceAssetIds: assets.filter((a: any) => isUsableGenerationReference(a) && (a.role === 'product' || mode === 'brand' && brandAssets.has(a.id))).slice(0, 12).map((a: any) => a.id),
      skillSnapshot: skills.filter((s) => saved.plan.taskGraph.some((t: any) => t.skillIds.includes(s.id))).map((s) => ({ id: s.id, name: s.name, version: s.version, instructions: s.instructions.slice(0, 4000), completionCriteria: s.completionCriteria.slice(0, 1200) })) };
    if (saved.plan.logoExploration) snapshot.execution.referenceAssetIds = candidateRefs;
    await c.beginTransaction();
    try {
      const [projectRows]: any = await c.query('SELECT workflow_json FROM image_studio_projects WHERE id=? AND owner_id=? AND deleted_at IS NULL FOR UPDATE', [projectId, user.id]);
      if (!projectRows[0] || parse(projectRows[0].workflow_json)?.designAgent?.version !== run.plan_version) fail('方案已变化，请重新开始');
      const [active]: any = await c.query("SELECT id FROM image_studio_orchestration_runs WHERE project_id=? AND owner_id=? AND id<>? AND status IN ('running','waiting_user','cancelling') LIMIT 1", [projectId, user.id, run.id]);
      if (active.length) fail('当前已有制作计划，请在后台制作计划中确认或查看进度');
      const workflow = parse(projectRows[0].workflow_json);
      if (workflow.designAgent?.status !== 'approved') fail('请先确认设计方案');
      workflow.workbench = { ...workflow.workbench, productionStarts: { ...workflow.workbench?.productionStarts,
        [run.plan_version]: { runId: run.id, startedAt: new Date().toISOString() } } };
      await c.query('UPDATE image_studio_projects SET workflow_json=?,version=version+1,updated_at=NOW(3) WHERE id=?', [JSON.stringify(workflow), projectId]);
      await c.query("UPDATE image_studio_orchestration_runs SET status='running',plan_snapshot_json=?,updated_at=NOW(3) WHERE id=? AND status='draft'", [JSON.stringify(snapshot), run.id]);
      // Clicking 'start production' authorizes these exact image prompts and model.
      await c.query("UPDATE image_studio_orchestration_tasks SET approved=TRUE WHERE run_id=? AND kind <> 'delivery'", [run.id]);
      await event(c, run, 'run.started', { planVersion: run.plan_version, imageCount: input.prompts.length });
      await c.commit();
    } catch (e) { await c.rollback(); throw e; }
    return true;
  });
  if (result === undefined && !draft.duplicate) fail('调度正在处理，请重试');
  return getOrchestrationDraft(projectId, draft.id, user);
}

export async function controlOrchestration(projectId: string, runId: string, user: AuthUserPayload, action: 'cancel' | 'approve' | 'retry' | 'continue_automatically', taskKey?: string) {
  await getImageStudioProject(projectId, user);
  const done = await locked(runId, async (c, run) => {
    owner(run, projectId, user);
    if (action === 'cancel') {
      if (['completed', 'cancelled'].includes(run.status)) return true;
      await c.query("UPDATE image_studio_orchestration_runs SET status='cancelling',updated_at=NOW(3) WHERE id=?", [runId]);
      await event(c, run, 'run.cancelling', {});
      return true;
    }
    if (!['running', 'waiting_user', 'failed'].includes(run.status)) fail('当前状态不能继续此操作');
    if (action === 'continue_automatically') {
      if (!['running', 'waiting_user'].includes(run.status)) fail('请先处理失败的任务，再继续制作');
      const project: any = await getImageStudioProject(projectId, user);
      if (project.workflow?.designAgent?.version !== run.plan_version || project.workflow?.designAgent?.status !== 'approved') fail('当前方案已变化，请重新确认方案');
      const snapshot = parse(run.plan_snapshot_json);
      if (!snapshot?.execution) fail('制作计划尚未启动');
      snapshot.execution.autoContinue = true;
      await c.beginTransaction();
      try {
        await c.query("UPDATE image_studio_orchestration_runs SET status='running',plan_snapshot_json=?,updated_at=NOW(3) WHERE id=?", [JSON.stringify(snapshot), runId]);
        await c.query("UPDATE image_studio_orchestration_tasks SET approved=TRUE WHERE run_id=? AND kind <> 'delivery'", [runId]);
        await event(c, run, 'run.automatic_continuation_enabled', {});
        await c.commit();
      } catch (e) { await c.rollback(); throw e; }
      return true;
    }
    const [rows]: any = await c.query('SELECT * FROM image_studio_orchestration_tasks WHERE run_id=? AND task_key=?', [runId, taskKey]);
    const task = rows[0]; if (!task) fail('任务不存在');
    const project: any = await getImageStudioProject(projectId, user);
    if (project.workflow?.designAgent?.version !== run.plan_version) fail('当前方案已变化，请启动新计划');
    if (action === 'approve') {
      if (task.status !== 'waiting_user') fail('该任务不在等待确认');
      const manual = ['manual', 'review'].includes(task.kind);
      await c.query('UPDATE image_studio_orchestration_tasks SET approved=TRUE,status=?,updated_at=NOW(3) WHERE id=?', [manual ? 'completed' : 'pending', task.id]);
      // Delivery creates an export only through the explicit existing export flow.
    } else {
      if (task.status !== 'failed') fail('只可重试失败的任务');
      const spec = parse(task.input_snapshot_json);
      if (task.job_id) {
        const previous = await getImageStudioJob(task.job_id, user);
        if (!['failed', 'partial'].includes(previous.status)) fail('上游任务尚未明确失败，不能重复派发');
        spec.attempt = Number(spec.attempt || 0) + 1;
        if (spec.kind === 'image_generation') {
          spec.retrySlots = previous.generations.filter((g: any) => g.status === 'failed').map((g: any) => g.slotKey);
          if (!spec.retrySlots.length) fail('没有可重试的失败图片');
        }
      }
      await c.query("UPDATE image_studio_orchestration_tasks SET status='pending',job_id=NULL,input_snapshot_json=?,error_code=NULL,error_message=NULL,updated_at=NOW(3) WHERE id=?", [JSON.stringify(spec), task.id]);
    }
    await c.query("UPDATE image_studio_orchestration_runs SET status='running',updated_at=NOW(3) WHERE id=?", [runId]);
    await event(c, run, `task.${action}`, { taskKey }, task.id);
    return true;
  });
  if (!done) fail('调度正在处理，请稍后重试');
  return getOrchestrationDraft(projectId, runId, user);
}

async function syncWorkflow(c: PoolConnection, run: any, tasks: any[]) {
  await c.beginTransaction();
  try {
    const [rows]: any = await c.query('SELECT workflow_json FROM image_studio_projects WHERE id=? AND owner_id=? AND deleted_at IS NULL FOR UPDATE', [run.project_id, run.owner_id]);
    if (!rows[0]) { await c.rollback(); return false; }
    const workflow = parse(rows[0].workflow_json); const before = stableJson(workflow); const snapshot = parse(run.plan_snapshot_json);
    const states = { ...(workflow.workbench?.taskStates || {}) }; const rounds = { ...(workflow.workbench?.roundExecutions || {}) };
    for (const task of tasks) {
      const state = { status: task.status === 'waiting_user' ? 'blocked' : task.status, jobId: task.job_id || undefined, roundId: snapshot.execution?.roundId,
        error: task.error_message || undefined, result: parse(task.input_snapshot_json)?.resultSummary || undefined, updatedAt: new Date(task.updated_at).toISOString() };
      if (workflow.designAgent?.version === run.plan_version) states[`${run.plan_version}:${task.task_key}`] = state;
      if (snapshot.execution?.roundId) rounds[`${snapshot.execution.roundId}:${run.plan_version}:${task.task_key}`] = { ...state, taskId: task.task_key, taskTitle: parse(task.input_snapshot_json).title, planVersion: run.plan_version };
    }
    workflow.workbench = { ...workflow.workbench, taskStates: states, roundExecutions: rounds };
    const changed = before !== stableJson(workflow);
    if (changed) await c.query('UPDATE image_studio_projects SET workflow_json=?,version=version+1,updated_at=NOW(3) WHERE id=? AND owner_id=?', [JSON.stringify(workflow), run.project_id, run.owner_id]);
    await c.commit();
    return changed;
  } catch (e) { await c.rollback(); throw e; }
}

const defaultServices = { getImageStudioJob, getImageStudioProject, createImageStudioTextJob, createImageStudioGenerationJob, cancelImageStudioJob, createImageStudioExport };

export function canReuseImageJob(input: { expectedSlots: string[]; generations: Array<{ slot_key: string; status: string; output_asset_id: string | null }>; status: string; taskId: string; planVersion: number; context: any }) {
  if (input.context?.taskId !== input.taskId || input.context?.planVersion !== input.planVersion || !['queued', 'running', 'completed'].includes(input.status)) return false;
  if (!input.expectedSlots.length || input.generations.length !== input.expectedSlots.length) return false;
  const expected = new Set(input.expectedSlots);
  return expected.size === input.generations.length && new Set(input.generations.map((generation) => generation.slot_key)).size === expected.size
    && input.generations.every((generation) => expected.has(generation.slot_key)
    && (input.status !== 'completed' || generation.status === 'completed' && Boolean(generation.output_asset_id)));
}

async function findExistingImageJob(c: PoolConnection, run: any, spec: any, exec: any) {
  if (spec.retrySlots?.length || Number(spec.attempt || 0) > 0) return null;
  const expectedSlots = exec.prompts.filter((prompt: any) => prompt.taskId === spec.id).map((prompt: any) => prompt.slotKey);
  const [jobs]: any = await c.query(`SELECT id,status,request_json FROM image_studio_jobs WHERE project_id=? AND owner_id=?
    AND job_type='image_generate' AND model_profile_id=? AND status IN ('queued','running','completed') AND created_at>=? ORDER BY created_at DESC LIMIT 30`,
  [run.project_id, run.owner_id, exec.models.imageProfileId, run.created_at]);
  for (const job of jobs) {
    const [generations]: any = await c.query(`SELECT g.slot_key,g.status,CASE WHEN a.id IS NULL THEN NULL ELSE g.output_asset_id END AS output_asset_id
      FROM image_studio_generations g LEFT JOIN image_studio_assets a ON a.id=g.output_asset_id AND a.project_id=? AND a.owner_id=? AND a.deleted_at IS NULL
      WHERE g.job_id=?`, [run.project_id, run.owner_id, job.id]);
    if (canReuseImageJob({ expectedSlots, generations, status: job.status, taskId: spec.id, planVersion: run.plan_version, context: parse(job.request_json)?.context })) return job;
  }
  return null;
}

export async function tickOrchestration(runId: string, services = defaultServices) {
  return locked(runId, async (c, run) => {
    if (!['running', 'waiting_user', 'cancelling'].includes(run.status)) return;
    const [users]: any = await c.query('SELECT id,email,name,role FROM users WHERE id=?', [run.owner_id]);
    if (!users[0]) return;
    const user = users[0] as AuthUserPayload;
    const snapshot = parse(run.plan_snapshot_json); const exec = snapshot.execution;
    if (!exec) return;
    if (exec.testOnly && services === defaultServices) return;
    let tasks: any[] = (await c.query('SELECT * FROM image_studio_orchestration_tasks WHERE run_id=? ORDER BY created_at,task_key', [runId]))[0] as any[];
    const project: any = await services.getImageStudioProject(run.project_id, user).catch((e: any) => { if (e.status === 404) return null; throw e; });
    if (run.status !== 'cancelling' && (!project || project.workflow?.designAgent?.version !== run.plan_version)) {
      await c.query("UPDATE image_studio_orchestration_runs SET status='stale',updated_at=NOW(3) WHERE id=?", [runId]);
      await event(c, run, 'run.stale', {}); return;
    }
    for (const task of tasks.filter((t) => t.job_id && ['queued', 'running'].includes(t.status))) {
      const job = await services.getImageStudioJob(task.job_id, user);
      if (run.status === 'cancelling' && ['queued', 'running'].includes(job.status)) await services.cancelImageStudioJob(job.id, user);
      const status = job.status === 'completed' ? task.kind === 'review' && !exec.autoContinue ? 'waiting_user' : 'completed' : ['failed', 'partial', 'cancelled'].includes(job.status) ? 'failed' : job.status === 'queued' ? 'queued' : 'running';
      if (status !== task.status) {
        await c.query('UPDATE image_studio_orchestration_tasks SET status=?,error_code=?,error_message=?,updated_at=NOW(3) WHERE id=?', [status, job.error?.code || null, job.error?.message || (job.status === 'partial' ? '部分图片失败，请检查生成结果' : null), task.id]);
        await event(c, run, `task.${status}`, { taskKey: task.task_key, jobId: task.job_id }, task.id);
        task.status = status;
      }
    }
    if (run.status === 'cancelling') {
      await c.query("UPDATE image_studio_orchestration_tasks SET status='cancelled',updated_at=NOW(3) WHERE run_id=? AND status IN ('pending','waiting_user')", [runId]);
      if (!tasks.some((t) => ['queued', 'running'].includes(t.status))) await c.query("UPDATE image_studio_orchestration_runs SET status='cancelled',updated_at=NOW(3) WHERE id=?", [runId]);
    } else {
      if (exec.autoContinue) for (const task of tasks.filter((t) => t.status === 'waiting_user' && t.kind !== 'delivery')) {
        const status = task.kind === 'review' && task.job_id ? 'completed' : 'pending';
        await c.query('UPDATE image_studio_orchestration_tasks SET status=?,approved=TRUE,updated_at=NOW(3) WHERE id=?', [status, task.id]);
        await event(c, run, 'task.automatic_continuation', { taskKey: task.task_key, humanReviewPerformed: false }, task.id);
        task.status = status; task.approved = true;
      }
      const decision = nextOrchestrationTasks(tasks.map((t) => ({ id: t.task_key, status: t.status, dependsOn: parse(t.depends_on_json), approval: t.approval_required ? 'required' : 'none', approved: Boolean(t.approved) })) as OrchestrationTask[], 1);
      for (const key of decision.waitingUser) await c.query("UPDATE image_studio_orchestration_tasks SET status='waiting_user',updated_at=NOW(3) WHERE run_id=? AND task_key=? AND status='pending'", [runId, key]);
      for (const key of decision.ready) {
        const task = tasks.find((t) => t.task_key === key); const spec = parse(task.input_snapshot_json);
        try {
          if (spec.kind === 'direction') { await c.query("UPDATE image_studio_orchestration_tasks SET status='completed',updated_at=NOW(3) WHERE id=?", [task.id]); continue; }
          if (spec.kind === 'image_generation') {
            const existing = await findExistingImageJob(c, run, spec, exec);
            if (existing) {
              await c.query('UPDATE image_studio_orchestration_tasks SET status=?,job_id=?,updated_at=NOW(3) WHERE id=? AND status=\'pending\'', [existing.status, existing.id, task.id]);
              await event(c, run, 'task.existing_images_reused', { taskKey: key, jobId: existing.id }, task.id);
              continue;
            }
          }
          const autoBrandGuidelines = exec.autoContinue && spec.kind === 'manual' && exec.mode === 'brand' && /品牌.{0,8}规范|视觉.{0,8}规范|识别.{0,8}规范/.test(spec.title);
          const autoSvg = exec.autoContinue && spec.kind === 'manual' && /svg|矢量稿/i.test(spec.title);
          if (spec.kind === 'manual' && !autoBrandGuidelines && !autoSvg) {
            if (!exec.autoContinue) { await c.query("UPDATE image_studio_orchestration_tasks SET status='waiting_user',updated_at=NOW(3) WHERE id=?", [task.id]); continue; }
            spec.resultSummary = '已跳过人工确认；未执行人工核验。';
            await c.query("UPDATE image_studio_orchestration_tasks SET status='completed',input_snapshot_json=?,updated_at=NOW(3) WHERE id=?", [JSON.stringify(spec), task.id]);
            await event(c, run, 'task.manual_skipped', { taskKey: key, humanReviewPerformed: false }, task.id);
            continue;
          }
          if (spec.kind === 'research') {
            const configured = isDesignReferenceSearchConfigured();
            const references = configured ? await searchDesignReferences([snapshot.plan.brief.productOrService, spec.title].join(' ').slice(0, 240), run.project_id) : [];
            spec.resultSummary = configured ? `搜索返回 ${references.length} 张参考图，来源授权状态待核实。` : '未配置参考搜索，已跳过此步骤。';
            await c.query("UPDATE image_studio_orchestration_tasks SET status='completed',input_snapshot_json=?,updated_at=NOW(3) WHERE id=?", [JSON.stringify(spec), task.id]);
            await event(c, run, 'task.research_result', { taskKey: key, skipped: !configured, references }, task.id);
            continue;
          }
          const context = { orchestrationRunId: run.id, agentRole: studioAgentForTask(autoBrandGuidelines ? 'copywriting' : autoSvg ? 'svg_generation' : spec.kind), taskId: key, taskTitle: spec.title, roundId: exec.roundId, planVersion: run.plan_version, autoBrandGuidelines,
            designMode: exec.mode, designBrief: snapshot.plan.brief, visualDirection: snapshot.plan.directions.find((d: any) => d.id === snapshot.plan.selectedDirectionId),
            outputs: spec.outputs, inputs: spec.inputs, generationSlots: exec.prompts, skillIds: spec.skillIds, skillSnapshot: exec.skillSnapshot.filter((s: any) => spec.skillIds.includes(s.id)),
            dependencyResults: await Promise.all(tasks.filter((t) => spec.dependsOn.includes(t.task_key) && t.job_id).map(async (t) => ({ taskId: t.task_key, result: (await services.getImageStudioJob(t.job_id, user)).result }))) };
          const idempotencyKey = `orch-${run.id}-${task.id}-${Number(spec.attempt || 0)}`;
          const ancestors = new Set<string>(spec.dependsOn);
          for (let n = 0; n < tasks.length; n++) for (const row of tasks) if (ancestors.has(row.task_key)) for (const id of parse(row.depends_on_json)) ancestors.add(id);
          const ancestorJobs = tasks.filter((row) => ancestors.has(row.task_key) && row.job_id).map((row) => row.job_id);
          const outputRefs: string[] = [];
          if (ancestorJobs.length) {
            const [outputs]: any = await c.query(`SELECT DISTINCT output_asset_id FROM image_studio_generations WHERE project_id=? AND job_id IN (${ancestorJobs.map(() => '?').join(',')}) AND status='completed' AND output_asset_id IS NOT NULL`, [run.project_id, ...ancestorJobs]);
            outputRefs.push(...outputs.map((row: any) => String(row.output_asset_id)));
          }
          let accepted: { id: string };
          if (spec.kind === 'delivery') {
            const exported = await services.createImageStudioExport(run.project_id, user, idempotencyKey);
            accepted = { id: exported.jobId };
          } else if (spec.kind === 'image_generation') {
            accepted = await services.createImageStudioGenerationJob(run.project_id, user, { idempotencyKey, modelProfileId: exec.models.imageProfileId, skillIds: spec.skillIds,
              context: { ...context, singleLogoSlots: /logo|标志|字标/i.test(spec.title) ? exec.prompts.filter((p: any) => p.taskId === key).map((p: any) => p.slotKey) : [] },
              generations: exec.prompts.filter((p: any) => p.taskId === key && (!spec.retrySlots || spec.retrySlots.includes(p.slotKey))).map((p: any) => {
                const detail = context.dependencyResults.flatMap((d: any) => d.result?.prompts || []).find((d: any) => d.slotKey === p.slotKey);
                return { slotKey: p.slotKey, prompt: [p.prompt, detail?.prompt ? `逐图设计执行建议：${detail.prompt}` : '', detail?.negativePrompt ? `需要避免：${detail.negativePrompt}` : ''].filter(Boolean).join('\n\n'), referenceAssetIds: [...new Set([...exec.referenceAssetIds, ...outputRefs])].slice(0, 12), parameters: {} };
              }) });
          } else {
            const operations: Record<string, 'product_analyze' | 'storyboard' | 'copy_generate' | 'prompt_generate' | 'svg_generate' | 'design_review'> = { analysis: 'product_analyze', storyboard: 'storyboard', copywriting: 'copy_generate', prompting: 'prompt_generate', svg_generation: 'svg_generate', review: 'design_review', ...(autoBrandGuidelines ? { manual: 'copy_generate' as const } : autoSvg ? { manual: 'svg_generate' as const } : {}) };
            if (!operations[spec.kind]) throw new Error('未支持的任务类型');
            let refs = spec.kind === 'analysis' ? exec.referenceAssetIds : spec.kind === 'svg_generation' || autoSvg ? outputRefs.slice(0, 12) : [];
            if (spec.kind === 'review') {
              if (!outputRefs.length || outputRefs.length > 12) throw new Error('审稿需 1 至 12 张前置任务图片，请拆分计划后审稿');
              refs = outputRefs;
            }
            accepted = await services.createImageStudioTextJob(run.project_id, user, { idempotencyKey, modelProfileId: refs.length ? exec.models.visionProfileId : exec.models.textProfileId, operation: operations[spec.kind], context, referenceAssetIds: refs });
          }
          await c.query("UPDATE image_studio_orchestration_tasks SET status='queued',job_id=?,updated_at=NOW(3) WHERE id=? AND status='pending'", [accepted.id, task.id]);
          await event(c, run, 'task.queued', { taskKey: key, jobId: accepted.id }, task.id);
        } catch (error: any) {
          // A successful job insert may precede a lost DB response. Recovery must
          // reuse its deterministic key rather than dispatching a new paid job.
          await c.query("UPDATE image_studio_orchestration_tasks SET status='failed',error_code=?,error_message=?,updated_at=NOW(3) WHERE id=?", [String(error.code || 'DISPATCH_FAILED').slice(0, 64), String(error.message || '任务派发失败').slice(0, 768), task.id]);
          await event(c, run, 'task.failed', { taskKey: key }, task.id);
        }
      }
    }
    tasks = (await c.query('SELECT * FROM image_studio_orchestration_tasks WHERE run_id=?', [runId]))[0] as any[];
    if (run.status !== 'cancelling') {
      const status = tasks.every((t) => t.status === 'completed') ? 'completed' : tasks.some((t) => ['running', 'queued'].includes(t.status)) ? 'running' : tasks.some((t) => t.status === 'failed') ? 'failed' : tasks.some((t) => t.status === 'waiting_user') ? 'waiting_user' : 'running';
      if (status !== run.status) { await c.query('UPDATE image_studio_orchestration_runs SET status=?,updated_at=NOW(3) WHERE id=?', [status, runId]); await event(c, run, `run.${status}`, {}); }
    }
    if (await syncWorkflow(c, run, tasks)) await event(c, run, 'run.project_synced', {});
    await c.query('UPDATE image_studio_orchestration_runs SET updated_at=NOW(3) WHERE id=?', [runId]);
  });
}

let timer: ReturnType<typeof setInterval> | null = null; let ticking = false;
export function startOrchestrationDispatcher() {
  if (timer || !orchestrationEnabled()) return;
  const tick = async () => {
    if (ticking || !dbPool) return; ticking = true;
    try {
      const [runs]: any = await dbPool.query("SELECT id FROM image_studio_orchestration_runs WHERE status IN ('running','waiting_user','cancelling') ORDER BY updated_at LIMIT 50");
      for (const run of runs) await tickOrchestration(String(run.id)).catch((e: any) => console.warn('[orchestration]', run.id, e.code || 'TICK_FAILED'));
    } finally { ticking = false; }
  };
  timer = setInterval(() => { void tick().catch(() => undefined); }, 2500); timer.unref();
  void tick().catch(() => undefined);
}
export function stopOrchestrationDispatcher() { if (timer) clearInterval(timer); timer = null; }
