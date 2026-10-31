'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Check, ChevronDown, CircleAlert, Leaf, Loader2, Palette, Play, Plus, Search, Sparkles, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/auth';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DesignQuestionChoiceField } from './design-question-choice-field';
import type { DesignAgentAction, DesignAgentInputs, DesignAgentMessage, DesignAgentSkillForm, DesignAgentSnapshot, DesignReference } from '@/lib/design-agent-conversation';

type Skill = { id: string; name: string; category: string; description: string };
type PlanQuestion = { id: string; label: string; prompt: string; required: boolean; answerType: 'text' | 'textarea' | 'select'; options: string[]; recommendation?: string };
type PaletteColor = { name: string; hex: string; usage: string };
type PlanDirection = { id: string; name: string; concept: string; positioning: string; audience: string; keywords: string[]; palette: PaletteColor[]; typography: string; imagery: string; rationale: string; deliverables: string[]; logoConcept?: string; graphicSystem?: string; toneOfVoice?: string; applicationExamples?: string[] };
export type DesignTaskKind = 'research' | 'analysis' | 'direction' | 'storyboard' | 'copywriting' | 'prompting' | 'image_generation' | 'svg_generation' | 'review' | 'delivery' | 'manual';
export type DesignMode = 'brand' | 'product';
export type DesignTask = { id: string; title: string; kind: DesignTaskKind; reason: string; dependsOn: string[]; skillIds: string[]; inputs: string[]; outputs: string[]; reviewPolicy: 'automatic' | 'confirm' | 'select' };
export type DesignPlan = { summary: string; brief: { brandName: string; productOrService: string; positioning: string; targetAudience: string; marketAndChannel: string; businessGoal: string; knownFacts: string[]; constraints: string[]; factsToConfirm: string[] }; questions: PlanQuestion[]; recommendedSkills: Array<{ skillId: string; reason: string }>; directions: PlanDirection[]; nextSteps: string[]; taskGraph?: DesignTask[]; selectedDirectionId: string | null; logoExploration?: { taskId: string; referenceAssetIds: string[]; candidates: Array<{ id: string; name: string; concept: string; imagery: string; typography: string; palette: string }> } };
export type SavedPlan = { version: number; mode?: DesignMode; status: 'needs_review' | 'approved'; inputBrief: string; answers: Record<string, string>; selectedSkillIds: string[]; sourceConversation?: { type: 'order' | 'intake'; id: string }; plan: DesignPlan; createdAt: string; updatedAt: string; approvedAt?: string };
export type Project = { id: string; name: string; platform: string | null; workflow: Record<string, any>; version: number };
export type CollaborationConversation = { id: string; conversationType: 'order' | 'invite'; title: string; orderNo: string };
export type AgentChatPrompt = { text: string; nonce: number };
export type DesignPlanGenerateAction = { onClick: () => void; disabled: boolean; busy: boolean; label: string };
type Result<T> = { success: boolean; data: T; message?: string };

function recommendedAnswers(plan?: DesignPlan | null) {
  return Object.fromEntries((plan?.questions || []).flatMap((question) => {
    const recommendation = question.recommendation?.trim() || question.options?.[0];
    return recommendation ? [[question.id, recommendation]] : [];
  }));
}

function QuestionAnswerField({ question, value, onChange, accent = 'violet', disabled = false, mode = 'product' }: {
  question: PlanQuestion; value: string; onChange: (value: string) => void; accent?: 'violet' | 'amber'; disabled?: boolean; mode?: DesignMode;
}) {
  return <DesignQuestionChoiceField question={question} value={value} onChange={onChange} accent={accent} disabled={disabled} mode={mode} />;
}

const categoryLabels: Record<string, string> = { brand_identity: '品牌设计', ecommerce: '电商设计', social_media: '社媒设计', packaging: '包装设计', design_review: '设计审稿', other: '其他' };

function SkillConfirmationCard({ form, skills, confirmedAnswers, disabled, onSubmit, mode = 'brand' }: {
  form: DesignAgentSkillForm; skills: Skill[]; confirmedAnswers: Record<string, string>; disabled: boolean; mode?: DesignMode;
  onSubmit: (form: DesignAgentSkillForm, answers: Record<string, string>, skillIds: string[]) => Promise<boolean>;
}) {
  const [skillIds, setSkillIds] = useState(form.skillIds);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const isSubmitted = form.questions.filter((question) => question.required).every((question) => confirmedAnswers[question.id] !== undefined)
    && form.questions.some((question) => confirmedAnswers[question.id] !== undefined);
  useEffect(() => { if (!disabled && submitting && !isSubmitted) setSubmitting(false); }, [disabled, isSubmitted, submitting]);
  const requiredComplete = form.questions.every((question) => !question.required || Boolean((isSubmitted ? confirmedAnswers[question.id] : answers[question.id])?.trim()));
  const setAnswer = (id: string, value: string) => setAnswers((current) => ({ ...current, [id]: value }));
  const submit = async () => {
    if (isSubmitted || submitting || !requiredComplete || disabled) return;
    setSubmitting(true);
    try { if (!await onSubmit(form, Object.fromEntries(Object.entries(answers).filter(([, value]) => value.trim())), skillIds)) setSubmitting(false); }
    catch { setSubmitting(false); }
  };
  return <section className="mt-3 rounded-xl border border-violet-200 bg-white p-3" aria-label="本轮 Skills 方案确认表单">
    <div className="flex items-start justify-between gap-2"><div><h4 className="text-xs font-semibold text-violet-950">{form.title || '本轮 Skills 方案确认'}</h4><p className="mt-1 text-[11px] leading-5 text-slate-500">{form.intro}</p></div>{isSubmitted && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700">已提交</span>}</div>
    {form.skillIds.length > 0 && <div className="mt-3"><p className="mb-1.5 text-[11px] font-medium text-slate-700">建议使用的 Skills</p><div className="flex flex-wrap gap-1.5">{form.skillIds.map((id) => { const skill = skills.find((item) => item.id === id); const selected = skillIds.includes(id); return <button key={id} type="button" aria-pressed={selected} disabled={disabled || isSubmitted || submitting} onClick={() => setSkillIds((current) => selected ? current.filter((item) => item !== id) : current.length < 5 ? [...current, id] : current)} className={`rounded-full border px-2.5 py-1.5 text-[11px] ${selected ? 'border-violet-400 bg-violet-50 text-violet-800' : 'border-slate-200 bg-white text-slate-500'} disabled:opacity-60`}>{selected ? '✓ ' : ''}{skill?.name || '设计 Skill'}</button>; })}</div></div>}
    <div className="mt-3 space-y-3">{form.questions.map((question) => {
      const value = isSubmitted ? confirmedAnswers[question.id] || '' : answers[question.id] || '';
      return <div key={question.id} className="text-xs font-medium text-slate-700">
        <span>{question.label}{question.required && <span className="ml-1 text-rose-500">*</span>}</span>
        <p className="mt-1 font-normal leading-5 text-slate-500">{question.prompt}</p>
        <DesignQuestionChoiceField question={question} value={value} mode={mode} disabled={disabled || isSubmitted || submitting}
          onChange={(value) => setAnswer(question.id, value)} />
      </div>;
    })}</div>
    <div className="mt-3 flex items-center justify-between gap-2"><span className="text-[10px] text-slate-400">{form.purpose === 'requirements_confirmation' ? '生成方案后仍需确认方案，开始制作才会创建画布节点' : '提交后继续收集需求，尚未开始制作'}</span><button type="button" disabled={disabled || isSubmitted || submitting || !requiredComplete} onClick={() => void submit()} className="h-8 shrink-0 rounded-lg bg-violet-600 px-3 text-[11px] font-medium text-white hover:bg-violet-700 disabled:bg-slate-200 disabled:text-slate-500">{isSubmitted ? '本轮已确认' : submitting ? '正在发送…' : form.purpose === 'requirements_confirmation' ? '确认并进入下一步' : '确认并继续'}</button></div>
  </section>;
}

function PlanRoundCard({ message, skills, latest, disabled, currentPlan, answers, mode, onChooseDirection, onSetAnswer, onConfirm, confirmBusy, onStartAll, startAllBusy, startAllCompleted, startAllReason, onExplore }: {
  message: DesignAgentMessage; skills: Skill[]; latest: boolean; disabled: boolean;
  currentPlan: DesignPlan | null; answers: Record<string, string>; mode: DesignMode;
  onChooseDirection: (id: string) => void; onSetAnswer: (id: string, value: string) => void;
  onConfirm: () => void; confirmBusy: boolean; onStartAll?: () => void; startAllBusy?: boolean; startAllCompleted?: boolean; startAllReason?: string;
  onExplore?: (text: string) => Promise<boolean>;
}) {
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [exploreNote, setExploreNote] = useState('');
  const [exploreBusy, setExploreBusy] = useState(false);
  const snapshot = message.planSnapshot;
  if (!snapshot) return null;
  const plan = snapshot.plan;
  const skillIds = [...new Set([...(message.roundSkillIds || []), ...snapshot.selectedSkillIds, ...plan.recommendedSkills.map((item) => item.skillId)])];
  const skillNames = skillIds.map((id) => skills.find((skill) => skill.id === id)?.name).filter((name): name is string => Boolean(name));
  const tasks = (plan.taskGraph || []).filter((task) => !plan.logoExploration || task.id === plan.logoExploration.taskId);
  const draft = latest && snapshot.status === 'needs_review' ? currentPlan : null;
  const missingAnswers = draft?.questions.some((question) => question.required && !answers[question.id]?.trim()) || false;
  const hasDirection = Boolean(draft?.logoExploration || draft?.directions.some((direction) => direction.id === draft.selectedDirectionId));
  return <section className="mt-3 rounded-xl border border-violet-200 bg-white p-3" aria-label={`第 ${snapshot.version} 版方案`}>
    <div className="flex items-start justify-between gap-2"><div><h4 className="text-xs font-semibold text-violet-950">本轮方案 <span className="ml-1 font-normal text-slate-400">v{snapshot.version}</span></h4><p className="mt-1 text-[11px] leading-5 text-slate-500">{snapshot.status === 'approved' ? '已确认' : '待确认'} · 本轮对话记录的方案快照</p></div>{latest && snapshot.status === 'approved' && <button type="button" disabled={disabled || startAllBusy || Boolean(startAllReason) || !onStartAll} onClick={onStartAll} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-violet-600 px-2.5 text-[11px] font-medium text-white hover:bg-violet-700 disabled:bg-violet-200">{startAllBusy ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}{startAllBusy ? '正在制作' : startAllCompleted ? '制作已完成' : '开始制作'}</button>}</div>
    <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-slate-700">{plan.summary}</p>
    {skillNames.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5" aria-label="本轮使用的 Skills">{skillNames.map((name) => <span key={name} className="rounded-full bg-violet-50 px-2 py-1 text-[10px] text-violet-700">{name}</span>)}</div>}
    {draft && <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
      {draft.logoExploration ? <div><p className="text-xs font-semibold text-slate-700">本轮 Logo 候选 · {draft.logoExploration.candidates.length} 款</p><p className="mt-1 text-[11px] text-slate-500">确认制作计划后，每个方向生成一张图，再从成品中挑选。</p><div className="mt-2 space-y-2">{draft.logoExploration.candidates.map((candidate) => <div key={candidate.id} className="rounded-lg border border-slate-200 px-3 py-2 text-xs"><p className="font-semibold text-slate-700">{candidate.name}</p><p className="mt-1 text-slate-500">{candidate.concept}</p><p className="mt-1 text-slate-500">{candidate.imagery}</p></div>)}</div></div> : <div><p className="text-xs font-semibold text-slate-700">选择一个视觉方向</p><div className="mt-2 space-y-2">{draft.directions.map((direction) => {
        const selected = direction.id === draft.selectedDirectionId;
        return <button key={direction.id} type="button" aria-pressed={selected} disabled={disabled || confirmBusy} onClick={() => onChooseDirection(direction.id)} className={`w-full rounded-lg border px-3 py-2 text-left text-xs disabled:opacity-60 ${selected ? 'border-violet-500 bg-violet-50 text-violet-900' : 'border-slate-200 text-slate-700 hover:border-violet-300'}`}><span className="font-semibold">{selected ? '✓ ' : ''}{direction.name}</span><span className="mt-1 block leading-5 text-slate-500">{direction.concept}</span>{direction.logoConcept && <span className="mt-1 block text-slate-500">标志：{direction.logoConcept}</span>}{direction.typography && <span className="mt-1 block text-slate-500">字体：{direction.typography}</span>}{direction.imagery && <span className="mt-1 block text-slate-500">视觉：{direction.imagery}</span>}{direction.rationale && <span className="mt-1 block text-slate-500">考虑：{direction.rationale}</span>}{direction.palette.length > 0 && <span className="mt-2 flex flex-wrap gap-1">{direction.palette.map((color, index) => <span key={`${color.hex}-${index}`} className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-1 text-[10px]"><i className="size-3 rounded-sm border border-black/10" style={{ backgroundColor: color.hex }} />{color.name}</span>)}</span>}</button>;
      })}</div>
      {onExplore && <div className="mt-3 rounded-lg bg-slate-50 p-3"><p className="text-xs font-semibold text-slate-700">比较或融合方向</p><p className="mt-1 text-[11px] text-slate-500">可多选喜欢的方向，再说明想保留的元素；也可以不选，要求重新发散。</p><div className="mt-2 flex flex-wrap gap-1.5">{draft.directions.map((direction) => <button type="button" key={direction.id} aria-pressed={comparisonIds.includes(direction.id)} disabled={disabled || exploreBusy} onClick={() => setComparisonIds((current) => current.includes(direction.id) ? current.filter((id) => id !== direction.id) : [...current, direction.id])} className={`rounded-md border px-2 py-1.5 text-[11px] ${comparisonIds.includes(direction.id) ? 'border-violet-400 bg-violet-100 text-violet-900' : 'border-slate-200 bg-white text-slate-600'}`}>{comparisonIds.includes(direction.id) ? '✓ ' : ''}{direction.name}</button>)}</div><textarea aria-label="方向探索补充要求" value={exploreNote} onChange={(event) => setExploreNote(event.target.value)} disabled={disabled || exploreBusy} maxLength={1000} placeholder="例如：融合 A 的图形和 B 的字体；或再探索更有温度的方向" rows={2} className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs" /><button type="button" disabled={disabled || exploreBusy || (!comparisonIds.length && !exploreNote.trim())} onClick={() => { const chosen = draft.directions.filter((item) => comparisonIds.includes(item.id)).map((item) => `${item.name}（${item.id}）`).join('、'); const text = `请继续风格探索。${chosen ? `我想比较或融合这些方向：${chosen}。` : '请根据我的反馈重新发散。'}${exploreNote.trim() ? `我的想法：${exploreNote.trim()}。` : ''}请保留已确认的品牌要求和原有方向，给出可供选择的下一步，不要开始出图。`; setExploreBusy(true); void onExplore(text).finally(() => setExploreBusy(false)); }} className="mt-2 rounded-lg bg-violet-600 px-3 py-2 text-xs text-white disabled:bg-slate-200 disabled:text-slate-500">{exploreBusy ? '正在发送…' : '继续探索'}</button></div>}
      </div>}
      {draft.questions.length > 0 && <div className="space-y-3"><p className="text-xs font-semibold text-slate-700">补充方案信息</p>{draft.questions.map((question) => <div key={question.id} className="text-xs font-medium text-slate-700"><span>{question.label}{question.required && <span className="ml-1 text-rose-500">*</span>}</span><p className="mt-1 font-normal leading-5 text-slate-500">{question.prompt}</p><QuestionAnswerField question={question} value={answers[question.id] || ''} onChange={(value) => onSetAnswer(question.id, value)} disabled={disabled || confirmBusy} mode={mode} /></div>)}</div>}
      <button type="button" disabled={disabled || confirmBusy || !hasDirection || missingAnswers} onClick={onConfirm} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-200">{confirmBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}{confirmBusy ? '正在确认…' : '确认方案'}</button>
      {(!hasDirection || missingAnswers) && <p className="text-[11px] leading-5 text-slate-500">{!hasDirection ? '请先选择视觉方向。' : '请先填写所有必填信息。'}</p>}
    </div>}
    {latest && snapshot.status === 'approved' && !startAllBusy && startAllReason && <p className="mt-2 text-[11px] leading-5 text-amber-700">{startAllReason}</p>}
    <details className="mt-2 border-t border-slate-100 pt-2">
      <summary className="cursor-pointer text-[11px] font-medium text-violet-700">查看本轮需求与制作计划</summary>
      <div className="mt-2 space-y-3 text-[11px] leading-5 text-slate-600">
        <div><p className="font-semibold text-slate-700">需求摘要</p><p>{[plan.brief.brandName, plan.brief.productOrService, plan.brief.positioning, plan.brief.targetAudience, plan.brief.marketAndChannel, plan.brief.businessGoal].filter(Boolean).join(' · ') || snapshot.inputBrief}</p>{plan.brief.constraints.length > 0 && <p className="mt-1">约束：{plan.brief.constraints.join('；')}</p>}</div>
        {plan.directions.length > 0 && <div><p className="font-semibold text-slate-700">视觉方向</p><div className="mt-1 space-y-2">{plan.directions.map((direction) => <div key={direction.id} className="rounded-lg bg-slate-50 p-2"><p className="font-medium text-slate-700">{direction.name}{direction.id === plan.selectedDirectionId ? ' · 当前选择' : ''}</p><p>{direction.concept}</p>{direction.palette.length > 0 && <div className="mt-1 flex flex-wrap gap-1.5">{direction.palette.map((color, index) => <span key={`${color.hex}-${index}`} title={`${color.name} ${color.hex}`} className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-1"><i className="size-3 rounded-sm border border-black/10" style={{ backgroundColor: /^#[\da-fA-F]{6}$/.test(color.hex) ? color.hex : '#f1f5f9' }} />{color.name}</span>)}</div>}</div>)}</div></div>}
        {tasks.length > 0 && <div><p className="font-semibold text-slate-700">本轮制作计划 · {tasks.length} 项</p><ol className="mt-1 space-y-1.5">{tasks.map((task, index) => <li key={task.id} className="rounded-lg bg-slate-50 px-2 py-1.5"><span className="font-medium text-slate-700">{index + 1}. {task.title}</span>{task.reason && <p>{task.reason}</p>}{task.outputs.length > 0 && <p className="text-slate-400">交付：{task.outputs.join('、')}</p>}</li>)}</ol></div>}
      </div>
    </details>
  </section>;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(path, options);
  const result = await response.json() as Result<T>;
  if (!response.ok || !result.success) throw new Error(result.message || '请求失败');
  return result.data;
}

function ReferenceResults({ messageId, items, disabled, onUse }: { messageId: string; items: DesignReference[]; disabled: boolean; onUse?: (messageId: string, ids: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);
  return <div className="mt-3"><p className="text-xs font-medium text-slate-700">公开设计参考 · 选择最多 4 张</p><p className="mt-1 text-[11px] text-slate-500">用于借鉴设计方向，授权信息未知，请查看来源。</p>
    <div className="mt-2 grid grid-cols-2 gap-2">{items.map((item) => <div key={item.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white"><button type="button" disabled={disabled} aria-pressed={selected.includes(item.id)} onClick={() => setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : current.length < 4 ? [...current, item.id] : current)} className={`relative block w-full text-left ${selected.includes(item.id) ? 'ring-2 ring-inset ring-violet-500' : ''}`}><img src={item.imageUrl} alt={item.title} loading="lazy" referrerPolicy="no-referrer" className="h-28 w-full bg-slate-100 object-contain" onError={(event) => { event.currentTarget.style.visibility = 'hidden'; }} /><span className="absolute left-1 top-1 rounded bg-white/90 px-1.5 text-[10px]">{selected.includes(item.id) ? '✓ 已选择' : '选择'}</span></button><p className="line-clamp-2 px-2 pt-1 text-[11px] leading-4">{item.title}</p><a href={item.sourceUrl || item.imageUrl} target="_blank" rel="noopener noreferrer" className="block px-2 pb-2 text-[10px] text-violet-600">{item.sourceUrl ? '查看来源页面 ↗' : '查看图片来源 ↗'}</a></div>)}</div>
    <button type="button" disabled={disabled || !selected.length} onClick={() => onUse?.(messageId, selected)} className="mt-2 rounded-lg bg-violet-600 px-3 py-1.5 text-xs text-white disabled:opacity-40">参考所选方向（{selected.length}）</button></div>;
}

export function DesignPlanAgent({ project, savedPlan, conversations, sourceConversationId, onSourceConversationChange, onProjectSaved, onPlanApproved, conversationAnswers = {}, onSendQuestions, chatPrompt, pinGenerateAction = false, onGenerateActionChange, modelProfileId, modelUnavailable = false, referenceAssetIds, mode = 'product', variant = 'form', messages = [], productImageUrl, conversationPickerNonce = 0, completedImageCount = 0, interactionDisabled = false, onConversationInputsChange, onRetryMessage, onLoadEarlier, hasEarlierMessages = false, loadingEarlier = false, onRunAction, onStartAll, startAllBusy, startAllCompleted, startAllReason, onSubmitSkillForm, onApplySkillSelection, onExploreDirections, confirmedFormAnswers = {}, toolbarTarget, renderRoundActivity, onUseDesignReferences }: {
  project: Project; savedPlan?: SavedPlan | null; conversations: CollaborationConversation[]; sourceConversationId: string;
  onSourceConversationChange: (id: string) => void; onProjectSaved: (project: Project) => void;
  onPlanApproved?: (sourceConversationId: string) => Promise<void>;
  conversationAnswers?: Record<string, string>;
  onSendQuestions?: (questions: PlanQuestion[]) => Promise<boolean | undefined>;
  chatPrompt?: AgentChatPrompt | null;
  pinGenerateAction?: boolean;
  onGenerateActionChange?: (action: DesignPlanGenerateAction | null) => void;
  modelProfileId?: string;
  mode?: DesignMode;
  referenceAssetIds?: string[];
  modelUnavailable?: boolean;
  variant?: 'form' | 'conversation';
  messages?: DesignAgentMessage[];
  onConversationInputsChange?: (inputs: DesignAgentInputs) => void;
  onRetryMessage?: (messageId: string) => void;
  onLoadEarlier?: () => void;
  hasEarlierMessages?: boolean;
  loadingEarlier?: boolean;
  onRunAction?: (action: DesignAgentAction, runId: string) => void;
  onStartAll?: (roundId?: string) => void;
  startAllBusy?: boolean;
  startAllCompleted?: boolean;
  startAllReason?: string;
  onSubmitSkillForm?: (form: DesignAgentSkillForm, answers: Record<string, string>, skillIds: string[]) => Promise<boolean>;
  onApplySkillSelection?: (skillIds: string[]) => Promise<boolean>;
  onExploreDirections?: (text: string) => Promise<boolean>;
  confirmedFormAnswers?: Record<string, string>;
  productImageUrl?: string;
  conversationPickerNonce?: number;
  completedImageCount?: number;
  interactionDisabled?: boolean;
  toolbarTarget?: HTMLElement | null;
  renderRoundActivity?: (message: DesignAgentMessage) => ReactNode;
  onUseDesignReferences?: (messageId: string, ids: string[]) => void;
}) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [brief, setBrief] = useState(savedPlan?.inputBrief || '');
  const [skillIds, setSkillIds] = useState<string[]>(savedPlan?.selectedSkillIds.length ? savedPlan.selectedSkillIds : variant === 'conversation' ? [] : savedPlan?.plan.recommendedSkills.map((item) => item.skillId) || []);
  const [answers, setAnswers] = useState<Record<string, string>>({ ...recommendedAnswers(savedPlan?.plan), ...(savedPlan?.answers || {}), ...conversationAnswers });
  const [confirmedAnswers, setConfirmedAnswers] = useState<Record<string, string>>({});
  const [plan, setPlan] = useState<DesignPlan | null>(savedPlan?.plan || null);
  const [planVersion, setPlanVersion] = useState(savedPlan?.version || 0);
  const [status, setStatus] = useState(savedPlan?.status || 'needs_review');
  const [savedConversationId, setSavedConversationId] = useState(savedPlan?.sourceConversation ? `${savedPlan.sourceConversation.type === 'intake' ? 'invite' : 'order'}:${savedPlan.sourceConversation.id}` : '');
  const [busy, setBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [skillSearch, setSkillSearch] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [intakeSnapshot, setIntakeSnapshot] = useState<DesignAgentSnapshot | null>(null);
  const sourceTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (variant !== 'form' || savedPlan) return;
    let cancelled = false;
    void request<DesignAgentSnapshot>(`/image-studio/projects/${project.id}/design-agent/conversation`).then((snapshot) => {
      if (!cancelled) setIntakeSnapshot(snapshot);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [project.id, savedPlan?.version, variant]);

  useEffect(() => {
    if (!conversationPickerNonce) return;
    sourceTriggerRef.current?.scrollIntoView({ block: 'nearest' });
    setSourceOpen(true);
  }, [conversationPickerNonce]);

  useEffect(() => {
    void request<Skill[]>('/design-skills').then(setSkills).catch((error) => toast.error(error instanceof Error ? error.message : '设计偏好加载失败，请重试'));
  }, []);

  useEffect(() => {
    if (!savedPlan) return;
    setBrief(savedPlan.inputBrief || '');
    setSkillIds(savedPlan.selectedSkillIds.length ? savedPlan.selectedSkillIds : variant === 'conversation' ? [] : savedPlan.plan.recommendedSkills.map((item) => item.skillId));
    setAnswers({ ...recommendedAnswers(savedPlan.plan), ...(savedPlan.answers || {}), ...conversationAnswers });
    setConfirmedAnswers({});
    setPlan(savedPlan.plan || null);
    setPlanVersion(savedPlan.version || 0);
    setStatus(savedPlan.status || 'needs_review');
    setSavedConversationId(savedPlan.sourceConversation ? `${savedPlan.sourceConversation.type === 'intake' ? 'invite' : 'order'}:${savedPlan.sourceConversation.id}` : '');
  }, [savedPlan?.updatedAt]);

  const pendingSkillChange = Boolean(savedPlan && JSON.stringify([...skillIds].sort()) !== JSON.stringify([...(savedPlan.selectedSkillIds || [])].sort()));
  useEffect(() => { onConversationInputsChange?.({ skillIds, confirmedAnswers, confirmSkillSelection: pendingSkillChange }); }, [skillIds, confirmedAnswers, pendingSkillChange, onConversationInputsChange]);

  useEffect(() => {
    if (!Object.keys(conversationAnswers).length) return;
    setAnswers((current) => ({ ...current, ...conversationAnswers }));
  }, [conversationAnswers]);

  useEffect(() => { onSourceConversationChange(savedConversationId); }, [savedConversationId, onSourceConversationChange]);

  const toggleSkill = (id: string) => setSkillIds((current) => current.includes(id)
    ? current.filter((item) => item !== id)
    : current.length >= 5 ? current : [...current, id]);

  // The embedded form and chat tool use the same persisted interview as the canvas workbench.
  const submitIntake = async (text: string, formAnswers: Record<string, string> = {}, labels: Record<string, string> = {}, chosenSkills = skillIds) => {
    if (busy) return false;
    setBusy(true); setGenerationError('');
    try {
      const [sourceType, sourceId] = sourceConversationId.split(':', 2);
      const snapshot = await request<DesignAgentSnapshot>(`/image-studio/projects/${project.id}/design-agent/messages`, {
        method: 'POST', body: JSON.stringify({ clientMessageId: crypto.randomUUID(), text, mode, skillIds: chosenSkills,
          confirmedAnswers: formAnswers, confirmedAnswerLabels: labels, confirmSkillSelection: true,
          sourceConversation: sourceId ? { type: sourceType === 'invite' ? 'intake' : 'order', id: sourceId } : null,
          referenceAssetIds: referenceAssetIds || [], ...(modelProfileId ? { modelProfileId } : {}) }),
      });
      setIntakeSnapshot(snapshot);
      if (snapshot.status === 'failed') throw new Error(snapshot.error || '需求整理失败，请重试');
      onProjectSaved(snapshot.project);
      setSkillIds(chosenSkills);
      const saved = snapshot.project.workflow.designAgent as SavedPlan | undefined;
      if (saved && (saved.mode || 'product') === mode) {
        setPlan(saved.plan); setPlanVersion(saved.version); setStatus(saved.status); setAnswers(saved.answers);
      }
      return true;
    } catch (error) { const message = error instanceof Error ? error.message : '需求整理失败'; setGenerationError(message); toast.error(message); return false; }
    finally { setBusy(false); }
  };

  const generate = async (briefOverride?: string) => {
    const currentBrief = briefOverride?.trim() || brief.trim();
    if (variant === 'conversation' && onExploreDirections) {
      if (busy || interactionDisabled || modelUnavailable) return;
      setBusy(true);
      try { await onExploreDirections(currentBrief || '请继续收集本项目的设计需求，信息完整并经我确认后再生成设计方案。'); }
      finally { setBusy(false); }
      return;
    }
    if (busy || (currentBrief.length < 8 && !sourceConversationId)) return;
    if (modelUnavailable) { toast.error(referenceAssetIds?.length ? '请先选择可用的图片理解模型' : '请先选择可用的方案与文案模型'); return; }
    if (!plan && variant === 'form') {
      await submitIntake(currentBrief || '请根据关联会话收集设计需求，信息完整后再整理方案。');
      return;
    }
    setBusy(true);
    setGenerationError('');
    try {
      const [conversationType, conversationId] = sourceConversationId.split(':', 2);
      const sourceConversation = conversationId ? { type: conversationType === 'invite' ? 'intake' : 'order', id: conversationId } : undefined;
      const result = await request<{ project: Project; designPlan: SavedPlan }>(`/image-studio/projects/${project.id}/design-agent/plan`, {
        method: 'POST', body: JSON.stringify({ brief: currentBrief || (mode === 'brand' ? '请基于所选客服会话，整理品牌需求并规划品牌识别系统与应用物料。' : '请基于所选客服会话，整理商品需求并规划适用于电商批量生图的商品套图。'), mode, skillIds, answers, sourceConversation, ...(referenceAssetIds ? { referenceAssetIds } : {}), ...(modelProfileId ? { modelProfileId } : {}) }),
      });
      onProjectSaved(result.project);
      setBrief(result.designPlan.inputBrief);
      setAnswers({ ...recommendedAnswers(result.designPlan.plan), ...result.designPlan.answers });
      setPlan(result.designPlan.plan);
      setPlanVersion(result.designPlan.version);
      setStatus(result.designPlan.status);
      toast.success('设计方案已生成');
    } catch (error) { const message = error instanceof Error ? error.message : '设计方案生成失败'; setGenerationError(message); toast.error(message); }
    finally { setBusy(false); }
  };

  const generateRef = useRef<() => void>(() => undefined);
  generateRef.current = () => { void generate(); };
  const generateDisabled = busy || modelUnavailable || interactionDisabled || (variant !== 'conversation' && brief.trim().length < 8 && !sourceConversationId);
  const generateLabel = busy ? '正在整理…' : !plan ? '完善设计需求' : variant === 'conversation' ? '继续调整方案' : '重新生成方案';
  useEffect(() => {
    if (!onGenerateActionChange) return;
    onGenerateActionChange({ onClick: () => generateRef.current(), disabled: generateDisabled, busy, label: generateLabel });
    return () => onGenerateActionChange(null);
  }, [onGenerateActionChange, generateDisabled, busy, generateLabel]);

  const lastChatPromptNonce = useRef(0);
  useEffect(() => {
    if (!chatPrompt || !chatPrompt.nonce || lastChatPromptNonce.current === chatPrompt.nonce) return;
    lastChatPromptNonce.current = chatPrompt.nonce;
    setBrief(chatPrompt.text);
    void generate(chatPrompt.text);
  }, [chatPrompt?.nonce]);

  const save = async (approve: boolean) => {
    if (!plan || busy) return;
    setBusy(true);
    try {
      const result = await request<{ project: Project; designPlan: SavedPlan }>(`/image-studio/projects/${project.id}/design-agent/plan`, {
        method: 'PUT', body: JSON.stringify({ version: project.version, planVersion, plan, answers, approve }),
      });
      onProjectSaved(result.project);
      setPlanVersion(result.designPlan.version);
      setStatus(result.designPlan.status);
      if (approve && sourceConversationId) {
        toast.success('设计方案已确认');
        await onPlanApproved?.(sourceConversationId);
      } else {
        toast.success(approve ? '方案已确认' : '修改已保存');
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : '方案保存失败'); }
    finally { setBusy(false); }
  };

  const setAnswer = (id: string, value: string) => {
    setAnswers((current) => ({ ...current, [id]: value }));
    setConfirmedAnswers((current) => ({ ...current, [id]: value }));
  };
  const chooseDirection = (id: string) => setPlan((current) => current ? { ...current, selectedDirectionId: id } : current);
  const updateBriefField = (key: string, value: string) => setPlan((current) => current ? { ...current, brief: { ...current.brief, [key]: value } } : current);
  const updateDirectionField = (id: string, key: string, value: string) => setPlan((current) => current ? {
    ...current, directions: current.directions.map((direction) => direction.id === id ? { ...direction, [key]: value } : direction),
  } : current);
  const updatePaletteColor = (id: string, colorIndex: number, key: keyof PaletteColor, value: string) => setPlan((current) => current ? {
    ...current, directions: current.directions.map((direction) => direction.id === id ? { ...direction,
      palette: direction.palette.map((color, index) => index === colorIndex ? { ...color, [key]: value } : color) } : direction),
  } : current);
  const requiredAnswersComplete = Boolean(plan?.questions.every((question) => !question.required || Boolean(answers[question.id]?.trim())));
  const sendQuestionsToBrand = async () => {
    if (!plan?.questions.length || !onSendQuestions) return;
    try {
      const sent = await onSendQuestions(plan.questions);
      if (sent !== false) toast.success('必要问题已发送到当前聊天');
    } catch (error) { toast.error(error instanceof Error ? error.message : '问题发送失败，请稍后重试'); }
  };

  const editor = <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700"><Palette className="h-5 w-5" /></div><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-slate-900">品牌设计方案</h3>{plan && <span className={'rounded-full px-2 py-1 text-[10px] font-semibold ' + (status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800')}>{status === 'approved' ? '已确认' : '待确认'}</span>}</div><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">整理需求，补充关键信息，再选定合适的视觉方向。</p></div></div>
      {project.platform && <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[11px] text-slate-500">项目平台 · {project.platform}</span>}
    </div>

    <label className="mt-4 block text-xs font-semibold text-slate-700">品牌、商品与设计目标 <span className="text-rose-500">*</span>
      <textarea value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={6000} rows={4} placeholder={sourceConversationId ? '可以补充这次设计的重点。' : '例如：为便携咖啡品牌设计电商主图和社交媒体视觉，面向年轻租房人群，希望风格活泼但不过分可爱。'} className="mt-2 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm leading-6 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
      <span className="mt-1 block text-right text-[10px] font-normal text-slate-400">{brief.length}/6000</span>
    </label>

    <label className="mt-3 block text-xs font-semibold text-slate-700">客户会话（可选）
      <select value={sourceConversationId} onChange={(event) => onSourceConversationChange(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-normal text-slate-700 outline-none focus:border-indigo-400 sm:max-w-xl"><option value="">不引用会话</option>{conversations.map((item) => <option key={`${item.conversationType}:${item.id}`} value={`${item.conversationType}:${item.id}`}>{item.conversationType === 'invite' ? '邀请会话 · ' : item.orderNo ? `${item.orderNo} · ` : '订单会话 · '}{item.title}</option>)}</select>
    </label>

    <div className="mt-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-700">设计偏好 <span className="font-normal text-slate-400">（可选，最多选 5 项）</span></p><span className="text-[10px] text-slate-400">{skillIds.length}/5</span></div>
      {skills.length ? <div className="mt-2 flex flex-wrap gap-2">{skills.slice(0, 40).map((skill) => { const selected = skillIds.includes(skill.id); return <button key={skill.id} type="button" onClick={() => toggleSkill(skill.id)} disabled={!selected && skillIds.length >= 5} aria-pressed={selected} title={skill.description} className={'rounded-full border px-3 py-1.5 text-[11px] font-medium transition disabled:opacity-50 ' + (selected ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-300 hover:text-indigo-700')}>{categoryLabels[skill.category] || '设计'} · {skill.name}</button>; })}</div> : <p className="mt-2 text-[11px] text-slate-400">正在加载设计偏好…</p>}
    </div>

    {!pinGenerateAction && <div className="mt-3 flex flex-wrap items-center justify-end gap-2"><p className="mr-auto flex items-center gap-1.5 text-[11px] text-slate-500"><CircleAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" />不确定的信息会标记为待补充。</p><button type="button" onClick={() => void generate()} disabled={generateDisabled} className="inline-flex min-h-11 min-w-[190px] shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-xs font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:opacity-60">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Palette className="h-4 w-4" />}{generateLabel}</button></div>}

    {!plan && intakeSnapshot && <div className="mt-4 space-y-3">
      {[...intakeSnapshot.messages].reverse().filter((message) => message.role === 'assistant').slice(0, 1).map((message) => <div key={message.id}>
        <p className="whitespace-pre-wrap text-xs leading-6 text-slate-600">{message.text}</p>
        {message.skillConfirmationForm && <SkillConfirmationCard form={message.skillConfirmationForm} skills={skills} disabled={busy} mode={mode}
          confirmedAnswers={Object.fromEntries(Object.entries(intakeSnapshot.memory.fields).flatMap(([key, fact]) => key.startsWith('answer.') && fact.status === 'confirmed' ? [[key.slice(7), fact.value]] : []))}
          onSubmit={(form, values, ids) => submitIntake(form.questions.filter((question) => values[question.id]).map((question) => `${question.label}：${values[question.id]}`).join('\n'), values,
            Object.fromEntries(form.questions.map((question) => [question.id, question.label])), form.skillIds.length ? ids : skillIds)} />}
      </div>)}
    </div>}
    {generationError && variant === 'form' && <p role="alert" className="mt-3 text-xs text-rose-600">{generationError}</p>}
    {plan && <div className="mt-5 space-y-4 border-t border-indigo-100 pt-4">
      <article className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-50 text-indigo-700"><Check className="h-4 w-4" /></span><h4 className="text-sm font-bold">需求概览</h4></div><textarea aria-label="方案摘要" value={plan.summary} onChange={(event) => setPlan((current) => current ? { ...current, summary: event.target.value } : current)} rows={2} className="mt-2 w-full resize-y rounded-lg border border-slate-200 p-2.5 text-sm leading-6 text-slate-700 outline-none focus:border-indigo-400" />
        <div className="mt-3 grid gap-2 sm:grid-cols-2">{([['brandName', '品牌 / 项目'], ['productOrService', '商品 / 服务'], ['positioning', '定位'], ['targetAudience', '目标人群'], ['marketAndChannel', '渠道'], ['businessGoal', '业务目标']] as const).map(([key, label]) => <label key={key} className="rounded-lg bg-slate-50 p-2.5 text-[11px] font-semibold text-slate-500">{label}<input value={plan.brief[key]} onChange={(event) => updateBriefField(key, event.target.value)} className="mt-1 h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-normal text-slate-800 outline-none focus:border-indigo-400" /></label>)}</div>
        {plan.brief.knownFacts.length > 0 && <p className="mt-3 text-xs leading-5 text-emerald-800"><b>已知依据：</b>{plan.brief.knownFacts.join('；')}</p>}
        {plan.brief.constraints.length > 0 && <p className="mt-2 text-xs leading-5 text-slate-600"><b>约束：</b>{plan.brief.constraints.join('；')}</p>}
        {plan.brief.factsToConfirm.length > 0 && <p className="mt-2 rounded-lg bg-amber-50 p-2.5 text-xs leading-5 text-amber-900"><b>待核实：</b>{plan.brief.factsToConfirm.join('；')}</p>}
      </article>

      {plan.recommendedSkills.length > 0 && <div className="rounded-xl bg-violet-50 p-3"><p className="text-xs font-semibold text-violet-900">适合的设计领域</p><div className="mt-2 flex flex-wrap gap-2">{plan.recommendedSkills.map((item) => { const skill = skills.find((entry) => entry.id === item.skillId); return <span key={item.skillId} title={item.reason} className="rounded-lg bg-white px-2.5 py-1.5 text-[11px] text-violet-800">{skill?.name || '设计方向'}</span>; })}</div></div>}

      {plan.questions.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 sm:p-4"><div className="flex items-start justify-between gap-2"><div><h4 className="text-xs font-bold text-amber-950">还需要确认</h4><p className="mt-1 text-[11px] leading-5 text-amber-800">推荐内容已填入，可以直接修改，或点选其他建议。</p></div><span className="rounded-full bg-white px-2 py-1 text-[10px] text-amber-800">{plan.questions.length} 个问题</span></div><div className="mt-3 grid gap-3 sm:grid-cols-2">{plan.questions.map((question) => <div key={question.id} className="rounded-xl border border-amber-100 bg-white p-3 text-xs font-semibold text-slate-700">{question.label}{question.required && <span className="ml-1 text-rose-500">*</span>}<span className="mt-1 block font-normal leading-5 text-slate-500">{question.prompt}</span><QuestionAnswerField question={question} value={answers[question.id] || ''} onChange={(value) => setAnswer(question.id, value)} accent="amber" mode={mode} /></div>)}</div><div className="mt-3 flex flex-wrap gap-2">{onSendQuestions && <button type="button" onClick={() => void sendQuestionsToBrand()} disabled={busy} className="h-9 rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white disabled:opacity-50">发给品牌方</button>}{!pinGenerateAction && <button type="button" onClick={() => void generate()} disabled={busy} className="h-9 rounded-lg border border-amber-300 bg-white px-3 text-xs font-semibold text-amber-900 disabled:opacity-50">更新方案</button>}</div></div>}

      <div><div className="flex flex-wrap items-end justify-between gap-2"><div><h4 className="text-sm font-bold">视觉方向</h4><p className="mt-1 text-[11px] text-slate-500">修改内容后，选择最合适的方向。</p></div><span className="text-[10px] text-slate-400">{plan.directions.length} 个方向</span></div><div className="mt-3 grid gap-3 xl:grid-cols-2">{plan.directions.map((direction, index) => { const selected = plan.selectedDirectionId === direction.id; return <article key={direction.id} className={'rounded-2xl border bg-white p-4 transition ' + (selected ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200')}><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600">方向 {index + 1}</p><input aria-label={`方向 ${index + 1} 名称`} value={direction.name} onChange={(event) => updateDirectionField(direction.id, 'name', event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm font-bold text-slate-900 outline-none focus:border-indigo-400" /></div><button type="button" onClick={() => chooseDirection(direction.id)} aria-pressed={selected} className={'h-9 shrink-0 rounded-lg px-3 text-xs font-semibold ' + (selected ? 'bg-indigo-600 text-white' : 'border border-slate-200 text-slate-600 hover:border-indigo-300 hover:text-indigo-700')}>{selected ? '已选方向' : '选择此方向'}</button></div><textarea aria-label="方向概念" value={direction.concept} onChange={(event) => updateDirectionField(direction.id, 'concept', event.target.value)} rows={2} className="mt-2 w-full resize-y rounded-lg border border-slate-200 p-2 text-xs font-medium leading-5 text-slate-700 outline-none focus:border-indigo-400" /><label className="mt-2 block text-[10px] font-semibold text-slate-500">定位<input value={direction.positioning} onChange={(event) => updateDirectionField(direction.id, 'positioning', event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs font-normal text-slate-700 outline-none focus:border-indigo-400" /></label><label className="mt-2 block text-[10px] font-semibold text-slate-500">目标人群<input value={direction.audience} onChange={(event) => updateDirectionField(direction.id, 'audience', event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-xs font-normal text-slate-700 outline-none focus:border-indigo-400" /></label><div className="mt-3 flex flex-wrap gap-1.5">{direction.keywords.map((keyword) => <span key={keyword} className="rounded-full bg-indigo-50 px-2 py-1 text-[10px] text-indigo-700">{keyword}</span>)}</div><div className="mt-3 rounded-xl bg-slate-50 p-3"><div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-slate-700"><Palette className="h-3.5 w-3.5" />建议配色</div><div className="space-y-2">{direction.palette.map((color, colorIndex) => <div key={`${direction.id}-${colorIndex}`} className="grid grid-cols-[1.5rem_minmax(4.5rem,.65fr)_5.5rem_minmax(5rem,1fr)] items-center gap-1.5"><span className="h-6 w-6 rounded-md border border-black/10" style={{ backgroundColor: /^#[0-9a-fA-F]{6}$/.test(color.hex) ? color.hex : '#ffffff' }} /><input aria-label="颜色名称" value={color.name} onChange={(event) => updatePaletteColor(direction.id, colorIndex, 'name', event.target.value)} className="h-8 min-w-0 rounded-md border border-slate-200 px-1.5 text-[10px]" /><input aria-label="色值" value={color.hex} onChange={(event) => updatePaletteColor(direction.id, colorIndex, 'hex', event.target.value)} className="h-8 min-w-0 rounded-md border border-slate-200 px-1.5 font-mono text-[10px]" /><input aria-label="颜色用途" value={color.usage} onChange={(event) => updatePaletteColor(direction.id, colorIndex, 'usage', event.target.value)} className="h-8 min-w-0 rounded-md border border-slate-200 px-1.5 text-[10px]" /></div>)}</div></div><label className="mt-3 block text-[10px] font-semibold text-slate-500">字体排版<textarea value={direction.typography} onChange={(event) => updateDirectionField(direction.id, 'typography', event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-[11px] font-normal leading-5 text-slate-700" /></label><label className="mt-2 block text-[10px] font-semibold text-slate-500">图像风格<textarea value={direction.imagery} onChange={(event) => updateDirectionField(direction.id, 'imagery', event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-slate-200 p-2 text-[11px] font-normal leading-5 text-slate-700" /></label><p className="mt-2 text-[11px] leading-5 text-slate-600"><b>设计理由：</b>{direction.rationale}</p>{direction.deliverables.length > 0 && <p className="mt-2 text-[10px] text-slate-500"><b>交付建议：</b>{direction.deliverables.join(' · ')}</p>}</article>; })}</div></div>

      {mode === 'brand' && plan.directions.find((direction) => direction.id === plan.selectedDirectionId) && <section className="rounded-xl border border-violet-100 bg-violet-50/50 p-3 text-xs leading-5 text-slate-600"><h4 className="font-semibold text-violet-800">品牌识别草案</h4>{(() => { const direction = plan.directions.find((item) => item.id === plan.selectedDirectionId)!; return <div className="mt-2 space-y-1.5">{direction.logoConcept && <p><b>Logo 概念：</b>{direction.logoConcept}</p>}{direction.graphicSystem && <p><b>图形系统：</b>{direction.graphicSystem}</p>}{direction.toneOfVoice && <p><b>品牌语气：</b>{direction.toneOfVoice}</p>}{direction.applicationExamples?.length ? <p><b>应用示例：</b>{direction.applicationExamples.join(' · ')}</p> : null}</div>; })()}</section>}
      {(plan.taskGraph?.length || 0) > 0 && <p className="rounded-xl bg-indigo-50 p-3 text-xs leading-5 text-indigo-800">已整理 {plan.taskGraph?.length} 项后续工作，制作进度会显示在工作台对话中。</p>}
      {!requiredAnswersComplete && <p className="border-t border-slate-100 pt-3 text-right text-[11px] text-amber-700">请补充全部必填问题后再确认方案。</p>}
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3"><button type="button" onClick={() => void save(false)} disabled={busy} className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700 disabled:opacity-50">保存修改</button><button type="button" onClick={() => void save(true)} disabled={busy || (!plan.logoExploration && !plan.selectedDirectionId) || !requiredAnswersComplete} className="h-10 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white disabled:opacity-50">{busy ? '保存中…' : status === 'approved' ? '重新确认方案' : '确认方案'}</button></div>
    </div>}
  </section>;

  const showLegacyConversationPanels = variant === 'form';
  if (showLegacyConversationPanels) return editor;

  const source = conversations.find((item) => `${item.conversationType}:${item.id}` === sourceConversationId);
  const activeSkillIds = skillIds;
  const baseMessages: DesignAgentMessage[] = messages.length ? messages : savedPlan?.inputBrief ? [{ id: 'initial-brief', role: 'user' as const, text: savedPlan.inputBrief }] : [];
  const newestSnapshot = [...baseMessages].reverse().find((message) => message.role === 'assistant' && message.planSnapshot)?.planSnapshot;
  const visibleMessages: DesignAgentMessage[] = variant === 'conversation' && savedPlan && newestSnapshot?.version !== savedPlan.version
    ? [...baseMessages, { id: `current-plan-${savedPlan.version}`, role: 'assistant', text: '当前设计方案。', planSnapshot: savedPlan, roundSkillIds: savedPlan.selectedSkillIds }]
    : baseMessages;
  const selectedDirection = plan?.directions.find((direction) => direction.id === plan.selectedDirectionId);
  const answeredCount = plan?.questions.filter((question) => Boolean(answers[question.id]?.trim())).length || 0;
  const avatar = (user = false) => <span className={`grid size-8 shrink-0 place-items-center rounded-full ${user ? 'bg-violet-100 text-violet-600' : 'bg-[#f0ebff] text-[#7547ff]'}`}>{user ? <UserRound className="size-4" /> : <Sparkles className="size-4" />}</span>;

  return <div className={`space-y-6 ${interactionDisabled ? 'pointer-events-none opacity-70' : ''}`} aria-label="需求与方案对话">
    {toolbarTarget && createPortal(<Popover open={sourceOpen} onOpenChange={setSourceOpen}>
      <PopoverTrigger asChild><button ref={sourceTriggerRef} type="button" title={source?.title || '关联品牌方会话'} className="inline-flex max-w-full items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600 outline-none focus-visible:ring-2 focus-visible:ring-violet-300"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-teal-500 text-white"><Leaf className="size-3" /></span><span className="truncate">{sourceConversationId ? '已关联品牌方会话' : '关联品牌方会话'}</span><ChevronDown className="size-3 shrink-0 text-slate-400" /></button></PopoverTrigger>
      <PopoverContent align="start" className="z-[160] w-[min(330px,calc(100vw-2rem))] rounded-2xl border-slate-200 bg-white p-2 text-slate-800 outline-none">
        <p className="px-2 py-2 text-xs font-semibold">引用会话需求</p>
        <div className="max-h-64 space-y-1 overflow-y-auto"><button type="button" onClick={() => { onSourceConversationChange(''); setSourceOpen(false); }} className="w-full rounded-lg px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-50">不引用会话</button>{conversations.map((item) => { const id = `${item.conversationType}:${item.id}`; return <button type="button" key={id} onClick={() => { onSourceConversationChange(id); setSourceOpen(false); }} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-violet-50 ${id === sourceConversationId ? 'bg-violet-50 text-violet-700' : 'text-slate-700'}`}><span className="min-w-0 flex-1 break-words">{item.title}</span>{id === sourceConversationId && <Check className="size-3.5 shrink-0" />}</button>; })}{!conversations.length && <p className="px-3 py-3 text-xs text-slate-400">暂无可关联的会话</p>}</div>
      </PopoverContent>
    </Popover>, toolbarTarget)}

    {hasEarlierMessages && <button type="button" disabled={loadingEarlier || interactionDisabled} onClick={onLoadEarlier} className="w-full py-1 text-xs text-slate-400 hover:text-violet-600 disabled:opacity-40">{loadingEarlier ? '加载中…' : '查看更早的对话'}</button>}
    {visibleMessages.map((message) => message.role === 'user'
      ? <div key={message.id} data-agent-message className="flex items-start justify-end gap-3" aria-label="用户消息"><div className="min-w-0 max-w-[85%]"><div className="whitespace-pre-wrap break-words rounded-2xl rounded-tr-md bg-[#7547ff] px-3.5 py-3 text-[13px] leading-6 text-white">{message.text}{Boolean(message.designReferences?.length) && <div className="mt-2 flex flex-wrap gap-2">{message.designReferences!.map((item) => <a key={item.id} href={item.sourceUrl || item.imageUrl} target="_blank" rel="noopener noreferrer" title={item.title}><img src={item.imageUrl} alt={item.title} referrerPolicy="no-referrer" className="size-16 rounded-lg bg-white object-contain" /></a>)}</div>}{Boolean(message.attachments?.length) && <div className="mt-2 flex flex-wrap gap-2">{message.attachments!.map((asset) => <a key={asset.assetId} href={asset.previewUrl} target="_blank" rel="noreferrer" title={asset.title}><img src={asset.previewUrl} alt={asset.title} className="size-16 rounded-lg object-cover" /></a>)}</div>}</div>{message.runStatus === 'failed' && <div className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-600"><p>{message.error || '这条消息未能完成回复，已有方案没有改变。'}</p><button type="button" disabled={interactionDisabled} onClick={() => onRetryMessage?.(message.id)} className="mt-1 font-medium underline disabled:opacity-40">重试这条消息</button></div>}</div>{avatar(true)}</div>
      : <div key={message.id} data-agent-message className="flex items-start gap-3" aria-label="设计 Agent 回复">{avatar()}<div className="min-w-0 max-w-[90%] rounded-2xl rounded-tl-md bg-[#f4f5f9] px-3.5 py-3 text-[13px] leading-6 text-slate-700">{renderRoundActivity?.(message)}<p className="whitespace-pre-wrap break-words">{message.text}</p>{message.referenceSearchQuery && <p className="mt-2 text-[11px] text-slate-500">搜索：{message.referenceSearchQuery}</p>}{message.referenceSearchError && <p className="mt-2 text-xs text-rose-600">{message.referenceSearchError}</p>}{message.referenceSearchQuery && !message.referenceSearchError && !message.designReferences?.length && <p className="mt-2 text-xs text-slate-500">未找到可展示的参考图，请调整关键词重试。</p>}{Boolean(message.designReferences?.length) && <ReferenceResults messageId={message.id} items={message.designReferences!} disabled={interactionDisabled} onUse={onUseDesignReferences} />}{Boolean(message.changes?.length) && <details className="mt-2 text-[11px] text-slate-500"><summary className="cursor-pointer">查看本轮调整</summary><p className="mt-1 whitespace-pre-wrap">{message.changes!.join('\n')}</p></details>}{Boolean(message.actions?.length) && <div className="mt-2 flex flex-wrap gap-2">{message.actions!.map((action, index) => <button key={index} type="button" disabled={interactionDisabled} onClick={() => onRunAction?.(action, message.runId || message.id)} className="rounded-lg bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700 disabled:opacity-40">{action.label || '开始制作'}</button>)}</div>}{message.skillConfirmationForm && onSubmitSkillForm && <SkillConfirmationCard form={message.skillConfirmationForm} skills={skills} mode={mode} confirmedAnswers={confirmedFormAnswers} disabled={interactionDisabled} onSubmit={onSubmitSkillForm} />}{variant === 'conversation' && <PlanRoundCard message={message} skills={skills} latest={message.id === [...visibleMessages].reverse().find((item) => item.role === 'assistant' && item.planSnapshot)?.id && message.planSnapshot?.version === savedPlan?.version && (!savedPlan?.mode || savedPlan.mode === mode)} disabled={interactionDisabled} currentPlan={plan} answers={answers} mode={mode} onChooseDirection={chooseDirection} onSetAnswer={setAnswer} onConfirm={() => void save(true)} confirmBusy={busy} onStartAll={() => onStartAll?.(message.runId || message.id)} startAllBusy={startAllBusy} startAllCompleted={startAllCompleted} startAllReason={startAllReason} onExplore={onExploreDirections} />}</div></div>)}

    {interactionDisabled && visibleMessages.at(-1)?.role === 'user' && <div className="flex items-start gap-3" role="status">{avatar()}<div className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-2 text-xs text-slate-500"><Loader2 className="size-3.5 animate-spin" />{/(搜索|查找|找一些|找一下|找些|找一组|联网).{0,24}(参考|案例|图片|风格)/.test(visibleMessages.at(-1)?.text || '') ? '正在搜索公开设计参考并整理结果…' : '正在处理本轮需求…'}</div></div>}

    {mode === 'brand' && toolbarTarget && createPortal(<Popover>
      <PopoverTrigger asChild><button type="button" disabled={busy || interactionDisabled} className="rounded-lg bg-violet-50 px-2.5 py-2 text-[11px] font-medium text-violet-700 disabled:opacity-50">Skills {activeSkillIds.length}/5</button></PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="z-[160] w-[min(360px,calc(100vw-2rem))] rounded-2xl border-slate-200 bg-white p-3 text-slate-800">
        <div className="flex items-center justify-between text-xs"><span className="font-semibold">品牌设计 Skills</span><span className="text-slate-400">{skillIds.length}/5</span></div>
        <p className="mt-1 text-[10px] text-slate-400">选择后用于下一条消息，或应用到当前方案。</p>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-slate-200 px-2.5"><Search className="size-3.5 text-slate-400" /><input aria-label="搜索设计 Skills" value={skillSearch} onChange={(event) => setSkillSearch(event.target.value)} placeholder="搜索设计领域" className="h-9 min-w-0 flex-1 border-0 bg-transparent text-xs outline-none" /></div>
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto">{skills.filter((skill) => `${skill.name} ${categoryLabels[skill.category] || ''}`.toLowerCase().includes(skillSearch.trim().toLowerCase())).map((skill) => { const checked = skillIds.includes(skill.id); return <button type="button" key={skill.id} aria-pressed={checked} disabled={!checked && skillIds.length >= 5} onClick={() => toggleSkill(skill.id)} className={`flex w-full items-center gap-3 rounded-lg p-2 text-left text-xs disabled:opacity-40 ${checked ? 'bg-violet-50 text-violet-700' : 'text-slate-700 hover:bg-slate-50'}`}><span className="min-w-0 flex-1"><span className="block">{skill.name}</span><span className="mt-1 block text-[10px] text-slate-400">{categoryLabels[skill.category] || '其他'}</span></span>{checked && <Check className="size-3.5 shrink-0" />}</button>; })}{!skills.length && <p className="p-3 text-xs text-slate-400">正在加载…</p>}</div>
        {pendingSkillChange && onApplySkillSelection && <button type="button" disabled={interactionDisabled || busy} onClick={() => void onApplySkillSelection(skillIds)} className="mt-2 w-full rounded-lg bg-violet-600 px-3 py-2 text-xs text-white disabled:opacity-50">应用到当前方案</button>}
      </PopoverContent>
    </Popover>, toolbarTarget)}

    {!plan && !busy && !visibleMessages.length && <div className="flex items-start gap-3">{avatar()}<div className="rounded-2xl rounded-tl-md bg-[#f4f5f9] px-3.5 py-3 text-[13px] leading-6 text-slate-600">{mode === 'brand' ? '告诉我品牌名称、业务和目标人群，也可以上传现有 Logo 或品牌资料。我会先整理定位，再给出视觉方向和品牌资产计划。' : '想为商品做一套什么样的图？添加商品图，告诉我你的想法，我们从视觉方向开始。'}</div></div>}

    {showLegacyConversationPanels && plan && <div className="flex items-start gap-3">{avatar()}<div className="min-w-0 flex-1 space-y-3">
      <div className="rounded-2xl rounded-tl-md bg-[#f4f5f9] px-3.5 py-3 text-[13px] leading-6 text-slate-700"><p className="mb-1 text-[10px] text-slate-400">当前方案</p><p className="line-clamp-3">{plan.summary}</p></div>
      <div className="flex items-center justify-between"><span className="text-xs font-medium text-slate-700">{status === 'approved' ? '已确认的视觉方向' : '选择视觉方向'}</span><button type="button" onClick={() => setDetailsOpen(true)} className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-violet-600">查看方案<ArrowUpRight className="size-3" /></button></div>
      <div className="space-y-2.5">{plan.directions.map((direction) => { const selected = direction.id === plan.selectedDirectionId; return <button type="button" key={direction.id} aria-pressed={selected} disabled={busy} onClick={() => chooseDirection(direction.id)} className={`w-full rounded-xl border p-3 text-left transition disabled:opacity-60 ${selected ? 'border-violet-400 bg-violet-50/30 ring-1 ring-violet-100' : 'border-slate-200 bg-white hover:border-violet-200'}`}><div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-800">{direction.name}</span>{selected && <span className={`inline-flex shrink-0 items-center gap-1 text-[10px] ${status === 'approved' && direction.id === savedPlan?.plan.selectedDirectionId ? 'text-emerald-600' : 'text-violet-600'}`}><Check className="size-3" />{status === 'approved' && direction.id === savedPlan?.plan.selectedDirectionId ? '已确认' : '已选择'}</span>}</div><div className="flex items-stretch gap-3">{productImageUrl && <img src={productImageUrl} alt="商品外观参考" className="h-[76px] w-16 shrink-0 rounded-lg bg-slate-50 object-contain" />}<div className="min-w-0 flex-1"><div className="flex gap-1.5">{direction.palette.slice(0, 5).map((color, index) => <span key={index} title={`${color.name} ${color.hex}`} className="h-7 min-w-0 flex-1 rounded-md border border-black/5" style={{ backgroundColor: /^#[\da-fA-F]{6}$/.test(color.hex) ? color.hex : '#f1f5f9' }} />)}</div><p className="mt-2 line-clamp-2 text-[11px] leading-[18px] text-slate-500">{direction.concept}</p></div></div></button>; })}</div>
      {plan.questions.length > 0 && <section className="rounded-xl border border-slate-200 bg-white"><div className="px-3 py-3 text-xs font-medium text-slate-700">补充需求信息<span className="ml-2 text-[10px] font-normal text-slate-400">{answeredCount}/{plan.questions.length} 项已填入建议，可直接修改</span></div><div className="space-y-3 border-t border-slate-100 p-3">{plan.questions.map((question) => <div key={question.id} className="text-xs text-slate-700"><span className="font-medium">{question.label}{question.required && <span className="ml-1 text-rose-500">*</span>}</span><span className="mt-1 block text-[11px] leading-5 text-slate-400">{question.prompt}</span><QuestionAnswerField question={question} value={answers[question.id] || ''} onChange={(value) => setAnswer(question.id, value)} disabled={interactionDisabled} mode={mode} /></div>)}{onSendQuestions && <button type="button" disabled={interactionDisabled} onClick={() => void sendQuestionsToBrand()} className="text-xs font-medium text-violet-600 disabled:opacity-50">发送给品牌方补充</button>}</div></section>}
      <div className="flex flex-wrap items-center gap-2"><button type="button" disabled={busy || !selectedDirection || !requiredAnswersComplete} onClick={() => void save(true)} className="h-9 rounded-lg bg-[#7547ff] px-3 text-xs font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">{status === 'approved' ? '更新已确认方向' : '确认此方向'}</button><button type="button" disabled={busy} onClick={() => void save(false)} className="h-9 rounded-lg border border-slate-200 px-3 text-xs text-slate-600 disabled:opacity-50">保存修改</button></div>
      {!requiredAnswersComplete && <p className="text-[11px] leading-5 text-amber-600">补充必填信息后即可确认方向。</p>}
    </div></div>}

    {busy && <div className="flex items-start gap-3" role="status">{avatar()}<div className="flex items-center gap-2 rounded-2xl rounded-tl-md bg-violet-50 px-3.5 py-3 text-xs text-violet-600"><Loader2 className="size-3.5 animate-spin" />正在整理需求与视觉方案…</div></div>}
    {generationError && !busy && <p role="alert" className="ml-11 rounded-xl bg-rose-50 px-3 py-2.5 text-xs leading-5 text-rose-700">{generationError}</p>}

    <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}><DialogContent className="flex max-h-[90dvh] max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl bg-white p-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:rounded-none"><DialogHeader className="shrink-0 border-b border-slate-100 px-6 py-5 text-left"><DialogTitle className="text-base">设计方案</DialogTitle><DialogDescription className="text-xs">查看和编辑需求、补充信息与视觉方向。</DialogDescription></DialogHeader><div className="min-h-0 flex-1 overflow-y-auto p-4">{editor}</div></DialogContent></Dialog>
  </div>;
}
