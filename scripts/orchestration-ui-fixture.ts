import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import jwt from 'jsonwebtoken';
import { dbPool } from '../apps/server/src/config/database.js';
import { JWT_SECRET } from '../apps/server/src/middleware/auth.middleware.js';
import { createImageStudioProject, getImageStudioProject, listImageStudioModelProfiles } from '../apps/server/src/services/image-studio.js';
import { startOrchestration } from '../apps/server/src/services/image-studio-orchestration-runtime.js';
import { getAgentConversation } from '../apps/server/src/services/image-studio-agent-chat.js';

async function main() {
  if (!dbPool) throw new Error('Database unavailable');
  try {
    if (process.argv[2] === 'cache') {
      const metadata = JSON.parse(await readFile(process.argv[3], 'utf8'));
      const state = JSON.parse(await readFile(metadata.state, 'utf8'));
      state.origins = [{ origin: 'http://127.0.0.1:3000', localStorage: [{ name: 'auth_user', value: JSON.stringify({ id: metadata.ownerId, role: 'customer_service' }) }] }];
      await writeFile(metadata.state, JSON.stringify(state)); console.log('Local workspace cache owner added'); return;
    }
    if (process.argv[2] === 'start') {
      const metadata = JSON.parse(await readFile(process.argv[3], 'utf8'));
      const [users]: any = await dbPool.query('SELECT id,email,name,role FROM users WHERE id=?', [metadata.ownerId]);
      let prompts: Array<{ taskId: string; slotKey: string; prompt: string }> = [];
      if (metadata.canvasStage) {
        process.env.IMAGE_STUDIO_RUN_ORCHESTRATION_DB_TESTS = '1';
        const project = await getImageStudioProject(metadata.projectId, users[0]);
        if (!project.name.startsWith('orchestration-ui-qa-')) throw new Error('Fixture target verification failed');
        const saved = (project.workflow as any).designAgent;
        const { createPlanCanvasNodes, readConnectedPrompt, taskSlots } = await import('../apps/web/src/components/image-studio/canvas-plan.js');
        const canvas = createPlanCanvasNodes(saved, saved.plan.taskGraph, [], { x: 240, y: 240 }, true);
        prompts = saved.plan.taskGraph.flatMap((task: any) => taskSlots(task, saved).map((slot) => ({ taskId: task.id, slotKey: slot.slotKey, prompt: readConnectedPrompt(saved, slot.slotKey, canvas.nodes, canvas.connections) })));
      }
      const result = await startOrchestration(metadata.projectId, users[0], { planVersion: 1, idempotencyKey: metadata.canvasStage ? `plan-${metadata.projectId}-1` : randomUUID(), prompts });
      console.log(JSON.stringify({ id: result.id, status: result.status })); return;
    }
    if (process.argv[2] === 'cleanup') {
      const metadata = JSON.parse(await readFile(process.argv[3], 'utf8'));
      const [rows]: any = await dbPool.query("SELECT id FROM image_studio_projects WHERE id=? AND owner_id=? AND name LIKE 'orchestration-ui-qa-%'", [metadata.projectId, metadata.ownerId]);
      if (rows.length !== 1) throw new Error('Fixture target verification failed');
      await dbPool.query('DELETE FROM image_studio_canvas_projects WHERE id=? AND owner_id=?', [`studio-${metadata.projectId}`, metadata.ownerId]);
      for (const table of ['image_studio_orchestration_events', 'image_studio_orchestration_tasks', 'image_studio_orchestration_runs', 'image_studio_agent_memory_events', 'image_studio_agent_messages', 'image_studio_agent_runs', 'image_studio_agent_plan_revisions', 'image_studio_agent_sessions']) await dbPool.query(`DELETE FROM ${table} WHERE project_id=?`, [metadata.projectId]);
      await dbPool.query('DELETE FROM image_studio_projects WHERE id=? AND owner_id=?', [metadata.projectId, metadata.ownerId]);
      await dbPool.query('DELETE FROM image_studio_audit_logs WHERE project_id=?', [metadata.projectId]);
      await unlink(metadata.state); await unlink(process.argv[3]); console.log('Fixture project and temporary authentication files removed'); return;
    }
    const [users]: any = await dbPool.query("SELECT id,email,name,role FROM users WHERE role='customer_service' LIMIT 1");
    if (!users[0]) throw new Error('Development service account required');
    const user = users[0];
    const canvasStage = process.argv[2] === 'canvas';
    const choicesStage = process.argv[2] === 'choices';
    const direction = { id: 'a', name: '测试自然风格', concept: 'QA：不调用模型', positioning: '', audience: '', keywords: [], palette: ['#123456', '#ABCDEF', '#FFFFFF'].map((hex) => ({ name: hex, hex, usage: '' })), typography: '无衬线', imagery: '几何', rationale: '', deliverables: [] };
    const plan = { summary: '后台调度界面验证', brief: { brandName: 'QA', productOrService: '', positioning: '', targetAudience: '', marketAndChannel: '', businessGoal: '', knownFacts: [], constraints: [], factsToConfirm: [] }, questions: [], recommendedSkills: [], directions: [direction, { ...direction, id: 'b' }], selectedDirectionId: 'a', nextSteps: [], taskGraph: [
      { id: 'direction', title: '载入已确认方向', kind: 'direction', reason: '', dependsOn: [], skillIds: [], inputs: [], outputs: [], reviewPolicy: 'automatic' },
      { id: 'manual', title: '人工确认测试', kind: 'manual', reason: '只验证交互，不执行生图', dependsOn: ['direction'], skillIds: [], inputs: [], outputs: [], reviewPolicy: 'confirm' },
    ] };
    if (canvasStage) plan.taskGraph = [{ id: 'images', title: '独立 Logo 测试', kind: 'image_generation', reason: '只验证节点创建，测试运行不会派发模型', dependsOn: [], skillIds: [], inputs: [], outputs: ['Logo 方案一', 'Logo 方案二'], reviewPolicy: 'automatic' }];
    const imageProfile = canvasStage ? (await listImageStudioModelProfiles()).find((profile) => profile.capability === 'image') : undefined;
    if (canvasStage && !imageProfile) throw new Error('An enabled image model profile is needed; no model calls will be made');
    const project = await createImageStudioProject(user, { name: `orchestration-ui-qa-${randomUUID()}`, workflow: { ...(imageProfile ? { modelProfiles: { imageProfileId: imageProfile.id } } : {}),
      ...(!choicesStage ? { designAgent: { version: 1, mode: 'brand', status: 'approved', plan, answers: {}, selectedSkillIds: [], inputBrief: 'QA', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } } : {}), workbench: { designMode: 'brand' } } });
    if (choicesStage) {
      await getAgentConversation(project.id, user);
      const form = { id: 'qa-choice-form', title: '补充品牌设计需求', intro: '只验证推荐选项和其他输入，不调用模型。', skillIds: [], questions: [
        { id: 'qa_style', label: '品牌气质', prompt: '你希望品牌给人什么感觉？', required: true, answerType: 'text', options: ['温暖亲和', '极简专业', '活泼有趣'], recommendation: '温暖亲和' },
        { id: 'qa_quantity', label: '图片数量', prompt: '需要多少张独立图片？', required: true, answerType: 'textarea', options: [] },
      ] };
      await dbPool.query("INSERT INTO image_studio_agent_messages (id,project_id,owner_id,seq,role,content,metadata_json,created_at) VALUES (?,?,?,1,'assistant',?,?,NOW(3))",
        [randomUUID(), project.id, user.id, '先补充需求，再生成方案。', JSON.stringify({ skillConfirmationForm: form })]);
      await dbPool.query('UPDATE image_studio_agent_sessions SET last_seq=1,revision=1 WHERE project_id=?', [project.id]);
    } else if (!canvasStage) await startOrchestration(project.id, user, { planVersion: 1, idempotencyKey: randomUUID(), prompts: [] });
    const dir = await mkdtemp(join(tmpdir(), 'studio-orchestration-qa-')); const state = join(dir, 'state.json'); const metadataPath = join(dir, 'fixture.json');
    await writeFile(state, JSON.stringify({ cookies: [{ name: 'auth_token', value: jwt.sign(user, JWT_SECRET, { expiresIn: '10m' }), domain: '127.0.0.1', path: '/', expires: Math.floor(Date.now()/1000)+600, httpOnly: true, secure: false, sameSite: 'Lax' }], origins: [{ origin: 'http://127.0.0.1:3000', localStorage: [{ name: 'auth_user', value: JSON.stringify({ id: user.id, role: user.role }) }] }] }));
    await writeFile(metadataPath, JSON.stringify({ projectId: project.id, ownerId: user.id, state, canvasStage }));
    console.log(JSON.stringify({ projectId: project.id, state, metadataPath }));
  } finally { await dbPool.end(); }
}
main().catch((e) => { console.error(e.code || e.message); process.exitCode = 1; });
