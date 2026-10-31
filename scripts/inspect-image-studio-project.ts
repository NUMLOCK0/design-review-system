import 'dotenv/config';
import { dbPool } from '../apps/server/src/config/database.js';
import { sanitizeAiError } from '../apps/server/src/services/ai-call-log.js';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../apps/server/src/middleware/auth.middleware.js';

const parse = (value: any) => typeof value === 'string' ? JSON.parse(value) : value;
async function main() {
  const id = process.argv[2];
  if (!/^[\w-]{1,64}$/.test(id || '') || !dbPool) throw new Error('Provide a project ID and configured database');
  try {
    const [rows]: any = await dbPool.query('SELECT id,owner_id,name,version,workflow_json,updated_at FROM image_studio_projects WHERE id=? AND deleted_at IS NULL', [id]);
    if (!rows[0]) throw new Error('Project not found');
    if (process.argv[3] === '--browser-session') {
      const [users]: any = await dbPool.query('SELECT id,email,name,role FROM users WHERE id=?', [rows[0].owner_id]);
      if (!users[0]) throw new Error('Project owner not found');
      const folder = await mkdtemp(join(tmpdir(), 'studio-project-diagnostics-'));
      const state = join(folder, 'state.json');
      await writeFile(state, JSON.stringify({ cookies: [{ name: 'auth_token', value: jwt.sign(users[0], JWT_SECRET, { expiresIn: '10m' }), domain: '127.0.0.1', path: '/', expires: Math.floor(Date.now() / 1000) + 600, httpOnly: true, secure: false, sameSite: 'Lax' }],
        origins: [{ origin: 'http://127.0.0.1:3000', localStorage: [{ name: 'auth_user', value: JSON.stringify({ id: users[0].id, role: users[0].role }) }] }] }));
      console.log(JSON.stringify({ projectId: id, state }));
      return;
    }
    const workflow = parse(rows[0].workflow_json) || {};
    console.log(JSON.stringify({ project: { id, name: rows[0].name, version: rows[0].version, updatedAt: rows[0].updated_at,
      planVersion: workflow.designAgent?.version, planStatus: workflow.designAgent?.status, mode: workflow.designAgent?.mode,
      models: workflow.modelProfiles, graph: workflow.designAgent?.plan?.taskGraph, workbench: { canvasProjectId: workflow.workbench?.canvasProjectId, taskStates: workflow.workbench?.taskStates, productionStarts: workflow.workbench?.productionStarts } } }));
    const [runs]: any = await dbPool.query('SELECT id,status,plan_version,plan_snapshot_json,created_at,updated_at FROM image_studio_orchestration_runs WHERE project_id=? ORDER BY created_at DESC LIMIT 8', [id]);
    console.log(JSON.stringify({ runs: runs.map((run: any) => { const execution = parse(run.plan_snapshot_json)?.execution;
      return { id: run.id, status: run.status, planVersion: run.plan_version, createdAt: run.created_at, updatedAt: run.updated_at, testOnly: execution?.testOnly, models: execution?.models, slots: execution?.prompts?.map((p: any) => ({ taskId: p.taskId, slotKey: p.slotKey, promptLength: p.prompt?.length })) }; }) }));
    const [tasks]: any = await dbPool.query('SELECT run_id,task_key,kind,status,approved,depends_on_json,job_id,error_code,error_message,updated_at FROM image_studio_orchestration_tasks WHERE project_id=? ORDER BY created_at DESC LIMIT 80', [id]);
    console.log(JSON.stringify({ tasks }));
    const [jobs]: any = await dbPool.query('SELECT id,job_type,status,progress,request_json,result_json,model_profile_id,error_code,error_message,created_at,started_at,completed_at,updated_at FROM image_studio_jobs WHERE project_id=? ORDER BY created_at DESC LIMIT 30', [id]);
    console.log(JSON.stringify({ jobs: jobs.map((job: any) => { const request = parse(job.request_json); const result = parse(job.result_json); return { ...job, request_json: undefined, result_json: undefined, resultFields: result && typeof result === 'object' ? Object.keys(result) : [], operation: request?.operation,
      context: { taskId: request?.context?.taskId, planVersion: request?.context?.planVersion, orchestrationRunId: request?.context?.orchestrationRunId } }; }) }));
    const [generations]: any = await dbPool.query('SELECT id,job_id,slot_key,status,model_name,output_asset_id,error_code,error_message,created_at,started_at,completed_at FROM image_studio_generations WHERE project_id=? ORDER BY created_at DESC LIMIT 40', [id]);
    console.log(JSON.stringify({ generations }));
    const [calls]: any = await dbPool.query('SELECT source,operation,model,reference_id,status,http_status,duration_ms,error_code,error_message,created_at FROM ai_call_logs WHERE reference_id IN (SELECT id FROM image_studio_jobs WHERE project_id=?) ORDER BY created_at DESC LIMIT 30', [id]);
    console.log(JSON.stringify({ calls }));
    const [canvases]: any = await dbPool.query('SELECT id,version,project_json,updated_at FROM image_studio_canvas_projects WHERE id=? AND deleted_at IS NULL', [workflow.workbench?.canvasProjectId || `studio-${id}`]);
    console.log(JSON.stringify({ canvases: canvases.map((canvas: any) => ({ id: canvas.id, version: canvas.version, updatedAt: canvas.updated_at, nodes: (parse(canvas.project_json)?.nodes || []).map((node: any) => ({ id: node.id, type: node.type, title: node.title,
      status: node.metadata?.status, artifactType: node.metadata?.artifactType, slotKey: node.metadata?.workbenchSlotKey, jobId: node.metadata?.workbenchJobId, planVersion: node.metadata?.workbenchPlanVersion,
      hasContent: Boolean(node.metadata?.content), hasStorageKey: Boolean(node.metadata?.storageKey) })) })) }));
  } finally { await dbPool.end(); }
}
main().catch((e) => { console.error(sanitizeAiError(e)); process.exitCode = 1; });
