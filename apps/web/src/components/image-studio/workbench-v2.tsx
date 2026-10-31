'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  ArrowLeft, Download, FileImage, ImagePlus, Loader2,
  AtSign, Paperclip, Send, Sparkles, Workflow, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/auth';
import { DesignPlanAgent, type CollaborationConversation, type DesignMode, type DesignPlanGenerateAction, type DesignTask, type Project, type SavedPlan } from '@/components/image-studio/design-plan-agent';
import { ImageStudioModelSelector } from '@/components/image-studio/model-selector';
import { OrchestrationPanel } from '@/components/image-studio/orchestration-panel';
import { PsdExportDialog } from '@/components/image-studio/psd-export-dialog';
import { MaterialsPanel } from '@/components/image-studio/materials-panel';
import { ProductInvestigationPanel } from '@/components/image-studio/product-investigation';
import { WorkbenchTaskMessages, type WorkbenchTaskMessage } from '@/components/image-studio/workbench-task-messages';
import { RoundActivity, type RoundExecution } from '@/components/image-studio/round-activity';
import { createPlanCanvasNodes, imageNodeId, imageTaskWaitMessage, isLogoConceptSlot, promptNodeId, readConnectedPrompt, taskSlots } from '@/components/image-studio/canvas-plan';
import { isProductionComplete } from '@/components/image-studio/production-completion';
import { resolveStudioModels, saveStudioModelPreference, type StudioModelProfile as Profile, type StudioModelSelection } from '@/lib/image-studio-models';
import { createWorkspaceCanvasProject, ensureWorkspacePersistenceReady } from '@infinite-canvas/services/api/workspace-persistence';
import { useCanvasStore } from '@infinite-canvas/stores/canvas/use-canvas-store';
import { StudioCanvasModelProvider } from '@infinite-canvas/stores/use-config-store';
import { createCanvasNode } from '@infinite-canvas/lib/canvas/canvas-node-factory';
import { downloadCanvasSvg, downloadLogoAssetArchive, isCanvasSvgNode } from '@infinite-canvas/lib/canvas/canvas-svg-export';
import { uploadImage } from '@infinite-canvas/services/image-storage';
import { VectorizeDialog } from './vectorize-dialog';
import type { CanvasNodeData } from '@infinite-canvas/types/canvas';
import { publishWorkbenchCanvasCommand, subscribeWorkbenchSelection } from '@infinite-canvas/lib/canvas/workbench-bridge';
import type { DesignAgentAction, DesignAgentInputs, DesignAgentMessage, DesignAgentRevision, DesignAgentSkillForm, DesignAgentSnapshot } from '@/lib/design-agent-conversation';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CanvasNodeType } from '@infinite-canvas/types/canvas';
import '@infinite-canvas/i18n';
import { AppProviders } from '@infinite-canvas/components/layout/app-providers';

const CanvasContent = dynamic(() => import('@design-review/infinite-canvas').then((module) => module.ImageStudioCanvasContent), {
  ssr: false,
  loading: () => <div className="grid h-full place-items-center text-sm text-slate-400"><Loader2 className="mr-2 inline size-4 animate-spin" />正在载入无限画布…</div>,
});

type SkillLite = { id: string; name: string; category: string; version: number };
type Asset = { id: string; kind: string; role: string; filename: string; mimeType: string; previewUrl: string; catalog?: { effective?: Record<string, any> } };
type JobGeneration = { id: string; slotKey: string; shotId?: string | null; prompt: string; status: string; outputAssetId?: string | null; previewUrl?: string | null; error?: { message: string } | null };
type Job = { id: string; projectId: string; type: string; operation?: string | null; exportId?: string | null; context?: Record<string, any> | null; status: string; progress: number; result?: unknown; error?: { message: string } | null; generations?: JobGeneration[]; createdAt?: string };
type Review = { id: string; slotKey: string; prompt: string; status: string; outputAssetId: string | null; filename: string | null; previewUrl: string | null; selected: boolean; locked: boolean; reviewVersion: number; error: { message: string } | null };
type TaskState = { status: 'idle' | 'pending' | 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'blocked' | 'stale'; jobId?: string; roundId?: string; previousJobId?: string; previousPlanVersion?: number; sourcePlanVersion?: number; error?: string; updatedAt?: string; exportId?: string; result?: string };
type TaskExecutionOptions = { runId?: string; roundId?: string; slotKeys?: string[]; instruction?: string; reusePrevious?: boolean };
type MobileTab = 'chat' | 'canvas';
type AgentMessage = DesignAgentMessage;
type Result<T> = { success: boolean; data: T; message?: string };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(path, options);
  const result = await response.json() as Result<T>;
  if (!response.ok || !result.success) throw new Error(result.message || '请求失败');
  return result.data;
}

function parsePlan(project: Project | null): SavedPlan | null {
  const plan = project?.workflow?.designAgent as SavedPlan | undefined;
  return plan && typeof plan === 'object' ? plan : null;
}

function fallbackTasks(plan: SavedPlan | null): DesignTask[] {
  if (!plan) return [];
  if (Array.isArray(plan.plan.taskGraph) && plan.plan.taskGraph.length) return plan.plan.taskGraph.map((task) =>
    task.kind === 'manual' && /svg|矢量稿/i.test(task.title) ? { ...task, kind: 'svg_generation' } : task);
  const skillIds = [...new Set([...(plan.selectedSkillIds || []), ...(plan.plan.recommendedSkills || []).map((item) => item.skillId)])].slice(0, 5);
  return (plan.plan.nextSteps || []).map((title, index) => {
    const kind: DesignTask['kind'] = /调研|搜索|竞品|参考/.test(title) ? 'research'
      : /商品|素材|信息|分析/.test(title) ? 'analysis'
        : /风格|方向|视觉/.test(title) ? 'direction'
          : /分镜|页面|套图|策划/.test(title) ? 'storyboard'
            : /文案|卖点/.test(title) ? 'copywriting'
              : /提示词|画面/.test(title) ? 'prompting'
                : /svg|矢量/.test(title) ? 'svg_generation'
                  : /生成|出图|图片/.test(title) ? 'image_generation'
                  : /审核|检查|审稿/.test(title) ? 'review' : /交付|导出/.test(title) ? 'delivery' : 'manual';
    return { id: `task_${index + 1}`, title, kind, reason: '', dependsOn: index ? [`task_${index}`] : [], skillIds, inputs: [], outputs: [], reviewPolicy: kind === 'image_generation' || kind === 'direction' ? 'confirm' : 'automatic' };
  });
}

function taskStatusLabel(status?: TaskState['status']) {
  return ({ queued: '排队中', running: '执行中', completed: '已完成', partial: '部分完成', failed: '失败', blocked: '待补充', stale: '待更新', idle: '待执行' } as Record<string, string>)[status || 'idle'] || '待执行';
}

function taskKindLabel(kind: DesignTask['kind']) {
  return ({ research: '调研', analysis: '资料分析', direction: '视觉方向', storyboard: '套图规划', copywriting: '文案', prompting: '画面提示', image_generation: '生图', svg_generation: 'SVG 矢量稿', review: '审稿', delivery: '交付', manual: '人工确认' } as Record<string, string>)[kind];
}

function formatTaskResult(value: unknown) {
  if (typeof value === 'string') return value.slice(0, 18000);
  return JSON.stringify(value, null, 2)?.slice(0, 18000) || '任务已完成';
}

function getSvgSource(value: unknown): string | null {
  let result = value;
  if (typeof result === 'string') {
    try { result = JSON.parse(result); } catch { /* accept a plain SVG response below */ }
  }
  const object = result && typeof result === 'object' ? result as Record<string, unknown> : {};
  let svg = typeof object.svg === 'string' ? object.svg : typeof result === 'string' ? result : '';
  svg = svg.replace(/^```(?:svg|xml)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = svg.indexOf('<svg');
  const end = svg.lastIndexOf('</svg>');
  if (start < 0 || end < start) return null;
  svg = svg.slice(start, end + 6);
  if (svg.length > 80_000 || /<(script|foreignObject|iframe|object|embed)\b/i.test(svg)
    || /\bon[a-z]+\s*=/i.test(svg) || /(?:href|src)\s*=\s*["']\s*(?:https?:|\/\/|data:)/i.test(svg)
    || /url\(\s*["']?\s*(?:https?:|\/\/|data:)/i.test(svg)) return null;
  return svg;
}

function conversationTaskResult(value: unknown): string {
  if (typeof value === 'string') return value.slice(0, 18000);
  if (!value || typeof value !== 'object') return '';
  const result = value as Record<string, any>;
  const summary = [result.summary, result.text, result.content, result.analysis, result.prompt, result.copy, result.productInfo?.summary].find((item) => typeof item === 'string' && item.trim());
  const lines: string[] = summary ? [summary] : [];
  const product = result.productInfo;
  if (product && typeof product === 'object') {
    for (const [key, label] of Object.entries({ name: '商品', brand: '品牌', category: '品类', color: '颜色', shape: '外观', material: '材质', craft: '工艺', audience: '目标人群', usage: '使用场景', spec: '规格', lockTerm: '商品外观参考' })) {
      if (typeof product[key] === 'string' && product[key].trim()) lines.push(`${label}：${product[key]}`);
    }
  }
  const items = result.shots || result.storyboard?.shots || result.sellingPoints || result.findings || result.items;
  if (Array.isArray(items)) lines.push(...items.map((item, index) => typeof item === 'string' ? `${index + 1}. ${item}` : item && typeof item === 'object' ? `${index + 1}. ${[item.title || item.name || item.claim, item.copy || item.description || item.visualDescription].filter((text) => typeof text === 'string').join('：')}` : '').filter(Boolean));
  return lines.join('\n').slice(0, 18000);
}

function studioTaskKey(plan: SavedPlan, task: DesignTask) {
  return `${plan.version}:${task.id}`;
}

export function ImageStudioWorkbench({ projectId }: { projectId: string }) {
  return <WorkbenchProvider key={projectId} projectId={projectId} />;
}

function WorkbenchProvider({ projectId }: { projectId: string }) {
  return (
    <div className="h-full min-h-0 w-full overflow-hidden bg-[#f7f8fc] text-slate-900">
      <AppProviders className="h-full min-h-0"><WorkbenchShell projectId={projectId} /></AppProviders>
    </div>
  );
}

function WorkbenchShell({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const projectRef = useRef<Project | null>(null);
  const patchQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [assets, setAssets] = useState<Asset[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [skills, setSkills] = useState<SkillLite[]>([]);
  const [conversations, setConversations] = useState<CollaborationConversation[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [canvasProjectId, setCanvasProjectId] = useState('');
  const [canvasReady, setCanvasReady] = useState(false);
  const [activeSourceId, setActiveSourceId] = useState('');
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat');
  const [connected, setConnected] = useState(false);
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  // React state can still contain the previous task until the next render.
  const runningTaskIdRef = useRef<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchTaskTitle, setBatchTaskTitle] = useState('');
  const [backendScheduling, setBackendScheduling] = useState(false);
  const [backendRunPresent, setBackendRunPresent] = useState(false);
  const [completedRunVersion, setCompletedRunVersion] = useState<number | null>(null);
  const [orchestrationRefresh, setOrchestrationRefresh] = useState(0);
  useEffect(() => { void request<{ enabled: boolean }>('/image-studio/orchestration-capabilities').then((value) => setBackendScheduling(value.enabled)).catch(() => undefined); }, []);
  const [chatDraft, setChatDraft] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [uploadingAssets, setUploadingAssets] = useState(false);
  const [agentSession, setAgentSession] = useState<DesignAgentSnapshot | null>(null);
  const agentRevisionRef = useRef(0);
  const [agentRunId, setAgentRunId] = useState<string | null>(null);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [pendingAssetIds, setPendingAssetIds] = useState<string[]>([]);
  const [selectedCanvasNodeIds, setSelectedCanvasNodeIds] = useState<string[]>([]);
  const [canvasSelectionIds, setCanvasSelectionIds] = useState<string[]>([]);
  const [agentPanel, setAgentPanel] = useState<'memory' | 'history' | 'tasks' | null>(null);
  const [agentToolbar, setAgentToolbar] = useState<HTMLDivElement | null>(null);
  const [showLatestButton, setShowLatestButton] = useState(false);
  const followLatestRef = useRef(true);
  const [planHistory, setPlanHistory] = useState<DesignAgentRevision[]>([]);
  const agentInputsRef = useRef<DesignAgentInputs>({ skillIds: [], confirmedAnswers: {} });
  const pendingClientMessage = useRef<{ id: string; text: string } | null>(null);
  const [pendingAgentActions, setPendingAgentActions] = useState<{ runId: string; actions: DesignAgentAction[] } | null>(null);
  const handledAgentRuns = useRef(new Set<string>());
  const [planDiff, setPlanDiff] = useState<{ reused: number; added: number; changed: number } | null>(null);
  const [planGenerateAction, setPlanGenerateAction] = useState<DesignPlanGenerateAction | null>(null);
  const [modelsSaving, setModelsSaving] = useState(false);
  const [vectorSource, setVectorSource] = useState<CanvasNodeData>();
  const [vectorInitialBrand, setVectorInitialBrand] = useState<string>();
  const assetInputRef = useRef<HTMLInputElement>(null);
  const requirementsScrollRef = useRef<HTMLDivElement>(null);
  const [conversationPickerNonce, setConversationPickerNonce] = useState(0);
  const canvasProject = useCanvasStore((state) => state.projects.find((item) => item.id === canvasProjectId));

  const savedPlan = useMemo(() => parsePlan(project), [project]);
  const tasks = useMemo(() => {
    const planned = fallbackTasks(savedPlan);
    if (savedPlan?.plan.logoExploration) return planned.filter((task) => task.id === savedPlan.plan.logoExploration!.taskId);
    if (!savedPlan || savedPlan.plan.taskGraph?.length || planned.some((task) => task.kind === 'image_generation')) return planned;
    const skillIds = [...new Set([...(savedPlan.selectedSkillIds || []), ...(savedPlan.plan.recommendedSkills || []).map((item) => item.skillId)])].slice(0, 5);
    return [...planned, {
      id: 'task_product_image_set',
      title: savedPlan.mode === 'brand' ? '生成品牌应用物料' : '生成商品套图',
      kind: 'image_generation' as const,
      reason: savedPlan.mode === 'brand' ? '沿用已确认的品牌识别系统生成首批应用物料。' : '按已确认的视觉方向生成商品图片。',
      dependsOn: [],
      skillIds,
      inputs: [],
      outputs: [],
      reviewPolicy: 'confirm' as const,
    }];
  }, [savedPlan]);
  const workbench = (project?.workflow?.workbench || {}) as { canvasProjectId?: string; taskStates?: Record<string, TaskState>; messages?: AgentMessage[]; designMode?: DesignMode; logoSymbolOnlyByPlan?: Record<string, boolean> };
  const designMode: DesignMode = workbench.designMode === 'brand' ? 'brand' : 'product';
  const planMode: DesignMode = savedPlan?.mode || designMode;
  const taskStates = workbench.taskStates || {};
  const modelSelection = resolveStudioModels(profiles, project?.workflow?.modelProfiles);
  const imageProfile = profiles.find((profile) => profile.id === modelSelection.imageProfileId && profile.capability === 'image');
  const textProfile = profiles.find((profile) => profile.id === modelSelection.textProfileId && ['text', 'vision'].includes(profile.capability));
  const visionProfile = profiles.find((profile) => profile.id === modelSelection.visionProfileId && profile.capability === 'vision');
  const selectedDirection = savedPlan?.plan.directions.find((direction) => direction.id === savedPlan.plan.selectedDirectionId);
  const imageGenerationTasks = tasks.filter((task) => task.kind === 'image_generation');
  const imageGenerationTask = savedPlan
    ? imageGenerationTasks.find((task) => taskStates[studioTaskKey(savedPlan, task)]?.status !== 'completed') || imageGenerationTasks[0]
    : undefined;
  const imageGenerationState = savedPlan && imageGenerationTask ? taskStates[studioTaskKey(savedPlan, imageGenerationTask)] : undefined;
  const selectedPromptNode = canvasSelectionIds.length === 1 ? canvasProject?.nodes.find((node) => node.id === canvasSelectionIds[0] && node.metadata?.artifactType === 'image-prompt' && savedPlan && node.id === promptNodeId(savedPlan.version, node.metadata.workbenchSlotKey || '')) : undefined;
  const selectedCanvasImageNode = canvasSelectionIds.length === 1 ? canvasProject?.nodes.find((node) => node.id === canvasSelectionIds[0] && node.type === CanvasNodeType.Image) : undefined;
  const selectedImageNode = selectedCanvasImageNode?.metadata?.artifactType === 'generated-image' ? selectedCanvasImageNode : undefined;
  const selectedSvgNode = selectedCanvasImageNode && isCanvasSvgNode(selectedCanvasImageNode) ? selectedCanvasImageNode : undefined;
  const applyVectorizedSvg = useCallback(async (source: CanvasNodeData, svg: string, outlineSvg?: string, dimensions?: { width: number; height: number }, typography?: NonNullable<CanvasNodeData['metadata']>['logoTypography']) => {
      if (!canvasProjectId || !canvasReady) throw new Error('画布尚未准备好');
      const current = useCanvasStore.getState().projects.find((item) => item.id === canvasProjectId);
      if (!current?.nodes.some((node) => node.id === source.id && node.metadata?.content === source.metadata?.content)) throw new Error('原图已变化，请重新选择后转换');
      const preview = await uploadImage(new Blob([outlineSvg || svg], { type: 'image/svg+xml' }));
      const latest = useCanvasStore.getState().projects.find((item) => item.id === canvasProjectId);
      if (!latest?.nodes.some((node) => node.id === source.id && node.metadata?.content === source.metadata?.content)) throw new Error('原图已变化，请重新选择后转换');
      const node = createCanvasNode(CanvasNodeType.Image, { x: source.position.x + source.width + 140, y: source.position.y }, {
        content: preview.url, storageKey: preview.storageKey, mimeType: preview.mimeType, svgSource: svg, ...(outlineSvg ? { svgOutlineSource: outlineSvg } : {}), ...(typography ? { logoTypography: typography } : {}),
        naturalWidth: preview.width, naturalHeight: preview.height, bytes: preview.bytes, status: 'success',
        artifactType: 'vectorized-svg', prompt: '由所选图片描摹生成的矢量路径',
      });
      const vectorNode = { ...node, title: `${source.title || '图片'} · SVG 矢量稿`,
        position: { x: source.position.x + source.width + 140, y: source.position.y }, width: source.width, height: dimensions ? source.width * dimensions.height / dimensions.width : source.height };
      publishWorkbenchCanvasCommand({ type: 'upsert-nodes', projectId: canvasProjectId, nodes: [vectorNode],
        connections: [{ id: `vector-${vectorNode.id}`, fromNodeId: source.id, toNodeId: vectorNode.id }], selectLast: true });
      toast.success('SVG 已添加到画布，可查看和下载');
  }, [canvasProjectId, canvasReady]);
  let imageSourceChanged = false;
  if (selectedImageNode && savedPlan && canvasProject) {
    try {
      imageSourceChanged = selectedImageNode.metadata?.workbenchPlanVersion !== savedPlan.version
        || !selectedImageNode.metadata?.prompt?.startsWith(readConnectedPrompt(savedPlan, selectedImageNode.metadata?.workbenchSlotKey || '', canvasProject.nodes, canvasProject.connections));
    } catch { imageSourceChanged = true; }
  }
  const imageGenerationBusy = imageGenerationState && ['queued', 'running'].includes(imageGenerationState.status);
  const productImages = assets.filter((asset) => asset.role === 'product' && asset.kind === 'image');
  const pendingAssets = pendingAssetIds.flatMap((id) => { const asset = assets.find((item) => item.id === id); return asset ? [asset] : []; });
  const hasProductImage = productImages.length > 0;
  const imageGenerationHint = !canvasReady ? '画布正在载入'
    : imageGenerationBusy ? '图片正在生成'
      : !savedPlan ? '请先生成并确认设计方案'
        : savedPlan.status !== 'approved' ? '确认视觉方向后即可生成'
          : planMode === 'product' && !hasProductImage ? '添加商品图后即可生成'
            : !imageProfile ? '请先完成图片生成设置'
              : planMode === 'brand' ? '按品牌规范生成应用物料' : '按已确认的视觉方向生成商品套图';
  const imageGenerationLabel = imageGenerationBusy ? '正在生成…'
    : imageGenerationState?.status === 'failed' ? '重试生成'
        : imageGenerationState?.status === 'completed' ? planMode === 'brand' ? '再次生成品牌物料' : '再次生成套图'
        : planMode === 'brand' ? '生成品牌物料' : '生成商品套图';

  const setCurrentProject = useCallback((next: Project) => {
    projectRef.current = next;
    setProject(next);
  }, []);

  const applyAgentSnapshot = useCallback((snapshot: DesignAgentSnapshot, runActions = false) => {
    // Pagination, polling and a normal reply can finish out of order.
    if (snapshot.revision < agentRevisionRef.current) return;
    agentRevisionRef.current = snapshot.revision;
    if (!projectRef.current || snapshot.project.version >= projectRef.current.version) setCurrentProject(snapshot.project);
    setAgentSession((previous) => {
      const sameProject = previous?.project.id === snapshot.project.id ? previous : null;
      const messages = new Map((sameProject?.messages || []).filter((message) => !message.id.startsWith('pending-')).map((message) => [message.id, message]));
      snapshot.messages.forEach((message) => messages.set(message.id, message));
      return { ...snapshot, messages: [...messages.values()].sort((a, b) => (a.seq || 0) - (b.seq || 0)),
        hasMore: sameProject?.messages.length && sameProject.messages[0].seq! < (snapshot.beforeSeq || Infinity) ? sameProject.hasMore : snapshot.hasMore,
        beforeSeq: Math.min(sameProject?.beforeSeq || Infinity, snapshot.beforeSeq || Infinity) };
    });
    setAgentRunId(snapshot.activeRunId);
    if (runActions && snapshot.autoExecute && snapshot.status === 'completed' && snapshot.runId && snapshot.actions?.length && !handledAgentRuns.current.has(snapshot.runId)) {
      handledAgentRuns.current.add(snapshot.runId);
      setPendingAgentActions({ runId: snapshot.runId, actions: snapshot.actions });
    }
  }, [setCurrentProject]);

  const onConversationInputsChange = useCallback((inputs: DesignAgentInputs) => { agentInputsRef.current = inputs; }, []);

  useEffect(() => subscribeWorkbenchSelection((selection) => {
    if (selection.projectId === canvasProjectId) { setCanvasSelectionIds(selection.nodeIds); setSelectedCanvasNodeIds(selection.nodeIds); }
  }), [canvasProjectId]);

  useEffect(() => {
    if (!agentRunId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    setChatSending(true);
    const poll = async () => {
      try {
        const snapshot = await request<DesignAgentSnapshot>(`/image-studio/projects/${projectId}/design-agent/runs/${agentRunId}`);
        if (cancelled) return;
        applyAgentSnapshot(snapshot, true);
        if (snapshot.status !== 'processing') { setChatSending(false); return; }
      } catch (error) {
        if (cancelled) return;
        console.warn('[Design Agent] 回复状态检查失败', error);
      }
      timer = setTimeout(() => void poll(), 2500);
    };
    timer = setTimeout(() => void poll(), 1000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [agentRunId, applyAgentSnapshot, projectId]);

  const persistWorkflow = useCallback((mutate: (workflow: Record<string, any>) => Record<string, any>) => {
    const operation = async () => {
      let current = projectRef.current;
      if (!current) throw new Error('项目尚未加载');
      let attempt = 0;
      while (attempt < 2) {
        try {
          const updated = await request<Project>(`/image-studio/projects/${projectId}`, {
            method: 'PUT', body: JSON.stringify({ version: current.version, workflow: mutate(current.workflow || {}) }),
          });
          setCurrentProject(updated);
          return updated;
        } catch (error) {
          attempt += 1;
          const message = String(error instanceof Error ? error.message : '');
          if (attempt >= 2 || !(message.includes('版本') || message.includes('项目已被其他页面更新'))) throw error;
          current = await request<Project>(`/image-studio/projects/${projectId}`);
          setCurrentProject(current);
        }
      }
      throw new Error('项目保存失败');
    };
    const next = patchQueue.current.then(operation, operation);
    patchQueue.current = next.then(() => undefined, () => undefined);
    return next;
  }, [projectId, setCurrentProject]);

  const changeModels = useCallback(async (selection: StudioModelSelection) => {
    if (modelsSaving) return;
    setModelsSaving(true);
    try { await persistWorkflow((workflow) => ({ ...workflow, modelProfiles: selection })); saveStudioModelPreference(selection); }
    catch (error) { toast.error(error instanceof Error ? error.message : '模型选择保存失败'); }
    finally { setModelsSaving(false); }
  }, [modelsSaving, persistWorkflow]);

  const changeDesignMode = useCallback(async (mode: DesignMode) => {
    if (mode === designMode || batchRunning || modelsSaving) return;
    try {
      await persistWorkflow((workflow) => ({
        ...workflow,
        workbench: { ...(workflow.workbench || {}), designMode: mode },
      }));
      if (savedPlan && savedPlan.mode !== mode) toast.info('工作模式已切换。现有方案仍按原模式保存，请发送新需求重新整理。');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '工作模式保存失败');
    }
  }, [batchRunning, designMode, modelsSaving, persistWorkflow, savedPlan]);

  const persistTaskState = useCallback(async (task: DesignTask, state: TaskState, planVersion?: number) => {
    const plan = parsePlan(projectRef.current);
    if (!plan) return;
    const key = `${planVersion || plan.version}:${task.id}`;
    await persistWorkflow((workflow) => {
      const states: Record<string, TaskState> = { ...workflow.workbench?.taskStates };
      states[key] = { ...state, updatedAt: new Date().toISOString() };
      if (state.jobId) for (const [otherKey, value] of Object.entries(states)) {
        if (otherKey !== key && otherKey.endsWith(`:${task.id}`) && value.jobId === state.jobId) states[otherKey] = { ...value, ...state, updatedAt: new Date().toISOString() };
      }
      const roundExecutions = { ...(workflow.workbench?.roundExecutions || {}) };
      if (state.roundId) roundExecutions[`${state.roundId}:${planVersion || plan.version}:${task.id}`] = { ...state, taskId: task.id, taskTitle: task.title, planVersion: planVersion || plan.version, updatedAt: new Date().toISOString() };
      return { ...workflow, workbench: { ...workflow.workbench, taskStates: states, roundExecutions } };
    });
  }, [persistWorkflow]);

  const refreshProjectJobs = useCallback(async () => {
    const summaries = await request<Array<{ id: string }>>(`/image-studio/projects/${projectId}/jobs?limit=30`);
    const next = await Promise.all(summaries.slice(0, 25).map((item) => request<Job>(`/image-studio/jobs/${item.id}`).catch(() => null)));
    const available = next.filter((item): item is Job => Boolean(item));
    setJobs(available);
    return available;
  }, [projectId]);

  const refreshReviews = useCallback(async () => {
    const next = await request<Review[]>(`/image-studio/projects/${projectId}/generation-reviews`);
    setReviews(next);
    return next;
  }, [projectId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [loadedProject, loadedAssets, loadedProfiles, loadedConversations, loadedSkills, loadedAgent] = await Promise.all([
        request<Project>(`/image-studio/projects/${projectId}`),
        request<Asset[]>(`/image-studio/projects/${projectId}/assets`),
        request<Profile[]>('/image-studio/model-profiles'),
        request<CollaborationConversation[]>(`/image-studio/projects/${projectId}/collaboration-conversations`).catch(() => []),
        request<SkillLite[]>('/design-skills').catch(() => []),
        request<DesignAgentSnapshot>(`/image-studio/projects/${projectId}/design-agent/conversation`),
      ]);
      setCurrentProject(loadedProject);
      setAssets(loadedAssets);
      setProfiles(loadedProfiles);
      setSkills(loadedSkills);
      setConversations(loadedConversations);
      applyAgentSnapshot(loadedAgent);
      await ensureWorkspacePersistenceReady();
      const stableCanvasId = String((loadedProject.workflow?.workbench || {}).canvasProjectId || `studio-${projectId}`);
      await createWorkspaceCanvasProject(`${loadedProject.name} · 创作画布`, stableCanvasId);
      setCanvasProjectId(stableCanvasId);
      if ((loadedProject.workflow?.workbench || {}).canvasProjectId !== stableCanvasId) {
        await persistWorkflow((workflow) => ({ ...workflow, workbench: { ...(workflow.workbench || {}), canvasProjectId: stableCanvasId } }));
      }
      await Promise.all([refreshProjectJobs(), refreshReviews()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '工作台加载失败');
    } finally { setLoading(false); }
  }, [applyAgentSnapshot, persistWorkflow, projectId, refreshProjectJobs, refreshReviews, setCurrentProject]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const source = savedPlan?.sourceConversation;
    setActiveSourceId(source ? `${source.type === 'intake' ? 'invite' : 'order'}:${source.id}` : '');
  }, [projectId, savedPlan?.updatedAt]);

  const onCanvasReady = useCallback(() => setCanvasReady(true), []);

  const updatePlan = useCallback((next: Project) => {
    const before = parsePlan(projectRef.current);
    const after = parsePlan(next);
    if (before && after && before.version !== after.version) {
      const oldTasks = new Map(fallbackTasks(before).map((task) => [task.id, task]));
      const newTasks = fallbackTasks(after);
      const reused = newTasks.filter((task) => oldTasks.has(task.id) && oldTasks.get(task.id)?.title === task.title).length;
      const added = newTasks.filter((task) => !oldTasks.has(task.id)).length;
      const changed = newTasks.filter((task) => oldTasks.has(task.id) && oldTasks.get(task.id)?.title !== task.title).length;
      setPlanDiff({ reused, added, changed });
    }
    setCurrentProject(next);
    void request<DesignAgentSnapshot>(`/image-studio/projects/${projectId}/design-agent/conversation`).then((snapshot) => applyAgentSnapshot(snapshot)).catch(() => undefined);
  }, [applyAgentSnapshot, projectId, setCurrentProject]);

  const chatMessages = agentSession?.messages || [];
  const taskActivity = tasks.map((task) => {
    const state = taskStates[savedPlan ? studioTaskKey(savedPlan, task) : ''];
    return `${task.id}:${state?.status || 'idle'}:${state?.updatedAt || ''}`;
  }).join('|');

  useEffect(() => {
    if (loadingEarlier || !chatMessages.length) return;
    if (!followLatestRef.current) { setShowLatestButton(true); return; }
    requestAnimationFrame(() => { const container = requirementsScrollRef.current; if (container) container.scrollTop = container.scrollHeight; });
  }, [chatMessages.length, taskActivity, chatSending, loadingEarlier]);

  const sendChatMessage = useCallback(async (round?: { text: string; skillIds: string[]; confirmedAnswers: Record<string, string>; confirmedAnswerLabels: Record<string, string>; designReferenceSelection?: { messageId: string; ids: string[] }; confirmSkillSelection?: boolean }): Promise<boolean> => {
    const message = (round?.text ?? chatDraft).trim();
    if (!message || chatSending || modelsSaving || planGenerateAction?.busy || uploadingAssets) return false;
    const referenceAssetIds = round ? [] : pendingAssetIds;
    const sentCanvasNodeIds = round && !round.designReferenceSelection ? [] : selectedCanvasNodeIds;
    const canvasNodes = useCanvasStore.getState().projects.find((item) => item.id === canvasProjectId)?.nodes || [];
    const needsVision = referenceAssetIds.length > 0 || Boolean(round?.designReferenceSelection) || (!round && canvasNodes.some((node) => selectedCanvasNodeIds.includes(node.id) && node.metadata?.imageStudioAssetId));
    const model = needsVision ? visionProfile : textProfile;
    if (!model) { toast.error(needsVision ? '请先选择可用的图片理解模型' : '请先选择可用的方案与文案模型'); return false; }
    const clientMessage = pendingClientMessage.current?.text === message ? pendingClientMessage.current : { id: crypto.randomUUID(), text: message };
    pendingClientMessage.current = clientMessage;
    followLatestRef.current = true;
    setShowLatestButton(false);
    setChatSending(true);
    setAgentSession((current) => current ? { ...current, messages: [...current.messages.filter((item) => item.id !== `pending-${clientMessage.id}`),
      { id: `pending-${clientMessage.id}`, role: 'user', text: message, attachments: referenceAssetIds.map((id) => ({ assetId: id, title: assets.find((asset) => asset.id === id)?.filename || '参考图片', previewUrl: `/api/image-studio/assets/${id}/preview` })) }] } : current);
    try {
      const [conversationType, conversationId] = activeSourceId.split(':', 2);
      const snapshot = await request<DesignAgentSnapshot>(`/image-studio/projects/${projectId}/design-agent/messages`, {
        method: 'POST', body: JSON.stringify({ clientMessageId: clientMessage.id, text: message, revision: agentSession?.revision,
          mode: designMode, ...agentInputsRef.current, ...(round ? { skillIds: round.skillIds, confirmedAnswers: round.confirmedAnswers, confirmedAnswerLabels: round.confirmedAnswerLabels, confirmSkillSelection: round.confirmSkillSelection ?? !round.designReferenceSelection, ...(round.designReferenceSelection ? { designReferenceSelection: round.designReferenceSelection } : {}) } : {}),
          referenceAssetIds, selectedNodeIds: sentCanvasNodeIds, modelProfileId: model.id,
          sourceConversation: conversationId ? { type: conversationType === 'invite' ? 'intake' : 'order', id: conversationId } : null }),
      });
      applyAgentSnapshot(snapshot, true);
      pendingClientMessage.current = null;
      if (!round) {
        setChatDraft((current) => current.trim() === message ? '' : current);
        setPendingAssetIds((current) => current.filter((id) => !referenceAssetIds.includes(id)));
        setSelectedCanvasNodeIds((current) => current.filter((id) => !sentCanvasNodeIds.includes(id)));
      }
      if (snapshot.status !== 'processing') setChatSending(false);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '消息发送失败');
      try { const snapshot = await request<DesignAgentSnapshot>(`/image-studio/projects/${projectId}/design-agent/conversation`); applyAgentSnapshot(snapshot); if (!snapshot.activeRunId) setChatSending(false); }
      catch { setChatSending(false); }
      return false;
    }
  }, [chatDraft, chatSending, modelsSaving, planGenerateAction?.busy, uploadingAssets, pendingAssetIds, canvasProjectId, selectedCanvasNodeIds, textProfile, visionProfile, assets, activeSourceId, projectId, agentSession?.revision, designMode, applyAgentSnapshot]);

  const submitSkillConfirmationForm = useCallback(async (form: DesignAgentSkillForm, answers: Record<string, string>, skillIds: string[]) => {
    const selected = skillIds.map((id) => skills.find((skill) => skill.id === id)?.name || id);
    const answerLines = form.questions.filter((question) => answers[question.id]?.trim()).map((question) => `${question.label}：${answers[question.id].trim()}`);
    const text = [selected.length ? `确认本轮 Skills 方案：${selected.join('、')}` : '确认本轮选择', ...answerLines].join('\n');
    return sendChatMessage({ text, skillIds: form.skillIds.length ? skillIds : agentInputsRef.current.skillIds, confirmSkillSelection: form.skillIds.length > 0, confirmedAnswers: answers,
      confirmedAnswerLabels: Object.fromEntries(form.questions.map((question) => [question.id, question.label])) });
  }, [sendChatMessage, skills]);

  const applySkillSelection = useCallback(async (skillIds: string[]) => {
    const names = skillIds.map((id) => skills.find((skill) => skill.id === id)?.name || id);
    return sendChatMessage({ text: names.length ? `请将当前方案使用的设计 Skills 调整为：${names.join('、')}。` : '请清除当前方案选择的设计 Skills。',
      skillIds, confirmedAnswers: {}, confirmedAnswerLabels: {} });
  }, [sendChatMessage, skills]);

  const retryAgentMessage = useCallback(async (messageId: string) => {
    if (chatSending) return;
    setChatSending(true);
    try {
      const snapshot = await request<DesignAgentSnapshot>(`/image-studio/projects/${projectId}/design-agent/messages/${messageId}/retry`, { method: 'POST', body: '{}' });
      applyAgentSnapshot(snapshot, true);
      if (snapshot.status !== 'processing') setChatSending(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : '重试失败'); setChatSending(false); }
  }, [applyAgentSnapshot, chatSending, projectId]);

  const loadEarlierMessages = useCallback(async () => {
    if (!agentSession?.beforeSeq || loadingEarlier) return;
    setLoadingEarlier(true);
    const container = requirementsScrollRef.current;
    const previousHeight = container?.scrollHeight || 0;
    try {
      const snapshot = await request<DesignAgentSnapshot>(`/image-studio/projects/${projectId}/design-agent/conversation?beforeSeq=${agentSession.beforeSeq}`);
      applyAgentSnapshot(snapshot);
      setAgentSession((current) => current ? { ...current, hasMore: snapshot.hasMore, beforeSeq: snapshot.beforeSeq } : current);
      requestAnimationFrame(() => { if (container) container.scrollTop += container.scrollHeight - previousHeight; });
    } catch (error) { toast.error(error instanceof Error ? error.message : '加载失败'); }
    finally { setLoadingEarlier(false); }
  }, [agentSession?.beforeSeq, applyAgentSnapshot, loadingEarlier, projectId]);

  const openAgentPanel = useCallback(async (panel: 'memory' | 'history') => {
    setAgentPanel(panel);
    if (panel === 'history') {
      try { setPlanHistory(await request<DesignAgentRevision[]>(`/image-studio/projects/${projectId}/design-agent/revisions`)); }
      catch (error) { toast.error(error instanceof Error ? error.message : '历史方案加载失败'); }
    }
  }, [projectId]);

  const uploadProductImages = useCallback(async (fileList: FileList | File[] | null) => {
    const files = Array.from(fileList || []);
    if (!files.length || uploadingAssets) return;
    setUploadingAssets(true);
    try {
      for (const file of files) {
        if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 100 * 1024 * 1024) {
          throw new Error('仅支持 100 MB 以内的 PNG、JPEG、WebP 或 GIF 图片');
        }
        const signed = await request<{ assetId: string; uploadUrl: string; contentType: string }>('/upload/presign', {
          method: 'POST', body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, folder: 'image-studio' }),
        });
        const uploaded = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': signed.contentType }, body: file, redirect: 'error' });
        if (!uploaded.ok) throw new Error(`「${file.name}」上传失败`);
        await request('/upload/complete', { method: 'POST', body: JSON.stringify({ assetId: signed.assetId }) });
        const attached = await request<Asset>(`/image-studio/projects/${projectId}/assets`, { method: 'POST', body: JSON.stringify({ mediaAssetId: signed.assetId, role: 'product' }) });
        setPendingAssetIds((current) => [...new Set([...current, attached.id])]);
      }
      setAssets(await request<Asset[]>(`/image-studio/projects/${projectId}/assets`));
        toast.success(`已添加 ${files.length} 张参考图片`);
    } catch (error) { toast.error(error instanceof Error ? error.message : '素材上传失败'); }
    finally { setUploadingAssets(false); if (assetInputRef.current) assetInputRef.current.value = ''; }
  }, [projectId, uploadingAssets]);


  const findTaskJob = useCallback((task: DesignTask, plan: SavedPlan | null, jobList = jobs) => {
    if (!plan) return undefined;
    const saved = taskStates[studioTaskKey(plan, task)];
    if (saved?.status === 'stale') return undefined;
    return (saved?.jobId ? jobList.find((job) => job.id === saved.jobId) : undefined)
      || jobList.find((job) => (!job.context?.planVersion || job.context.planVersion === plan.version) && job.id !== saved?.previousJobId
        && (job.context?.taskId === task.id || job.generations?.some((generation) => generation.slotKey.startsWith(`${task.id}-`))));
  }, [jobs, taskStates]);

  const nodePosition = useCallback((existingId?: string) => {
    const canvas = useCanvasStore.getState().projects.find((item) => item.id === canvasProjectId);
    const existing = existingId ? canvas?.nodes.find((node) => node.id === existingId) : undefined;
    if (existing) return existing.position;
    const nodes = canvas?.nodes || [];
    const right = nodes.reduce((max, node) => Math.max(max, node.position.x + node.width), 0);
    const row = nodes.filter((node) => node.metadata?.workbenchJobId || node.metadata?.workbenchTaskId).length;
    return { x: right ? right + 96 : 40, y: 80 + (row % 3) * 300 };
  }, [canvasProjectId]);

  const prepareProductionCanvas = useCallback(() => {
    if (!savedPlan || savedPlan.status !== 'approved') throw new Error('请先确认设计方案');
    const canvas = useCanvasStore.getState().projects.find((item) => item.id === canvasProjectId);
    if (!canvas) throw new Error('画布尚未准备好');
    const right = canvas.nodes.reduce((max, node) => Math.max(max, node.position.x + node.width), 0);
    const currentWorkbench = projectRef.current?.workflow?.workbench || {};
    const additions = createPlanCanvasNodes(savedPlan, tasks, canvas.nodes, { x: right ? right + 260 : 240, y: 240 }, true, currentWorkbench.taskStates || {}, { logoSymbolOnly: currentWorkbench.logoSymbolOnlyByPlan?.[savedPlan.version] === true });
    return { ...canvas, nodes: [...canvas.nodes, ...additions.nodes], connections: [...canvas.connections, ...additions.connections], additions };
  }, [canvasProjectId, savedPlan, tasks]);

  const productionStarted = Boolean(savedPlan && (project?.workflow?.workbench?.productionStarts?.[savedPlan.version]
    || jobs.some((job) => Number(job.context?.planVersion) === savedPlan.version)));
  const productionCompleted = isProductionComplete({ planVersion: savedPlan?.version, productionStarted, completedRunVersion, isRunning: batchRunning, tasks, taskStates });
  useEffect(() => {
    if (!canvasReady || !canvasProjectId || savedPlan?.status !== 'approved' || !productionStarted) return;
    const result = prepareProductionCanvas().additions;
    if (result.nodes.length || result.connections.length) publishWorkbenchCanvasCommand({ type: 'upsert-nodes', projectId: canvasProjectId, ...result });
  }, [canvasProjectId, canvasReady, savedPlan?.status, productionStarted, prepareProductionCanvas]);

  useEffect(() => {
    if (!canvasReady || !savedPlan || !productionStarted) return;
    const canvas = useCanvasStore.getState().projects.find((item) => item.id === canvasProjectId);
    const nodes = (canvas?.nodes || []).flatMap((node) => {
      if (node.metadata?.artifactType !== 'generated-image' || node.metadata.content || node.metadata.status !== 'idle' || node.metadata.workbenchPlanVersion !== savedPlan.version) return [];
      const task = tasks.find((item) => item.id === node.metadata?.workbenchTaskId);
      if (!task) return [];
      const message = imageTaskWaitMessage(savedPlan.version, task, tasks, taskStates);
      return node.metadata.workbenchStatusMessage === message ? [] : [{ ...node, metadata: { ...node.metadata, workbenchStatusMessage: message } }];
    });
    if (nodes.length) publishWorkbenchCanvasCommand({ type: 'upsert-nodes', projectId: canvasProjectId, nodes });
  }, [canvasReady, canvasProjectId, productionStarted, savedPlan, tasks, taskStates]);

  const buildImageNode = useCallback((job: Job, generation: JobGeneration, task: DesignTask, canvasNodes: ReturnType<typeof createCanvasNode>[]) => {
    const id = imageNodeId(Number(job.context?.planVersion || 0), generation.slotKey);
    const current = canvasNodes.find((node) => node.id === id);
    if (current?.metadata?.workbenchJobId !== job.id && current?.metadata?.workbenchJobCreatedAt && job.createdAt
      && Date.parse(current.metadata.workbenchJobCreatedAt) > Date.parse(job.createdAt)) return current;
    const sourcePrompt = canvasNodes.find((node) => node.id === promptNodeId(Number(job.context?.planVersion || 0), generation.slotKey));
    const existingVersions = canvasNodes.filter((node) => node.id !== id && node.metadata?.artifactType === 'generated-image' && node.metadata.workbenchSlotKey === generation.slotKey && node.metadata.workbenchPlanVersion === Number(job.context?.planVersion || 0)).length;
    const basePosition = current?.position || (sourcePrompt ? { x: sourcePrompt.position.x + sourcePrompt.width + 240 + existingVersions * 380, y: sourcePrompt.position.y + sourcePrompt.height / 2 } : nodePosition());
    const generationIndex = Math.max(0, job.generations?.findIndex((item) => item.id === generation.id) ?? 0);
    const position = current?.position || {
      x: basePosition.x + (sourcePrompt ? 0 : (generationIndex % 3) * 340),
      y: basePosition.y + (sourcePrompt ? 0 : Math.floor(generationIndex / 3) * 360),
    };
    const status = generation.status === 'completed' && generation.outputAssetId ? 'success'
      : generation.status === 'failed' ? 'error'
        : ['queued', 'running'].includes(generation.status) ? 'loading' : 'idle';
    const content = generation.previewUrl || (generation.outputAssetId ? `/api/image-studio/assets/${encodeURIComponent(generation.outputAssetId)}/preview` : '');
    const node = createCanvasNode(CanvasNodeType.Image, position, {
      content, status, prompt: generation.prompt, generationType: 'generation', generationMode: 'image',
      mimeType: 'image/png', naturalWidth: 1024, naturalHeight: 1024,
      ...(generation.outputAssetId ? { storageKey: `studio-image-asset:${generation.outputAssetId}`, imageStudioAssetId: generation.outputAssetId } : {}),
      ...(generation.error?.message ? { errorDetails: generation.error.message } : {}),
      workbenchTaskId: task.id, workbenchJobId: job.id, workbenchJobCreatedAt: job.createdAt, workbenchSlotKey: generation.slotKey, workbenchPlanVersion: Number(job.context?.planVersion || 0), artifactType: 'generated-image',
    });
    return { ...node, id, title: current?.title || generation.slotKey, position, width: current?.width || node.width, height: current?.height || node.height };
  }, [nodePosition]);

  const buildImageArtifacts = useCallback((job: Job, task: DesignTask) => {
    const canvas = job.context?.planVersion === savedPlan?.version && savedPlan?.status === 'approved'
      ? prepareProductionCanvas() : useCanvasStore.getState().projects.find((item) => item.id === canvasProjectId);
    const images = (job.generations || []).map((generation) => buildImageNode(job, generation, task, canvas?.nodes || []));
    const prompts = (job.generations || []).flatMap((generation, index) => {
      const prompt = canvas?.nodes.find((node) => node.id === promptNodeId(Number(job.context?.planVersion || 0), generation.slotKey));
      // Bind the actual submitted prompt once; later progress events must preserve user edits.
      if (!prompt || !generation.prompt?.trim() || prompt.metadata?.workbenchJobId === job.id || images[index]?.metadata?.workbenchJobId !== job.id) return [];
      return [{ ...prompt, metadata: { ...prompt.metadata, content: generation.prompt, workbenchJobId: job.id } }];
    });
    return [...prompts, ...images];
  }, [buildImageNode, canvasProjectId, prepareProductionCanvas, savedPlan?.version, savedPlan?.status]);

  const buildSvgNode = useCallback((job: Job, task: DesignTask) => {
    const svg = getSvgSource(job.result);
    if (!svg) return null;
    const id = `svg-${job.id}`;
    const current = useCanvasStore.getState().projects.find((item) => item.id === canvasProjectId)?.nodes.find((node) => node.id === id);
    const result = job.result && typeof job.result === 'object' ? job.result as Record<string, unknown> : {};
    const title = typeof result.title === 'string' && result.title.trim() ? result.title.trim().slice(0, 120) : task.title;
    const savedPreview = current?.metadata?.svgSource === svg && current.metadata.storageKey && current.metadata.content;
    const node = createCanvasNode(CanvasNodeType.Image, current?.position || nodePosition(), {
      content: savedPreview || `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, mimeType: savedPreview ? current?.metadata?.mimeType || 'image/png' : 'image/svg+xml', svgSource: svg,
      ...(savedPreview ? { storageKey: current?.metadata?.storageKey } : {}),
      status: 'success', generationType: 'generation', generationMode: 'image', prompt: task.reason,
      workbenchTaskId: task.id, workbenchJobId: job.id, artifactType: 'generated-svg',
    });
    return { ...node, id, title: current?.title || title, position: current?.position || node.position, width: current?.width || node.width, height: current?.height || node.height };
  }, [canvasProjectId, nodePosition]);

  const restoreTaskArtifacts = useCallback((jobList: Job[]) => {
    if (!canvasReady || !canvasProjectId || !savedPlan) return;
    for (const task of tasks) {
      const job = findTaskJob(task, savedPlan, jobList);
      if (!job) continue;
      const nodes = job.generations?.length
        ? buildImageArtifacts(job, task)
        : task.kind === 'svg_generation' ? (job.status === 'completed' ? [buildSvgNode(job, task)].filter((node): node is NonNullable<typeof node> => Boolean(node)) : [])
          : [];
      if (nodes.length) publishWorkbenchCanvasCommand({ type: 'upsert-nodes', projectId: canvasProjectId, nodes,
          connections: (job.generations || []).filter((generation) => {
            const existing = useCanvasStore.getState().projects.find((item) => item.id === canvasProjectId)?.nodes || [];
            return !existing.some((node) => node.id === promptNodeId(Number(job.context?.planVersion || 0), generation.slotKey))
              || !existing.some((node) => node.id === imageNodeId(Number(job.context?.planVersion || 0), generation.slotKey));
          }).map((generation) => ({ id: `link-${generation.id}`, fromNodeId: promptNodeId(Number(job.context?.planVersion || 0), generation.slotKey), toNodeId: imageNodeId(Number(job.context?.planVersion || 0), generation.slotKey) })) });
    }
  }, [buildImageArtifacts, buildSvgNode, canvasProjectId, canvasReady, findTaskJob, savedPlan, tasks]);

  useEffect(() => { restoreTaskArtifacts(jobs); }, [jobs, restoreTaskArtifacts]);

  const saveReview = useCallback(async (item: Review, patch: { selected?: boolean; locked?: boolean }) => {
    try {
      const updated = await request<Review>(`/image-studio/projects/${projectId}/generations/${item.id}/review`, {
        method: 'PATCH', body: JSON.stringify({ selected: patch.selected ?? item.selected, locked: patch.locked ?? item.locked, version: item.reviewVersion }),
      });
      setReviews((current) => current.map((review) => review.id === item.id ? { ...review, selected: updated.selected, locked: updated.locked, reviewVersion: updated.reviewVersion } : review));
      if (patch.selected !== undefined && (savedPlan?.mode || designMode) === 'brand' && item.outputAssetId) {
        await persistWorkflow((workflow) => {
          const kit = workflow.brandKit && typeof workflow.brandKit === 'object' ? workflow.brandKit : {};
          const assets = Array.isArray(kit.assets) ? kit.assets.filter((asset: { assetId?: string }) => asset.assetId !== item.outputAssetId) : [];
          if (updated.selected) assets.push({ assetId: item.outputAssetId, label: item.filename || item.slotKey, role: 'approved-brand-asset' });
          return { ...workflow, brandKit: { ...kit, assets, version: Number(kit.version || 1) + 1, updatedAt: new Date().toISOString() } };
        });
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : '审稿状态保存失败'); }
  }, [designMode, persistWorkflow, projectId, savedPlan?.mode]);

  const refreshJob = useCallback(async (jobId: string) => {
    const job = await request<Job>(`/image-studio/jobs/${jobId}`);
    setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
    const plan = parsePlan(projectRef.current);
    if (!plan) return job;
    for (const task of tasks) {
      const currentStates = (projectRef.current?.workflow?.workbench?.taskStates || {}) as Record<string, TaskState>;
      const currentState = currentStates[studioTaskKey(plan, task)];
      const storedJobVersions = Object.entries(currentStates).filter(([key, state]) => key.endsWith(`:${task.id}`) && state.jobId === job.id)
        .map(([key]) => Number(key.split(':')[0])).filter(Number.isFinite);
      const jobPlanVersion = Number(job.context?.planVersion || (storedJobVersions.length ? Math.min(...storedJobVersions) : undefined)
        || (currentState?.previousJobId === job.id ? currentState.previousPlanVersion : undefined) || plan.version);
      const previous = currentStates[`${jobPlanVersion}:${task.id}`];
      const belongs = previous?.jobId === job.id || job.context?.taskId === task.id || job.generations?.some((generation) => generation.slotKey.startsWith(`${task.id}-`));
      if (!belongs) continue;
      const missingImageOutput = task.kind === 'image_generation' && job.status === 'completed' && !job.generations?.some((generation) => generation.status === 'completed' && generation.outputAssetId);
      const invalidSvgOutput = task.kind === 'svg_generation' && job.status === 'completed' && !getSvgSource(job.result);
      const outputError = missingImageOutput ? '生图任务已结束，但模型没有返回可用图片；请检查图片模型配置或任务日志后重试。'
        : invalidSvgOutput ? '模型未返回有效的 SVG 矢量源码；请重试或更换方案与文案模型。' : undefined;
      const completedSlots = new Set((useCanvasStore.getState().projects.find((item) => item.id === canvasProjectId)?.nodes || [])
        .filter((node) => node.metadata?.artifactType === 'generated-image' && node.metadata.workbenchPlanVersion === jobPlanVersion && node.metadata.status === 'success' && node.metadata.workbenchSlotKey)
        .map((node) => node.metadata!.workbenchSlotKey!));
      for (const generation of job.generations || []) if (generation.status === 'completed' && generation.outputAssetId) completedSlots.add(generation.slotKey);
      const incompleteSet = task.kind === 'image_generation' && jobPlanVersion === plan.version && taskSlots(task, plan).some((slot) => !completedSlots.has(slot.slotKey));
      const nextStatus: TaskState['status'] = outputError ? 'failed' : job.status === 'completed' ? incompleteSet ? 'partial' : 'completed'
        : job.status === 'partial' ? 'partial'
          : job.status === 'failed' || job.status === 'cancelled' ? 'failed'
            : job.status === 'queued' ? 'queued' : 'running';
      if (previous?.status !== nextStatus || previous?.jobId !== job.id) {
        await persistTaskState(task, { ...previous, roundId: typeof job.context?.roundId === 'string' ? job.context.roundId : previous?.roundId, jobId: job.id, status: nextStatus, error: outputError || job.error?.message }, jobPlanVersion);
      }
      const nodes = job.generations?.length ? buildImageArtifacts(job, task)
        : task.kind === 'svg_generation' ? (job.status === 'completed' ? [buildSvgNode(job, task)].filter((node): node is NonNullable<typeof node> => Boolean(node)) : [])
          : [];
      if (nodes.length && canvasProjectId) publishWorkbenchCanvasCommand({ type: 'upsert-nodes', projectId: canvasProjectId, nodes,
        connections: (job.generations || []).filter((generation) => {
          const existing = useCanvasStore.getState().projects.find((item) => item.id === canvasProjectId)?.nodes || [];
          return !existing.some((node) => node.id === promptNodeId(Number(job.context?.planVersion || 0), generation.slotKey))
            || !existing.some((node) => node.id === imageNodeId(Number(job.context?.planVersion || 0), generation.slotKey));
        }).map((generation) => ({ id: `link-${generation.id}`, fromNodeId: promptNodeId(Number(job.context?.planVersion || 0), generation.slotKey), toNodeId: imageNodeId(Number(job.context?.planVersion || 0), generation.slotKey) })) });
    }
    if (job.generations?.length && ['completed', 'partial', 'failed'].includes(job.status)) await refreshReviews();
    return job;
  }, [buildImageArtifacts, buildSvgNode, canvasProjectId, persistTaskState, refreshReviews, taskStates, tasks]);

  const refreshJobRef = useRef(refreshJob);
  refreshJobRef.current = refreshJob;

  useEffect(() => {
    let socket: Socket | null = null;
    const origin = process.env.NODE_ENV === 'development'
      ? window.location.protocol + '//' + window.location.hostname + ':8080'
      : window.location.origin;
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || origin, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      auth: async (callback) => {
        try {
          const ticket = await request<{ ticket: string }>('/image-studio/socket-ticket', { method: 'POST', body: '{}' });
          callback({ ticket: ticket.ticket });
        } catch (error) {
          console.warn('[Image Studio] 无法获取实时连接凭证', error);
          callback({ ticket: '' });
        }
      },
    });
    socket.on('connect', () => { setConnected(true); setOrchestrationRefresh((value) => value + 1); });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (error) => {
      setConnected(false);
      console.warn('[Image Studio] 实时连接失败', error.message);
      if (/鉴权|凭证|账号已失效/.test(error.message)) socket?.disconnect();
    });
    socket.on('image-studio:job:update', (event: { projectId?: string; jobId?: string; orchestrationRunId?: string }) => {
      if (event.projectId === projectId && event.orchestrationRunId) setOrchestrationRefresh((value) => value + 1);
      if (event.projectId === projectId && event.jobId) void refreshJobRef.current(event.jobId).catch(() => undefined);
    });
    return () => { socket?.disconnect(); };
  }, [projectId]);

  useEffect(() => {
    if (connected || !jobs.some((job) => ['queued', 'running', 'cancelling'].includes(job.status))) return;
    const timer = window.setInterval(() => {
      for (const job of jobs.filter((item) => ['queued', 'running', 'cancelling'].includes(item.status))) {
        void refreshJobRef.current(job.id).catch(() => undefined);
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [connected, jobs]);

  const executeTask = useCallback(async (task: DesignTask, execution: TaskExecutionOptions = {}) => {
    if (backendRunPresent) { toast.info('请在后台制作计划中确认、重试或停止任务'); return; }
    if (!savedPlan || runningTaskIdRef.current || modelsSaving) return;
    if (savedPlan.status !== 'approved') { toast.error('请先确认设计方案，再开始制作'); return; }
    const stateKey = studioTaskKey(savedPlan, task);
    const latestTaskStates = ((projectRef.current?.workflow?.workbench || {}) as { taskStates?: Record<string, TaskState> }).taskStates || {};
    const prior = latestTaskStates[stateKey];
    const executionVersion = savedPlan.version;
    const saveExecutionState = (state: TaskState) => persistTaskState(task, { ...state, roundId: execution.roundId || execution.runId }, executionVersion);
    const idempotencyKey = execution.runId ? `agent:${execution.runId}:${task.id}` : crypto.randomUUID();
    if (prior && ['queued', 'running'].includes(prior.status)) return;
    const unsatisfied = task.dependsOn.find((dependency) => latestTaskStates[`${savedPlan.version}:${dependency}`]?.status !== 'completed');
    if (unsatisfied) {
      toast.error(`请先完成前置任务：${tasks.find((item) => item.id === unsatisfied)?.title || unsatisfied}`);
      return;
    }
    if (task.kind === 'image_generation' && savedPlan.status !== 'approved') {
      toast.error('请先选择并确认一个视觉方向');
      return;
    }
    if (task.kind === 'image_generation' && planMode === 'product' && !assets.some((asset) => asset.role === 'product' && asset.kind === 'image')) {
      toast.error('还没有商品原图。请先在项目素材中添加商品图片。');
      return;
    }
    if (task.kind === 'image_generation' && !imageProfile) {
      toast.error('请先完成图片生成设置。');
      return;
    }
    runningTaskIdRef.current = task.id;
    setRunningTaskId(task.id);
    try {
      const productionCanvas = prepareProductionCanvas();
      await persistWorkflow((workflow) => {
        if (workflow.designAgent?.version !== executionVersion || workflow.designAgent?.status !== 'approved') throw new Error('设计方案已变化，请重新确认');
        return { ...workflow, workbench: { ...workflow.workbench, productionStarts: { ...workflow.workbench?.productionStarts,
          [executionVersion]: workflow.workbench?.productionStarts?.[executionVersion] || { startedAt: new Date().toISOString() } } } };
      });
      publishWorkbenchCanvasCommand({ type: 'upsert-nodes', projectId: canvasProjectId, ...productionCanvas.additions });
      await saveExecutionState({ status: 'queued' });
      if (task.kind === 'direction') {
        if (!selectedDirection) throw new Error('请先选择视觉方向');
        await saveExecutionState({ status: 'completed', result: `${selectedDirection.name}\n${selectedDirection.concept}` });
        return;
      }
      const autoBrandGuidelines = task.kind === 'manual' && planMode === 'brand' && /品牌.{0,8}规范|视觉.{0,8}规范|识别.{0,8}规范/.test(task.title);
      if (task.kind === 'manual' && !autoBrandGuidelines) {
        await saveExecutionState({ status: 'completed', result: '已跳过人工确认；未执行人工核验。' });
        return;
      }
      if (task.kind === 'review') {
        const referenceAssetIds = [...new Set(reviews.filter((review) => review.status === 'completed' && review.outputAssetId).map((review) => review.outputAssetId!))].slice(0, 12);
        if (!referenceAssetIds.length || !visionProfile) throw new Error('自动审稿需要已生成的图片和可用的图片理解模型');
        const accepted = await request<{ id: string }>('/image-studio/projects/' + projectId + '/ai-tasks', {
          method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ modelProfileId: visionProfile.id, operation: 'design_review', referenceAssetIds,
            context: { taskId: task.id, roundId: execution.roundId || execution.runId, planVersion: executionVersion, designMode: planMode, designBrief: savedPlan.plan.brief, visualDirection: selectedDirection, outputs: task.outputs } }),
        });
        await saveExecutionState({ status: 'queued', jobId: accepted.id });
        return;
      }
      if (task.kind === 'delivery') {
        if (!reviews.some((review) => review.selected && review.outputAssetId)) throw new Error('请先在对话中的生成结果里选择成品');
        const accepted = await request<{ id: string; jobId: string }>('/image-studio/projects/' + projectId + '/exports', { method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: '{}' });
        await saveExecutionState({ status: 'queued', jobId: accepted.jobId, exportId: accepted.id });
        const job = await request<Job>(`/image-studio/jobs/${accepted.jobId}`);
        setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
        return;
      }
      if (task.kind === 'research') {
        if (!textProfile) throw new Error('请先选择可用的方案与文案模型');
        const query = [savedPlan.plan.brief.productOrService, savedPlan.plan.brief.marketAndChannel, selectedDirection?.name, task.title].filter(Boolean).join(' ');
        const result = await request<{ project: Project; research: { summary: string; sources: Array<{ title: string; url: string; excerpt: string }> } }>(`/image-studio/projects/${projectId}/design-agent/research`, { method: 'POST', body: JSON.stringify({ query: query.slice(0, 220), modelProfileId: textProfile.id }) });
        setCurrentProject(result.project);
        await saveExecutionState({ status: 'completed', result: result.research.summary || '商品与风格调研已完成。' });
        await refreshProjectJobs().catch(() => undefined);
        return;
      }
      const operationByKind: Partial<Record<DesignTask['kind'], string>> = { analysis: 'product_analyze', storyboard: 'storyboard', copywriting: 'copy_generate', prompting: 'prompt_generate', ...(autoBrandGuidelines ? { manual: 'copy_generate' } : {}) };
      if (task.kind === 'svg_generation') {
        if (!textProfile) throw new Error('请先选择可用的方案与文案模型');
        const accepted = await request<{ id: string }>('/image-studio/projects/' + projectId + '/ai-tasks', {
          method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ modelProfileId: textProfile.id, operation: 'svg_generate',
            context: { taskId: task.id, roundId: execution.roundId || execution.runId, planVersion: executionVersion, memoryRevision: agentSession?.revision, instruction: execution.instruction, taskTitle: task.title, taskReason: task.reason, inputs: task.inputs, outputs: task.outputs,
              projectName: project?.name, designMode: 'brand', designBrief: savedPlan.plan.brief, visualDirection: selectedDirection,
              brandKit: project?.workflow?.brandKit, projectMemory: agentSession?.memory, answers: savedPlan.answers, skillIds: task.skillIds,
              skillSnapshot: task.skillIds.map((id) => savedPlan.plan.recommendedSkills.find((item) => item.skillId === id)).filter(Boolean) } }),
        });
        await saveExecutionState({ status: 'queued', jobId: accepted.id });
        const job = await request<Job>(`/image-studio/jobs/${accepted.id}`);
        setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
        return;
      }
      if (task.kind === 'image_generation') {
        const slots = taskSlots(task, savedPlan);
        const selectedSlots = execution.slotKeys?.length ? slots.filter((slot) => execution.slotKeys!.includes(slot.slotKey)) : slots;
        if (!selectedSlots.length || (execution.slotKeys?.length && selectedSlots.length !== execution.slotKeys.length)) throw new Error('所选画面不属于当前方案，请重新选择提示词节点');
        const canvas = productionCanvas;
        const prompts = selectedSlots.map((slot) => ({ ...slot, prompt: readConnectedPrompt(savedPlan, slot.slotKey, canvas.nodes, canvas.connections) }));
        const productAssets = assets.filter((asset) => asset.role === 'product' && asset.kind === 'image').slice(0, 12);
        const brandKit = project?.workflow?.brandKit || {};
        const isBrandMode = planMode === 'brand';
        const generationReferenceIds = savedPlan.plan.logoExploration?.taskId === task.id ? savedPlan.plan.logoExploration.referenceAssetIds : [...new Set([
          ...productAssets.map((asset) => asset.id),
          ...Object.entries(agentSession?.memory.fields || {}).filter(([key, fact]) => key.startsWith('asset.') && fact.status === 'confirmed').map(([, fact]) => fact.value),
          ...(isBrandMode && Array.isArray(brandKit.assets) ? brandKit.assets.map((asset: { assetId?: string }) => asset.assetId).filter((id: unknown): id is string => typeof id === 'string') : []),
        ])].slice(0, 12);
        const sizes = Array.isArray(imageProfile?.options?.sizes) ? imageProfile.options!.sizes as string[] : [];
        const qualities = Array.isArray(imageProfile?.options?.qualityLevels) ? imageProfile.options!.qualityLevels as string[] : [];
        const generationSize = sizes.find((size) => size !== 'auto') || sizes[0] || '1024x1024';
        const generationQuality = qualities[0] || 'auto';
        const accepted = await request<{ id: string }>('/image-studio/projects/' + projectId + '/jobs', {
          method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ modelProfileId: imageProfile!.id,
            skillIds: task.skillIds, context: { taskId: task.id, taskTitle: task.title, roundId: execution.roundId || execution.runId, planVersion: executionVersion, memoryRevision: agentSession?.revision, planSnapshot: savedPlan, instruction: execution.instruction || '', singleLogoSlots: prompts.filter((slot) => isLogoConceptSlot(task, slot.deliverable, savedPlan)).map((slot) => slot.slotKey) },
            generations: prompts.map(({ slotKey, prompt }) => {
              const slotRequirement = agentSession?.memory.fields[`slot.${slotKey}`];
              const adjustments = [slotRequirement?.status === 'confirmed' ? `本张专属调整：${slotRequirement.value}` : '', execution.instruction ? `本轮调整：${execution.instruction}` : ''].filter(Boolean).join('\n');
              return { slotKey, prompt: [prompt, adjustments].filter(Boolean).join('\n\n'),
                referenceAssetIds: [...new Set([...(execution.slotKeys?.length && execution.reusePrevious !== false ? jobs.flatMap((job) => job.generations || []).filter((generation) => generation.slotKey === slotKey && generation.outputAssetId).slice(0, 1).map((generation) => generation.outputAssetId!) : []), ...generationReferenceIds])].slice(0, 12), parameters: { size: generationSize, quality: generationQuality } };
            }) }),
        });
        await saveExecutionState({ status: 'queued', jobId: accepted.id });
        const job = await request<Job>(`/image-studio/jobs/${accepted.id}`);
        setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
        restoreTaskArtifacts([job]);
        return;
      }
      const operation = operationByKind[task.kind];
      if (!operation) throw new Error('此任务类型当前需要人工确认');
      const analysisImages = task.kind === 'analysis' ? assets.filter((asset) => asset.role === 'product' && asset.kind === 'image').slice(0, 12) : [];
      const taskTextProfile = analysisImages.length ? visionProfile : textProfile;
      if (!taskTextProfile) throw new Error(analysisImages.length ? '请先选择可用的图片理解模型' : '请先选择可用的方案与文案模型');
      const accepted = await request<{ id: string }>('/image-studio/projects/' + projectId + '/ai-tasks', {
        method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify({ modelProfileId: taskTextProfile.id, operation,
          context: { taskId: task.id, roundId: execution.roundId || execution.runId, planVersion: executionVersion, memoryRevision: agentSession?.revision, taskTitle: task.title, taskReason: task.reason, inputs: task.inputs, outputs: task.outputs, autoBrandGuidelines,
            projectName: project?.name, projectPlatform: project?.platform, designMode: planMode, brandKit: project?.workflow?.brandKit, designBrief: savedPlan.plan.brief,
            visualDirection: selectedDirection, answers: savedPlan.answers, skillIds: task.skillIds, skillSnapshot: task.skillIds.map((id) => savedPlan.plan.recommendedSkills.find((item) => item.skillId === id)).filter(Boolean) },
          referenceAssetIds: analysisImages.map((asset) => asset.id) }),
      });
      await saveExecutionState({ status: 'queued', jobId: accepted.id });
      const job = await request<Job>(`/image-studio/jobs/${accepted.id}`);
      setJobs((current) => [job, ...current.filter((item) => item.id !== job.id)]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '任务启动失败';
      await saveExecutionState({ status: 'failed', error: message }).catch(() => undefined);
      toast.error(message);
    } finally { runningTaskIdRef.current = null; setRunningTaskId(null); }
  }, [agentSession?.memory, agentSession?.revision, assets, backendRunPresent, canvasProjectId, designMode, imageProfile, jobs, modelsSaving, nodePosition, persistTaskState, persistWorkflow, prepareProductionCanvas, project, projectId, refreshProjectJobs, restoreTaskArtifacts, reviews, savedPlan, selectedDirection, setCurrentProject, taskStates, tasks, textProfile, visionProfile]);

  const executeTaskRef = useRef(executeTask);
  executeTaskRef.current = executeTask;
  const refreshJobRefForBatch = useRef<(jobId: string) => Promise<Job>>(async () => { throw new Error('任务状态尚未就绪'); });
  refreshJobRefForBatch.current = refreshJob;
  const batchRunRef = useRef(false);
  const pendingStartRef = useRef<{ signature: string; key: string } | null>(null);
  const latestRoundId = [...chatMessages].reverse().find((item) => item.role === 'assistant')?.runId || [...chatMessages].reverse().find((item) => item.role === 'assistant')?.id;
  const startAllTasks = useCallback(async (productionRunId?: string, roundId?: string) => {
    if (productionCompleted) { toast.info('当前方案已制作完成，可在画布查看结果'); return; }
    if (backendRunPresent) { toast.info('当前制作计划尚未结束，请在后台制作计划中确认、重试或查看进度'); return; }
    if (!savedPlan || batchRunRef.current || !canvasReady || savedPlan.status !== 'approved' || modelsSaving || runningTaskId) return;
    batchRunRef.current = true;
    setBatchRunning(true);
    setMobileTab('chat');
    const automaticKinds = new Set<DesignTask['kind']>(['research', 'analysis', 'direction', 'storyboard', 'copywriting', 'prompting', 'image_generation', 'svg_generation', 'manual', 'review']);
    const orderedTasks = [...tasks];
    const done = new Set<string>();
    const sorted: DesignTask[] = [];
    while (orderedTasks.length) {
      const index = orderedTasks.findIndex((task) => task.dependsOn.every((dependency) => done.has(dependency) || !tasks.some((item) => item.id === dependency)));
      if (index < 0) { sorted.push(...orderedTasks); break; }
      const [task] = orderedTasks.splice(index, 1);
      sorted.push(task);
      done.add(task.id);
    }
    let waitingForReview = false;
    try {
      if (backendScheduling) {
        const canvas = prepareProductionCanvas();
        const prompts = tasks.filter((task) => task.kind === 'image_generation').flatMap((task) => taskSlots(task, savedPlan).map((slot) => ({ taskId: task.id, slotKey: slot.slotKey, prompt: readConnectedPrompt(savedPlan, slot.slotKey, canvas.nodes, canvas.connections) })));
        const selectedRound = roundId || productionRunId || latestRoundId;
        const signature = JSON.stringify({ planVersion: savedPlan.version, roundId: selectedRound, prompts });
        if (!pendingStartRef.current || pendingStartRef.current.signature !== signature) pendingStartRef.current = { signature, key: productionRunId ? `production-${productionRunId}` : `production-${crypto.randomUUID()}` };
        await request(`/image-studio/projects/${projectId}/orchestrations`, { method: 'POST', body: JSON.stringify({ planVersion: savedPlan.version, idempotencyKey: pendingStartRef.current.key, roundId: selectedRound, prompts }) });
        pendingStartRef.current = null;
        setBackendRunPresent(true);
        setOrchestrationRefresh((value) => value + 1);
        publishWorkbenchCanvasCommand({ type: 'upsert-nodes', projectId: canvasProjectId, ...canvas.additions });
        const updatedProject = await request<Project>(`/image-studio/projects/${projectId}`).catch(() => null);
        if (updatedProject) setCurrentProject(updatedProject);
        toast.success('已交给后台制作，可关闭页面后返回查看');
        return;
      }
      for (const task of sorted) {
        const currentPlan = parsePlan(projectRef.current);
        if (!currentPlan || currentPlan.version !== savedPlan.version) throw new Error('制作方案已变化，请重新开始');
        const key = studioTaskKey(currentPlan, task);
        let state = ((projectRef.current?.workflow?.workbench || {}) as { taskStates?: Record<string, TaskState> }).taskStates?.[key];
        let missingSlots: string[] | undefined;
        if (state?.status === 'completed' || (task.kind === 'image_generation' && state?.status === 'partial')) {
          if (task.kind === 'image_generation' || task.kind === 'svg_generation') {
            const canvas = useCanvasStore.getState().projects.find((item) => item.id === canvasProjectId);
            const canvasNodes = canvas?.nodes || [];
            if (task.kind === 'image_generation') missingSlots = taskSlots(task, currentPlan).filter((slot) => !canvasNodes.some((node) => node.metadata?.artifactType === 'generated-image' && node.metadata.workbenchSlotKey === slot.slotKey && node.metadata.workbenchPlanVersion === currentPlan.version && node.metadata.status === 'success' && canvas?.connections.some((link) => link.fromNodeId === promptNodeId(currentPlan.version, slot.slotKey) && link.toNodeId === node.id))).map((slot) => slot.slotKey);
            const hasCanvasOutput = canvasNodes.some((node) => node.metadata?.workbenchTaskId === task.id
              && (task.kind === 'svg_generation' ? node.metadata?.artifactType === 'generated-svg' : node.metadata?.artifactType === 'generated-image'));
            const priorJob = findTaskJob(task, currentPlan);
            const hasJobOutput = task.kind === 'svg_generation' ? Boolean(getSvgSource(priorJob?.result))
              : Boolean(priorJob?.generations?.some((generation) => generation.outputAssetId));
            if (task.kind === 'image_generation' ? missingSlots?.length === 0 : hasCanvasOutput || hasJobOutput) continue;
            await persistTaskState(task, { ...state, status: 'idle', error: undefined });
            state = undefined;
          } else continue;
        }
        if (!automaticKinds.has(task.kind)) {
          waitingForReview = true;
          setBatchTaskTitle(`待确认：${task.title}`);
          if (!state || state.status === 'idle') await persistTaskState(task, { status: 'blocked', roundId: roundId || productionRunId });
          continue;
        }
        const unmet = task.dependsOn.find((dependency) => ((projectRef.current?.workflow?.workbench || {}) as { taskStates?: Record<string, TaskState> }).taskStates?.[`${currentPlan.version}:${dependency}`]?.status !== 'completed');
        if (unmet) {
          waitingForReview = true;
          const dependencyTitle = tasks.find((item) => item.id === unmet)?.title || unmet;
          setBatchTaskTitle(`等待前置确认：${dependencyTitle}`);
          await persistTaskState(task, { ...state, roundId: roundId || productionRunId, status: 'blocked', error: `等待前置任务完成：${dependencyTitle}` });
          continue;
        }
        if (task.kind === 'image_generation' && currentPlan.status !== 'approved') throw new Error('请先选择并确认视觉方向');
        setBatchTaskTitle(task.title);
        if (!state || !['queued', 'running'].includes(state.status)) await executeTaskRef.current(task, { ...(productionRunId ? { runId: productionRunId } : {}), roundId: roundId || productionRunId, ...(missingSlots?.length ? { slotKeys: missingSlots, reusePrevious: false } : {}) });
        state = ((projectRef.current?.workflow?.workbench || {}) as { taskStates?: Record<string, TaskState> }).taskStates?.[key];
        if (!state || state.status === 'idle' || (['queued', 'running'].includes(state.status) && !state.jobId)) {
          throw new Error(`${task.title}未能启动，请检查模型设置、画布节点及前置任务后重试`);
        }
        const waitStarted = Date.now();
        while (Date.now() - waitStarted < 30 * 60 * 1000) {
          state = ((projectRef.current?.workflow?.workbench || {}) as { taskStates?: Record<string, TaskState> }).taskStates?.[key];
          if (state?.status === 'completed') break;
          if (state?.status === 'failed' || state?.status === 'partial' || state?.status === 'blocked') throw new Error(state.error || `${task.title}未能完成，请检查任务消息`);
          if (state?.jobId) {
            const job = await request<Job>(`/image-studio/jobs/${state.jobId}`);
            await refreshJobRefForBatch.current(job.id);
            if (job.status === 'failed' || job.status === 'partial' || job.status === 'cancelled') throw new Error(job.error?.message || `${task.title}未能完成`);
          }
          await new Promise((resolve) => window.setTimeout(resolve, 2000));
        }
        if (state?.status !== 'completed') throw new Error(`${task.title}等待超时，可以再次点击继续`);
        if (task.kind === 'image_generation') {
          setMobileTab('canvas');
          const imageNode = useCanvasStore.getState().projects.find((item) => item.id === canvasProjectId)?.nodes
            .find((node) => node.metadata?.workbenchTaskId === task.id && node.type === CanvasNodeType.Image);
          if (imageNode) publishWorkbenchCanvasCommand({ type: 'focus-node', projectId: canvasProjectId, nodeId: imageNode.id });
        }
      }
      setBatchTaskTitle('');
      if (waitingForReview) toast.success('可自动执行的任务已按顺序完成；待确认步骤已保留，请在任务卡片继续');
      else toast.success('制作计划已完成');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '制作计划执行失败');
    } finally {
      batchRunRef.current = false;
      setBatchRunning(false);
      setBatchTaskTitle('');
    }
  }, [backendRunPresent, backendScheduling, canvasProjectId, canvasReady, latestRoundId, modelsSaving, persistTaskState, prepareProductionCanvas, productionCompleted, projectId, runningTaskId, savedPlan, setCurrentProject, tasks]);

  const runAgentAction = useCallback(async (action: DesignAgentAction, runId: string) => {
    if (batchRunning || runningTaskId) { toast.info('当前正在制作，新的要求会在本轮完成后执行'); return; }
    if (action.taskId === '*') { await startAllTasks(runId); return; }
    const task = tasks.find((item) => item.id === action.taskId);
    if (!task) { toast.error('这项制作任务已更新，请重新发送制作要求'); return; }
    await executeTask(task, { runId, roundId: runId, slotKeys: action.slotKeys, instruction: action.instruction });
  }, [batchRunning, executeTask, runningTaskId, startAllTasks, tasks]);

  useEffect(() => {
    if (!pendingAgentActions || batchRunning || runningTaskId || jobs.some((job) => ['queued', 'running', 'cancelling'].includes(job.status))) return;
    const [action, ...remaining] = pendingAgentActions.actions;
    setPendingAgentActions(remaining.length ? { ...pendingAgentActions, actions: remaining } : null);
    if (action) void runAgentAction(action, pendingAgentActions.runId);
  }, [batchRunning, jobs, pendingAgentActions, runAgentAction, runningTaskId]);

  const onSourceConversationChange = useCallback((id: string) => setActiveSourceId(id), []);
  const onPlanApproved = useCallback(async () => {}, []);

  const focusTask = useCallback((task: DesignTask) => {
    const job = findTaskJob(task, savedPlan);
    const canvas = useCanvasStore.getState().projects.find((item) => item.id === canvasProjectId);
    const node = canvas?.nodes.find((item) => item.metadata?.workbenchTaskId === task.id || (job && item.metadata?.workbenchJobId === job.id));
    if (node) publishWorkbenchCanvasCommand({ type: 'focus-node', projectId: canvasProjectId, nodeId: node.id });
    setMobileTab('canvas');
  }, [canvasProjectId, findTaskJob, savedPlan]);

  const createExport = useCallback(async (task: DesignTask) => {
    try { await executeTask(task); }
    catch (error) { toast.error(error instanceof Error ? error.message : '交付任务失败'); }
  }, [executeTask]);

  const productionMessages: WorkbenchTaskMessage[] = savedPlan ? tasks.map((task) => {
    const state = taskStates[studioTaskKey(savedPlan, task)] as TaskState | undefined;
    const job = findTaskJob(task, savedPlan);
    const dependencies = task.dependsOn.filter((id) => taskStates[`${savedPlan.version}:${id}`]?.status !== 'completed');
      const needsApproval = ['direction', 'storyboard', 'copywriting', 'prompting', 'image_generation', 'svg_generation'].includes(task.kind) && savedPlan.status !== 'approved';
    const needsVision = task.kind === 'analysis' && hasProductImage && !visionProfile;
    const isBusy = Boolean(state && ['queued', 'running'].includes(state.status));
    const disabledReason = modelsSaving ? '正在保存模型'
      : planGenerateAction?.busy ? '正在完善需求文档'
        : !canvasReady ? '正在打开画布'
          : isBusy ? '任务正在执行'
            : runningTaskId ? '请等待当前任务完成'
              : dependencies.length ? `先完成：${dependencies.map((id) => tasks.find((item) => item.id === id)?.title || id).join('、')}`
              : needsApproval ? '先确认视觉方向'
                : needsVision ? '请选择图片理解模型'
                  : task.kind === 'image_generation' && !imageProfile ? '请选择图片生成模型'
                    : task.kind === 'svg_generation' && !textProfile ? '请选择方案与文案模型' : undefined;
    return {
      id: task.id, title: task.title, kindLabel: taskKindLabel(task.kind), reason: task.reason,
      outputs: task.outputs, skills: task.skillIds.map((id) => skills.find((skill) => skill.id === id)?.name).filter((name): name is string => Boolean(name)),
      dependencies: task.dependsOn.map((id) => tasks.find((item) => item.id === id)?.title || id),
      status: state?.status || 'idle', statusLabel: taskStatusLabel(state?.status), progress: job?.progress,
      result: state?.result || conversationTaskResult(job?.result), error: state?.error || job?.error?.message,
      exportUrl: task.kind === 'delivery' && state?.exportId && state.status === 'completed' ? `/api/image-studio/exports/${encodeURIComponent(state.exportId)}/download` : undefined,
      actionLabel: isBusy ? '执行中' : state?.status === 'stale' ? '按新要求更新' : state?.status === 'failed' ? '重试' : state?.status === 'completed' ? task.kind === 'image_generation' ? '再生成套图' : '再做一次' : task.kind === 'image_generation' ? '生成套图' : '开始',
      disabled: Boolean(disabledReason), disabledReason,
    };
  }) : [];
  const startAllReason = !savedPlan ? '先通过对话整理制作计划'
    : productionCompleted ? '当前方案已制作完成，可在画布查看结果'
    : backendRunPresent ? '当前制作计划尚未结束，请在后台制作计划中确认、重试或查看进度'
    : savedPlan.mode && savedPlan.mode !== designMode ? '请先切换到方案所属的工作模式'
    : savedPlan.status !== 'approved' ? savedPlan.plan.logoExploration ? '先确认 Logo 候选制作方案' : '先选择并确认一个视觉方向'
      : !canvasReady ? '画布正在打开'
        : modelsSaving ? '模型设置正在保存'
          : chatSending ? '请等待当前对话完成'
          : runningTaskId ? '当前任务正在启动'
            : planMode === 'product' && tasks.some((task) => task.kind === 'image_generation') && !hasProductImage ? '先添加商品图片'
              : tasks.some((task) => task.kind === 'image_generation') && !imageProfile ? '先选择图片生成模型'
                  : tasks.some((task) => ['research', 'storyboard', 'copywriting', 'prompting', 'svg_generation'].includes(task.kind)) && !textProfile ? '先选择方案与文案模型'
                  : tasks.some((task) => task.kind === 'analysis') && hasProductImage && !visionProfile ? '先选择图片理解模型'
                    : tasks.some((task) => task.kind === 'analysis') && !hasProductImage && !textProfile ? '先选择方案与文案模型'
                  : undefined;

  const showTaskMessages = () => {
    setAgentPanel('tasks');
  };

  if (loading) return <div className="grid h-full min-h-[60vh] place-items-center text-sm text-slate-500"><Loader2 className="mr-2 size-4 animate-spin" />正在打开工作台…</div>;
  if (!project) return <div className="grid h-full place-items-center text-sm text-slate-500">项目不存在或无权访问 <Link href="/service/image-studio" className="ml-2 text-indigo-600">返回项目列表</Link></div>;

  const isVisible = (panel: MobileTab) => mobileTab === panel;
  const taskPanel = <WorkbenchTaskMessages tasks={productionMessages.map((task) => batchRunning ? { ...task, disabled: true, disabledReason: '正在按制作计划执行' } : task)} reviews={reviews} canvasReady={canvasReady} onExecute={(id) => { const task = tasks.find((item) => item.id === id); if (task) void executeTask(task, { roundId: latestRoundId }); }} onFocus={(id) => { const task = tasks.find((item) => item.id === id); if (task) { setAgentPanel(null); focusTask(task); } }} onReviewChange={(id, patch) => { const review = reviews.find((item) => item.id === id); if (review) void saveReview(review, patch); }} onStartAll={() => void startAllTasks(undefined, latestRoundId)} startAllBusy={batchRunning} startAllCompleted={productionCompleted} startAllDisabled={Boolean(startAllReason) || batchRunning} startAllReason={startAllReason || (batchTaskTitle ? `即将开始：${batchTaskTitle}` : undefined)} activeTaskTitle={batchTaskTitle} showPlan={Boolean(savedPlan?.status === 'approved' && (!savedPlan.mode || savedPlan.mode === designMode))} />;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f7f8fc]">
      <VectorizeDialog node={vectorSource} projectId={projectId} open={Boolean(vectorSource)} onClose={() => { setVectorSource(undefined); setVectorInitialBrand(undefined); }} onApply={applyVectorizedSvg} initialBrand={vectorInitialBrand ?? savedPlan?.plan.brief.brandName ?? ''} visionProfileId={visionProfile?.id} />
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/service/image-studio" aria-label="返回项目" className="grid size-9 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"><ArrowLeft className="size-4" /></Link>
          <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{project.name}</p><p className="hidden text-[10px] text-slate-400 sm:block">{project.platform || '未指定平台'} · 无限画布工作台</p></div>
        </div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className={`hidden items-center gap-1 rounded-full px-2.5 py-1 sm:inline-flex ${connected ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}><span className={`size-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-400'}`} />{connected ? '已连接' : '连接中'}</span>
          <span className="hidden rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700 md:inline-flex">{!savedPlan ? '需求收集中' : savedPlan.status !== 'approved' ? '方案待确认' : !productionStarted ? '方案已确认 · 待开始制作' : batchRunning ? '正在制作' : productionCompleted ? '制作已完成' : '制作已启动'}</span>
          <button type="button" onClick={() => imageGenerationTask ? void executeTask(imageGenerationTask, { roundId: latestRoundId }) : toast.error('请先在左侧生成并确认设计方案')} disabled={modelsSaving || batchRunning || !canvasReady || Boolean(runningTaskId) || Boolean(imageGenerationBusy)} title={imageGenerationHint} className="hidden h-9 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-semibold text-white shadow-sm shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none lg:inline-flex"><ImagePlus className="size-4" />{imageGenerationLabel}</button>
          <Link href="/service/image-studio/workspace/canvas" className="hidden rounded-lg border border-slate-200 px-3 py-2 text-slate-600 hover:bg-slate-50 sm:inline-flex">画布项目</Link>
        </div>
      </header>

      <nav className="grid h-11 shrink-0 grid-cols-2 border-b border-slate-200 bg-white lg:hidden">
        {([['chat', '对话'], ['canvas', '画布']] as const).map(([key, label]) => <button key={key} onClick={() => setMobileTab(key)} className={`text-xs font-semibold ${mobileTab === key ? 'border-b-2 border-indigo-600 text-indigo-700' : 'text-slate-500'}`}>{label}</button>)}
      </nav>

      <main className="flex min-h-0 flex-1 overflow-hidden">
        <aside aria-label="需求与方案" className={`${isVisible('chat') ? 'flex' : 'hidden'} min-h-0 w-full shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white lg:flex lg:w-[480px] xl:w-[560px] 2xl:w-[600px]`}>
          <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4"><div className="flex min-w-0 items-center gap-3"><h2 className="shrink-0 text-sm font-semibold text-slate-900">设计 Agent</h2><span className="hidden items-center gap-1.5 text-[11px] text-slate-400 sm:inline-flex"><span className={`size-1.5 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />{connected ? '已连接' : '连接中'}</span></div><div role="group" aria-label="创作模式" className="flex shrink-0 rounded-lg bg-slate-100 p-0.5"><button type="button" aria-pressed={designMode === 'brand'} disabled={batchRunning || modelsSaving} onClick={() => void changeDesignMode('brand')} className={`h-8 rounded-md px-2.5 text-[11px] font-medium transition ${designMode === 'brand' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>品牌设计</button><button type="button" aria-pressed={designMode === 'product'} disabled={batchRunning || modelsSaving} onClick={() => void changeDesignMode('product')} className={`h-8 rounded-md px-2.5 text-[11px] font-medium transition ${designMode === 'product' ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>商品套图</button></div></div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pb-3 text-[11px] text-slate-500"><button type="button" onClick={() => void openAgentPanel('memory')} className="hover:text-violet-600">项目档案</button><button type="button" onClick={() => void openAgentPanel('history')} className="hover:text-violet-600">历史方案</button><button type="button" onClick={showTaskMessages} className="hover:text-violet-600">制作任务</button><div ref={setAgentToolbar} className="flex flex-wrap items-center gap-2" />{chatSending && <span role="status" className="ml-auto inline-flex items-center gap-1.5 text-violet-600"><Loader2 className="size-3 animate-spin" />正在回复…</span>}</div>
          <div ref={requirementsScrollRef} onScroll={(event) => { const element = event.currentTarget; const nearBottom = element.scrollHeight - element.scrollTop - element.clientHeight < 120; followLatestRef.current = nearBottom; if (nearBottom) setShowLatestButton(false); }} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 pb-6 pt-1">
            <MaterialsPanel projectId={projectId} assets={assets} onRefresh={async () => { const next = await request<Asset[]>(`/image-studio/projects/${projectId}/assets`); setAssets(next); setPendingAssetIds((current) => current.filter((id) => next.some((asset) => asset.id === id && asset.kind === 'image' && !['competitor', 'chat_screenshot'].includes(asset.role)))); }} />
            {designMode === 'product' && (!savedPlan || !savedPlan.mode || savedPlan.mode === 'product') && <ProductInvestigationPanel project={project} modelProfileId={textProfile?.id} visionProfileId={visionProfile?.id} hasProductImages={hasProductImage} hasReports={assets.some((asset) => asset.kind === 'document' && asset.role === 'report' && asset.mimeType === 'application/pdf')} enabled={Boolean(agentSession?.requirements?.product?.confirmed)} hasPlan={Boolean(savedPlan)} busy={chatSending || modelsSaving || batchRunning} onProject={setCurrentProject} onGeneratePlan={() => sendChatMessage({ text: '已确认商品图片清单，请根据清单生成设计方案。', skillIds: agentInputsRef.current.skillIds, confirmedAnswers: {}, confirmedAnswerLabels: {} })} />}
            <div className="mb-3"><PsdExportDialog projectId={projectId} images={reviews} /></div>
            {backendScheduling && <OrchestrationPanel projectId={projectId} planVersion={savedPlan?.version} refreshKey={orchestrationRefresh} connected={connected} onUpdate={(active, hasRun, completedPlan) => { setBatchRunning(active); setBackendRunPresent(hasRun); setCompletedRunVersion(completedPlan); if ((!active && hasRun) || completedPlan) void refreshReviews().catch(() => undefined); void request<Project>(`/image-studio/projects/${projectId}`).then((next) => { if (next.version > (projectRef.current?.version || 0)) setCurrentProject(next); }).catch(() => undefined); void refreshProjectJobs().catch(() => undefined); }} />}
            {savedPlan && savedPlan.mode !== designMode && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">当前需求方案属于{savedPlan.mode === 'brand' ? '品牌设计' : '商品套图'}模式。切换工作模式后，请发送一条新需求以生成对应方案。</div>}
            <DesignPlanAgent project={project} savedPlan={savedPlan} conversations={conversations} sourceConversationId={activeSourceId} onSourceConversationChange={onSourceConversationChange} onProjectSaved={updatePlan} onPlanApproved={onPlanApproved} pinGenerateAction onGenerateActionChange={setPlanGenerateAction} referenceAssetIds={productImages.map((asset) => asset.id)} modelProfileId={hasProductImage ? visionProfile?.id : textProfile?.id} modelUnavailable={!(hasProductImage ? visionProfile : textProfile) || modelsSaving} mode={designMode} variant="conversation" messages={chatMessages} productImageUrl={productImages[0]?.previewUrl} conversationPickerNonce={conversationPickerNonce} interactionDisabled={chatSending} toolbarTarget={agentToolbar} renderRoundActivity={(message) => <RoundActivity candidateNames={Object.fromEntries((savedPlan?.plan.logoExploration?.candidates || []).map((candidate, index) => [`${savedPlan!.plan.logoExploration!.taskId}-${index + 1}`, candidate.name]))} roundId={message.runId || message.id} executions={Object.values(project.workflow?.workbench?.roundExecutions || {}) as RoundExecution[]} jobs={jobs} toolEvents={message.toolEvents} reviews={reviews} onReviewChange={(id, patch) => { const review = reviews.find((item) => item.id === id); if (review) void saveReview(review, patch); }} onRetry={(taskId, jobId) => { const job = jobs.find((item) => item.id === jobId); const task = tasks.find((item) => item.id === taskId); if (job?.context?.planVersion && job.context.planVersion !== savedPlan?.version) { toast.error('该任务属于历史方案，请在当前方案中重新制作'); return; } if (task) void executeTask(task, { roundId: message.runId || message.id }); }} onFocus={(taskId, jobId) => { const node = canvasProject?.nodes.find((item) => jobId && item.metadata?.workbenchJobId === jobId); if (node) { setMobileTab('canvas'); publishWorkbenchCanvasCommand({ type: 'focus-node', projectId: canvasProjectId, nodeId: node.id }); } else if (jobId) { toast.info('该任务的画布结果尚不可用'); } else { const task = tasks.find((item) => item.id === taskId); if (task) focusTask(task); } }} />} onConversationInputsChange={onConversationInputsChange} onUseDesignReferences={(messageId, ids) => { const inputs = agentInputsRef.current; void sendChatMessage({ text: selectedCanvasNodeIds.length ? '请分析我选中的公开设计参考，提取可借鉴的视觉特征，仅调整选中画布作品的设计方向，不修改整个方案。只借鉴风格，不复制原有标志或独特图形，先不要出图。' : '请分析我选中的公开设计参考，提取可借鉴的视觉特征并结合当前项目调整设计方向。只借鉴风格，不复制原有标志或独特图形，先不要出图。', skillIds: inputs.skillIds, confirmedAnswers: inputs.confirmedAnswers, confirmedAnswerLabels: {}, designReferenceSelection: { messageId, ids } }); }} onRetryMessage={(id) => void retryAgentMessage(id)} onLoadEarlier={() => void loadEarlierMessages()} hasEarlierMessages={agentSession?.hasMore} loadingEarlier={loadingEarlier} onRunAction={(action, runId) => void runAgentAction(action, runId)} onStartAll={(roundId) => void startAllTasks(undefined, roundId)} startAllBusy={batchRunning} startAllCompleted={productionCompleted} startAllReason={startAllReason} onSubmitSkillForm={submitSkillConfirmationForm} onExploreDirections={(text) => { const inputs = agentInputsRef.current; return sendChatMessage({ text, skillIds: inputs.skillIds, confirmedAnswers: {}, confirmedAnswerLabels: {}, confirmSkillSelection: false }); }} onApplySkillSelection={applySkillSelection} confirmedFormAnswers={Object.fromEntries(Object.entries(agentSession?.memory.fields || {}).flatMap(([key, fact]) => key.startsWith('answer.') && fact.status === 'confirmed' ? [[key.slice(7), fact.value]] : []))} />
          </div>
          {showLatestButton && <button type="button" onClick={() => { followLatestRef.current = true; setShowLatestButton(false); const container = requirementsScrollRef.current; container?.scrollTo({ top: container.scrollHeight, behavior: 'smooth' }); }} className="mx-auto mb-2 rounded-full bg-violet-100 px-3 py-1.5 text-xs text-violet-700">回到最新消息 ↓</button>}
          <div className="relative z-10 shrink-0 bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2" aria-label="设计对话输入区">
            {selectedCanvasNodeIds.length > 0 && <div className="mb-2 flex flex-wrap gap-1.5">{selectedCanvasNodeIds.map((id) => <span key={id} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-violet-50 px-2 py-1 text-[10px] text-violet-700"><span className="max-w-44 truncate">引用：{canvasProject?.nodes.find((node) => node.id === id)?.title || '画布作品'}</span><button type="button" aria-label="取消引用画布作品" onClick={() => setSelectedCanvasNodeIds((current) => current.filter((nodeId) => nodeId !== id))}><X className="size-3" /></button></span>)}</div>}
            <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_-4px_18px_rgba(15,23,42,0.025)] focus-within:border-violet-300">
              {pendingAssets.length > 0 && <div className="px-1 pb-2"><div className="mb-2 flex items-center justify-between"><p className="text-[11px] text-slate-500">已引用 {pendingAssets.length} 张图片参考</p><button type="button" onClick={() => assetInputRef.current?.click()} disabled={uploadingAssets} className="text-[11px] text-slate-400 hover:text-violet-600">添加</button></div><div className="flex gap-2 overflow-x-auto pb-1">{pendingAssets.map((asset) => <div key={asset.id} title={asset.filename} className="group relative size-12 shrink-0 overflow-hidden rounded-lg border border-slate-100 bg-slate-50"><img src={asset.previewUrl} alt={asset.filename} className="size-full object-cover" /><button type="button" aria-label={`移除图片参考：${asset.filename}`} title="取消本次引用" disabled={uploadingAssets || Boolean(planGenerateAction?.busy)} onClick={() => setPendingAssetIds((current) => current.filter((id) => id !== asset.id))} className="absolute right-0 top-0 grid size-5 place-items-center rounded-full bg-slate-950/70 text-white opacity-100 transition hover:bg-rose-600 disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"><X className="size-3" /></button></div>)}</div></div>}
              <textarea aria-label="设计需求" value={chatDraft} onChange={(event) => setChatDraft(event.target.value)} onPaste={(event) => {
                const pastedImages = Array.from(event.clipboardData.items)
                  .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
                  .map((item) => item.getAsFile())
                  .filter((file): file is File => file !== null);
                if (!pastedImages.length) return;
                event.preventDefault();
                const supportedImages = pastedImages.filter((file) => ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type));
                if (supportedImages.length !== pastedImages.length) toast.error('粘贴图片仅支持 PNG、JPEG、WebP 或 GIF 格式');
                if (!supportedImages.length) return;
                const namedImages = supportedImages.map((file, index) => file.name ? file : new File([file], `pasted-image-${Date.now()}-${index + 1}.${file.type.split('/')[1] || 'png'}`, { type: file.type, lastModified: file.lastModified }));
                void uploadProductImages(namedImages);
              }} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void sendChatMessage(); } }} maxLength={6000} rows={2} placeholder={batchRunning ? '可以继续补充需求，正在制作的图片会保留当前版本…' : savedPlan ? '继续讨论或修改需求，也可选中画布中的作品再发送…' : designMode === 'brand' ? '描述品牌、业务和希望建立的品牌形象，也可粘贴参考图…' : '描述商品、想要的风格和套图需求，也可粘贴商品图…'} className="block max-h-28 min-h-16 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] leading-6 text-slate-700 outline-none placeholder:text-slate-400 focus:border-violet-200 disabled:bg-slate-50" />
              <div className="mt-2 flex items-center justify-between gap-2" aria-label="发送设计需求工具栏">
                <div className="flex min-w-0 items-center gap-1">
                  <button type="button" aria-label={designMode === 'brand' ? '添加品牌参考图' : '添加商品图'} title={designMode === 'brand' ? '上传现有 Logo、品牌手册页面或风格参考图' : '添加商品图片'} onClick={() => assetInputRef.current?.click()} disabled={uploadingAssets || Boolean(planGenerateAction?.busy)} className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-40">{uploadingAssets ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}</button>
                  <button type="button" onClick={() => setChatDraft((current) => current ? `${current}\n请搜索相关的公开设计参考图。` : '请搜索与当前项目风格相符的公开设计参考图。')} disabled={chatSending} className="shrink-0 rounded-lg px-2 py-1.5 text-[11px] text-slate-500 hover:bg-violet-50 hover:text-violet-600 disabled:opacity-40">找参考图</button>
                  <button type="button" aria-label="关联品牌方会话" title="关联品牌方会话" onClick={() => setConversationPickerNonce((nonce) => nonce + 1)} className="grid size-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-violet-50 hover:text-violet-600"><AtSign className="size-4" /></button>
                  <ImageStudioModelSelector profiles={profiles} value={modelSelection} onChange={(selection) => void changeModels(selection)} disabled={modelsSaving || Boolean(runningTaskId) || Boolean(planGenerateAction?.busy) || chatSending} toolbar />
                  {(uploadingAssets || modelsSaving) && <span role="status" className="min-w-0 truncate text-[10px] text-slate-400">{modelsSaving ? '保存中…' : '上传中…'}</span>}
                </div>
                <button type="button" aria-label="发送设计需求" onClick={() => void sendChatMessage()} disabled={!chatDraft.trim() || chatSending || modelsSaving || uploadingAssets || Boolean(planGenerateAction?.busy)} className="grid h-9 w-11 shrink-0 place-items-center rounded-xl bg-[#7547ff] text-white hover:bg-violet-700 disabled:bg-violet-200">{chatSending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}</button>
              </div>
              <input ref={assetInputRef} type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => void uploadProductImages(event.target.files)} />
            </div>
          </div>
        </aside>

        <section className={`${isVisible('canvas') ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col overflow-hidden bg-[#f4f6fb] lg:flex`}>
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-slate-200 bg-white/90 px-3 sm:px-4"><div className="flex items-center gap-2 text-xs font-semibold text-slate-700"><FileImage className="size-4 text-indigo-600" />创作画布</div><div className="flex items-center gap-2">{imageSourceChanged && <span className="text-[10px] text-amber-700">设计依据已更新，可选择提示词重新生成</span>}{selectedCanvasImageNode?.metadata?.content && !selectedSvgNode && <button type="button" disabled={!canvasReady} title="对比矢量转换效果，原图不会改变" onClick={() => setVectorSource(selectedCanvasImageNode)} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[10px] font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"><Sparkles className="size-3.5" />转换为 SVG</button>}{selectedSvgNode && <button type="button" onClick={() => { if (!downloadCanvasSvg(selectedSvgNode)) toast.error('SVG 源码不可用，请刷新画布后重试'); }} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[10px] font-medium text-violet-700 hover:bg-violet-100"><Download className="size-3.5" />下载 SVG</button>}{selectedSvgNode?.metadata?.svgOutlineSource && <button type="button" onClick={() => { const outline = selectedSvgNode.metadata?.svgOutlineSource; if (!outline || !downloadCanvasSvg({ ...selectedSvgNode, title: `${selectedSvgNode.title || 'Logo'} · 转曲版`, metadata: { ...selectedSvgNode.metadata, svgSource: outline } })) toast.error('转曲源码不可用'); }} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[10px] font-medium text-violet-700 hover:bg-violet-100"><Download className="size-3.5" />下载转曲 SVG</button>}{selectedSvgNode?.metadata?.svgOutlineSource && <button type="button" onClick={() => { void downloadLogoAssetArchive(selectedSvgNode).catch((error) => toast.error(error instanceof Error ? error.message : '资产包导出失败')); }} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[10px] font-medium text-violet-700 hover:bg-violet-100"><Download className="size-3.5" />导出基础资产包</button>}{selectedSvgNode?.metadata?.logoTypography && <button type="button" disabled={!canvasReady} onClick={() => { const connection = canvasProject?.connections.find((item) => item.toNodeId === selectedSvgNode.id && item.id.startsWith('vector-')); const original = canvasProject?.nodes.find((item) => item.id === connection?.fromNodeId && item.type === CanvasNodeType.Image); if (!original) { toast.error('找不到来源图片，无法制作新版本'); return; } setVectorInitialBrand(selectedSvgNode.metadata?.logoTypography?.text); setVectorSource(original); }} className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[10px] font-medium text-violet-700 hover:bg-violet-100 disabled:opacity-50"><Sparkles className="size-3.5" />制作文字新版本</button>}{selectedPromptNode && <button type="button" disabled={batchRunning || Boolean(runningTaskId) || modelsSaving} onClick={() => { const task = tasks.find((item) => item.id === selectedPromptNode.metadata?.workbenchTaskId && item.kind === 'image_generation'); const slotKey = selectedPromptNode.metadata?.workbenchSlotKey; if (task && slotKey) void executeTask(task, { roundId: latestRoundId, slotKeys: [slotKey], reusePrevious: false }); }} className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1.5 text-[10px] font-medium text-white hover:bg-violet-700 disabled:opacity-50"><ImagePlus className="size-3.5" />按此提示词生成</button>}<button type="button" onClick={showTaskMessages} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[10px] text-slate-500 hover:bg-slate-50"><Workflow className="size-3.5" />查看任务消息</button></div></div>
          <div className="shrink-0 border-b border-violet-100 bg-violet-50 px-4 py-1.5 text-[11px] text-violet-700">{!savedPlan ? '先完成需求收集，再整理设计方案。' : savedPlan.status !== 'approved' ? '请先确认方案，再开始制作。' : !productionStarted ? '方案已确认。点击“开始制作”后，画布才会创建逐图提示词和生图节点。' : '每张图对应一个提示词文本节点，图片回填至相连的生图节点。双击文本可编辑提示词。'}</div>
          {savedPlan?.mode === 'brand' && savedPlan.status === 'approved' && tasks.some((task) => task.kind === 'image_generation' && taskSlots(task, savedPlan).some((slot) => isLogoConceptSlot(task, slot.deliverable, savedPlan))) && <label className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-4 py-2 text-xs text-slate-700"><input type="checkbox" checked={workbench.logoSymbolOnlyByPlan?.[savedPlan.version] === true} disabled={Boolean(productionStarted || modelsSaving || batchRunning)} onChange={(event) => { const enabled = event.target.checked; const version = savedPlan.version; setModelsSaving(true); void persistWorkflow((workflow) => { if (workflow.designAgent?.version !== version || workflow.designAgent?.status !== 'approved' || workflow.workbench?.productionStarts?.[version]) throw new Error('方案状态已变化，无法修改制作方式'); return { ...workflow, workbench: { ...workflow.workbench, logoSymbolOnlyByPlan: { ...workflow.workbench?.logoSymbolOnlyByPlan, [version]: enabled } } }; }).catch((error) => toast.error(error instanceof Error ? error.message : '制作方式保存失败')).finally(() => setModelsSaving(false)); }} />Logo 图形与文字分开制作 <span className="text-slate-400">{productionStarted ? '（已开始制作，当前方案设置已锁定）' : '（先生成无文字图形，再添加品牌文字；不影响应用物料）'}</span></label>}
          <div className="min-h-0 flex-1 overflow-hidden">{canvasProjectId && <div className="infinite-canvas-root h-full w-full overflow-hidden"><StudioCanvasModelProvider value={{ projectId, profiles, selection: modelSelection, onChange: (selection) => void changeModels(selection) }}><CanvasContent projectId={canvasProjectId} onReady={onCanvasReady} /></StudioCanvasModelProvider></div>}</div>
        </section>

      </main>
      <Dialog open={agentPanel !== null} onOpenChange={(open) => { if (!open) setAgentPanel(null); }}><DialogContent className="max-h-[85vh] overflow-y-auto bg-white sm:max-w-2xl"><DialogHeader><DialogTitle>{agentPanel === 'history' ? '历史方案' : agentPanel === 'tasks' ? '制作任务' : '项目档案'}</DialogTitle><DialogDescription>{agentPanel === 'history' ? '查看每次实际调整后保存的方案，已有作品会保留。' : agentPanel === 'tasks' ? '查看当前方案的制作计划与任务状态。' : '已确认的需求会持续用于后续讨论和制作，建议内容会单独标注。'}</DialogDescription></DialogHeader>{agentPanel === 'tasks' ? taskPanel : agentPanel === 'memory' ? <div className="space-y-3">{project.workflow.brandKit && <section className="rounded-xl border border-violet-100 bg-violet-50/50 p-3 text-xs text-slate-700"><h3 className="font-semibold text-violet-800">品牌规范 · v{project.workflow.brandKit.version || 1}</h3><p className="mt-2">{project.workflow.brandKit.positioning || project.workflow.brandKit.name}</p><p className="mt-1">{project.workflow.brandKit.typography || ''}</p><div className="mt-2 flex flex-wrap gap-2">{(project.workflow.brandKit.palette || []).map((color: {name?: string; hex?: string}, index: number) => <span key={index} title={`${color.name || ''} ${color.hex || ''}`} className="size-6 rounded border border-black/10" style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(color.hex || '') ? color.hex : '#f1f5f9' }} />)}</div></section>}{Object.entries(agentSession?.memory.fields || {}).map(([key, fact]) => <div key={key} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-3 text-xs"><span className="font-medium text-slate-800">{fact.label}</span><span className={fact.status === 'confirmed' ? 'text-emerald-600' : 'text-amber-600'}>{fact.status === 'confirmed' ? '已确认' : '建议'}</span></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{fact.value}</p><p className="mt-2 text-[10px] text-slate-400">{fact.sourceSeq ? `来自第 ${fact.sourceSeq} 条消息` : '来自已有项目方案'}</p></div>)}{!Object.keys(agentSession?.memory.fields || {}).length && <p className="py-6 text-center text-sm text-slate-400">开始对话后，设计要求会整理在这里。</p>}</div> : <div className="space-y-3">{planHistory.map((item) => <details key={item.version} className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-medium text-slate-700">方案 v{item.version}<span className="ml-3 text-xs font-normal text-slate-400">{new Date(item.createdAt).toLocaleString()}</span></summary><p className="mt-3 whitespace-pre-wrap text-xs leading-6 text-slate-500">{item.changes.join('\n')}</p><p className="mt-2 text-sm leading-6 text-slate-700">{item.savedPlan.plan.summary}</p><dl className="mt-3 space-y-2 text-xs leading-5">{Object.entries(item.savedPlan.plan.brief).filter(([, value]) => Array.isArray(value) ? value.length : value).map(([key, value]) => <div key={key}><dt className="text-slate-400">{({ brandName: '品牌', productOrService: '商品/业务', positioning: '定位', targetAudience: '受众', marketAndChannel: '渠道', businessGoal: '目标', knownFacts: '已知信息', constraints: '设计约束', factsToConfirm: '待确认' } as Record<string, string>)[key]}</dt><dd className="text-slate-700">{Array.isArray(value) ? value.join('；') : value}</dd></div>)}</dl></details>)}{!planHistory.length && <p className="py-6 text-center text-sm text-slate-400">暂无历史方案。</p>}</div>}</DialogContent></Dialog>
    </div>
  );
}
