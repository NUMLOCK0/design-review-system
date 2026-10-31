import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { dbPool } from '../config/database.js';
import { ensureImageStudioSchema } from '../config/image-studio-schema.js';
import { createImageStudioProject, getImageStudioProject, listImageStudioModelProfiles } from './image-studio.js';
import { createOrchestrationDraft, getOrchestrationDraft } from './image-studio-orchestration.js';
import { controlOrchestration, startOrchestration, tickOrchestration } from './image-studio-orchestration-runtime.js';
import express from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../middleware/auth.middleware.js';
import { imageStudioRouter } from '../routes/image-studio.js';

test('durable orchestration: idempotency, restart, confirmation, cancel and ownership', { skip: process.env.IMAGE_STUDIO_RUN_ORCHESTRATION_DB_TESTS !== '1' }, async () => {
  assert.ok(dbPool);
  await ensureImageStudioSchema(dbPool!);
  const [users]: any = await dbPool!.query("SELECT id,email,name,role FROM users WHERE role='customer_service' LIMIT 1");
  assert.ok(users[0], 'A development customer_service account is required');
  const user = users[0]; const created: string[] = [];
  const previousFlag = process.env.IMAGE_STUDIO_ORCHESTRATION_ENABLED;
  process.env.IMAGE_STUDIO_ORCHESTRATION_ENABLED = 'true';
  const app = express(); app.use(express.json()); app.use('/api/image-studio', imageStudioRouter);
  app.use((error: any, _req: any, res: any, _next: any) => res.status(error.status || 500).json({ message: error.message }));
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}/api/image-studio`;
  const headers = { Authorization: `Bearer ${jwt.sign(user, JWT_SECRET, { expiresIn: '5m' })}`, 'Content-Type': 'application/json' };
  const direction = { id: 'a', name: '自然', concept: '几何', positioning: '', audience: '', keywords: [], palette: ['#123456', '#ABCDEF', '#FFFFFF'].map((hex) => ({ name: hex, hex, usage: '' })), typography: '', imagery: '', rationale: '', deliverables: [] };
  const task = (id: string, kind: string, dependsOn: string[]) => ({ id, kind, title: id, reason: '', dependsOn, skillIds: [], inputs: [], outputs: [], reviewPolicy: 'automatic' });
  const saved = { version: 1, mode: 'brand', status: 'approved', selectedSkillIds: [], answers: {}, inputBrief: 'integration',
    plan: { summary: 'test', brief: { brandName: 'test', productOrService: '', positioning: '', targetAudience: '', marketAndChannel: '', businessGoal: '', knownFacts: [], constraints: [], factsToConfirm: [] },
      questions: [], recommendedSkills: [], directions: [direction, { ...direction, id: 'b' }], selectedDirectionId: 'a', nextSteps: [], taskGraph: [task('copy', 'copywriting', []), task('manual', 'manual', ['copy'])] } };
  try {
    const project = await createImageStudioProject(user, { name: `orchestration-test-${randomUUID()}`, workflow: { designAgent: saved } }); created.push(project.id);
    const key = randomUUID();
    assert.equal((await fetch(`${base}/orchestration-capabilities`, { headers })).status, 200);
    const draft = await createOrchestrationDraft(project.id, user, { planVersion: 1, idempotencyKey: key });
    assert.equal((await createOrchestrationDraft(project.id, user, { planVersion: 1, idempotencyKey: key })).id, draft.id);
    await assert.rejects(createOrchestrationDraft(project.id, user, { planVersion: 2, idempotencyKey: key }), /幂等键/);
    await assert.rejects(getOrchestrationDraft(project.id, draft.id, { ...user, id: randomUUID() }), /无权访问/);
    await startOrchestration(project.id, user, { planVersion: 1, idempotencyKey: key, prompts: [] });
    assert.equal((await startOrchestration(project.id, user, { planVersion: 1, idempotencyKey: key, prompts: [] })).id, draft.id, 'A retry with unchanged content returns the original run');
    await assert.rejects(startOrchestration(project.id, user, { planVersion: 1, idempotencyKey: key, roundId: 'changed-round', prompts: [] }), /制作内容已变化/);
    const [beforeActiveRetry]: any = await dbPool!.query('SELECT COUNT(*) AS count FROM image_studio_orchestration_runs WHERE project_id=?', [project.id]);
    await assert.rejects(startOrchestration(project.id, user, { planVersion: 1, idempotencyKey: randomUUID(), prompts: [] }), /已有制作计划正在执行/);
    const [afterActiveRetry]: any = await dbPool!.query('SELECT COUNT(*) AS count FROM image_studio_orchestration_runs WHERE project_id=?', [project.id]);
    assert.equal(afterActiveRetry[0].count, beforeActiveRetry[0].count, 'An active run must not create another draft');
    assert.equal(((await getImageStudioProject(project.id, user)).workflow as any).workbench.productionStarts[1].runId, draft.id, 'Only starting production persists the canvas preparation marker');
    // Simulate a run created before automatic continuation was introduced.
    const [snapshotRows]: any = await dbPool!.query('SELECT plan_snapshot_json FROM image_studio_orchestration_runs WHERE id=?', [draft.id]);
    const legacySnapshot = typeof snapshotRows[0].plan_snapshot_json === 'string' ? JSON.parse(snapshotRows[0].plan_snapshot_json) : snapshotRows[0].plan_snapshot_json;
    delete legacySnapshot.execution.autoContinue;
    await dbPool!.query('UPDATE image_studio_orchestration_runs SET plan_snapshot_json=? WHERE id=?', [JSON.stringify(legacySnapshot), draft.id]);
    await dbPool!.query("UPDATE image_studio_orchestration_tasks SET approved=FALSE WHERE run_id=? AND kind='manual'", [draft.id]);
    let calls = 0; let complete = false;
    const jobId = randomUUID();
    const services: any = { getImageStudioProject,
      createImageStudioTextJob: async () => { calls++; return { id: jobId }; },
      getImageStudioJob: async () => ({ id: jobId, status: complete ? 'completed' : 'queued', result: { text: 'done' } }),
      cancelImageStudioJob: async () => { complete = true; },
    };
    await tickOrchestration(draft.id, services);
    await tickOrchestration(draft.id, services);
    assert.equal(calls, 1, 'Repeated dispatcher ticks must not resubmit queued work');
    complete = true;
    await tickOrchestration(draft.id, services);
    assert.equal((await getOrchestrationDraft(project.id, draft.id, user)).status, 'waiting_user');
    await assert.rejects(startOrchestration(project.id, user, { planVersion: 1, idempotencyKey: randomUUID(), prompts: [] }), /正在等待确认/);
    const waitingVersion = (await getImageStudioProject(project.id, user)).version;
    await tickOrchestration(draft.id, services);
    assert.equal((await getImageStudioProject(project.id, user)).version, waitingVersion, 'Polling an unchanged waiting run must not create project revisions');
    const continueResponse = await fetch(`${base}/projects/${project.id}/orchestrations/${draft.id}/control`, { method: 'POST', headers, body: JSON.stringify({ action: 'continue_automatically' }) });
    assert.equal(continueResponse.status, 200);
    await tickOrchestration(draft.id, services);
    assert.equal((await getOrchestrationDraft(project.id, draft.id, user)).status, 'completed');
    const [skipped]: any = await dbPool!.query("SELECT input_snapshot_json FROM image_studio_orchestration_tasks WHERE run_id=? AND task_key='manual'", [draft.id]);
    const skippedSpec = typeof skipped[0].input_snapshot_json === 'string' ? JSON.parse(skipped[0].input_snapshot_json) : skipped[0].input_snapshot_json;
    assert.match(skippedSpec.resultSummary, /未执行人工核验/);
    const recovered = await startOrchestration(project.id, user, { planVersion: 1, idempotencyKey: randomUUID(), prompts: [] });
    const keys: string[] = []; let lostResponse = true;
    const recoveryServices = { ...services, createImageStudioTextJob: async (_pid: string, _user: unknown, input: any) => {
      keys.push(input.idempotencyKey);
      if (lostResponse) { lostResponse = false; throw new Error('simulated lost database response'); }
      return { id: jobId };
    } };
    await tickOrchestration(recovered.id, recoveryServices);
    assert.equal((await getOrchestrationDraft(project.id, recovered.id, user)).status, 'failed');
    await controlOrchestration(project.id, recovered.id, user, 'retry', 'copy');
    await tickOrchestration(recovered.id, recoveryServices);
    assert.equal(keys.length, 2);
    assert.equal(keys[0], keys[1], 'Unknown dispatch outcomes must recover with the original key');
    await controlOrchestration(project.id, recovered.id, user, 'cancel');
    await tickOrchestration(recovered.id, services);
    const next = await startOrchestration(project.id, user, { planVersion: 1, idempotencyKey: randomUUID(), prompts: [] });
    await controlOrchestration(project.id, next.id, user, 'cancel');
    await tickOrchestration(next.id, services);
    assert.equal((await getOrchestrationDraft(project.id, next.id, user)).status, 'cancelled');
    const guidelines = { ...saved, plan: { ...saved.plan, taskGraph: [{ ...task('guide', 'manual', []), title: '品牌识别规范' }] } };
    const automaticProject = await createImageStudioProject(user, { name: `orchestration-test-${randomUUID()}`, workflow: { designAgent: guidelines } }); created.push(automaticProject.id);
    const autoRun = await startOrchestration(automaticProject.id, user, { planVersion: 1, idempotencyKey: randomUUID(), prompts: [] });
    let guideCalls = 0;
    const guideServices = { ...services, createImageStudioTextJob: async (_id: string, _user: unknown, input: any) => {
      guideCalls++; assert.equal(input.operation, 'copy_generate'); assert.equal(input.context.autoBrandGuidelines, true); return { id: jobId };
    } };
    await tickOrchestration(autoRun.id, guideServices);
    await tickOrchestration(autoRun.id, guideServices);
    assert.equal(guideCalls, 1);
    assert.equal((await getOrchestrationDraft(automaticProject.id, autoRun.id, user)).status, 'completed', 'Brand guideline generation should continue automatically');
    const svgPlan = { ...saved, plan: { ...saved.plan, taskGraph: [{ ...task('vector', 'manual', []), title: 'Logo 可编辑 SVG 矢量稿' }] } };
    const svgProject = await createImageStudioProject(user, { name: `orchestration-test-${randomUUID()}`, workflow: { designAgent: svgPlan } }); created.push(svgProject.id);
    const svgRun = await startOrchestration(svgProject.id, user, { planVersion: 1, idempotencyKey: randomUUID(), prompts: [] });
    let svgCalls = 0;
    const svgServices = { ...services, createImageStudioTextJob: async (_id: string, _user: unknown, input: any) => { svgCalls++; assert.equal(input.operation, 'svg_generate'); return { id: jobId }; } };
    await tickOrchestration(svgRun.id, svgServices);
    await tickOrchestration(svgRun.id, svgServices);
    assert.equal(svgCalls, 1);
    assert.equal((await getOrchestrationDraft(svgProject.id, svgRun.id, user)).status, 'completed');
    const reviewPlan = { ...saved, plan: { ...saved.plan, taskGraph: [task('review', 'review', [])] } };
    const reviewProject = await createImageStudioProject(user, { name: `orchestration-test-${randomUUID()}`, workflow: { designAgent: reviewPlan } }); created.push(reviewProject.id);
    const reviewRun = await startOrchestration(reviewProject.id, user, { planVersion: 1, idempotencyKey: randomUUID(), prompts: [] });
    await dbPool!.query("UPDATE image_studio_orchestration_tasks SET status='queued',job_id=? WHERE run_id=? AND task_key='review'", [jobId, reviewRun.id]);
    await tickOrchestration(reviewRun.id, services);
    assert.equal((await getOrchestrationDraft(reviewProject.id, reviewRun.id, user)).status, 'completed', 'Completed AI review must not wait for approval');
    const imageProfile = (await listImageStudioModelProfiles()).find((profile: { capability: string; id: string }) => profile.capability === 'image');
    if (imageProfile) {
      const imagePlan = { ...saved, plan: { ...saved.plan, taskGraph: [{ ...task('image', 'image_generation', []), outputs: ['Logo'] }] } };
      const imageProject = await createImageStudioProject(user, { name: `orchestration-test-${randomUUID()}`, workflow: { designAgent: imagePlan, modelProfiles: { imageProfileId: imageProfile.id } } }); created.push(imageProject.id);
      const imageRun = await startOrchestration(imageProject.id, user, { planVersion: 1, idempotencyKey: randomUUID(), prompts: [{ taskId: 'image', slotKey: 'image-1', prompt: 'Test prompt' }] });
      const [runRows]: any = await dbPool!.query('SELECT created_at FROM image_studio_orchestration_runs WHERE id=?', [imageRun.id]);
      const createdAt = new Date(new Date(runRows[0].created_at).getTime() + 1000);
      const existingJobId = randomUUID(), assetId = randomUUID();
      await dbPool!.query("INSERT INTO image_studio_assets (id,project_id,owner_id,kind,role,object_key,filename,mime_type,size_bytes,created_at) VALUES (?,?,?,'image','generated','test-only','test.png','image/png',1,?)", [assetId, imageProject.id, user.id, createdAt]);
      await dbPool!.query("INSERT INTO image_studio_jobs (id,project_id,owner_id,job_type,status,idempotency_key,request_json,model_profile_id,progress,created_at,updated_at) VALUES (?,?,?,'image_generate','completed',?,?,?,100,?,?)", [existingJobId, imageProject.id, user.id, randomUUID(), JSON.stringify({ context: { taskId: 'image', planVersion: 1 } }), imageProfile.id, createdAt, createdAt]);
      await dbPool!.query("INSERT INTO image_studio_generations (id,job_id,project_id,slot_key,prompt,reference_asset_ids,model_profile_id,model_name,parameters_json,status,output_asset_id,created_at) VALUES (?,?,?,'image-1','Test prompt','[]',?,'test','{}','completed',?,?)", [randomUUID(), existingJobId, imageProject.id, imageProfile.id, assetId, createdAt]);
      const noNewImages = { ...services, createImageStudioGenerationJob: async () => { throw new Error('Existing images must not be regenerated'); } };
      await tickOrchestration(imageRun.id, noNewImages);
      const reused = await getOrchestrationDraft(imageProject.id, imageRun.id, user);
      assert.equal(reused.status, 'completed');
      assert.equal(reused.tasks[0].jobId, existingJobId);

      const candidates = Array.from({ length: 6 }, (_, i) => ({ id: `style-${i}`, name: `方向 ${i}`, concept: `概念 ${i}`, imagery: `图形 ${i}`, typography: '', palette: '' }));
      const referenceId = randomUUID();
      const candidatePlan = { ...saved, plan: { ...saved.plan, selectedDirectionId: null,
        taskGraph: [...saved.plan.taskGraph, { ...task('logo_candidates', 'image_generation', []), title: '多风格 Logo 候选', outputs: candidates.map((item) => item.name) }],
        logoExploration: { taskId: 'logo_candidates', candidates, referenceAssetIds: [referenceId] } } };
      const candidateProject = await createImageStudioProject(user, { name: `orchestration-test-${randomUUID()}`, workflow: { designAgent: candidatePlan, modelProfiles: { imageProfileId: imageProfile.id } } }); created.push(candidateProject.id);
      await dbPool!.query("INSERT INTO image_studio_assets (id,project_id,owner_id,kind,role,object_key,filename,mime_type,size_bytes,created_at) VALUES (?,?,?,'generated','generation','test-only','reference.png','image/png',1,NOW(3))", [referenceId, candidateProject.id, user.id]);
      const prompts = candidates.map((candidate, i) => ({ taskId: 'logo_candidates', slotKey: `logo_candidates-${i + 1}`, prompt: candidate.concept }));
      await assert.rejects(startOrchestration(candidateProject.id, user, { planVersion: 1, idempotencyKey: randomUUID(), prompts: prompts.slice(0, 5) }), /数量与方案不一致/);
      const candidateRun = await startOrchestration(candidateProject.id, user, { planVersion: 1, idempotencyKey: randomUUID(), prompts });
      let submitted: any;
      await tickOrchestration(candidateRun.id, { ...services, createImageStudioGenerationJob: async (_pid: string, _user: unknown, input: any) => { submitted = input; return { id: randomUUID() }; } });
      assert.equal(submitted.generations.length, 6);
      assert.deepEqual(submitted.generations.map((item: any) => item.prompt), prompts.map((item) => item.prompt));
      assert.ok(submitted.generations.every((item: any) => item.referenceAssetIds.includes(referenceId)));
      assert.deepEqual((await getOrchestrationDraft(candidateProject.id, candidateRun.id, user)).tasks.map((item: any) => item.id), ['logo_candidates']);
    }
    const listed = await fetch(`${base}/projects/${project.id}/orchestrations`, { headers });
    assert.equal(listed.status, 200); assert.ok((await listed.json() as any).data.length >= 3);
    const unauthorized = await fetch(`${base}/projects/${randomUUID()}/orchestrations`, { headers });
    assert.equal(unauthorized.status, 404);
    const malformed = await fetch(`${base}/projects/${project.id}/orchestrations`, { method: 'POST', headers, body: JSON.stringify({ planVersion: 1, idempotencyKey: 'short', prompts: [] }) });
    assert.notEqual(malformed.status, 202);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (previousFlag === undefined) delete process.env.IMAGE_STUDIO_ORCHESTRATION_ENABLED; else process.env.IMAGE_STUDIO_ORCHESTRATION_ENABLED = previousFlag;
    for (const id of created) {
      for (const table of ['image_studio_orchestration_events', 'image_studio_orchestration_tasks', 'image_studio_orchestration_runs']) await dbPool!.query(`DELETE FROM ${table} WHERE project_id=? AND owner_id=?`, [id, user.id]);
      await dbPool!.query('DELETE FROM image_studio_generations WHERE project_id=?', [id]);
      await dbPool!.query('DELETE FROM image_studio_jobs WHERE project_id=? AND owner_id=?', [id, user.id]);
      await dbPool!.query('DELETE FROM image_studio_assets WHERE project_id=? AND owner_id=?', [id, user.id]);
      await dbPool!.query('DELETE FROM image_studio_projects WHERE id=? AND owner_id=?', [id, user.id]);
      await dbPool!.query('DELETE FROM image_studio_audit_logs WHERE project_id=? AND actor_id=?', [id, user.id]);
    }
    await dbPool!.end();
  }
});
