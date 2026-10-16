'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { io, type Socket } from 'socket.io-client';
import { ArrowLeft, Check, ChevronDown, ChevronUp, CircleAlert, ImagePlus, Loader2, LockKeyhole, Plus, Send, Trash2, UnlockKeyhole, UploadCloud, WandSparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/auth';
import { Select as UiSelect, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { confidenceLabels, createPlatformSpecs, imageStudioCategories, imageStudioPlatforms, type ImageStudioCategory, type ImageStudioPlatform, type PlatformOutputSpec, type RuleConfidence } from '@/lib/image-studio-platform-specs';
import { ImageStudioTaskLogWindow, taskJobTitle, taskPhaseLabel, type TaskLogEntry, type TrackedTask } from '@/components/image-studio/task-log-window';

type Stage = 'materials' | 'product' | 'directions' | 'style' | 'specs' | 'variants' | 'storyboard' | 'prompts' | 'batch' | 'results';
type Project = { id: string; name: string; platform: string | null; workflow: Record<string, any>; version: number };
type Asset = { id: string; role: string; filename: string; mimeType: string; size: number; previewUrl: string; catalog: { ai: Record<string, any> | null; manual: Record<string, any>; effective: Record<string, any>; version: number } };
type ProductInfo = { category: string; brand: string; sellingPrice: string; originalPrice: string; material: string; color: string; shape: string; craft: string; lockTerm: string; specifications: Array<{ name: string; value: string }>; usageScenario: string; usageFunction: string; audience: string; occasions: string[]; copyTone: string; notes: string };
type ChatBrief = { summary: string; productName: string; productLinks: string[]; platform: string; deadline: string; deliverables: string[]; customerGoals: string[]; confirmedRequirements: string[]; sellingPointClues: string[]; customerConcerns: string[]; visualPreferences: string[]; mustKeep: string[]; avoid: string[]; factsToConfirm: string[]; followUpQuestions: string[] };
type ChatIntake = { id: string; projectId: string; sourceAssetIds: string[]; sourceType: 'screenshots' | 'collaboration' | 'invite'; sourceConversationId: string | null; sourceTitle: string | null; sourceMessageCount: number; sourceFormCount: number; sourceRequirementCount: number; sourceImageCount: number; sourceSkippedAttachmentCount: number; brief: ChatBrief | null; status: string; version: number; error: { code: string; message: string } | null; createdAt: string; updatedAt: string; reviewedAt: string | null };
type ImagePlan = { id: string; runId: string; version: number; status: string; plan: any; createdAt: string; updatedAt: string; reviewedAt: string | null };
type PlanRun = { id: string; jobId: string; sourceType: string; sourceConversationId: string; runStatus: string; error: { code: string; message: string } | null; createdAt: string; currentVersion: ImagePlan | null };
type CollaborationConversation = { id: string; conversationType: 'order' | 'invite'; title: string; orderNo: string; status: string; counterpartName: string; lastMessageAt: string | null; assignedServiceName: string | null };
type Profile = { id: string; name: string; capability: 'text' | 'vision' | 'image'; model: string | null; options?: Record<string, any> };
type DirectionKey = 'selling' | 'pain' | 'main_direction' | 'target_audience' | 'usage_scenario' | 'visual_style';
type Candidate = { id: string; text: string; status: string };
type Direction = { key: DirectionKey; label: string; required: boolean; selectedValues: string[]; customValues: string[]; version: number; candidates: Candidate[] };
type Job = { id: string; projectId: string; type: string; operation?: string | null; exportId?: string | null; context?: Record<string, any> | null; status: string; progress: number; phase?: string; result?: any; error: { message: string } | null; generations?: Array<{ id: string; slotKey?: string; shotId?: string | null; prompt?: string; status: string; previewUrl?: string | null; error?: { message: string } | null }>; createdAt?: string };
type Review = { id: string; slotKey: string; shotId: string | null; prompt: string; status: string; outputAssetId: string | null; filename: string | null; previewUrl: string | null; downloadUrl: string | null; error: { message: string } | null; selected: boolean; locked: boolean; reviewVersion: number; createdAt: string };
type ExportRecord = { id: string; jobId: string; imageCount: number; status: string; progress: number; error: { message: string } | null; downloadUrl: string | null; createdAt: string; completedAt: string | null };
type ApiResult<T> = { success: boolean; data: T; message?: string };

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(path, options);
  const result = await response.json() as ApiResult<T>;
  if (!response.ok || !result.success) throw new Error(result.message || '请求失败');
  return result.data;
}

const steps: Array<{ key: Stage; title: string; phase: string; note: string }> = [
  { key: 'materials', title: '沟通与素材', phase: '准备资料', note: '先整理客户需求，再补充商品图片和参考图' },
  { key: 'product', title: '商品信息', phase: '准备资料', note: '核对商品名称、型号和已有资料' },
  { key: 'directions', title: '卖点与人群', phase: '页面策划', note: '整理商品亮点、客户顾虑和适用场景' },
  { key: 'style', title: '视觉风格', phase: '页面策划', note: '确定页面配色、字体和整体感觉' },
  { key: 'specs', title: '规格设置', phase: '页面策划', note: '按图片用途设置平台画幅与制作数量' },
  { key: 'variants', title: '款式分配', phase: '页面策划', note: '把型号和颜色对应到正确的商品图片' },
  { key: 'storyboard', title: '页面规划', phase: '页面策划', note: '安排详情页顺序，逐页检查内容' },
  { key: 'prompts', title: '画面要求', phase: '生成与交付', note: '逐页确认画面内容和需要避免的内容' },
  { key: 'batch', title: '批量生图', phase: '生成与交付', note: '先试做一页，确认效果后再生成整套' },
  { key: 'results', title: '选图与交付', phase: '生成与交付', note: '选择结果、锁定合格图并下载' },
];

function progressLabel(status: string) {
  const labels: Record<string, string> = { queued: '准备中', processing: '进行中', completed: '已完成', failed: '未完成', partial: '部分完成', cancelled: '已停止', cancelling: '正在停止' };
  return labels[status] || '进行中';
}

function asList(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function splitLines(value: string) { return [...new Set(value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))]; }
function uid() { return crypto.randomUUID(); }
function selectImageSize(sizes: string[], ratio: string, fallback: string) {
  const desired = ratio.split(':').map(Number);
  if (desired.length !== 2 || !desired[0] || !desired[1]) return fallback;
  const targetRatio = desired[0] / desired[1];
  const candidates = sizes.flatMap((size) => {
    const match = /^(\d+)[x×](\d+)$/i.exec(size);
    return match ? [{ size, distance: Math.abs(Math.log((Number(match[1]) / Number(match[2])) / targetRatio)) }] : [];
  }).sort((left, right) => left.distance - right.distance);
  return candidates[0]?.size || fallback;
}

export function ImageStudioWorkflow({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [directions, setDirections] = useState<Direction[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const activityStorageKey = `image-studio-task-log:${projectId}`;
  const [activityLogs, setActivityLogs] = useState<TaskLogEntry[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const value = JSON.parse(window.localStorage.getItem(activityStorageKey) || '[]');
      return Array.isArray(value) ? value.filter((entry: TaskLogEntry) => Boolean(entry && typeof entry.id === 'string' && typeof entry.title === 'string' && typeof entry.detail === 'string' && typeof entry.createdAt === 'string')).slice(0, 80).map((entry: TaskLogEntry) => entry.status === 'running'
        ? { ...entry, status: 'info' as const, detail: `${entry.detail} · 页面已刷新，后台状态见当前任务` }
        : entry) : [];
    }
    catch { return []; }
  });
  const [trackedTask, setTrackedTask] = useState<TrackedTask | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [exports, setExports] = useState<ExportRecord[]>([]);
  const [chatIntakes, setChatIntakes] = useState<ChatIntake[]>([]);
  const [planRuns, setPlanRuns] = useState<PlanRun[]>([]);
  const [planDrafts, setPlanDrafts] = useState<Record<string, any>>({});
  const [collaborationConversations, setCollaborationConversations] = useState<CollaborationConversation[]>([]);
  const [selectedCollaborationId, setSelectedCollaborationId] = useState('');
  const [chatSourceMode, setChatSourceMode] = useState<'screenshots' | 'collaboration'>('screenshots');
  const [collaborationLoading, setCollaborationLoading] = useState(false);
  const [selectedChatAssetIds, setSelectedChatAssetIds] = useState<string[]>([]);
  const [chatBriefDrafts, setChatBriefDrafts] = useState<Record<string, ChatBrief>>({});
  const [workflow, setWorkflow] = useState<Record<string, any>>({});
  const [stage, setStage] = useState<Stage>('materials');
  const [textProfileId, setTextProfileId] = useState('');
  const [visionProfileId, setVisionProfileId] = useState('');
  const [imageProfileId, setImageProfileId] = useState('');
  const [uploadRole, setUploadRole] = useState('product');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const cursorRef = useRef(0);
  const loggedJobPhasesRef = useRef<Record<string, Set<string>>>({});
  const trackedBackgroundJobIdsRef = useRef(new Set<string>());
  const dataRef = useRef({ project, workflow, stage });
  dataRef.current = { project, workflow, stage };

  const appendActivityLog = useCallback((title: string, detail: string, status: TaskLogEntry['status'] = 'info') => {
    const entry: TaskLogEntry = { id: uid(), title, detail, status, createdAt: new Date().toISOString() };
    setActivityLogs((current) => [entry, ...current].slice(0, 80));
    return entry.id;
  }, []);
  const updateActivityLog = useCallback((id: string, patch: Partial<Pick<TaskLogEntry, 'detail' | 'status'>>) => {
    setActivityLogs((current) => current.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  }, []);
  const beginTrackedTask = useCallback((title: string, detail: string) => {
    const id = appendActivityLog(title, detail, 'running');
    setTrackedTask({ id, title, detail, startedAt: new Date().toISOString() });
    return id;
  }, [appendActivityLog]);
  const updateTrackedTask = useCallback((id: string, detail: string, progress?: number) => {
    setTrackedTask((current) => current?.id === id ? { ...current, detail, progress } : current);
    updateActivityLog(id, { detail });
  }, [updateActivityLog]);
  const finishTrackedTask = useCallback((id: string, success: boolean, detail: string) => {
    updateActivityLog(id, { detail, status: success ? 'success' : 'error' });
    setTrackedTask((current) => current?.id === id ? null : current);
  }, [updateActivityLog]);
  const watchBackgroundJob = useCallback((id: string) => { trackedBackgroundJobIdsRef.current.add(id); }, []);
  useEffect(() => {
    try { window.localStorage.setItem(activityStorageKey, JSON.stringify(activityLogs.slice(0, 80))); }
    catch { /* task logging remains available for this page session */ }
  }, [activityStorageKey, activityLogs]);

  const refreshAssets = useCallback(async () => {
    const value = await api<Asset[]>('/image-studio/projects/' + projectId + '/assets');
    setAssets(value);
    return value;
  }, [projectId]);
  const refreshDirections = useCallback(async () => {
    const value = await api<Direction[]>('/image-studio/projects/' + projectId + '/creative-directions');
    setDirections(value);
    return value;
  }, [projectId]);
  const refreshReviews = useCallback(async () => {
    const value = await api<Review[]>('/image-studio/projects/' + projectId + '/generation-reviews');
    setReviews(value);
    return value;
  }, [projectId]);
  const refreshExports = useCallback(async () => {
    const value = await api<ExportRecord[]>('/image-studio/projects/' + projectId + '/exports');
    setExports(value);
    return value;
  }, [projectId]);
  const refreshChatIntakes = useCallback(async () => {
    const value = await api<ChatIntake[]>('/image-studio/projects/' + projectId + '/chat-intakes');
    setChatIntakes(value);
    setChatBriefDrafts((current) => Object.fromEntries(value.filter((item) => item.brief).map((item) => [item.id, current[item.id] || item.brief!])));
    return value;
  }, [projectId]);
  const refreshPlans = useCallback(async () => {
    const value = await api<PlanRun[]>('/image-studio/projects/' + projectId + '/plans');
    setPlanRuns(value);
    setPlanDrafts((current) => Object.fromEntries(value.filter((item) => item.currentVersion).map((item) => [item.id, current[item.id] || item.currentVersion!.plan])));
    return value;
  }, [projectId]);
  const refreshCollaborationConversations = useCallback(async () => {
    setCollaborationLoading(true);
    try {
      const value = await api<CollaborationConversation[]>('/image-studio/projects/' + projectId + '/collaboration-conversations');
      setCollaborationConversations(value);
      setSelectedCollaborationId((current) => current && value.some((item) => `${item.conversationType}:${item.id}` === current) ? current : value[0] ? `${value[0].conversationType}:${value[0].id}` : '');
      return value;
    } finally { setCollaborationLoading(false); }
  }, [projectId]);
  const refreshJobs = useCallback(async () => {
    const summaries = await api<Array<{ id: string }>>('/image-studio/projects/' + projectId + '/jobs?limit=30');
    const full = await Promise.all(summaries.slice(0, 20).map((item) => api<Job>('/image-studio/jobs/' + item.id).catch(() => null)));
    setJobs((current) => full.filter((item): item is Job => Boolean(item)).map((job) => ({ ...job, phase: job.phase || current.find((item) => item.id === job.id)?.phase })));
  }, [projectId]);

  const saveWorkflow = useCallback(async (nextWorkflow = dataRef.current.workflow, nextStage = dataRef.current.stage) => {
    const current = dataRef.current.project;
    if (!current) return;
    setSaving(true);
    try {
      const updated = await api<Project>('/image-studio/projects/' + current.id, {
        method: 'PUT',
        body: JSON.stringify({ version: current.version, workflow: { ...nextWorkflow, _workflowStage: nextStage } }),
      });
      setProject(updated);
      dataRef.current = { ...dataRef.current, project: updated };
      appendActivityLog('保存工作流进度', `已保存「${steps.find((item) => item.key === nextStage)?.title || nextStage}」步骤`, 'success');
      return updated;
    } catch (error) {
      appendActivityLog('保存工作流进度', error instanceof Error ? error.message : '保存失败', 'error');
      toast.error(error instanceof Error ? error.message : '保存项目失败');
      throw error;
    } finally { setSaving(false); }
  }, [appendActivityLog]);

  const consumeJob = useCallback(async (jobId: string, event?: { eventType?: string; data?: Record<string, any>; progress?: number | Record<string, any> }) => {
    const job = await api<Job>('/image-studio/jobs/' + jobId);
    const eventData = event?.data || (event?.progress && typeof event.progress === 'object' ? event.progress : undefined);
    const phase = typeof eventData?.phase === 'string' ? eventData.phase : undefined;
    if (phase && trackedBackgroundJobIdsRef.current.has(job.id)) {
      const loggedPhases = loggedJobPhasesRef.current[job.id] || new Set<string>();
      if (!loggedPhases.has(phase)) {
        loggedPhases.add(phase);
        loggedJobPhasesRef.current[job.id] = loggedPhases;
        appendActivityLog('后台任务步骤', `${taskJobTitle(job)} · ${taskPhaseLabel(phase)}`, 'info');
      }
    }
    setJobs((current) => {
      const previous = current.find((item) => item.id === job.id);
      return [{ ...job, phase: phase || previous?.phase }, ...current.filter((item) => item.id !== job.id)].slice(0, 30);
    });
    if (job.type === 'image_generate') { void refreshReviews().catch(() => undefined); return; }
    if (job.type === 'export') {
      if (job.status === 'completed' || job.status === 'failed') void refreshExports().catch(() => undefined);
      else if (job.exportId) setExports((current) => current.map((item) => item.id === job.exportId ? { ...item, status: job.status, progress: job.progress } : item));
      return;
    }
    if (job.operation === 'chat_intake_extract') { await refreshChatIntakes(); return; }
    if (job.operation === 'plan_agent') { await refreshPlans(); return; }
    if (job.status !== 'completed' || !job.result || !job.operation) return;
    if (job.operation === 'creative_candidates') { await refreshDirections(); return; }
    const current = dataRef.current;
    const keyMap: Record<string, string> = { product_analyze: 'productAnalysis', storyboard: 'storyboard', copy_generate: 'copywriting', prompt_generate: 'generatedPrompt', asset_annotate: 'assetAnnotations' };
    const key = keyMap[job.operation];
    if (!key) return;
    if (current.workflow[key]?.sourceJobId === job.id) return;
    let result = job.result;
    if (job.operation === 'storyboard' && Array.isArray(result.shots)) {
      const outputSpecs = (current.workflow.specs?.outputs || []).filter((item: any) => item.enabled);
      const defaultOutputKey = outputSpecs.find((item: any) => item.key === 'detail')?.key || outputSpecs[0]?.key || 'detail';
      result = { ...result, shots: result.shots.slice(0, 20).map((shot: any, index: number) => ({ ...shot, id: shot.id || uid(), order: index + 1, outputSpecKey: shot.outputSpecKey || defaultOutputKey, approved: Boolean(shot.approved), prompt: String(shot.prompt || '') })) };
    }
    let next = { ...current.workflow, [key]: { ...result, sourceJobId: job.id } };
    if (job.operation === 'product_analyze') {
      const inferred = result && typeof result === 'object' && result.productInfo && typeof result.productInfo === 'object' && !Array.isArray(result.productInfo) ? result.productInfo : {};
      const savedInfo = current.workflow.productInfo && typeof current.workflow.productInfo === 'object' ? current.workflow.productInfo : {};
      const existing: ProductInfo = { category: '', brand: '', sellingPrice: '', originalPrice: '', material: '', color: '', shape: '', craft: '', lockTerm: '', usageScenario: '', usageFunction: '', audience: '', copyTone: '', ...savedInfo,
        specifications: Array.isArray(savedInfo.specifications) ? savedInfo.specifications : [], occasions: Array.isArray(savedInfo.occasions) ? savedInfo.occasions : [], notes: savedInfo.notes ?? current.workflow.specification ?? '' };
      const fillBlank = (key: keyof ProductInfo, value: unknown) => {
        if (typeof existing[key] === 'string' && String(existing[key]).trim()) return;
        if (typeof value === 'string' && value.trim()) (existing as any)[key] = value.trim();
      };
      for (const field of ['category', 'material', 'color', 'shape', 'craft', 'lockTerm', 'usageScenario', 'usageFunction', 'audience', 'copyTone'] as const) {
        fillBlank(field, inferred[field]);
      }
      if (!existing.specifications.length && Array.isArray(inferred.specifications)) {
        existing.specifications = inferred.specifications.slice(0, 30).flatMap((item: any) => {
          const name = typeof item?.name === 'string' ? item.name.trim().slice(0, 80) : '';
          const value = typeof item?.value === 'string' ? item.value.trim().slice(0, 300) : '';
          return name && value ? [{ name, value }] : [];
        });
      }
      if (!existing.occasions.length && Array.isArray(inferred.occasions)) {
        const occasions = inferred.occasions.filter((item: unknown): item is string => typeof item === 'string').map((item: string) => item.trim()).filter((item: string) => Boolean(item));
        existing.occasions = [...new Set<string>(occasions)].slice(0, 12);
      }
      next = { ...next, productName: current.workflow.productName || (typeof inferred.name === 'string' ? inferred.name.trim() : ''), productInfo: existing };
    }
    if (job.operation === 'prompt_generate' && job.context?.shotId && result.prompt) {
      const shots = current.workflow.storyboard?.shots || [];
      next = { ...next, storyboard: { ...current.workflow.storyboard, shots: shots.map((shot: any) => shot.id === job.context?.shotId
        ? { ...shot, prompt: result.prompt, negativePrompt: result.negativePrompt || '', promptReferenceAssetIds: asList(result.referenceAssetIds) } : shot) } };
    }
    if (job.operation === 'asset_annotate') await refreshAssets().catch(() => undefined);
    setWorkflow(next);
    dataRef.current = { ...current, workflow: next };
    try {
      const updated = await api<Project>('/image-studio/projects/' + current.project?.id, {
        method: 'PUT', body: JSON.stringify({ version: current.project!.version, workflow: { ...next, _workflowStage: current.stage } }),
      });
      setProject(updated);
      dataRef.current = { ...dataRef.current, project: updated };
      if (job.operation === 'product_analyze') await refreshDirections();
      toast.success('结果已保存');
    } catch { toast.error('结果已保存。请刷新页面，确认显示的是最新内容。'); }
  }, [appendActivityLog, refreshAssets, refreshChatIntakes, refreshDirections, refreshExports, refreshPlans, refreshReviews]);

  const syncEvents = useCallback(async () => {
    const events = await api<Array<{ id: number; jobId: string; type?: string; payload?: Record<string, any> }>>('/image-studio/projects/' + projectId + '/events?after=' + cursorRef.current + '&limit=500');
    for (const event of events) {
      cursorRef.current = Math.max(cursorRef.current, event.id);
      await consumeJob(event.jobId, { eventType: event.type, data: event.payload }).catch(() => undefined);
    }
  }, [consumeJob, projectId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, a, m, d, chat] = await Promise.all([
        api<Project>('/image-studio/projects/' + projectId), refreshAssets(),
        api<Profile[]>('/image-studio/model-profiles'), refreshDirections(), refreshChatIntakes(), refreshCollaborationConversations().catch(() => []), refreshPlans(),
      ]);
      const savedSpecs = p.workflow?.specs || {};
      const specsPlatform = savedSpecs.platform || savedSpecs.platformTemplate || p.platform || 'taobao';
      const specsCategory = (savedSpecs.category || p.workflow?.productCategory || 'unspecified') as ImageStudioCategory;
      const freshSpecs = createPlatformSpecs(specsPlatform, specsCategory);
      const savedOutputs = Array.isArray(savedSpecs.outputs) ? savedSpecs.outputs : [];
      const outputSpecs = freshSpecs.outputs.map((preset) => {
        const saved = savedOutputs.find((item: any) => item.key === preset.key);
        return saved ? { ...preset, ...saved, enabled: Boolean(saved.enabled) } : preset;
      });
      const initializedWorkflow = { ...(p.workflow || {}), productCategory: p.workflow?.productCategory || specsCategory,
        specs: { ...freshSpecs, ...savedSpecs, platform: freshSpecs.platform, category: specsCategory, platformTemplate: freshSpecs.platformTemplate,
          profileVersion: freshSpecs.profileVersion, outputs: outputSpecs, aspectRatio: savedSpecs.aspectRatio || '3:4' } };
      setProject(p); setAssets(a); setProfiles(m); setDirections(d); setWorkflow(initializedWorkflow);
      setChatIntakes(chat);
      setChatBriefDrafts(Object.fromEntries(chat.filter((item) => item.brief).map((item) => [item.id, item.brief!])));
      setSelectedChatAssetIds(a.filter((asset) => asset.role === 'chat_screenshot').slice(-12).map((asset) => asset.id));
      const savedStage = String(p.workflow?._workflowStage || 'materials') as Stage;
      if (steps.some((item) => item.key === savedStage)) setStage(savedStage);
      dataRef.current = { project: p, workflow: initializedWorkflow, stage: steps.some((item) => item.key === savedStage) ? savedStage : 'materials' };
      setTextProfileId(m.find((item) => item.capability === 'text')?.id || m.find((item) => item.capability === 'vision')?.id || '');
      setVisionProfileId(m.find((item) => item.capability === 'vision')?.id || m.find((item) => item.capability === 'text')?.id || '');
      setImageProfileId(m.find((item) => item.capability === 'image')?.id || '');
      await Promise.all([refreshJobs(), refreshReviews(), refreshExports()]);
      await syncEvents();
    } catch (error) { toast.error(error instanceof Error ? error.message : '工作台加载失败'); }
    finally { setLoading(false); }
  }, [projectId, refreshAssets, refreshChatIntakes, refreshCollaborationConversations, refreshDirections, refreshExports, refreshJobs, refreshPlans, refreshReviews, syncEvents]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let active = true;
    let socket: Socket | null = null;
    const connect = async () => {
      try {
        const ticket = await api<{ ticket: string }>('/image-studio/socket-ticket', { method: 'POST', body: '{}' });
        if (!active) return;
        const origin = process.env.NODE_ENV === 'development' ? window.location.protocol + '//' + window.location.hostname + ':8080' : window.location.origin;
        socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || origin, { path: '/socket.io', transports: ['websocket'], reconnection: true, auth: { ticket: ticket.ticket } });
        socketRef.current = socket;
        socket.on('connect', () => { setConnected(true); void syncEvents(); });
        socket.on('disconnect', () => setConnected(false));
        socket.on('image-studio:job:update', (event: { projectId?: string; jobId?: string; eventType?: string; data?: Record<string, any>; progress?: number | Record<string, any> }) => {
          if (event.projectId === projectId && event.jobId) void consumeJob(event.jobId, event).catch(() => undefined);
        });
      } catch { /* socket connection retries on the next page load */ }
    };
    void connect();
    return () => { active = false; socket?.disconnect(); socketRef.current = null; };
  }, [consumeJob, projectId, syncEvents]);

  useEffect(() => {
    if (connected) return;
    const timer = window.setInterval(() => {
      void (async () => { await refreshJobs().catch(() => undefined); await syncEvents().catch(() => undefined); })();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [connected, refreshJobs, syncEvents]);

  const patchWorkflow = (patch: Record<string, any>) => setWorkflow((current) => ({ ...current, ...patch }));
  const patchNested = (key: string, patch: Record<string, any>) => setWorkflow((current) => {
    const nested = { ...(current[key] || {}), ...patch };
    if (key === 'specs' && !Object.prototype.hasOwnProperty.call(patch, 'confirmed')) nested.confirmed = false;
    return { ...current, [key]: nested };
  });
  const changeSpecPlatform = (platform: ImageStudioPlatform) => {
    const next = createPlatformSpecs(platform, specs.category || 'unspecified');
    const outputs = next.outputs.map((preset) => {
      const previous = outputSpecs.find((item) => item.key === preset.key);
      if (!previous) return preset;
      const customized = previous.customizedFields || [];
      return {
        ...preset,
        enabled: previous.enabled,
        customizedFields: customized,
        ...(customized.includes('aspectRatio') ? { aspectRatio: previous.aspectRatio } : {}),
        ...(customized.includes('width') ? { width: previous.width } : {}),
        ...(customized.includes('height') ? { height: previous.height } : {}),
        ...(customized.includes('count') ? { count: previous.count } : {}),
      };
    });
    patchNested('specs', { ...next, channel: specs.channel || '', categoryDetail: specs.categoryDetail || '', outputs });
  };
  const setOutputEnabled = (key: string, enabled: boolean) => {
    patchNested('specs', { outputs: outputSpecs.map((item) => item.key === key ? { ...item, enabled } : item) });
  };
  const updateOutputSpec = (key: string, field: 'aspectRatio' | 'width' | 'height' | 'count', value: string) => {
    patchNested('specs', { outputs: outputSpecs.map((item) => {
      if (item.key !== key) return item;
      const customizedFields = [...new Set([...(item.customizedFields || []), field])];
      const numericValue = Math.max(1, Number(value) || 1);
      return { ...item, [field]: field === 'aspectRatio' ? value : field === 'count' ? Math.min(20, numericValue) : numericValue, customizedFields };
    }) });
  };
  const patchProductInfo = (patch: Partial<ProductInfo>) => setWorkflow((current) => ({ ...current,
    productInfo: { category: '', brand: '', sellingPrice: '', originalPrice: '', material: '', color: '', shape: '', craft: '', lockTerm: '', specifications: [], usageScenario: '', usageFunction: '', audience: '', occasions: [], copyTone: '', ...(current.productInfo || {}), notes: current.productInfo?.notes ?? current.specification ?? '', ...patch },
  }));
  const patchShot = (id: string, patch: Record<string, any>) => setWorkflow((current) => ({ ...current, storyboard: { ...current.storyboard, shots: (current.storyboard?.shots || []).map((shot: any) => shot.id === id ? { ...shot, ...patch } : shot) } }));

  const runTask = async (operation: string, context: Record<string, any>, referenceAssetIds: string[] = []) => {
    const modelProfileId = referenceAssetIds.length ? visionProfileId : textProfileId;
    if (!modelProfileId) { toast.error(referenceAssetIds.length ? '暂时无法识别图片，请稍后再试；如果持续出现，请联系管理员' : '请先选择文案与策划服务'); return; }
    const taskLabels: Record<string, string> = { product_analyze: '分析商品信息', storyboard: '生成页面方案', copy_generate: '生成商品文案', prompt_generate: '完善画面要求', asset_annotate: '识别商品素材' };
    const activityId = beginTrackedTask(taskLabels[operation] || '执行AI任务', '正在保存项目设置并提交后台任务');
    setBusy(true);
    try {
      await saveWorkflow();
      updateTrackedTask(activityId, '正在提交AI处理任务');
      const accepted = await api<{ id: string }>('/image-studio/projects/' + projectId + '/ai-tasks', {
        method: 'POST', headers: { 'Idempotency-Key': uid() },
        body: JSON.stringify({ modelProfileId, operation, context: { workflow, projectName: project?.name, platform: project?.platform, ...context }, referenceAssetIds }),
      });
      watchBackgroundJob(accepted.id);
      updateTrackedTask(activityId, '后台任务已受理，正在读取实时进度');
      const job = await api<Job>('/image-studio/jobs/' + accepted.id);
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      finishTrackedTask(activityId, true, `后台任务已提交 · ${taskLabels[operation] || operation}`);
      toast.success('已开始整理内容，完成后会在这里显示');
    } catch (error) { finishTrackedTask(activityId, false, error instanceof Error ? error.message : '提交失败'); toast.error(error instanceof Error ? error.message : '暂时无法开始，请稍后重试'); }
    finally { setBusy(false); }
  };

  const requestCandidates = async (direction: Direction) => {
    if (!visionProfileId) { toast.error('暂时无法识别图片，请稍后再试；如果持续出现，请联系管理员'); return; }
    const activityId = beginTrackedTask('生成创作方向建议', `正在分析「${direction.label}」方向`);
    setBusy(true);
    try {
      const accepted = await api<{ id: string }>('/image-studio/projects/' + projectId + '/creative-directions/' + direction.key + '/candidates', {
        method: 'POST', headers: { 'Idempotency-Key': uid() }, body: JSON.stringify({ modelProfileId: visionProfileId, referenceAssetIds: assets.filter((asset) => asset.role === 'product').slice(0, 8).map((asset) => asset.id) }),
      });
      watchBackgroundJob(accepted.id);
      updateTrackedTask(activityId, '任务已受理，正在读取实时进度');
      const job = await api<Job>('/image-studio/jobs/' + accepted.id);
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      finishTrackedTask(activityId, true, `已提交「${direction.label}」建议任务`);
      toast.success('已开始生成建议，完成后会自动显示');
    } catch (error) { finishTrackedTask(activityId, false, error instanceof Error ? error.message : '建议生成任务提交失败'); toast.error(error instanceof Error ? error.message : '建议暂时无法生成，请重试'); }
    finally { setBusy(false); }
  };

  const saveDirection = async (direction: Direction, patch: Partial<Pick<Direction, 'selectedValues' | 'customValues'>> = {}) => {
    try {
      await api('/image-studio/projects/' + projectId + '/creative-directions/' + direction.key, {
        method: 'PUT', body: JSON.stringify({ selectedValues: patch.selectedValues ?? direction.selectedValues, customValues: patch.customValues ?? direction.customValues, version: direction.version }),
      });
      await refreshDirections();
      appendActivityLog('更新创作方向', `已保存「${direction.label}」方向`, 'success');
    } catch (error) { appendActivityLog('更新创作方向失败', error instanceof Error ? error.message : '保存失败', 'error'); toast.error(error instanceof Error ? error.message : '保存创作方向失败'); }
  };
  const setCandidate = async (candidate: Candidate, status: 'accepted' | 'rejected') => {
    try { await api('/image-studio/projects/' + projectId + '/creative-candidates/' + candidate.id, { method: 'PATCH', body: JSON.stringify({ status }) }); await refreshDirections(); appendActivityLog(status === 'accepted' ? '采纳创作建议' : '忽略创作建议', '已更新建议状态', 'success'); }
    catch (error) { toast.error(error instanceof Error ? error.message : '无法保存这条建议，请重试'); }
  };

  const uploadFiles = async (files: FileList | null, role = uploadRole) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    const uploadedChatAssetIds: string[] = [];
    let uploadedCount = 0;
    const activityId = beginTrackedTask('上传商品素材', `准备上传 ${selectedFiles.length} 张素材`);
    setUploading(true);
    try {
      if (role === 'chat_screenshot' && selectedFiles.length > 12) throw new Error('一次最多上传 12 张聊天截图');
      for (const file of selectedFiles) {
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 100 * 1024 * 1024) throw new Error('仅支持 100 MB 以内的 PNG、JPEG、WebP 或 GIF 图片');
        if (role === 'chat_screenshot' && file.size > 15 * 1024 * 1024) throw new Error('单张聊天截图不能超过 15 MB');
      }
      for (let index = 0; index < selectedFiles.length; index += 1) {
        const file = selectedFiles[index];
        updateTrackedTask(activityId, `正在上传第 ${index + 1}/${selectedFiles.length} 张素材`, Math.round((index / selectedFiles.length) * 100));
        const signed = await api<{ assetId: string; uploadUrl: string; contentType: string }>('/upload/presign', { method: 'POST', body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, folder: 'image-studio' }) });
        const uploaded = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': signed.contentType }, body: file, redirect: 'error' });
        if (!uploaded.ok) throw new Error('图片上传失败，请重试');
        await api('/upload/complete', { method: 'POST', body: JSON.stringify({ assetId: signed.assetId }) });
        const attached = await api<{ id: string }>('/image-studio/projects/' + projectId + '/assets', { method: 'POST', body: JSON.stringify({ mediaAssetId: signed.assetId, role }) });
        if (role === 'chat_screenshot') uploadedChatAssetIds.push(attached.id);
        uploadedCount += 1;
      }
      if (uploadedChatAssetIds.length) setSelectedChatAssetIds((current) => [...new Set([...current, ...uploadedChatAssetIds])].slice(-12));
      await refreshAssets(); finishTrackedTask(activityId, true, `已上传 ${uploadedCount} 张素材（${role === 'product' ? '商品素材' : role === 'chat_screenshot' ? '聊天截图' : role}）`); toast.success('图片已上传');
    } catch (error) {
      if (uploadedChatAssetIds.length) {
        setSelectedChatAssetIds((current) => [...new Set([...current, ...uploadedChatAssetIds])].slice(-12));
        await refreshAssets().catch(() => undefined);
      }
      finishTrackedTask(activityId, false, `${uploadedCount}/${selectedFiles.length} 张已上传 · ${error instanceof Error ? error.message : '上传失败'}`);
      toast.error(error instanceof Error ? error.message : '上传素材失败');
    }
    finally { setUploading(false); }
  };

  const changeAssetRole = async (assetId: string, role: string) => {
    try {
      await api('/image-studio/projects/' + projectId + '/assets/' + encodeURIComponent(assetId), { method: 'PATCH', body: JSON.stringify({ role }) });
      await refreshAssets();
      appendActivityLog('修改素材用途', `素材用途已设为「${role}」`, 'success');
    } catch (error) { toast.error(error instanceof Error ? error.message : '更新素材用途失败'); }
  };

  const recognizeChatScreenshots = async (ids = selectedChatAssetIds) => {
    const sourceAssetIds = [...new Set(ids)].slice(0, 12);
    if (!profiles.some((profile) => profile.id === visionProfileId && profile.capability === 'vision')) { toast.error('暂时无法识别图片，请稍后再试；如果持续出现，请联系管理员'); return; }
    if (!sourceAssetIds.length) { toast.error('请先选择要识别的聊天截图'); return; }
    const activityId = beginTrackedTask('识别聊天截图需求', `准备分析 ${sourceAssetIds.length} 张聊天截图`);
    setBusy(true);
    try {
      const accepted = await api<{ id: string }>('/image-studio/projects/' + projectId + '/ai-tasks', {
        method: 'POST', headers: { 'Idempotency-Key': uid() },
        body: JSON.stringify({ modelProfileId: visionProfileId, operation: 'chat_intake_extract', context: { projectName: project?.name || '', platform: project?.platform || '' }, referenceAssetIds: sourceAssetIds }),
      });
      watchBackgroundJob(accepted.id);
      const job = await api<Job>('/image-studio/jobs/' + accepted.id);
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      await refreshChatIntakes();
      finishTrackedTask(activityId, true, `已提交 ${sourceAssetIds.length} 张聊天截图的识别任务`);
      toast.success('已开始整理，稍后可在下方核对结果');
    } catch (error) { finishTrackedTask(activityId, false, error instanceof Error ? error.message : '整理聊天截图失败'); toast.error(error instanceof Error ? error.message : '整理聊天截图失败，请重试'); }
    finally { setBusy(false); }
  };

  const recognizeCollaborationConversation = async () => {
    const [conversationType, conversationId] = selectedCollaborationId.split(':', 2);
    if (!conversationId || !['order', 'invite'].includes(conversationType)) { toast.error('请先选择一段订单或邀请会话'); return; }
    if (!profiles.some((profile) => profile.id === visionProfileId && profile.capability === 'vision')) { toast.error('暂时无法识别图片，请稍后再试；如果持续出现，请联系管理员'); return; }
    const activityId = beginTrackedTask('整理订单 / 邀请会话', '正在读取会话内容及相关图片');
    setBusy(true);
    try {
      const accepted = await api<{ id: string }>('/image-studio/projects/' + projectId + '/chat-intakes/from-collaboration', {
        method: 'POST', headers: { 'Idempotency-Key': uid() },
        body: JSON.stringify({ modelProfileId: visionProfileId, conversationId, conversationType }),
      });
      watchBackgroundJob(accepted.id);
      const job = await api<Job>('/image-studio/jobs/' + accepted.id);
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      await Promise.all([refreshChatIntakes(), refreshAssets()]);
      finishTrackedTask(activityId, true, '会话已提交后台整理任务');
      toast.success('已开始整理会话内容及相关图片');
    } catch (error) { finishTrackedTask(activityId, false, error instanceof Error ? error.message : '会话整理任务提交失败'); toast.error(error instanceof Error ? error.message : '整理会话内容失败，请重试'); }
    finally { setBusy(false); }
  };

  const generateImagePlan = async () => {
    const [conversationType, conversationId] = selectedCollaborationId.split(':', 2);
    if (!conversationId || !['order', 'invite'].includes(conversationType)) { toast.error('请先选择一段订单或邀请会话'); return; }
    if (!profiles.some((profile) => profile.id === visionProfileId && profile.capability === 'vision') || !profiles.some((profile) => profile.capability === 'text')) {
      toast.error('图片方案需要启用图生文和文生文模型，请联系管理员检查模型配置'); return;
    }
    const activityId = beginTrackedTask('生成图片方案', '正在读取会话、识别图片并整理需求');
    setBusy(true);
    try {
      const accepted = await api<{ id: string }>('/image-studio/projects/' + projectId + '/plans/from-collaboration', {
        method: 'POST', headers: { 'Idempotency-Key': uid() }, body: JSON.stringify({ modelProfileId: visionProfileId, conversationId, conversationType }),
      });
      watchBackgroundJob(accepted.id);
      await Promise.all([refreshPlans(), refreshAssets()]);
      toast.success('已提交方案任务，图片识别、需求整理和校验将在后台依次完成');
      void api<Job>('/image-studio/jobs/' + accepted.id).then((job) => setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)])).catch(() => undefined);
      finishTrackedTask(activityId, true, '图片方案任务已进入后台队列');
    } catch (error) { finishTrackedTask(activityId, false, error instanceof Error ? error.message : '创建图片方案失败'); toast.error(error instanceof Error ? error.message : '创建图片方案失败'); }
    finally { setBusy(false); }
  };

  const generateScreenshotPlan = async () => {
    if (!selectedChatAssetIds.length) { toast.error('请先选择聊天截图'); return; }
    if (!profiles.some((profile) => profile.id === visionProfileId && profile.capability === 'vision') || !profiles.some((profile) => profile.capability === 'text')) {
      toast.error('图片方案需要启用图生文和文生文模型，请联系管理员检查模型配置'); return;
    }
    const activityId = beginTrackedTask('从截图生成图片方案', `正在处理 ${selectedChatAssetIds.length} 张聊天截图`);
    setBusy(true);
    try {
      const accepted = await api<{ id: string }>('/image-studio/projects/' + projectId + '/plans/from-screenshots', {
        method: 'POST', headers: { 'Idempotency-Key': uid() }, body: JSON.stringify({ modelProfileId: visionProfileId, assetIds: selectedChatAssetIds }),
      });
      watchBackgroundJob(accepted.id);
      await refreshPlans();
      toast.success('已提交截图方案任务，正在识别对话和整理逐图提示词');
      void api<Job>('/image-studio/jobs/' + accepted.id).then((job) => setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)])).catch(() => undefined);
      finishTrackedTask(activityId, true, '截图方案任务已进入后台队列');
    } catch (error) { finishTrackedTask(activityId, false, error instanceof Error ? error.message : '创建截图方案失败'); toast.error(error instanceof Error ? error.message : '创建截图方案失败'); }
    finally { setBusy(false); }
  };

  const saveImagePlan = async (run: PlanRun, approve: boolean) => {
    if (!run.currentVersion) return;
    const plan = planDrafts[run.id] || run.currentVersion.plan;
    setBusy(true);
    try {
      const version = await api<ImagePlan>('/image-studio/projects/' + projectId + '/plans/' + run.id + '/review', {
        method: 'PUT', body: JSON.stringify({ versionId: run.currentVersion.id, version: run.currentVersion.version, plan, approve }),
      });
      setPlanRuns((current) => current.map((item) => item.id === run.id ? { ...item, runStatus: version.status, currentVersion: version } : item));
      setPlanDrafts((current) => ({ ...current, [run.id]: version.plan }));
      appendActivityLog(approve ? '确认图片方案' : '保存图片方案', `方案版本 ${version.version}`, 'success');
      toast.success(approve ? '方案已审核确认' : '方案修改已保存');
    } catch (error) { appendActivityLog('保存图片方案失败', error instanceof Error ? error.message : '保存失败', 'error'); toast.error(error instanceof Error ? error.message : '保存图片方案失败'); }
    finally { setBusy(false); }
  };

  const exportImagePlan = async (run: PlanRun, format: 'json' | 'md') => {
    try {
      const result = await api<{ url: string; filename: string }>('/image-studio/projects/' + projectId + '/plans/' + run.id + '/export', { method: 'POST', body: JSON.stringify({ format }) });
      const link = document.createElement('a'); link.href = result.url; link.download = result.filename; link.rel = 'noreferrer'; link.click();
      appendActivityLog('导出图片方案', `已下载 ${result.filename}`, 'success');
    } catch (error) { appendActivityLog('导出图片方案失败', error instanceof Error ? error.message : '导出失败', 'error'); toast.error(error instanceof Error ? error.message : '导出方案失败'); }
  };

  const approveChatIntake = async (intake: ChatIntake) => {
    const brief = chatBriefDrafts[intake.id] || intake.brief;
    if (!brief) return;
    setBusy(true);
    try {
      const result = await api<{ intake: ChatIntake; project: Project }>('/image-studio/projects/' + projectId + '/chat-intakes/' + intake.id + '/review', {
        method: 'PUT', body: JSON.stringify({ version: intake.version, brief }),
      });
      setProject(result.project); setWorkflow(result.project.workflow);
      dataRef.current = { project: result.project, workflow: result.project.workflow, stage };
      setChatIntakes((current) => current.map((item) => item.id === result.intake.id ? result.intake : item));
      setChatBriefDrafts((current) => ({ ...current, [intake.id]: result.intake.brief || brief }));
      appendActivityLog('确认聊天需求', '已将核对后的需求带入商品方案', 'success');
      toast.success('已确认聊天需求，并带入商品方案');
    } catch (error) { appendActivityLog('确认聊天需求失败', error instanceof Error ? error.message : '保存失败', 'error'); toast.error(error instanceof Error ? error.message : '保存聊天需求失败'); }
    finally { setBusy(false); }
  };

  const startShot = async (shot: any) => {
    if (!imageProfileId) { toast.error('请先选择生图服务'); return; }
    const activityId = beginTrackedTask('生成单页图片', `正在提交「${shot.title || '当前页面'}」· ${outputForShot(shot)?.label || '图片用途待定'}`);
    setBusy(true);
    try {
      const refs = asList(shot.promptReferenceAssetIds).length ? asList(shot.promptReferenceAssetIds) : asList(shot.referenceAssetIds);
      const accepted = await api<{ id: string }>('/image-studio/projects/' + projectId + '/jobs', {
        method: 'POST', headers: { 'Idempotency-Key': uid() },
        body: JSON.stringify({ modelProfileId: imageProfileId, generations: [{ slotKey: 'shot-' + shot.id + '-' + Date.now(), shotId: shot.id, prompt: generationPrompt(shot), referenceAssetIds: refs.filter((id) => assets.some((asset) => asset.id === id && asset.role === 'product')).slice(0, 12), parameters: generationParametersForShot(shot) }] }),
      });
      watchBackgroundJob(accepted.id);
      updateTrackedTask(activityId, '单页图片任务已受理，正在读取生成进度');
      const job = await api<Job>('/image-studio/jobs/' + accepted.id);
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      finishTrackedTask(activityId, true, `已提交「${shot.title || '当前页面'}」图片生成`);
      toast.success('页面图片已开始生成');
    } catch (error) { finishTrackedTask(activityId, false, error instanceof Error ? error.message : '图片生成任务提交失败'); toast.error(error instanceof Error ? error.message : '暂时无法开始图片生成，请稍后重试'); }
    finally { setBusy(false); }
  };
  const startBatch = async () => {
    const approved = (workflow.storyboard?.shots || []).filter((shot: any) => shot.approved && String(shot.prompt || '').trim());
    if (!imageProfileId || !approved.length) return;
    const activityId = beginTrackedTask('批量生成商品图片', `正在提交 ${approved.length} 个已确认页面`);
    setBusy(true);
    try {
      const accepted = await api<{ id: string }>('/image-studio/projects/' + projectId + '/jobs', {
        method: 'POST', headers: { 'Idempotency-Key': uid() },
        body: JSON.stringify({ modelProfileId: imageProfileId, generations: approved.slice(0, 20).map((shot: any) => ({
          slotKey: 'batch-' + shot.id + '-' + Date.now(), shotId: shot.id,
          prompt: generationPrompt(shot),
          referenceAssetIds: (asList(shot.promptReferenceAssetIds).length ? asList(shot.promptReferenceAssetIds) : asList(shot.referenceAssetIds)).filter((id: string) => assets.some((asset) => asset.id === id && asset.role === 'product')).slice(0, 12),
          parameters: generationParametersForShot(shot),
        })) }),
      });
      watchBackgroundJob(accepted.id);
      updateTrackedTask(activityId, `${approved.length} 个页面已受理，正在读取生成进度`);
      const job = await api<Job>('/image-studio/jobs/' + accepted.id);
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      finishTrackedTask(activityId, true, `已提交 ${approved.length} 个页面的批量生成`);
      toast.success(approved.length + ' 个页面已开始生成');
    } catch (error) { finishTrackedTask(activityId, false, error instanceof Error ? error.message : '批量生成任务提交失败'); toast.error(error instanceof Error ? error.message : '暂时无法开始批量生成，请稍后重试'); }
    finally { setBusy(false); }
  };

  const setReview = async (item: Review, patch: Partial<Pick<Review, 'selected' | 'locked'>>) => {
    try {
      await api('/image-studio/projects/' + projectId + '/generations/' + item.id + '/review', {
        method: 'PATCH', body: JSON.stringify({ selected: patch.selected ?? item.selected, locked: patch.locked ?? item.locked, version: item.reviewVersion }),
      });
      await refreshReviews();
      const actions = [patch.selected !== undefined ? (patch.selected ? '选中交付图片' : '取消选中图片') : '', patch.locked !== undefined ? (patch.locked ? '锁定图片' : '解除锁定') : ''].filter(Boolean);
      if (actions.length) appendActivityLog(actions.join('、'), item.filename || `图片任务 ${item.slotKey}`, 'success');
    } catch (error) { toast.error(error instanceof Error ? error.message : '图片评审状态保存失败'); }
  };

  const createExport = async () => {
    if (!reviews.some((item) => item.selected && item.status === 'completed')) { toast.error('请先选择已完成的图片'); return; }
    const activityId = beginTrackedTask('打包交付图片', '正在汇总已选图片并创建下载包');
    setBusy(true);
    try {
      const accepted = await api<{ id: string; jobId: string; imageCount: number }>('/image-studio/projects/' + projectId + '/exports', { method: 'POST', headers: { 'Idempotency-Key': uid() }, body: '{}' });
      watchBackgroundJob(accepted.jobId);
      await refreshExports();
      await refreshJobs();
      finishTrackedTask(activityId, true, `已提交 ${accepted.imageCount} 张图片的打包任务`);
      toast.success(accepted.imageCount + ' 张图片已开始打包');
    } catch (error) { finishTrackedTask(activityId, false, error instanceof Error ? error.message : '打包任务提交失败'); toast.error(error instanceof Error ? error.message : '打包图片失败，请重试'); }
    finally { setBusy(false); }
  };

  const retryJob = async (jobId: string) => {
    const activityId = beginTrackedTask('重新执行失败任务', `正在重新提交任务 ${jobId.slice(0, 8)}`);
    try {
      const retried = await api<{ id: string }>('/image-studio/jobs/' + jobId + '/retry', { method: 'POST', body: '{}' });
      watchBackgroundJob(retried.id);
      const job = await api<Job>('/image-studio/jobs/' + retried.id);
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
      finishTrackedTask(activityId, true, '任务已重新进入后台队列');
      toast.success('已重新开始失败的任务');
    } catch (error) { finishTrackedTask(activityId, false, error instanceof Error ? error.message : '任务重试失败'); toast.error(error instanceof Error ? error.message : '重新开始失败，请稍后再试'); }
  };

  const retryChatIntake = async (jobId: string) => {
    await retryJob(jobId);
    await refreshChatIntakes().catch(() => undefined);
  };

  const downloadProtectedFile = async (path: string, filename: string) => {
    try {
      const response = await fetchWithAuth(path);
      if (!response.ok) {
        let message = '下载失败';
        try { const body = await response.json(); message = body.message || message; } catch { /* response may not be JSON */ }
        throw new Error(message);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = filename; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      appendActivityLog('下载交付文件', filename, 'success');
    } catch (error) { appendActivityLog('下载交付文件失败', error instanceof Error ? error.message : '下载失败', 'error'); toast.error(error instanceof Error ? error.message : '下载失败'); }
  };

  const chatAssets = assets.filter((asset) => asset.role === 'chat_screenshot');
  const visualAssets = assets.filter((asset) => asset.role !== 'chat_screenshot');
  const productAssets = visualAssets.filter((asset) => asset.role === 'product');
  const competitorAssets = assets.filter((asset) => asset.role === 'competitor');
  const productInfo: ProductInfo = {
    category: '', brand: '', sellingPrice: '', originalPrice: '', material: '', color: '', shape: '', craft: '', lockTerm: '',
    usageScenario: '', usageFunction: '', audience: '', copyTone: '',
    ...(workflow.productInfo || {}),
    specifications: Array.isArray(workflow.productInfo?.specifications) ? workflow.productInfo.specifications : [],
    occasions: Array.isArray(workflow.productInfo?.occasions) ? workflow.productInfo.occasions : [],
    notes: workflow.productInfo?.notes ?? workflow.specification ?? '',
  };
  const productSpecifications = productInfo.specifications;
  const styleGuide = workflow.styleGuide || {};
  const specs = workflow.specs || {};
  const outputSpecs: PlatformOutputSpec[] = Array.isArray(specs.outputs) ? specs.outputs : [];
  const enabledOutputSpecs = outputSpecs.filter((item) => item.enabled);
  const preferredOutputKey = enabledOutputSpecs.find((item) => item.key === 'detail')?.key || enabledOutputSpecs[0]?.key || '';
  const shots: any[] = Array.isArray(workflow.storyboard?.shots) ? workflow.storyboard.shots : [];
  const variants: any[] = Array.isArray(workflow.variants) ? workflow.variants : [];
  const directionsReady = directions.some((item) => item.key === 'selling' && item.selectedValues.length + item.customValues.length > 0);
  const approvedShots = shots.filter((shot) => shot.approved);
  const firstTrialShot = approvedShots.find((shot) => String(shot.prompt || '').trim());
  const outputForShot = (shot: any) => enabledOutputSpecs.find((item) => item.key === shot.outputSpecKey) || enabledOutputSpecs.find((item) => item.key === 'detail') || enabledOutputSpecs[0];
  const outputRatioForShot = (shot: any) => {
    const output = outputForShot(shot);
    if (!output) return workflow.specs?.aspectRatio || '3:4';
    return output.aspectRatio === 'custom' ? `${output.width}:${output.height}` : output.aspectRatio;
  };
  const generationPrompt = (shot: any) => {
    const output = outputForShot(shot);
    const outputNote = output ? `\n输出用途：${output.label}。目标画幅：${outputRatioForShot(shot)}；目标画布：${output.width}×${output.height} 像素。` : '';
    return String(shot.prompt || '').trim() + outputNote + (shot.negativePrompt ? '\n需要避免：' + shot.negativePrompt : '');
  };
  const generationParametersForShot = (shot: any) => {
    const imageProfile = profiles.find((item) => item.id === imageProfileId);
    const configuredSizes = Array.isArray(imageProfile?.options?.sizes) && imageProfile.options.sizes.length ? imageProfile.options.sizes : ['1024x1024', '1536x1024', '1024x1536', 'auto'];
    const configuredQualities = Array.isArray(imageProfile?.options?.qualityLevels) && imageProfile.options.qualityLevels.length ? imageProfile.options.qualityLevels : ['auto', 'low', 'medium', 'high'];
    const fallbackSize = configuredSizes.includes(workflow.specs?.imageSize) ? workflow.specs.imageSize : configuredSizes[0];
    const requestedQuality = workflow.specs?.imageQuality || configuredQualities[2] || configuredQualities[0];
    const output = outputForShot(shot);
    const ratio = outputRatioForShot(shot);
    return {
      size: selectImageSize(configuredSizes, ratio, fallbackSize),
      quality: configuredQualities.includes(requestedQuality) ? requestedQuality : configuredQualities[0],
      aspect_ratio: ratio,
      target_width: output?.width,
      target_height: output?.height,
      output_spec_key: output?.key,
    };
  };
  const firstTrialReview = firstTrialShot ? reviews.filter((item) => item.shotId === firstTrialShot.id && item.status === 'completed' && item.prompt === generationPrompt(firstTrialShot)).sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] : undefined;
  const trialPassed = Boolean(firstTrialReview?.selected && firstTrialReview.locked);
  const promptsReady = approvedShots.length > 0 && approvedShots.every((shot) => String(shot.prompt || '').trim());
  const batchSubmitted = approvedShots.length > 0 && jobs.some((job) => job.type === 'image_generate' && job.generations?.length === approvedShots.length
    && job.generations.every((item) => String(item.slotKey || '').startsWith('batch-'))
    && approvedShots.every((shot) => job.generations?.some((item) => item.shotId === shot.id && item.prompt === generationPrompt(shot))) && !['failed', 'cancelled'].includes(job.status));
  const stageDone: Record<Stage, boolean> = {
    materials: productAssets.length > 0, product: Boolean(workflow.productName && workflow.productAnalysis), directions: directionsReady,
    style: Boolean(workflow.styleGuide?.visualStyle || directions.find((item) => item.key === 'visual_style')?.selectedValues.length),
    specs: Boolean(workflow.specs?.confirmed && (workflow.specs?.platformTemplate || project?.platform) && enabledOutputSpecs.length > 0),
    variants: variants.length > 0 && variants.every((item) => item.assetIds?.length),
    storyboard: shots.length > 0 && shots.every((item) => item.approved),
    prompts: promptsReady, batch: trialPassed && promptsReady && batchSubmitted, results: reviews.some((item) => item.selected),
  };
  const currentIndex = Math.max(0, steps.findIndex((item) => item.key === stage));
  const nextStage = steps[currentIndex + 1]?.key;
  const currentStep = steps[currentIndex];
  const completedCount = Object.values(stageDone).filter(Boolean).length;
  const isBusy = busy || saving;
  const renderDirection = (direction: Direction) => <article key={direction.key} className="rounded-2xl border border-slate-200 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">{direction.label}{direction.required && <span className="ml-2 rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-600">必填</span>}</h3><p className="mt-1 text-xs text-slate-500">可先生成几种建议，再结合客户需求补充或调整。</p></div><button type="button" disabled={isBusy || !visionProfileId} onClick={() => void requestCandidates(direction)} className="h-9 rounded-xl border px-3 text-xs disabled:opacity-50"><WandSparkles className="mr-1 inline h-3.5 w-3.5" />生成建议</button></div>
    <div className="mt-3 flex flex-wrap gap-1.5">{direction.selectedValues.map((value) => <button key={value} type="button" onClick={() => void saveDirection(direction, { selectedValues: direction.selectedValues.filter((x) => x !== value) })} className="rounded-full bg-indigo-50 px-2.5 py-1.5 text-xs text-indigo-800">{value} ×</button>)}</div>
    {direction.candidates.map((candidate) => <div key={candidate.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2.5 text-xs"><span className="min-w-0 flex-1">{candidate.text}</span>{candidate.status === 'pending' ? <><button type="button" onClick={() => void setCandidate(candidate, 'accepted')} className="rounded-lg bg-indigo-600 px-2.5 py-1.5 text-white">采纳</button><button type="button" onClick={() => void setCandidate(candidate, 'rejected')} className="rounded-lg border px-2.5 py-1.5">拒绝</button></> : <button type="button" onClick={() => void setCandidate(candidate, 'accepted')} className="rounded-lg border px-2.5 py-1.5">重新采纳</button>}</div>)}
    <label className="mt-3 block text-xs font-semibold text-slate-600">手工补充（每行一条）<textarea value={direction.customValues.join('\n')} onChange={(event) => setDirections((current) => current.map((item) => item.key === direction.key ? { ...item, customValues: event.target.value.split(/\r?\n/).map((value) => value.trim().slice(0, 500)).filter(Boolean).slice(0, 50) } : item))} onBlur={() => void saveDirection(direction)} rows={3} className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-xs font-normal" /></label>
  </article>;

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f6f7fb]"><Loader2 className="h-6 w-6 animate-spin text-indigo-600" /></main>;
  if (!project) return <main className="grid min-h-screen place-items-center p-6 text-center"><div><CircleAlert className="mx-auto h-8 w-8 text-rose-500" /><p className="mt-3">项目不存在或无权访问</p><Link href="/service/image-studio" className="mt-4 inline-block text-sm text-indigo-700">返回项目列表</Link></div></main>;
  const modelSizes = profiles.find((item) => item.id === imageProfileId)?.options?.sizes;
  const modelQualities = profiles.find((item) => item.id === imageProfileId)?.options?.qualityLevels;
  const sizes = Array.isArray(modelSizes) && modelSizes.length ? modelSizes : ['1024x1024', '1536x1024', '1024x1536', 'auto'];
  const qualities = Array.isArray(modelQualities) && modelQualities.length ? modelQualities : ['auto', 'low', 'medium', 'high'];
  const imageSize = sizes.includes(workflow.specs?.imageSize) ? workflow.specs.imageSize : sizes[0];
  const imageQuality = qualities.includes(workflow.specs?.imageQuality) ? workflow.specs.imageQuality : qualities[2] || qualities[0];
  const saveAndContinue = async () => {
    if (!nextStage) return;
    try { const updated = await saveWorkflow(workflow, nextStage); if (updated) setStage(nextStage); }
    catch { /* saveWorkflow presents the server error */ }
  };
  const addShot = () => {
    if (shots.length >= 20) return;
    const shot = { id: uid(), order: shots.length + 1, title: '第 ' + (shots.length + 1) + ' 页', purpose: '', kind: '卖点展示', outputSpecKey: preferredOutputKey, copy: '', visualDescription: '', productVariant: '', referenceAssetIds: [], approved: false, prompt: '', negativePrompt: '' };
    patchWorkflow({ storyboard: { ...workflow.storyboard, shots: [...shots, shot] } });
  };
  const fillShotsToConfiguredCounts = () => {
    const nextShots = [...shots];
    for (const output of enabledOutputSpecs) {
      const countForOutput = () => nextShots.filter((shot) => shot.outputSpecKey === output.key).length;
      const targetCount = Math.min(20, Math.max(1, Number(output.count) || 1));
      while (countForOutput() < targetCount && nextShots.length < 20) {
        const order = nextShots.length + 1;
        const outputCount = countForOutput() + 1;
        nextShots.push({
          id: uid(), order, title: `${output.label} ${outputCount}`, purpose: `制作${output.label}，按当前用途规则呈现商品`,
          kind: output.label, outputSpecKey: output.key, copy: '', visualDescription: '', productVariant: '',
          referenceAssetIds: [], approved: false, prompt: '', negativePrompt: '',
        });
      }
    }
    if (nextShots.length === shots.length) return;
    patchWorkflow({ storyboard: { ...workflow.storyboard, shots: nextShots } });
  };

  return <main className="min-h-screen bg-[#f6f7fb] pb-28 text-slate-900 sm:pb-8"><div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-7 lg:px-8">
    <header className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4"><div className="flex min-w-0 items-center gap-3"><Link href="/service/image-studio" aria-label="返回项目列表" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border bg-white text-slate-600"><ArrowLeft className="h-4 w-4" /></Link><div className="min-w-0"><p className="text-xs text-slate-500">{currentStep.phase} · 第 {currentIndex + 1} 步</p><h1 className="truncate text-xl font-bold">{project.name}</h1></div></div><div className="flex items-center gap-2"><span className={'hidden rounded-full px-2.5 py-1 text-[11px] sm:inline-flex ' + (connected ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>{connected ? '实时连接' : '正在连接'}</span><span className="hidden text-xs text-slate-500 sm:block">{completedCount}/10 步</span></div></header>
    <div className="mt-4 grid items-start gap-4 lg:mt-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6">
      <nav aria-label="商品创作流程" className="sticky top-12 z-30 -mx-3 flex gap-2 overflow-x-auto border-b bg-[#f6f7fb]/95 px-3 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:flex-col lg:gap-1 lg:border-0 lg:bg-transparent lg:p-0">{steps.map((item, index) => { const selected = stage === item.key; return <button key={item.key} type="button" aria-current={selected ? 'step' : undefined} disabled={saving} onClick={() => { if (selected) return; void saveWorkflow(workflow, item.key).then((updated) => { if (updated) { setStage(item.key); appendActivityLog('切换工作流步骤', '进入「' + item.title + '」', 'info'); } }).catch(() => undefined); }} className={'flex min-h-11 min-w-[132px] shrink-0 items-center gap-2 rounded-xl border px-3 text-left disabled:opacity-60 lg:min-h-12 lg:w-full lg:min-w-0 ' + (selected ? 'border-indigo-200 bg-white text-indigo-800 shadow-sm' : 'border-transparent text-slate-600 hover:bg-white')}><span className={'grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold ' + (selected ? 'bg-indigo-600 text-white' : stageDone[item.key] ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500')}>{stageDone[item.key] && !selected ? <Check className="h-3.5 w-3.5" /> : index + 1}</span><span className="whitespace-nowrap text-xs font-semibold">{item.title}</span></button>; })}</nav>
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[11px] font-semibold text-indigo-600">{currentStep.phase}</p><h2 className="mt-1 text-lg font-bold">{currentStep.title}</h2><p className="mt-1 text-xs text-slate-500">{currentStep.note}</p></div><div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-1.5 text-[10px] text-slate-500">文案与策划<UiSelect value={textProfileId || undefined} onValueChange={setTextProfileId}><SelectTrigger aria-label="文案与策划" className="h-9 min-h-9 w-36 rounded-xl px-2 text-xs sm:w-40"><SelectValue placeholder="选择服务" /></SelectTrigger><SelectContent>{profiles.filter((item) => item.capability === 'text' || item.capability === 'vision').map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></UiSelect></label><label className="flex items-center gap-1.5 text-[10px] text-slate-500">图片识别<UiSelect value={visionProfileId || undefined} onValueChange={setVisionProfileId}><SelectTrigger aria-label="图片识别" className="h-9 min-h-9 w-36 rounded-xl px-2 text-xs sm:w-40"><SelectValue placeholder="选择服务" /></SelectTrigger><SelectContent>{(profiles.some((item) => item.capability === 'vision') ? profiles.filter((item) => item.capability === 'vision') : profiles.filter((item) => item.capability === 'text')).map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></UiSelect></label><button type="button" disabled={saving} onClick={() => void saveWorkflow()} className="h-9 rounded-xl border px-3 text-xs">{saving ? '保存中…' : '保存进度'}</button></div></div>

        {stage === 'materials' && <div className="space-y-5 pt-4">
          <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div><h3 className="text-sm font-bold text-slate-900">从沟通记录整理需求</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">上传微信聊天截图，或选择订单沟通记录、邀请会话。整理结果会汇总客户要求、已确认事项和待补充信息，供后续商品分析与页面策划使用。</p></div>
              {chatSourceMode === 'screenshots' && <label className="flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-3 text-xs font-semibold text-violet-800"><UploadCloud className="h-4 w-4" />{uploading ? '上传中…' : '上传聊天截图'}<input hidden multiple type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploading} onChange={(event) => { void uploadFiles(event.target.files, 'chat_screenshot'); event.currentTarget.value = ''; }} /></label>}
            </div>
            <p className="mt-2 text-[11px] leading-5 text-slate-500">为保护客户隐私，上传前可先遮住头像、微信号、手机号和地址。</p>
             <div role="tablist" aria-label="聊天需求来源" className="mt-4 flex gap-2 border-b border-violet-100"><button type="button" role="tab" aria-selected={chatSourceMode === 'screenshots'} onClick={() => setChatSourceMode('screenshots')} className={'border-b-2 px-3 py-2 text-xs font-semibold ' + (chatSourceMode === 'screenshots' ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500')}>上传截图</button><button type="button" role="tab" aria-selected={chatSourceMode === 'collaboration'} onClick={() => { setChatSourceMode('collaboration'); if (!collaborationConversations.length && !collaborationLoading) void refreshCollaborationConversations().catch((error) => toast.error(error instanceof Error ? error.message : '协作会话加载失败')); }} className={'border-b-2 px-3 py-2 text-xs font-semibold ' + (chatSourceMode === 'collaboration' ? 'border-violet-600 text-violet-700' : 'border-transparent text-slate-500')}>选择订单 / 邀请会话</button></div>
            {chatSourceMode === 'screenshots' && (chatAssets.length > 0 ? <><div className="mt-4 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-700">选择清晰、能看出上下文的截图（最多 12 张）</p><div className="flex gap-3 text-[11px]"><button type="button" onClick={() => setSelectedChatAssetIds(chatAssets.slice(-12).map((asset) => asset.id))} className="text-violet-700">选最近 12 张</button><button type="button" onClick={() => setSelectedChatAssetIds([])} className="text-slate-500">清空选择</button></div></div>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{chatAssets.map((asset) => <label key={asset.id} className={'flex cursor-pointer items-center gap-2 rounded-xl border bg-white p-2 ' + (selectedChatAssetIds.includes(asset.id) ? 'border-violet-300 ring-1 ring-violet-100' : 'border-slate-200')}><input type="checkbox" checked={selectedChatAssetIds.includes(asset.id)} disabled={!selectedChatAssetIds.includes(asset.id) && selectedChatAssetIds.length >= 12} onChange={(event) => setSelectedChatAssetIds((current) => event.target.checked ? [...current, asset.id].slice(-12) : current.filter((id) => id !== asset.id))} className="h-4 w-4 shrink-0" /><img src={asset.previewUrl} alt="聊天截图" className="h-12 w-12 shrink-0 rounded-lg bg-slate-100 object-cover" /><span className="min-w-0"><span className="block truncate text-[11px] font-medium">{asset.filename}</span><span className="text-[10px] text-slate-400">{Math.max(1, Math.round(asset.size / 1024))} KB</span></span></label>)}</div>
              <div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={isBusy || uploading || !profiles.some((profile) => profile.id === visionProfileId && profile.capability === 'vision') || !selectedChatAssetIds.length} onClick={() => void recognizeChatScreenshots()} className="h-10 rounded-xl border border-violet-200 bg-white px-4 text-xs font-semibold text-violet-800 disabled:opacity-50"><WandSparkles className="mr-1.5 inline h-4 w-4" />识别并整理需求</button><button type="button" disabled={isBusy || uploading || !profiles.some((profile) => profile.capability === 'text') || !profiles.some((profile) => profile.id === visionProfileId && profile.capability === 'vision') || !selectedChatAssetIds.length} onClick={() => void generateScreenshotPlan()} className="h-10 rounded-xl bg-violet-700 px-4 text-xs font-semibold text-white disabled:opacity-50"><WandSparkles className="mr-1.5 inline h-4 w-4" />生成图片方案</button></div>
            </> : <p className="mt-4 rounded-xl border border-dashed border-violet-200 bg-white/70 p-4 text-center text-xs text-slate-500">还没有聊天截图。可以先上传对话截图，也可以先添加商品图片和参考图。</p>)}
            {chatSourceMode === 'collaboration' && <div className="mt-4 rounded-xl border border-violet-100 bg-white p-3 sm:p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="min-w-0 flex-1 text-xs font-semibold text-slate-700">订单或邀请会话<UiSelect value={selectedCollaborationId || undefined} onValueChange={setSelectedCollaborationId}><SelectTrigger className="mt-1.5 h-11 min-h-11 w-full"><SelectValue placeholder={collaborationLoading ? '正在加载订单…' : '选择要整理的会话'} /></SelectTrigger><SelectContent>{collaborationConversations.map((item) => <SelectItem key={`${item.conversationType}:${item.id}`} value={`${item.conversationType}:${item.id}`}>{item.conversationType === 'invite' ? '邀请会话 · ' : item.orderNo ? `${item.orderNo} · ` : ''}{item.title} · {item.counterpartName || (item.conversationType === 'invite' ? '客户会话' : '订单协作')}</SelectItem>)}</SelectContent></UiSelect></label><div className="flex gap-2"><button type="button" disabled={isBusy || collaborationLoading || !selectedCollaborationId || !profiles.some((profile) => profile.id === visionProfileId && profile.capability === 'vision')} onClick={() => void recognizeCollaborationConversation()} className="h-11 shrink-0 rounded-xl border border-violet-200 bg-white px-3 text-xs font-semibold text-violet-800 disabled:opacity-50"><WandSparkles className="mr-1.5 inline h-4 w-4" />整理需求</button><button type="button" disabled={isBusy || collaborationLoading || !selectedCollaborationId || !profiles.some((profile) => profile.capability === 'text') || !profiles.some((profile) => profile.id === visionProfileId && profile.capability === 'vision')} onClick={() => void generateImagePlan()} className="h-11 shrink-0 rounded-xl bg-violet-700 px-3 text-xs font-semibold text-white disabled:opacity-50"><WandSparkles className="mr-1.5 inline h-4 w-4" />生成图片方案</button></div></div>{collaborationLoading ? <p className="mt-3 text-xs text-slate-500">正在查找订单与邀请会话…</p> : !collaborationConversations.length ? <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">还没有可选择的订单或邀请会话。请先在客服协作消息中接待客户，或上传聊天截图。</p> : <p className="mt-3 text-[11px] leading-5 text-slate-500">方案任务会依次识别会话图片、整理需求、生成逐图提示词并检查引用；完成后可在本页审核并导出。</p>}</div>}
            {chatIntakes.length > 0 && <div className="mt-4 space-y-3">{chatIntakes.map((intake) => <ChatIntakeCard key={intake.id} intake={intake} draft={chatBriefDrafts[intake.id] || intake.brief} assets={assets} busy={isBusy} onChange={(brief) => setChatBriefDrafts((current) => ({ ...current, [intake.id]: brief }))} onApprove={() => void approveChatIntake(intake)} onRetry={() => intake.sourceType !== 'screenshots' ? void retryChatIntake(intake.id) : (setSelectedChatAssetIds(intake.sourceAssetIds), void recognizeChatScreenshots(intake.sourceAssetIds))} />)}</div>}
            {planRuns.length > 0 && <div className="mt-5 space-y-3">{planRuns.map((run) => { const plan = planDrafts[run.id] || run.currentVersion?.plan; return <article key={run.id} className="rounded-2xl border border-indigo-100 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-semibold">图片方案 · {run.sourceType === 'screenshots' ? '聊天截图' : run.sourceType === 'invite' ? '邀请会话' : '订单会话'}</h3><p className="mt-1 text-xs text-slate-500">{run.currentVersion ? `版本 ${run.currentVersion.version} · ${run.currentVersion.status === 'approved' ? '已确认' : '待审核'}` : run.runStatus === 'failed' ? run.error?.message || '任务失败' : '正在分析图片与整理需求'} · {new Date(run.createdAt).toLocaleString()}</p></div><span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] text-indigo-700">{run.runStatus === 'processing' || run.runStatus === 'queued' ? '后台处理中' : run.runStatus === 'failed' ? '处理失败' : run.runStatus === 'approved' ? '已确认' : '待审核'}</span></div>{plan && <><p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-700">{plan.summary || '需求摘要待补充'}{plan.product ? ` · 商品：${plan.product}` : ''}</p><div className="mt-3"><h4 className="text-xs font-semibold">需求依据</h4><div className="mt-2 flex flex-wrap gap-1.5">{(plan.requirements || []).map((item: any) => <span key={item.id} className={'rounded-lg px-2 py-1 text-[10px] ' + (item.status === 'confirmed' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800')}>{item.status === 'confirmed' ? '已确认' : item.status === 'to_confirm' ? '待确认' : item.status === 'suggestion' ? '建议' : '提及'} · {item.text}</span>)}</div></div><div className="mt-4 space-y-3">{(plan.images || []).map((image: any, index: number) => <div key={image.id || index} className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs font-semibold">{index + 1}. {image.title || '图片项'} <span className="font-normal text-slate-500">{image.type ? `· ${image.type}` : ''}</span></h4>{image.referenceImages?.length > 0 && <span className="text-[10px] text-indigo-700">引用 {image.referenceImages.length} 张聊天图片</span>}</div><textarea aria-label={`${image.title || '图片项'}提示词`} value={image.prompt || ''} disabled={run.currentVersion?.status === 'approved'} onChange={(event) => setPlanDrafts((current) => { const next = structuredClone(current[run.id] || run.currentVersion!.plan); next.images[index].prompt = event.target.value; return { ...current, [run.id]: next }; })} rows={4} className="mt-2 w-full rounded-lg border border-slate-200 p-2.5 text-xs leading-5 outline-none focus:border-indigo-400 disabled:bg-slate-50" placeholder="逐图生成提示词" />{image.referenceImages?.length > 0 && <div className="mt-2 flex gap-2 overflow-x-auto">{image.referenceImages.map((ref: any) => <img key={ref.assetId} src={`/api/image-studio/assets/${ref.assetId}/preview`} alt="参考图片" className="h-14 w-14 rounded-lg border object-cover" />)}</div>}</div>)}</div>{plan.openQuestions?.length > 0 && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900"><strong>待向客户确认：</strong> {plan.openQuestions.join('；')}</div>}<div className="mt-4 flex flex-wrap gap-2">{run.currentVersion?.status !== 'approved' ? <><button type="button" disabled={isBusy} onClick={() => void saveImagePlan(run, false)} className="h-10 rounded-xl border px-3 text-xs font-semibold">保存修改</button><button type="button" disabled={isBusy} onClick={() => void saveImagePlan(run, true)} className="h-10 rounded-xl bg-indigo-700 px-3 text-xs font-semibold text-white">审核并确认</button></> : <><button type="button" onClick={() => void exportImagePlan(run, 'json')} className="h-10 rounded-xl border px-3 text-xs">导出 JSON</button><button type="button" onClick={() => void exportImagePlan(run, 'md')} className="h-10 rounded-xl border px-3 text-xs">导出 Markdown</button></>}</div></>}</article>; })}</div>}
          </section>
          <section><p className="rounded-xl bg-indigo-50 p-3 text-xs leading-5 text-indigo-900">商品实拍和款式图用于核对商品信息；竞品图只参考排版，不会用来生成商品外观。上传后请选择图片用途，避免把参考图当成商品图。</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><UiSelect value={uploadRole} onValueChange={setUploadRole}><SelectTrigger aria-label="素材用途" className="h-11 min-h-11 w-full rounded-xl sm:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="product">商品素材</SelectItem><SelectItem value="competitor">竞品版式参考</SelectItem><SelectItem value="packaging">包装与配件</SelectItem><SelectItem value="other">其他参考</SelectItem></SelectContent></UiSelect><label className="flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-indigo-300 bg-indigo-50/60 px-3 text-sm font-medium text-indigo-700"><UploadCloud className="h-4 w-4" />{uploading ? '上传中…' : '选择商品或参考图片'}<input hidden multiple type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={uploading} onChange={(event) => { void uploadFiles(event.target.files); event.currentTarget.value = ''; }} /></label><button type="button" disabled={isBusy || !visionProfileId || !visualAssets.length} onClick={() => void runTask('asset_annotate', { instruction: '逐张识别商品素材内容、商品型号、颜色和用途，不猜测无法确认的事实。忽略非商品图。' }, visualAssets.slice(0, 12).map((asset) => asset.id))} className="h-11 rounded-xl border px-4 text-xs"><WandSparkles className="mr-1 inline h-4 w-4" />整理商品图片</button></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">{visualAssets.map((asset) => <figure key={asset.id} className="overflow-hidden rounded-xl border"><div className="aspect-square bg-slate-100"><img src={asset.previewUrl} alt={asset.filename} className="h-full w-full object-cover" /></div><figcaption className="p-2"><p className="truncate text-xs font-semibold">{asset.filename}</p><AssetRoleSelect asset={asset} onChange={(role) => void changeAssetRole(asset.id, role)} /><details className="mt-2"><summary className="cursor-pointer text-[11px] text-indigo-700">识别信息</summary><p className="mt-1 text-[10px] text-slate-500">{asset.catalog?.effective?.what || '待识别'} · {asset.catalog?.effective?.color || ''} · {asset.catalog?.effective?.spec || ''}</p></details></figcaption></figure>)}</div>{!productAssets.length && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800"><ImagePlus className="mr-1 inline h-4 w-4" />请至少上传一张商品图片，并将用途选为“商品素材”。</p>}</section>
        </div>}

        {stage === 'product' && <div className="space-y-4 pt-4">
          <section className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div><h3 className="text-sm font-semibold text-indigo-950">商品识别</h3><p className="mt-1 text-xs text-indigo-800">识别结果只补充空白字段，已有内容会保留。</p></div>
              <button type="button" disabled={isBusy || !visionProfileId || !productAssets.length} onClick={() => void runTask('product_analyze', { instruction: '根据商品素材识别商品身份与可核验属性，并整理使用场景建议、卖点痛点候选。只补充有图片或客户资料依据的信息；不猜品牌、价格、材质成分、型号参数、认证或功效，不确定项放入待核实信息。' }, productAssets.slice(0, 8).map((asset) => asset.id))} className="h-10 shrink-0 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50"><WandSparkles className="mr-2 inline h-4 w-4" />{busy ? '正在识别…' : workflow.productAnalysis ? '重新识别商品' : 'AI 识别并填入'}</button>
            </div>
            {!productAssets.length && <p className="mt-3 text-xs text-slate-600">先在“沟通与素材”中上传商品图片，再进行识别。</p>}
          </section>

          <section className="rounded-2xl border bg-white p-4 sm:p-5">
            <div className="mb-4"><h3 className="text-sm font-semibold">商品基本信息</h3><p className="mt-1 text-xs text-slate-500">商品名、品类和价格以客户提供的信息为准。</p></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Input label="商品名称 / 型号" value={workflow.productName || ''} onChange={(value) => patchWorkflow({ productName: value })} placeholder="如：重磅纯棉圆领短袖" />
              <Input label="品类" value={productInfo.category} onChange={(value) => patchProductInfo({ category: value })} placeholder="如：服装 / 男装 / T 恤" />
              <Input label="品牌" value={productInfo.brand} onChange={(value) => patchProductInfo({ brand: value })} placeholder="没有品牌可留空" />
              <Input label="销售平台 / 店铺" value={workflow.salesChannel || project.platform || ''} onChange={(value) => patchWorkflow({ salesChannel: value })} placeholder="如：淘宝 / 天猫" />
              <Input label="售价（元）" value={productInfo.sellingPrice} onChange={(value) => patchProductInfo({ sellingPrice: value })} placeholder="客户提供的售价" inputMode="decimal" />
              <Input label="原价（元）" value={productInfo.originalPrice} onChange={(value) => patchProductInfo({ originalPrice: value })} placeholder="选填" inputMode="decimal" />
              <Input label="品牌定位" value={workflow.brandPositioning || ''} onChange={(value) => patchWorkflow({ brandPositioning: value })} placeholder="如：日常实用 / 中高端" />
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-4 sm:p-5">
            <div className="mb-4"><h3 className="text-sm font-semibold">外观与商品参数</h3><p className="mt-1 text-xs text-slate-500">只填写能确认的商品信息；不确定的参数先留空。</p></div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <Input label="材质" value={productInfo.material} onChange={(value) => patchProductInfo({ material: value })} placeholder="如：棉质，成分待确认" />
              <Input label="颜色 / 花色" value={productInfo.color} onChange={(value) => patchProductInfo({ color: value })} placeholder="如：奶油白、细格纹" />
              <Input label="版型 / 形态" value={productInfo.shape} onChange={(value) => patchProductInfo({ shape: value })} placeholder="如：宽松直筒、落肩袖" />
              <Input label="工艺 / 做工" value={productInfo.craft} onChange={(value) => patchProductInfo({ craft: value })} placeholder="如：走线、拼接、表面处理" />
            </div>
            <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
              <Input label="商品锁定词" value={productInfo.lockTerm} onChange={(value) => patchProductInfo({ lockTerm: value })} placeholder="简洁描述商品外观，帮助各页保持一致" />
              <p className="mt-1.5 text-[11px] leading-5 text-slate-500">这段描述会用于后续画面要求，避免商品外观前后不一致。</p>
            </div>
            <div className="mt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><div><h4 className="text-xs font-semibold text-slate-700">规格参数</h4><p className="mt-1 text-[11px] text-slate-500">按商品需要添加，图片看不清的参数请留空。</p></div><button type="button" onClick={() => patchProductInfo({ specifications: [...productSpecifications, { name: '', value: '' }] })} className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium text-indigo-700"><Plus className="h-3.5 w-3.5" />添加参数</button></div>
              <div className="space-y-2">{productSpecifications.map((item, index) => <div key={index} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_40px] gap-2"><input aria-label={`参数 ${index + 1} 名称`} value={item.name || ''} onChange={(event) => patchProductInfo({ specifications: productSpecifications.map((spec, position) => position === index ? { ...spec, name: event.target.value } : spec) })} maxLength={80} placeholder="参数名，如：容量" className="h-10 min-w-0 rounded-xl border px-3 text-sm outline-none focus:border-indigo-400" /><input aria-label={`参数 ${index + 1} 内容`} value={item.value || ''} onChange={(event) => patchProductInfo({ specifications: productSpecifications.map((spec, position) => position === index ? { ...spec, value: event.target.value } : spec) })} maxLength={300} placeholder="已确认的参数值" className="h-10 min-w-0 rounded-xl border px-3 text-sm outline-none focus:border-indigo-400" /><button type="button" aria-label={`删除参数 ${index + 1}`} onClick={() => patchProductInfo({ specifications: productSpecifications.filter((_, position) => position !== index) })} className="grid h-10 w-10 place-items-center rounded-xl border text-slate-500 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div>)}</div>
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-4 sm:p-5">
            <div className="mb-4"><h3 className="text-sm font-semibold">使用场景与表达</h3><p className="mt-1 text-xs text-slate-500">场景和人群可以先用 AI 建议，再按实际客户需求修改。</p></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="使用场景" value={productInfo.usageScenario} onChange={(value) => patchProductInfo({ usageScenario: value })} placeholder="如：夏季通勤" />
              <Input label="解决的需求" value={productInfo.usageFunction} onChange={(value) => patchProductInfo({ usageFunction: value })} placeholder="如：轻便收纳，具体效果需核实" />
              <Input label="目标人群" value={productInfo.audience} onChange={(value) => patchProductInfo({ audience: value })} placeholder="如：日常通勤人群" />
              <Input label="适用场合" value={productInfo.occasions.join('、')} onChange={(value) => patchProductInfo({ occasions: [...new Set(value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean))].slice(0, 12) })} placeholder="日常、通勤、旅行" />
              <Input label="文案调性" value={productInfo.copyTone} onChange={(value) => patchProductInfo({ copyTone: value })} placeholder="如：清爽简洁、专业可信" />
            </div>
            <label className="mt-4 block text-xs font-semibold text-slate-600">补充说明<textarea value={productInfo.notes} onChange={(event) => patchProductInfo({ notes: event.target.value })} maxLength={5000} rows={3} placeholder="工艺、售后政策或其他已确认信息" className="mt-1.5 w-full resize-y rounded-xl border p-3 text-sm font-normal leading-5 outline-none focus:border-indigo-400" /></label>
          </section>

          <div className="flex flex-wrap gap-2"><button type="button" disabled={isBusy || !textProfileId || !workflow.productAnalysis} onClick={() => void runTask('copy_generate', { instruction: '基于客户已确认的商品信息、卖点和用户需求，生成可用于电商详情页的短标题、正文和可核验依据。售价、原价、规格、认证和功效只能使用明确提供的信息，禁止编造。', productAnalysis: workflow.productAnalysis, productInfo, productName: workflow.productName, salesChannel: workflow.salesChannel, specification: productInfo.notes })} className="h-10 rounded-xl border px-4 text-sm disabled:opacity-50"><WandSparkles className="mr-2 inline h-4 w-4" />生成商品文案</button></div>
          {workflow.productAnalysis && <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4"><h3 className="font-semibold text-indigo-900">商品分析结果</h3><p className="mt-2 text-sm leading-6">{workflow.productAnalysis.productIdentity}</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{[['sellingPoints','卖点'],['painPoints','用户痛点'],['targetAudience','目标人群'],['usageScenarios','使用场景'],['mainDirection','主攻方向']].map(([key,label]) => <p key={key} className="text-xs leading-5"><b>{label}：</b>{Array.isArray(workflow.productAnalysis[key]) ? workflow.productAnalysis[key].join(' · ') : workflow.productAnalysis[key]}</p>)}</div>{Array.isArray(workflow.productAnalysis.factsToConfirm) && workflow.productAnalysis.factsToConfirm.length > 0 && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800"><b>待核实：</b>{workflow.productAnalysis.factsToConfirm.join('、')}</p>}</div>}
          {workflow.copywriting && <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4"><h3 className="font-semibold text-emerald-900">文生文商品文案</h3><div className="mt-3 grid gap-2 sm:grid-cols-2">{(Array.isArray(workflow.copywriting.copies) ? workflow.copywriting.copies : []).map((copy: any, index: number) => <article key={index} className="rounded-xl bg-white p-3"><p className="text-sm font-semibold">{copy.headline}</p><p className="mt-1 text-xs leading-5">{copy.body}</p><p className="mt-2 text-[10px] text-slate-500">依据：{copy.proof}</p></article>)}</div></div>}
        </div>}

        {stage === 'directions' && <div className="space-y-3 pt-4"><p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">请至少确认一条卖点。卖点、用户痛点、方向、人群和场景都会进入后续策划。</p>{directions.filter((item) => item.key !== 'visual_style').map(renderDirection)}</div>}
        {stage === 'style' && <div className="space-y-4 pt-4"><div className="grid gap-3 sm:grid-cols-2"><Select label="视觉风格" value={workflow.styleGuide?.visualStyle || ''} options={['简洁科技','自然生活','高端质感','活力年轻','专业可信','温暖治愈']} onChange={(value) => patchNested('styleGuide',{visualStyle:value})} /><Input label="配色" value={workflow.styleGuide?.palette || ''} onChange={(value) => patchNested('styleGuide',{palette:value})} placeholder="主色、辅助色、背景色" /><Input label="字体与排版" value={workflow.styleGuide?.typography || ''} onChange={(value) => patchNested('styleGuide',{typography:value})} placeholder="标题层级、留白和字号" /><Input label="氛围与材质" value={workflow.styleGuide?.mood || ''} onChange={(value) => patchNested('styleGuide',{mood:value})} placeholder="光线、质感和画面情绪" /></div><div className="rounded-2xl border p-4"><div className="flex items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">风格建议</h3><p className="mt-1 text-xs text-slate-500">先看看有哪些方向，再选一种并补充配色和排版。</p></div>{directions.find((item) => item.key === 'visual_style') && <button type="button" disabled={isBusy || !visionProfileId} onClick={() => void requestCandidates(directions.find((item) => item.key === 'visual_style')!)} className="rounded-xl border px-3 py-2 text-xs"><WandSparkles className="mr-1 inline h-4 w-4" />生成</button>}</div>{directions.find((item) => item.key === 'visual_style') && renderDirection(directions.find((item) => item.key === 'visual_style')!)}</div><p className="text-xs text-slate-500">竞品图只用于分析版式，不作为商品形象和生成参考。</p></div>}

        {stage === 'specs' && <div className="space-y-4 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-slate-600">销售平台模板<select value={specs.platform || 'other'} onChange={(event) => changeSpecPlatform(event.target.value as ImageStudioPlatform)} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-indigo-400">{imageStudioPlatforms.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="block text-xs font-semibold text-slate-600">商品类目<select value={specs.category || 'unspecified'} onChange={(event) => { const category = event.target.value as ImageStudioCategory; const profile = createPlatformSpecs(specs.platform || project.platform, category); patchNested('specs',{ category, contentRules: profile.contentRules }); patchWorkflow({ productCategory: category }); }} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-indigo-400">{imageStudioCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="店铺 / 经营渠道（选填）" value={specs.channel || ''} onChange={(value) => patchNested('specs', { channel: value })} placeholder="如京东 POP、自营；未知时留空" />
            <Input label="细分类目（选填）" value={specs.categoryDetail || ''} onChange={(value) => patchNested('specs', { categoryDetail: value })} placeholder="尽量填写发布页中的具体类目" />
          </div>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs leading-5 text-indigo-900"><b>{specs.platformTemplate || '平台模板'}规则提示：</b> {specs.contentRules || '请选择平台和类目，加载适用的图片制作建议。'}<span className="mt-1 block text-[11px] text-indigo-700">规则档案 {specs.profileVersion || '旧项目'} · 规则来源和核验状态逐项展示；“制作建议”和“待核验”不会阻止生成。</span></div>
          {Array.isArray(specs.references) && specs.references.length > 0 && <div className="flex flex-wrap gap-x-4 gap-y-2 text-[11px]">{specs.references.map((reference: { label: string; url: string }) => <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer" className="text-indigo-700 underline decoration-indigo-200 underline-offset-2">{reference.label}</a>)}</div>}
          <div className="space-y-3">{outputSpecs.map((item) => <article key={item.key} className={`rounded-2xl border p-3 sm:p-4 ${item.enabled ? 'border-indigo-200 bg-white' : 'border-slate-200 bg-slate-50/70'}`}>
            <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800"><input type="checkbox" checked={item.enabled} onChange={(event) => setOutputEnabled(item.key, event.target.checked)} className="h-4 w-4 accent-indigo-600" />{item.label}</label><div className="flex flex-wrap gap-1.5"><ConfidencePill status={item.aspectConfidence} /><ConfidencePill status={item.sizeConfidence} /><ConfidencePill status={item.countConfidence} /></div></div>
            {item.enabled && <><div className="mt-3 grid gap-2 sm:grid-cols-4"><Select label="画幅比例" value={item.aspectRatio} options={['1:1','3:4','2:3','4:3','16:9','custom']} onChange={(value) => updateOutputSpec(item.key,'aspectRatio',value)} /><Input label="宽度（像素）" value={String(item.width)} onChange={(value) => updateOutputSpec(item.key,'width',value.replace(/\D/g,'').slice(0,5))} placeholder="如 800" inputMode="numeric" /><Input label="高度（像素）" value={String(item.height)} onChange={(value) => updateOutputSpec(item.key,'height',value.replace(/\D/g,'').slice(0,5))} placeholder="如 800" inputMode="numeric" /><Input label={item.key === 'detail' ? '模块数量' : '制作张数'} value={String(item.count)} onChange={(value) => updateOutputSpec(item.key,'count',value.replace(/\D/g,'').slice(0,3))} placeholder="如 5" inputMode="numeric" /></div><p className="mt-2 text-[11px] leading-5 text-slate-500">{item.note}</p></>}
          </article>)}</div>
          <div className="grid gap-3 sm:grid-cols-2"><Textarea label="文字与合规要求" value={specs.contentRules || ''} onChange={(value) => patchNested('specs',{contentRules:value})} placeholder="补充类目文案限制、必展示信息和素材要求" /><div className="space-y-2"><Select label="模型生成尺寸" value={imageSize} options={sizes} onChange={(value) => patchNested('specs',{imageSize:value})} /><p className="text-[11px] leading-5 text-slate-500">实际生成画幅会从当前模型支持的尺寸中选择最接近该页面用途比例的规格；具体导出像素仍以生成服务实际返回为准。</p></div></div>
          <label className="flex min-h-11 items-start gap-2 rounded-xl border bg-slate-50 px-3 py-3 text-xs font-medium text-slate-700"><input type="checkbox" checked={Boolean(specs.confirmed)} onChange={(event) => patchNested('specs',{confirmed:event.target.checked})} className="mt-0.5 h-4 w-4" /><span>我已核对所选用途和规格。待核验的尺寸、张数与类目规则会在发布前再确认。</span></label><p className="-mt-2 text-[11px] text-slate-500">修改平台、类目或任一规格后，需要重新确认。</p>
        </div>}

        {stage === 'variants' && <div className="space-y-3 pt-4"><div className="flex items-center justify-between"><p className="text-xs text-slate-500">为不同颜色、型号或套装分别添加款式信息，并选择对应的商品图片。</p><button type="button" onClick={() => variants.length < 30 && patchWorkflow({variants:[...variants,{id:uid(),name:'新款式',color:'',specification:'',assetIds:[]}]})} className="rounded-xl border px-3 py-2 text-xs"><Plus className="mr-1 inline h-4 w-4" />添加款式</button></div>{variants.map((variant) => <article key={variant.id} className="rounded-2xl border p-4"><div className="grid gap-3 sm:grid-cols-3"><Input label="款式名称" value={variant.name || ''} onChange={(value) => patchWorkflow({variants:variants.map((item) => item.id===variant.id?{...item,name:value}:item)})} placeholder="标准款" /><Input label="颜色" value={variant.color || ''} onChange={(value) => patchWorkflow({variants:variants.map((item) => item.id===variant.id?{...item,color:value}:item)})} placeholder="颜色" /><Input label="型号 / 规格" value={variant.specification || ''} onChange={(value) => patchWorkflow({variants:variants.map((item) => item.id===variant.id?{...item,specification:value}:item)})} placeholder="确认规格" /></div><p className="mt-3 text-xs font-semibold">选择对应商品图片</p><div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">{productAssets.map((asset) => <label key={asset.id} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-[11px]"><input type="checkbox" checked={(variant.assetIds || []).includes(asset.id)} onChange={(event) => patchWorkflow({variants:variants.map((item) => item.id===variant.id?{...item,assetIds:event.target.checked?[...new Set([...(item.assetIds||[]),asset.id])]:(item.assetIds||[]).filter((id:string)=>id!==asset.id)}:item)})} />{asset.filename}</label>)}</div><button type="button" onClick={() => patchWorkflow({variants:variants.filter((item) => item.id!==variant.id)})} className="mt-3 text-xs text-rose-600">移除此款式</button></article>)}{!variants.length && <div className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-400">请添加至少一个款式。</div>}</div>}

        {stage === 'storyboard' && <div className="mb-3 flex flex-col gap-2 rounded-xl border border-indigo-100 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-600">按各用途的制作张数补齐待编辑分镜，最多 20 页；这一步不会自动开始生图。</p><button type="button" disabled={isBusy || shots.length >= 20 || !enabledOutputSpecs.length} onClick={fillShotsToConfiguredCounts} className="shrink-0 rounded-xl border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-50">按用途数量补齐页面</button></div>}

        {stage === 'storyboard' && <div className="space-y-3 pt-4"><div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-slate-600">逐页确认页面目的、文案、画面、对应款式和交付用途。生成整套详情页时，分镜默认使用详情模块规格。</p><div className="flex gap-2"><button type="button" disabled={isBusy || !visionProfileId || !directionsReady} onClick={() => void runTask('storyboard',{instruction:'结合商品事实、创作方向、视觉风格、平台规格和款式素材，规划4至8页电商详情分镜。返回标题、页面目的、类型、短文案、画面描述、对应款式、商品素材ID和可选竞品版式参考ID。竞品只分析版式。',styleGuide,specs,variants,assetCatalog:visualAssets.map((item)=>({id:item.id,role:item.role,filename:item.filename,catalog:item.catalog})),creativeDirections:directions.map((item)=>({key:item.key,label:item.label,values:[...item.selectedValues,...item.customValues]}))},visualAssets.slice(0,12).map((item)=>item.id))} className="rounded-xl border px-3 py-2 text-xs"><WandSparkles className="mr-1 inline h-4 w-4" />生成页面方案</button><button type="button" onClick={addShot} className="rounded-xl border px-3 py-2 text-xs"><Plus className="mr-1 inline h-4 w-4" />加页面</button></div></div>{shots.map((shot,index)=><article key={shot.id} className="rounded-2xl border p-3 sm:p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold">第 {index+1} 页</h3><div className="flex gap-1"><button type="button" disabled={!index} onClick={()=>{const copy=[...shots];[copy[index-1],copy[index]]=[copy[index],copy[index-1]];patchWorkflow({storyboard:{...workflow.storyboard,shots:copy}})}} className="rounded-lg border p-2 disabled:opacity-40"><ChevronUp className="h-4 w-4" /></button><button type="button" disabled={index===shots.length-1} onClick={()=>{const copy=[...shots];[copy[index+1],copy[index]]=[copy[index],copy[index+1]];patchWorkflow({storyboard:{...workflow.storyboard,shots:copy}})}} className="rounded-lg border p-2 disabled:opacity-40"><ChevronDown className="h-4 w-4" /></button><button type="button" onClick={()=>patchWorkflow({storyboard:{...workflow.storyboard,shots:shots.filter((item)=>item.id!==shot.id)}})} className="rounded-lg p-2 text-rose-600"><Trash2 className="h-4 w-4" /></button></div></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Input label="标题" value={shot.title||''} onChange={(value)=>patchShot(shot.id,{title:value,approved:false})} placeholder="页面标题" /><Input label="页面目的" value={shot.purpose||''} onChange={(value)=>patchShot(shot.id,{purpose:value,approved:false})} placeholder="建立信任、展示卖点…" /><Input label="页面文案" value={shot.copy||''} onChange={(value)=>patchShot(shot.id,{copy:value,approved:false})} placeholder="短文案" /><Select label="图片用途" value={shot.outputSpecKey || preferredOutputKey} options={enabledOutputSpecs.map((item)=>item.key)} optionLabels={Object.fromEntries(enabledOutputSpecs.map((item)=>[item.key,item.label]))} onChange={(value)=>patchShot(shot.id,{outputSpecKey:value,approved:false})} /><Select label="对应款式" value={shot.productVariant||''} options={variants.map((item)=>item.name)} onChange={(value)=>{const selected=variants.find((item)=>item.name===value);patchShot(shot.id,{variantId:selected?.id||'',productVariant:value,referenceAssetIds:selected?.assetIds||[],approved:false})}} /></div><Textarea label="画面描述" value={shot.visualDescription||''} onChange={(value)=>patchShot(shot.id,{visualDescription:value,approved:false})} placeholder="主体、构图、场景、光线、材质和信息层级" /><Select label="竞品排版参考（仅参考布局）" value={shot.layoutReferenceAssetId||''} options={competitorAssets.map((item)=>item.filename)} onChange={(value)=>{const ref=competitorAssets.find((item)=>item.filename===value);patchShot(shot.id,{layoutReferenceAssetId:ref?.id||'',approved:false})}} /><label className="mt-3 flex min-h-11 items-center gap-2 rounded-xl bg-slate-50 px-3 text-xs font-semibold"><input type="checkbox" checked={Boolean(shot.approved)} onChange={(event)=>patchShot(shot.id,{approved:event.target.checked})} className="h-4 w-4" />确认本页</label></article>)}{!shots.length && <div className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-400">生成页面规划，也可以手动添加页面。</div>}</div>}

        {stage === 'prompts' && <div className="space-y-3 pt-4"><p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">逐页确认画面内容和商品图片。竞品图片只作排版参考，不会用于生成商品外观。</p>{approvedShots.map((shot,index)=><article key={shot.id} className="rounded-2xl border p-4"><div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">{index+1}. {shot.title}</h3><button type="button" disabled={isBusy || !visionProfileId} onClick={()=>void runTask('prompt_generate',{shotId:shot.id,instruction:'为已审核分镜生成中文画面描述、需要避免和选择对应商品图片ID。遵循视觉风格、平台规格和合规要求。竞品只转化为抽象构图，不描述竞品或传入竞品图。',shot,styleGuide,specs,assetCatalog:visualAssets.map((item)=>({id:item.id,role:item.role,catalog:item.catalog}))},[...asList(shot.referenceAssetIds),...(shot.layoutReferenceAssetId?[shot.layoutReferenceAssetId]:[])])} className="rounded-xl border px-3 py-2 text-xs"><WandSparkles className="mr-1 inline h-4 w-4" />完善画面要求</button></div><Textarea label="画面描述" value={shot.prompt||''} onChange={(value)=>patchShot(shot.id,{prompt:value})} placeholder="主体、构图、光线、风格与文字布局" /><Textarea label="需要避免" value={shot.negativePrompt||''} onChange={(value)=>patchShot(shot.id,{negativePrompt:value})} placeholder="例如：商品变形、文字错误、出现不存在的配件" /></article>)}{!approvedShots.length&&<p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">请先确认至少一页页面方案。</p>}</div>}

        {stage === 'batch' && <div className="space-y-4 pt-4"><p className="rounded-xl bg-indigo-50 p-3 text-xs leading-5 text-indigo-900">建议先试做一页，检查商品外观、文案和整体风格；确认满意后再生成整套。提交后可以离开页面，稍后回来查看进度。</p><div className="grid gap-3 sm:grid-cols-2"><Select label="生图服务" value={imageProfileId} options={profiles.filter((item)=>item.capability==='image').map((item)=>item.name)} onChange={(value)=>setImageProfileId(profiles.find((item)=>item.name===value&&item.capability==='image')?.id||'')} /><Select label="输出尺寸" value={imageSize} options={sizes} onChange={(value)=>patchNested('specs',{imageSize:value})} /><Select label="画质" value={imageQuality} options={qualities} onChange={(value)=>patchNested('specs',{imageQuality:value})} /></div><div className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-semibold">先试做一页</h3><p className="mt-1 text-xs text-slate-500">{firstTrialShot?.title||'请先完成并确认页面方案'}</p></div><button type="button" disabled={isBusy||!imageProfileId||!firstTrialShot} onClick={()=>firstTrialShot&&void startShot(firstTrialShot)} className="h-10 rounded-xl bg-indigo-600 px-4 text-sm text-white disabled:opacity-50"><Send className="mr-2 inline h-4 w-4" />开始试做</button></div>{firstTrialReview&&<div className="flex flex-col gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3">{firstTrialReview.previewUrl&&<img src={firstTrialReview.previewUrl} alt="试生成预览" className="h-20 w-16 rounded-lg bg-white object-contain" />}<div><h3 className="text-sm font-semibold">试做效果确认</h3><p className="mt-1 text-xs text-slate-600">{trialPassed?'效果已确认':'查看效果，通过后继续批量生成'}</p></div></div>{!trialPassed&&<button type="button" disabled={isBusy} onClick={()=>void setReview(firstTrialReview,{selected:true,locked:true})} className="h-10 rounded-xl bg-indigo-600 px-4 text-sm text-white disabled:opacity-50">确认这页效果</button>}</div>}<div className="flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-semibold">批量生成整套</h3><p className="mt-1 text-xs text-slate-500">已确认 {approvedShots.length} 页；试做{trialPassed?'已完成':'尚未完成'}</p></div><button type="button" disabled={isBusy||!imageProfileId||!trialPassed||!promptsReady||batchSubmitted} onClick={()=>void startBatch()} className="h-10 rounded-xl bg-indigo-600 px-4 text-sm text-white disabled:opacity-50"><WandSparkles className="mr-2 inline h-4 w-4" />{batchSubmitted?'整套已提交':'批量生成'}</button></div><div className="space-y-2">{jobs.slice(0,10).map((job)=><div key={job.id} className="flex items-center justify-between gap-2 rounded-xl border p-3 text-xs"><span>{job.type==='image_generate'?'图片生成':'页面策划'} · {job.progress}%</span><span className="flex items-center gap-2 text-slate-500">{progressLabel(job.status)}{(job.status==='failed'||job.status==='partial')&&<button type="button" onClick={()=>void retryJob(job.id)} className="rounded-lg border px-2 py-1 text-indigo-700">重试</button>}</span></div>)}</div></div>}

        {stage === 'results' && <div className="pt-4"><div className="mb-4 rounded-xl bg-slate-50 p-3 text-sm"><b>{reviews.filter((item)=>item.status==='completed').length}</b> 张完成 · <b>{reviews.filter((item)=>item.selected).length}</b> 张已选</div><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{reviews.map((item)=><article key={item.id} className={'overflow-hidden rounded-2xl border '+(item.selected?'border-indigo-400 ring-1 ring-indigo-100':'border-slate-200')}><div className="aspect-[3/4] bg-slate-100">{item.previewUrl?<img src={item.previewUrl} alt="生图结果" className="h-full w-full object-contain" loading="lazy" />:<div className="grid h-full place-items-center p-3 text-center text-xs text-slate-500">{item.error?.message||progressLabel(item.status)}</div>}</div><div className="p-3"><p className="line-clamp-2 text-xs leading-5">{item.prompt}</p><div className="mt-3 flex flex-wrap gap-2">{item.status==='completed'&&<><button type="button" onClick={()=>void setReview(item,{selected:!item.selected})} className="rounded-lg border px-3 py-2 text-xs">{item.selected?'已选':'选图'}</button><button type="button" onClick={()=>void setReview(item,{locked:!item.locked})} className="rounded-lg border px-3 py-2 text-xs">{item.locked?<><LockKeyhole className="mr-1 inline h-3 w-3" />已锁定</>:<><UnlockKeyhole className="mr-1 inline h-3 w-3" />锁定</>}</button>{item.previewUrl&&<a href={item.previewUrl} target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-2 text-xs">预览</a>}{item.outputAssetId&&<button type="button" onClick={()=>void downloadProtectedFile("/image-studio/assets/"+encodeURIComponent(item.outputAssetId!)+"/download",item.filename||("image-"+item.id+".png"))} className="rounded-lg border px-3 py-2 text-xs">下载</button>}{!item.locked&&item.shotId&&<button type="button" disabled={isBusy} onClick={()=>{const shot=shots.find((entry)=>entry.id===item.shotId);if(shot)void startShot(shot)}} className="rounded-lg border px-3 py-2 text-xs">重生成页面</button>}</>}</div></div></article>)}</div>{!reviews.length&&<div className="rounded-xl bg-slate-50 p-10 text-center text-sm text-slate-400">任务完成后，图片会出现在这里。</div>}<div className="mt-6 rounded-2xl border p-4"><h3 className="text-sm font-semibold">交付清单</h3><div className="mt-3 flex flex-wrap gap-2">{reviews.filter((item)=>item.selected&&item.outputAssetId).map((item)=><button key={item.id} type="button" onClick={()=>void downloadProtectedFile("/image-studio/assets/"+encodeURIComponent(item.outputAssetId!)+"/download",item.filename||("image-"+item.id+".png"))} className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-800">下载已选图 · {item.shotId||item.slotKey}</button>)}</div>{!reviews.some((item)=>item.selected)&&<p className="mt-2 text-xs text-slate-500">选中的图片会保存在此交付清单中。</p>}<div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center"><button type="button" disabled={isBusy||!reviews.some((item)=>item.selected&&item.status==='completed')} onClick={()=>void createExport()} className="h-10 rounded-xl bg-indigo-600 px-4 text-sm text-white disabled:opacity-50">打包下载</button><span className="text-[11px] text-slate-500">每次最多打包 100 张图片，总大小不超过 100 MB。图片较多时请稍等片刻。</span></div>{exports.map((item)=><div key={item.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3 text-xs"><span>{item.imageCount} 张 · {item.status==='completed'?'导出完成':item.status==='failed'?'导出失败':'正在准备下载包 '+(item.progress||0)+'%'}{item.error?' · '+item.error.message:''}</span>{item.downloadUrl&&<button type="button" onClick={()=>void downloadProtectedFile("/image-studio/exports/"+encodeURIComponent(item.id)+"/download","image-studio-"+item.id+".zip")} className="rounded-lg border bg-white px-3 py-2 text-indigo-700">下载打包文件</button>}</div>)}</div></div>}

        <div className="fixed inset-x-0 bottom-0 z-40 -mx-0 flex flex-col-reverse gap-2 border-t bg-white/95 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:static sm:mt-6 sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:border-t sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-4 sm:shadow-none sm:backdrop-blur-none"><p className="hidden text-[11px] text-slate-400 sm:block">项目进度和生成记录会自动保存，离开后也可以回来继续查看。</p><div className="mx-auto flex w-full max-w-7xl justify-end gap-2 sm:mx-0 sm:w-auto">{currentIndex>0&&<button type="button" disabled={saving} onClick={()=>{const previous=steps[currentIndex-1].key;void saveWorkflow(workflow,previous).then((updated)=>{if(updated)setStage(previous);}).catch(()=>undefined);}} className="h-11 flex-1 rounded-xl border px-4 text-sm disabled:opacity-50 sm:h-10 sm:flex-none">上一步</button>}{nextStage&&<button type="button" disabled={!stageDone[stage]||saving} onClick={()=>void saveAndContinue()} className="h-11 flex-1 rounded-xl bg-indigo-600 px-4 text-sm text-white disabled:opacity-50 sm:h-10 sm:flex-none">{saving?'保存中…':stageDone[stage]?'保存并继续':'完成本步后继续'}</button>}</div></div>
      </section>
    </div>
    <div className="flex justify-end pb-8 pt-6"><button type="button" className="text-xs text-rose-500" onClick={()=>{if(confirm('删除项目？'))void api('/image-studio/projects/'+projectId,{method:'DELETE'}).then(()=>window.location.assign('/service/image-studio')).catch((error)=>toast.error(error.message));}}><Trash2 className="mr-1 inline h-3 w-3" />删除项目</button></div>
  </div><ImageStudioTaskLogWindow entries={activityLogs} jobs={jobs} currentTask={trackedTask} /></main>;
}

function ChatIntakeCard({ intake, draft, assets, busy, onChange, onApprove, onRetry }: {
  intake: ChatIntake; draft?: ChatBrief; assets: Asset[]; busy: boolean;
  onChange: (brief: ChatBrief) => void; onApprove: () => void; onRetry: () => void;
}) {
  const statusText: Record<string, string> = { queued: '准备中', processing: '正在整理', needs_review: '待你核对', approved: '已带入方案', failed: '整理失败', cancelled: '已停止', cancelling: '正在停止' };
  return <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-3 sm:px-4">
      <div><h4 className="text-xs font-bold text-slate-800">沟通需求整理</h4><p className="mt-1 text-[10px] text-slate-500">{new Date(intake.createdAt).toLocaleString()} · {intake.sourceType !== 'screenshots' ? `${intake.sourceType === 'invite' ? '邀请会话' : '订单沟通'}：${intake.sourceTitle || '客户订单'} · ${intake.sourceMessageCount} 条消息 · ${intake.sourceType === 'invite' ? `${intake.sourceFormCount} 份已填写表单 · ${intake.sourceRequirementCount} 项客户选择` : `${intake.sourceRequirementCount} 份已确认需求`} · ${intake.sourceImageCount} 张相关图片${intake.sourceSkippedAttachmentCount ? ` · ${intake.sourceSkippedAttachmentCount} 个附件未能添加` : ''}` : `${intake.sourceAssetIds.length} 张截图`}</p></div>
      <span className={'rounded-full px-2.5 py-1 text-[10px] font-semibold ' + (intake.status === 'approved' ? 'bg-emerald-50 text-emerald-700' : intake.status === 'needs_review' ? 'bg-amber-50 text-amber-700' : intake.status === 'failed' ? 'bg-rose-50 text-rose-700' : 'bg-violet-50 text-violet-700')}>{statusText[intake.status] || intake.status}</span>
    </div>
    <div className="space-y-3 p-3 sm:p-4">
      {intake.status === 'failed' && <div className="rounded-xl bg-rose-50 p-3 text-xs text-rose-700">{'这次没有整理成功，请检查截图是否清晰、沟通资料是否完整后重试。若多次失败，请联系管理员。'} <button type="button" disabled={busy} onClick={onRetry} className="ml-2 font-semibold underline">{intake.sourceType !== 'screenshots' ? '重试整理' : '重新识别'}</button></div>}
      {['queued', 'processing', 'cancelling'].includes(intake.status) && <p className="flex items-center gap-2 rounded-xl bg-violet-50 p-3 text-xs text-violet-800"><Loader2 className="h-4 w-4 animate-spin" />正在{intake.sourceType === 'invite' ? '整理邀请会话' : intake.sourceType === 'collaboration' ? '整理订单沟通记录' : '识别聊天截图'}，完成后你可以在这里核对和修改结果。</p>}
      <div className="flex flex-wrap gap-2">{intake.sourceAssetIds.map((id) => assets.find((asset) => asset.id === id)).filter((asset): asset is Asset => Boolean(asset)).map((asset) => <a key={asset.id} href={asset.previewUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg bg-slate-50 p-1.5"><img src={asset.previewUrl} alt="对话截图" className="h-9 w-9 rounded-md object-cover" /><span className="max-w-32 truncate text-[10px] text-slate-600">{asset.filename}</span></a>)}</div>
      {draft && ['needs_review', 'approved'].includes(intake.status) && <>
        <p className="rounded-lg bg-amber-50 p-2.5 text-[11px] leading-5 text-amber-900">请核对整理结果：客户已确认的要求和仍需确认的信息会分开显示。商品规格、材质和功效请以商品资料为准，避免将未经确认的内容用于宣传图。</p>
        <ChatBriefEditor value={draft} onChange={onChange} />
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-[10px] text-slate-500">确认后，这些需求会用于商品分析、页面策划和后续生图。</p><button type="button" disabled={busy} onClick={onApprove} className="h-10 rounded-xl bg-violet-700 px-4 text-xs font-semibold text-white disabled:opacity-50">{intake.status === 'approved' ? '保存修改并更新方案' : '确认需求并继续'}</button></div>
      </>}
    </div>
  </article>;
}

function AssetRoleSelect({ asset, onChange }: { asset: Asset; onChange: (role: string) => void }) {
  return <UiSelect value={asset.role} onValueChange={onChange}>
    <SelectTrigger aria-label={`${asset.filename}素材用途`} className="mt-1.5 h-8 min-h-8 w-full rounded-lg px-2 text-[10px]"><SelectValue /></SelectTrigger>
    <SelectContent><SelectItem value="product">商品素材</SelectItem><SelectItem value="competitor">竞品版式参考</SelectItem><SelectItem value="packaging">包装与配件</SelectItem><SelectItem value="other">其他参考</SelectItem></SelectContent>
  </UiSelect>;
}

function ChatBriefEditor({ value, onChange }: { value: ChatBrief; onChange: (brief: ChatBrief) => void }) {
  const fields: Array<{ key: keyof ChatBrief; label: string; hint: string }> = [
    { key: 'summary', label: '需求摘要', hint: '客户希望解决什么问题、这次沟通的结论' },
    { key: 'productName', label: '商品名称', hint: '商品名称或型号' },
    { key: 'productLinks', label: '商品链接', hint: '每行一个链接，可补充截图中识别不全的链接' },
    { key: 'platform', label: '销售平台', hint: '淘宝 / 天猫等' },
    { key: 'deadline', label: '交付时间', hint: '客户提出或双方确认的交期' },
    { key: 'deliverables', label: '交付要求', hint: '图种、数量、尺寸或页面比例' },
    { key: 'customerGoals', label: '客户目标', hint: '每行一项' },
    { key: 'confirmedRequirements', label: '客户已确认的要求', hint: '只填客户明确提出或双方确认的内容' },
    { key: 'sellingPointClues', label: '提到的商品亮点', hint: '请对照商品资料核实后再用于宣传' },
    { key: 'customerConcerns', label: '客户顾虑 / 用户痛点', hint: '客户表达的顾虑或目标用户遇到的问题' },
    { key: 'visualPreferences', label: '视觉偏好', hint: '参考图想借鉴什么，偏好的配色、构图或氛围' },
    { key: 'mustKeep', label: '必须保留', hint: '商品外观、商标、包装或其他不可改动项' },
    { key: 'avoid', label: '避免内容', hint: '不希望出现的元素、表达或风格' },
    { key: 'factsToConfirm', label: '待核实商品信息', hint: '规格、材质、功效等尚无可靠依据的内容' },
    { key: 'followUpQuestions', label: '建议追问客户', hint: '仍缺失、会影响出图的关键信息' },
  ];
  const scalarKeys = new Set<keyof ChatBrief>(['summary', 'productName', 'platform', 'deadline']);
  return <div className="grid gap-3 sm:grid-cols-2">{fields.map(({ key, label, hint }) => {
    const isScalar = scalarKeys.has(key);
    const currentValue = Array.isArray(value[key]) ? (value[key] as string[]).join('\n') : String(value[key] || '');
    return <label key={key} className={'block text-[11px] font-semibold text-slate-700 ' + (key === 'summary' || key === 'productLinks' || key === 'confirmedRequirements' || key === 'factsToConfirm' || key === 'followUpQuestions' ? 'sm:col-span-2' : '')}>{label}
      {isScalar && key !== 'summary' ? <input value={currentValue} maxLength={2048} onChange={(event) => onChange({ ...value, [key]: event.target.value } as ChatBrief)} placeholder={hint} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-xs font-normal outline-none focus:border-violet-400" /> : <textarea value={currentValue} rows={key === 'summary' ? 2 : 3} onChange={(event) => onChange({ ...value, [key]: scalarKeys.has(key) ? event.target.value : splitLines(event.target.value) } as ChatBrief)} placeholder={hint} className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 p-3 text-xs font-normal leading-5 outline-none focus:border-violet-400" />}
    </label>;
  })}</div>;
}

function Input({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; inputMode?: 'decimal' | 'numeric' }) {
  return <label className="block text-xs font-semibold text-slate-600">{label}<input value={value} onChange={(event)=>onChange(event.target.value)} maxLength={500} inputMode={inputMode} placeholder={placeholder} className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 px-3 text-sm font-normal outline-none focus:border-indigo-400" /></label>;
}
function Textarea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="mt-3 block text-xs font-semibold text-slate-600">{label}<textarea value={value} onChange={(event)=>onChange(event.target.value)} maxLength={24000} rows={4} placeholder={placeholder} className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm font-normal leading-5 outline-none focus:border-indigo-400" /></label>;
}
function ConfidencePill({ status }: { status: RuleConfidence }) {
  const styles: Record<RuleConfidence, string> = { verified: 'bg-emerald-50 text-emerald-700', suggested: 'bg-indigo-50 text-indigo-700', pending: 'bg-amber-50 text-amber-700' };
  return <span className={`rounded-full px-2 py-1 text-[10px] font-medium ${styles[status]}`}>{confidenceLabels[status]}</span>;
}
function Select({ label, value, options, onChange, optionLabels }: { label: string; value: string; options: string[]; onChange: (value: string) => void; optionLabels?: Record<string, string> }) {
  const items = [...new Set([...options, value].map((option) => option.trim()).filter(Boolean))];
  return <div className="block text-xs font-semibold text-slate-600"><span className="mb-1.5 block">{label}</span><UiSelect value={value || undefined} onValueChange={onChange}><SelectTrigger className="h-10 min-h-10 w-full rounded-xl border-slate-200 px-3 text-sm font-normal"><SelectValue placeholder="请选择" /></SelectTrigger><SelectContent>{items.map((option) => <SelectItem key={option} value={option}>{optionLabels?.[option] || (option === 'custom' ? '自定义画幅' : option)}</SelectItem>)}</SelectContent></UiSelect></div>;
}
