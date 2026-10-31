'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowUpRight, ExternalLink, LoaderCircle, Search, Sparkles, WandSparkles, X } from 'lucide-react';
import { toast } from 'sonner';
import type { FormField } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { encodeChatCard, parseChatCard, type ChatCard } from '@/lib/chat-cards';
import { DesignPlanAgent } from '@/components/image-studio/design-plan-agent';
import { ToolButton, type SendCard } from './tool-ui';

type ChatMessage = { id: string; senderId: string; senderName: string; body: string; createdAt?: string };
type StudioProject = { id: string; name: string; platform: string | null; workflow: Record<string, any>; version: number };
type Profile = { id: string; capability: 'text' | 'vision' | 'image' };
type ImageJob = { id: string; status: string; progress: number; phase?: string; error?: { message: string } | null };
type PlanRun = { id: string; sourceConversationId: string; runStatus: string; currentVersion: { status: string; plan: { images?: Array<{ title?: string; type?: string; output?: string }> } } | null };
type ApiResult<T> = { success: boolean; data: T; message?: string };
type PlanQuestion = { id: string; label: string; prompt: string; required: boolean; answerType: 'text' | 'textarea' | 'select'; options: string[] };
type MarketResearch = { query: string; generatedAt: string; status: 'complete' | 'no_results'; summary: string; findings: Array<{ claim: string; sourceIndexes: number[]; confidence: 'high' | 'medium' | 'low'; kind: string }>; sources: Array<{ title: string; url: string; excerpt: string; publishedDate?: string }> };
const researchKindLabels: Record<string, string> = { product: '商品信息线索', market: '市场趋势', competitor: '竞品观察', visual: '视觉规律', risk: '风险提示' };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(path, options);
  const result = await response.json() as ApiResult<T>;
  if (!response.ok || !result.success) throw new Error(result.message || '请求失败');
  return result.data;
}

function toQuestionCard(questions: PlanQuestion[], version: number): Extract<ChatCard, { kind: 'work_card' }> {
  const fields = questions.slice(0, 10).map((question, index) => {
    const options = question.answerType === 'select' ? question.options.slice(0, 20) : [];
    const kind = question.answerType === 'select' && !options.length ? 'textarea' : question.answerType;
    const schema: FormField = {
      id: question.id.slice(0, 64) || `question_${index + 1}`,
      key: question.id.slice(0, 64) || `question_${index + 1}`,
      kind,
      label: question.label.slice(0, 80),
      width: 100,
      required: question.required,
      placeholder: question.prompt.slice(0, 120),
      help: question.prompt.slice(0, 180),
      ...(options.length ? { options: options.map((option) => ({ label: option.slice(0, 100), value: option.slice(0, 100) })) } : {}),
    };
    return { label: question.label.slice(0, 80), value: '请品牌方填写', ...(options.length ? { options } : {}), schema };
  });
  return { kind: 'work_card', templateId: 'design_skill_intake', title: `电商套图策划补充 · V${version}`, mobileStyle: 'compact', fields, attachments: [] };
}

export function ChatEcommerceAgent({ conversationId, conversationTitle, platform, intakeMode, messages, brandUserIds = [], onSend }: {
  conversationId: string; conversationTitle: string; platform?: string | null;
  intakeMode: boolean; messages: ChatMessage[]; brandUserIds?: string[]; onSend: SendCard;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState<StudioProject | null>(null);
  const [loadError, setLoadError] = useState('');
  const [job, setJob] = useState<ImageJob | null>(null);
  const [planRuns, setPlanRuns] = useState<PlanRun[]>([]);
  const [researchQuery, setResearchQuery] = useState('');
  const [researchBusy, setResearchBusy] = useState(false);
  const sourceType = intakeMode ? 'invite' : 'order';
  const agentSourceType = intakeMode ? 'intake' : 'order';
  const sourceConversationId = `${sourceType}:${conversationId}`;
  const brandIdsKey = brandUserIds.join('|');

  const conversationAnswers = useMemo(() => {
    const brandIds = new Set(brandIdsKey.split('|').filter(Boolean));
    if (!brandIds.size) return {} as Record<string, string>;
    const forms = new Map<string, { card: Extract<ChatCard, { kind: 'work_card' }>; version: number }>();
    for (const message of messages) {
      if (!brandIds.has(message.senderId)) continue;
      const card = parseChatCard(message.body);
      if (card?.kind === 'work_card' && card.templateId === 'design_skill_intake' && card.title.startsWith('电商套图策划补充')) {
        forms.set(message.id, { card, version: Number(card.title.match(/V(\d+)$/)?.[1] || 1) });
      }
    }
    const answers: Record<string, string> = {};
    const answerVersions: Record<string, number> = {};
    for (const message of messages) {
      if (!brandIds.has(message.senderId)) continue;
      const card = parseChatCard(message.body);
      if (card?.kind !== 'form_answers') continue;
      const form = forms.get(card.formMessageId);
      if (!form) continue;
      for (const answer of card.answers) {
        const field = form.card.fields[answer.fieldIndex];
        const key = field?.schema?.key || field?.schema?.id;
        if (key && form.version >= (answerVersions[key] || 0)) {
          answers[key] = answer.value;
          answerVersions[key] = form.version;
        }
      }
    }
    return answers;
  }, [messages, brandIdsKey]);

  const loadProject = useCallback(async () => {
    setLoading(true); setLoadError(''); setProject(null); setJob(null); setPlanRuns([]);
    try {
      const listed = await request<{ items: StudioProject[] }>('/image-studio/projects?limit=100');
      const matched = listed.items.find((item) => {
        const savedSource = item.workflow?.designAgent?.sourceConversation || item.workflow?.chatAgent?.sourceConversation;
        return savedSource?.id === conversationId && savedSource?.type === agentSourceType;
      });
      const activeProject = matched || await request<StudioProject>('/image-studio/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: `${conversationTitle || '会话'} · 电商套图`,
          platform: platform?.trim() || null,
          workflow: { chatAgent: { sourceConversation: { type: agentSourceType, id: conversationId } } },
        }),
      });
      setProject(activeProject);
      const plans = await request<PlanRun[]>(`/image-studio/projects/${encodeURIComponent(activeProject.id)}/plans`);
      setPlanRuns(plans);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '无法打开 AI 套图策划');
    } finally { setLoading(false); }
  }, [agentSourceType, conversationId, conversationTitle, platform]);

  useEffect(() => { if (open) void loadProject(); }, [open, loadProject]);

  useEffect(() => {
    if (!job || ['completed', 'failed', 'partial', 'cancelled'].includes(job.status)) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await request<ImageJob>(`/image-studio/jobs/${encodeURIComponent(job.id)}`);
        if (!active) return;
        setJob(next);
        if (['completed', 'failed', 'partial', 'cancelled'].includes(next.status) && project) {
          const plans = await request<PlanRun[]>(`/image-studio/projects/${encodeURIComponent(project.id)}/plans`);
          if (active) setPlanRuns(plans);
        }
      } catch { /* The workbench remains the source of truth if a status refresh is temporarily unavailable. */ }
      if (active) timer = setTimeout(poll, 2500);
    };
    timer = setTimeout(poll, 1200);
    return () => { active = false; if (timer) clearTimeout(timer); };
  }, [job?.id, job?.status, project]);

  const noOpSourceChange = useCallback((_id: string) => undefined, []);
  const saveProject = useCallback((next: StudioProject) => setProject(next), []);
  const startImagePlan = useCallback(async (selectedSourceId: string) => {
    if (!project) return;
    const [conversationType, id] = selectedSourceId.split(':', 2);
    const profiles = await request<Profile[]>('/image-studio/model-profiles');
    const visionProfile = profiles.find((profile) => profile.capability === 'vision');
    if (!visionProfile) throw new Error('需要先在生图工作台配置图片理解模型，才能从聊天生成套图方案。');
    const accepted = await request<{ id: string }>('/image-studio/projects/' + encodeURIComponent(project.id) + '/plans/from-collaboration', {
      method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ modelProfileId: visionProfile.id, conversationId: id, conversationType }),
    });
    setJob({ id: accepted.id, status: 'queued', progress: 0 });
    toast.success('已读取当前对话，套图方案正在后台生成');
  }, [project]);

  const sendQuestions = useCallback(async (questions: PlanQuestion[]) => {
    if (!questions.length) return false;
    const card = toQuestionCard(questions, project?.workflow?.designAgent?.version || 1);
    if (encodeChatCard(card).length > 7800) {
      toast.error('问题表单内容过长，请精简问题或选项后再发送');
      return false;
    }
    const sent = await onSend(card);
    return sent !== false;
  }, [onSend, project?.workflow?.designAgent?.version]);

  const runMarketResearch = async () => {
    if (!project || researchBusy || researchQuery.trim().length < 2) return;
    setResearchBusy(true);
    try {
      const result = await request<{ project: StudioProject; research: MarketResearch }>(`/image-studio/projects/${encodeURIComponent(project.id)}/design-agent/research`, {
        method: 'POST', body: JSON.stringify({ query: researchQuery.trim(), sourceConversation: { type: agentSourceType, id: conversationId } }),
      });
      setProject(result.project);
      setResearchQuery(result.research.query);
      toast.success(result.research.sources.length ? `已整理 ${result.research.sources.length} 条公开资料` : '本次没有找到可用资料，请调整关键词');
    } catch (error) { toast.error(error instanceof Error ? error.message : '商品调研失败'); }
    finally { setResearchBusy(false); }
  };

  const latestPlan = planRuns.find((run) => run.sourceConversationId === conversationId && run.currentVersion);
  const marketResearch = project?.workflow?.marketResearch as MarketResearch | undefined;
  const terminalJob = job && ['completed', 'failed', 'partial', 'cancelled'].includes(job.status);
  const openWorkspaceHref = project ? `/service/image-studio/${encodeURIComponent(project.id)}` : '/service/image-studio';

  return <>
    <ToolButton icon={Sparkles} label="AI 套图策划" description="读取当前会话，生成品牌视觉方向与电商套图方案" onClick={() => setOpen(true)} />
    {open && typeof document !== 'undefined' && createPortal(<div role="presentation" className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/55 p-0 sm:items-center sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section role="dialog" aria-modal="true" aria-labelledby="chat-ecommerce-agent-title" className="flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-slate-50 shadow-2xl sm:max-h-[92dvh] sm:rounded-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-violet-600 text-white"><WandSparkles className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1"><h2 id="chat-ecommerce-agent-title" className="text-sm font-bold text-slate-900">会话 · 电商套图 Agent</h2><p className="truncate text-[11px] text-slate-500">{conversationTitle || '当前聊天'} · 自动匹配 Skills 并整理视觉方向</p></div>
          {project && <Link href={openWorkspaceHref} className="hidden items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-100 sm:inline-flex">打开生图工作台<ArrowUpRight className="h-3.5 w-3.5" /></Link>}
          <button type="button" aria-label="关闭" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
          {loading && <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />正在准备会话项目…</div>}
          {!loading && loadError && <div role="alert" className="mx-auto max-w-xl rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700"><p>{loadError}</p><button type="button" onClick={() => void loadProject()} className="mt-3 rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-semibold">重试</button></div>}
          {!loading && project && <div className="mx-auto max-w-4xl space-y-4">
            <div className="rounded-xl border border-violet-100 bg-white p-3 text-xs leading-5 text-slate-600"><span className="font-semibold text-violet-800">当前来源已绑定：</span>Agent 会读取此会话及已提交的表单和图片线索；先产出可审核的设计方向，确认后再创建逐张套图方案。不会未经确认自动发送消息或扣用生图额度。</div>
            <section className="rounded-2xl border border-cyan-200 bg-gradient-to-br from-cyan-50/80 via-white to-sky-50/60 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Search className="h-4 w-4 text-cyan-700" />商品与市场调研</h3><p className="mt-1 text-xs leading-5 text-slate-600">先核对品类趋势、竞品表达与视觉机会，再让策划 Agent 参考有来源的线索。</p></div>
                {marketResearch && <span className="rounded-full bg-white px-2.5 py-1 text-[10px] text-slate-500">最近调研 · {String(marketResearch.generatedAt).replace('T', ' ').slice(0, 16)}</span>}
              </div>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={researchQuery} onChange={(event) => setResearchQuery(event.target.value)} maxLength={240} onKeyDown={(event) => { if (event.key === 'Enter') void runMarketResearch(); }} placeholder="例如：便携咖啡杯 天猫 竞品主图设计趋势" className="h-10 min-w-0 flex-1 rounded-xl border border-cyan-200 bg-white px-3 text-xs outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" /><button type="button" onClick={() => void runMarketResearch()} disabled={researchBusy || researchQuery.trim().length < 2} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-cyan-700 px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">{researchBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{researchBusy ? '正在检索…' : marketResearch ? '重新调研' : '搜索公开资料'}</button></div>
              <p className="mt-2 text-[10px] leading-4 text-slate-500">仅发送上方关键词至公开搜索服务，不会上传聊天记录或图片。公开网页结论属于待核实的市场线索，不代表品牌方商品事实。</p>
              {marketResearch && <div className="mt-4 space-y-3 border-t border-cyan-100 pt-3">
                <p className="rounded-lg bg-white/80 p-3 text-xs leading-5 text-slate-700">{marketResearch.summary}</p>
                {marketResearch.findings.length > 0 && <div className="space-y-2">{marketResearch.findings.map((finding, index) => <article key={`${index}-${finding.claim}`} className="rounded-xl border border-cyan-100 bg-white p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div className="flex-1"><span className="mb-1 inline-block rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] text-cyan-800">{researchKindLabels[finding.kind] || '调研线索'}</span><p className="text-xs font-medium leading-5 text-slate-800">{finding.claim}</p></div><span className={'rounded-full px-2 py-0.5 text-[10px] ' + (finding.confidence === 'high' ? 'bg-emerald-50 text-emerald-700' : finding.confidence === 'medium' ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-600')}>{finding.confidence === 'high' ? '模型评估 · 高' : finding.confidence === 'medium' ? '模型评估 · 中' : '模型评估 · 低'}</span></div><div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{finding.sourceIndexes.map((sourceIndex) => { const source = marketResearch.sources[sourceIndex - 1]; return source ? <a key={sourceIndex} href={source.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-[10px] text-cyan-800 hover:underline">来源 {sourceIndex} · <span className="truncate">{source.title}</span><ExternalLink className="h-3 w-3 shrink-0" /></a> : null; })}</div></article>)}</div>}
                <details className="rounded-xl border border-slate-200 bg-white"><summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-slate-700">查看全部来源（{marketResearch.sources.length}）</summary><div className="space-y-2 border-t border-slate-100 p-3">{marketResearch.sources.map((source, index) => <article key={`${source.url}-${index}`} className="text-[11px] leading-5"><a href={source.url} target="_blank" rel="noreferrer" className="font-semibold text-cyan-800 hover:underline">{index + 1}. {source.title}<ExternalLink className="ml-1 inline h-3 w-3" /></a>{source.publishedDate && <span className="ml-2 text-slate-400">{source.publishedDate}</span>}<p className="mt-0.5 text-slate-500">{source.excerpt || '该来源未提供摘要'}</p></article>)}</div></details>
                {marketResearch.status === 'no_results' && <p className="text-xs text-amber-800">没有匹配结果，换用更具体的商品名称、类目或平台关键词再试。</p>}
              </div>}
            </section>
            <DesignPlanAgent
              project={project}
              savedPlan={project.workflow?.designAgent || null}
              conversations={[{ id: conversationId, conversationType: sourceType, title: conversationTitle || '当前会话', orderNo: intakeMode ? '' : conversationId }]}
              sourceConversationId={sourceConversationId}
              onSourceConversationChange={noOpSourceChange}
              onProjectSaved={saveProject}
              onPlanApproved={startImagePlan}
              conversationAnswers={conversationAnswers}
              onSendQuestions={sendQuestions}
            />
            {(job || latestPlan) && <section className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-bold text-slate-900">电商套图方案任务</h3><p className="mt-1 text-[11px] text-slate-500">套图经逐张核对后，可在工作台先试做一页，再决定是否批量生成。</p></div><Link href={openWorkspaceHref} className="inline-flex items-center gap-1 rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white">继续到生图工作台<ArrowUpRight className="h-3.5 w-3.5" /></Link></div>
              {job && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-xs"><div className="flex items-center justify-between gap-3"><span>{job.phase || (job.status === 'completed' ? '套图方案已生成' : job.status === 'failed' ? '生成未完成' : '正在整理商品需求与页面方案')}</span><span className="font-semibold text-violet-700">{job.progress}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${Math.max(0, Math.min(100, job.progress))}%` }} /></div>{job.error?.message && <p className="mt-2 text-rose-600">{job.error.message}</p>}{terminalJob && job.status === 'failed' && <p className="mt-2 text-slate-500">请打开工作台查看失败详情并重试。</p>}</div>}
              {latestPlan?.currentVersion?.plan.images?.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{latestPlan.currentVersion.plan.images.slice(0, 12).map((image, index) => <div key={`${latestPlan.id}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs"><p className="font-semibold text-slate-800">{index + 1}. {image.title || image.type || `套图页面 ${index + 1}`}</p><p className="mt-1 text-[10px] text-slate-500">{image.output || '待工作台审核'}</p></div>)}</div> : null}
            </section>}
            <p className="text-center text-[10px] text-slate-400">项目：{project.name} · 方案、风格与素材沿用生图工作台的数据库记录</p>
          </div>}
        </div>
        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6"><p className="text-[10px] leading-4 text-slate-400">生成方案后，在工作台逐张确认，再试做并审核图片，最后启动批量任务。</p><button type="button" onClick={() => setOpen(false)} className="shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600">返回聊天</button></footer>
      </section>
    </div>, document.body)}
  </>;
}
