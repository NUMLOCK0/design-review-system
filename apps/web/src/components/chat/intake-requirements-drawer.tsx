'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarDays, FileText, LoaderCircle, PanelRight, Sparkles, X } from 'lucide-react';
import { fetchWithAuth } from '@/lib/auth';
import { parseChatCard } from '@/lib/chat-cards';
import { checklistAnswerImages, formatChecklistAnswer } from '@/lib/chat-form-answer';
import { AuthenticatedImage } from '@/components/authenticated-image';

type RequirementMessage = { id: string; seq: number; senderId: string; senderName: string; body: string; createdAt: string };
type AiModel = { id: string; name: string; model: string | null; capability: 'text' | 'vision' | 'image' };
type Tab = 'original' | 'summary';

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function IntakeRequirementsDrawer({ conversationId, messages, brandUserIds, brandName }: { conversationId: string; messages: RequirementMessage[]; brandUserIds: string[]; brandName?: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('original');
  const [summary, setSummary] = useState('');
  const [summaryError, setSummaryError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [models, setModels] = useState<AiModel[]>([]);
  const [modelProfileId, setModelProfileId] = useState('');
  const brandIds = useMemo(() => new Set(brandUserIds.filter(Boolean)), [brandUserIds]);
  const records = useMemo(() => {
    const answers = new Map<string, { message: RequirementMessage; card: Extract<NonNullable<ReturnType<typeof parseChatCard>>, { kind: 'form_answers' }> }>();
    for (const message of messages) {
      if (!brandIds.has(message.senderId)) continue;
      const card = parseChatCard(message.body);
      if (card?.kind === 'form_answers') answers.set(card.formMessageId, { message, card });
    }
    return messages.flatMap((message) => {
      const card = parseChatCard(message.body);
      if (card?.kind !== 'work_card' || card.templateId !== 'intake_checklist') return [];
      const response = answers.get(message.id);
      const values = new Map(response?.card.answers.map((answer) => [answer.fieldIndex, answer.value]));
      return [{
        id: message.id,
        title: card.title,
        createdAt: response?.message.createdAt || message.createdAt,
        senderName: response?.message.senderName || brandName || '品牌方',
        answers: card.fields.map((field, fieldIndex) => ({ question: field.label, answer: values.has(fieldIndex) ? formatChecklistAnswer(field, values.get(fieldIndex) || '') : '', images: values.has(fieldIndex) ? checklistAnswerImages(field, values.get(fieldIndex) || '') : [] })),
        submitted: Boolean(response),
      }];
    }).sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }, [messages, brandIds, brandName]);
  const answeredCount = records.filter((item) => item.submitted).length;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetchWithAuth('/image-studio/model-profiles');
        const result = await response.json();
        if (!response.ok || !result?.success) throw new Error(result?.message || '加载 AI 模型失败');
        if (cancelled) return;
        const chatModels = (Array.isArray(result.data) ? result.data as AiModel[] : []).filter((item) => item.capability === 'text' || item.capability === 'vision');
        const available = chatModels.some((item) => item.capability === 'text') ? chatModels.filter((item) => item.capability === 'text') : chatModels;
        setModels(available);
        setModelProfileId((current) => available.some((item) => item.id === current) ? current : available[0]?.id || '');
        if (!available.length) setSummaryError('没有已启用的文生文模型档案，请联系管理员在模型设置中配置。');
      } catch (error) {
        if (!cancelled) setSummaryError(error instanceof Error ? error.message : '加载 AI 模型失败');
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  const generateSummary = async () => {
    if (!modelProfileId) { setSummaryError('请先选择一个已启用的模型'); return; }
    setGenerating(true);
    setSummaryError('');
    try {
      const response = await fetchWithAuth(`/intake-sessions/${encodeURIComponent(conversationId)}/summary`, { method: 'POST', body: JSON.stringify({ modelProfileId }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'AI 总结生成失败');
      setSummary(String(result.data.summary || ''));
    } catch (error) {
      setSummaryError(error instanceof Error ? error.message : 'AI 总结生成失败');
    } finally {
      setGenerating(false);
    }
  };

  return <>
    <button type="button" onClick={() => setOpen(true)} aria-expanded={open} aria-controls="intake-requirements-drawer" className="inline-flex shrink-0 items-center gap-1.5 rounded-full role-primary-soft px-3 py-1.5 text-xs font-semibold role-primary-text hover:opacity-80">
      <PanelRight className="h-3.5 w-3.5" />协作档案<span className="rounded-full bg-white/80 px-1.5 py-0.5 text-[10px]">{answeredCount}</span>
    </button>
    {open && <div className="absolute inset-0 z-[70]">
      <button type="button" aria-label="关闭协作档案抽屉" onClick={() => setOpen(false)} className="absolute inset-0 h-full w-full bg-slate-950/25" />
      <aside id="intake-requirements-drawer" role="complementary" aria-label="品牌方协作档案" className="absolute inset-y-0 right-0 flex w-[430px] max-w-[94vw] flex-col border-l border-slate-200 bg-white shadow-2xl">
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl role-primary-soft role-primary-text"><FileText className="h-4 w-4" /></div>
          <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-bold text-slate-900">协作档案</h2><p className="mt-0.5 truncate text-[11px] text-slate-400">{brandName || '品牌方'} · {answeredCount} 份已提交表单</p></div>
          <button type="button" aria-label="收起协作档案抽屉" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
        </header>
        <div role="tablist" aria-label="档案内容" className="flex shrink-0 gap-1 border-b border-slate-100 px-4 pt-2">
          {([['original', '原始会话'], ['summary', 'AI 总结']] as const).map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`border-b-2 px-3 py-2.5 text-xs font-semibold ${tab === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>{label}</button>)}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/70 p-4">
          {tab === 'original' ? records.length ? <div className="space-y-3">{records.map((record) => <article key={record.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2"><h3 className="text-sm font-semibold leading-5 text-slate-800">{record.title}</h3><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] ${record.submitted ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{record.submitted ? '已提交' : '待填写'}</span></div>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400"><CalendarDays className="h-3 w-3" />{record.senderName} · {formatDate(record.createdAt)}</div>
            <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100">{record.answers.map((item, index) => <div key={`${record.id}-${index}`} className="py-3 first:pt-3 last:pb-0"><p className="text-xs font-semibold leading-5 text-slate-500">{index + 1}. {item.question}</p><p className={`mt-1 whitespace-pre-wrap break-words text-sm leading-6 ${item.answer ? 'text-slate-800' : 'text-slate-300'}`}>{item.answer || '尚未回答'}</p>{item.images.length > 0 && <div className="mt-2 grid grid-cols-2 gap-2">{item.images.map((image, imageIndex) => <div key={`${image.url}-${imageIndex}`} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50"><AuthenticatedImage src={image.url} alt={image.label} className="h-28 w-full object-cover" /><p className="truncate px-2 py-1 text-[10px] text-slate-500">{image.label}</p></div>)}</div>}</div>)}</div>
          </article>)}</div> : <div className="flex h-full min-h-64 flex-col items-center justify-center px-6 text-center"><div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-300 shadow-sm"><FileText className="h-5 w-5" /></div><p className="mt-4 text-sm font-semibold text-slate-600">还没有表单问题</p><p className="mt-1 text-xs leading-5 text-slate-400">发送组合需求或标准需求清单后，问题和品牌方回答会自动归档在这里。</p></div>
          : <div className="space-y-4">
            <div className="rounded-xl border border-violet-100 bg-white p-4"><div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-600" /><h3 className="text-sm font-bold text-slate-800">最终设计方案</h3></div><p className="mt-2 text-xs leading-5 text-slate-500">结合原始聊天记录与品牌方已提交的表单回答，生成可执行的设计方案摘要。</p><label className="mt-3 block text-xs font-semibold text-slate-700">文生文模型<select value={modelProfileId} onChange={(event) => setModelProfileId(event.target.value)} disabled={!models.length || generating} className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs"><option value="">选择已启用模型</option>{models.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.model || '默认模型'}</option>)}</select></label><button type="button" onClick={() => void generateSummary()} disabled={generating || !messages.length || !modelProfileId} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{generating ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{generating ? '正在总结…' : summary ? '重新生成总结' : '生成 AI 总结'}</button></div>
            {summaryError && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">{summaryError}</p>}
            {summary ? <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="mb-3 text-[11px] text-slate-400">根据当前聊天记录及已提交表单生成</p><div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700">{summary}</div></article> : <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 px-5 py-10 text-center"><Sparkles className="mx-auto h-6 w-6 text-violet-300" /><p className="mt-3 text-sm font-semibold text-slate-600">尚未生成设计方案</p><p className="mt-1 text-xs leading-5 text-slate-400">生成后会提炼品牌目标、视觉方向、内容重点、交付规范与待确认事项。</p></div>}
          </div>}
        </div>
      </aside>
    </div>}
  </>;
}
