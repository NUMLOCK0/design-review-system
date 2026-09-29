'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { EVALUATION_TAGS, type EvaluationReport, type OrderEvaluation, type OrderEvaluationState, type EvaluationSummary } from '@design-review/shared';
import { Star } from 'lucide-react';
import { fetchWithAuth, getCurrentUser } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription } from '@/components/ui/modal';
import { toast } from 'sonner';

async function request(path: string, options?: RequestInit) {
  const response = await fetchWithAuth(`/order-evaluations${path}`, options);
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || '评价加载失败');
  return result;
}
const date = (value?: string) => value ? new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
function ErrorMessage({ message }: { message: string }) { return message ? <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{message}</p> : null; }
function Score({ score }: { score: number }) { return <span aria-label={`${score} 星`} className="inline-flex items-center gap-1 text-amber-600"><Star aria-hidden="true" className="h-4 w-4 fill-current" /><b>{score.toFixed(1)}</b></span>; }
function useEvaluationRefresh(refresh: () => void) {
  useEffect(() => {
    window.addEventListener('messages-realtime', refresh);
    window.addEventListener('order-evaluations-change', refresh);
    return () => { window.removeEventListener('messages-realtime', refresh); window.removeEventListener('order-evaluations-change', refresh); };
  }, [refresh]);
}
function changed() { window.dispatchEvent(new Event('order-evaluations-change')); }

export function EvaluationRating({ userId, mobile = false, link = true }: { userId: string; mobile?: boolean; link?: boolean }) {
  const [summary, setSummary] = useState<EvaluationSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    let active = true;
    request(`/users/${encodeURIComponent(userId)}?pageSize=1`).then((result) => { if (active) { setSummary(result.summary); setFailed(false); } }).catch(() => { if (active) { setSummary(null); setFailed(true); } });
    return () => { active = false; };
  }, [userId]);
  useEffect(load, [load]);
  useEvaluationRefresh(load);
  const content = <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">{summary?.count ? <><Score score={summary.average!} /><span>· {summary.count} 条评价</span></> : <span>{summary ? '暂无评价' : failed ? '评价暂不可用' : '评价加载中'}</span>}</span>;
  return link ? <Link href={`${mobile ? '/mobile' : ''}/evaluations/users/${encodeURIComponent(userId)}`} className="inline-flex min-h-9 items-center rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--role-primary)]">{content}</Link> : content;
}

function EvaluationCard({ item, onChanged, actions = true }: { item: OrderEvaluation; onChanged: () => void; actions?: boolean }) {
  const user = getCurrentUser();
  const [action, setAction] = useState<'reply' | 'report' | null>(null);
  const [text, setText] = useState('');
  const [reason, setReason] = useState('与订单无关');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const result = await request(`/${item.id}/${action === 'reply' ? 'reply' : 'reports'}`, { method: 'POST', body: JSON.stringify(action === 'reply' ? { reply: text } : { reason, description: text }) });
      toast.success(result.message); setAction(null); setText(''); onChanged(); changed();
    } catch (error: any) { setError(error.message); } finally { setBusy(false); }
  };
  const canAct = actions && user && ['advertiser', 'designer'].includes(user.role) && item.publishedAt && item.visibility === 'visible';
  return <article className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold text-slate-800">{item.authorName}{item.targetName && <span className="font-normal text-slate-500"> → {item.targetName}</span>}</p><p className="mt-1 text-xs text-slate-400">{item.category} · {date(item.createdAt)}</p></div><Score score={item.score} /></div>
    <div className="flex flex-wrap gap-2">{!item.publishedAt && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs text-amber-700">等待公开</span>}{item.visibility === 'hidden' && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">已隐藏</span>}{!item.reputationEligible && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500">不计入信誉评分</span>}{item.tags.map((tag) => <span key={tag} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{tag}</span>)}</div>
    {item.comment && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{item.comment}</p>}
    {item.reply && <div className="rounded-xl bg-slate-50 p-3"><p className="mb-1 text-xs font-semibold text-slate-500">被评价方回复 · {date(item.repliedAt)}</p><p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{item.reply}</p></div>}
    {canAct && <div className="flex justify-end gap-3">{user.id === item.targetId && !item.reply && <button type="button" className="min-h-10 px-2 text-xs font-semibold role-primary-text" onClick={() => { setAction('reply'); setText(''); setError(''); }}>回复</button>}{user.id !== item.authorId && <button type="button" className="min-h-10 px-2 text-xs text-slate-500" onClick={() => { setAction('report'); setText(''); setError(''); }}>举报 / 申诉</button>}</div>}
    <Modal open={Boolean(action)} onOpenChange={(open) => !open && !busy && setAction(null)}><ModalContent className="max-w-md rounded-2xl bg-white"><ModalHeader><ModalTitle>{action === 'reply' ? '回复评价' : '举报 / 申诉'}</ModalTitle><ModalDescription>{action === 'reply' ? '每条评价只能回复一次' : '客服审核后通知处理结果'}</ModalDescription></ModalHeader><form onSubmit={submit} className="space-y-4 py-4">{action === 'report' && <label className="block space-y-2"><span className="text-sm font-semibold">举报原因</span><Select value={reason} onValueChange={setReason}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['与订单无关', '泄露隐私', '辱骂或不当内容', '虚假交易', '其他'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></label>}<label className="block space-y-2"><span className="text-sm font-semibold">{action === 'reply' ? '回复内容' : '具体说明'}</span><Textarea required disabled={busy} maxLength={action === 'reply' ? 500 : 2000} rows={4} value={text} onChange={(event) => setText(event.target.value)} /></label><ErrorMessage message={error} /><Button type="submit" disabled={busy} className="h-11 w-full role-primary-bg text-white">{busy ? '正在提交…' : '确认提交'}</Button></form></ModalContent></Modal>
  </article>;
}

export function PublicEvaluations({ userId }: { userId: string }) {
  const requestSequence = useRef(0);
  const [items, setItems] = useState<OrderEvaluation[]>([]);
  const [summary, setSummary] = useState<EvaluationSummary | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async (nextPage = 1) => {
    const sequence = ++requestSequence.current;
    setLoading(true); setError('');
    try {
      const result = await request(`/users/${encodeURIComponent(userId)}?page=${nextPage}`);
      if (sequence !== requestSequence.current) return;
      setItems(result.data); setSummary(result.summary); setPage(nextPage); setHasMore(result.hasMore);
    } catch (error: any) { if (sequence === requestSequence.current) setError(error.message); } finally { if (sequence === requestSequence.current) setLoading(false); }
  }, [userId]);
  const refresh = useCallback(() => { void load(); }, [load]);
  useEffect(refresh, [refresh]); useEvaluationRefresh(refresh);
  return <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-base font-bold">合作评价</h2>{summary && <span className="flex items-center gap-2 text-xs text-slate-500">{summary.average !== null && <Score score={summary.average} />}{summary.count} 条评价</span>}</div><ErrorMessage message={error} />{loading ? <p role="status" className="py-8 text-center text-sm text-slate-400">正在加载评价…</p> : items.length ? items.map((item) => <EvaluationCard key={item.id} item={item} onChanged={refresh} />) : !error && <p className="rounded-2xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-400">暂无合作评价</p>}<Pagination page={page} hasMore={hasMore} loading={loading} load={load} /></section>;
}
function Pagination({ page, hasMore, loading, load }: { page: number; hasMore: boolean; loading: boolean; load: (page: number) => void }) {
  return page > 1 || hasMore ? <div className="flex justify-center gap-3"><Button variant="outline" disabled={loading || page === 1} onClick={() => load(page - 1)}>上一页</Button><span className="self-center text-xs text-slate-500">第 {page} 页</span><Button variant="outline" disabled={loading || !hasMore} onClick={() => load(page + 1)}>下一页</Button></div> : null;
}

function EvaluationForm({ state, mobile, onSubmitted }: { state: OrderEvaluationState; mobile: boolean; onSubmitted: (state: OrderEvaluationState) => void }) {
  const formId = useId();
  const [score, setScore] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!score) { setError('请选择评分'); return; }
    if (!confirming) { setError(''); setConfirming(true); return; }
    setBusy(true); setError('');
    try {
      const result = await request(`/orders/${encodeURIComponent(state.orderId)}`, { method: 'POST', body: JSON.stringify({ score, tags, comment }) });
      toast.success('评价已提交'); onSubmitted(result.data); changed();
    } catch (error: any) { setError(error.message); } finally { setBusy(false); }
  };
  useEffect(() => {
    if (busy || (!score && !comment && !tags.length)) return;
    const leave = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave);
  }, [score, comment, tags.length, busy]);
  return <form id={formId} onSubmit={submit} className={`space-y-5 ${mobile ? 'pb-[calc(104px+env(safe-area-inset-bottom))]' : 'py-4'}`}>
    {confirming ? <div className="space-y-3 rounded-2xl bg-slate-50 p-4"><p className="text-sm font-semibold">确认评价 {state.targetName}</p><Score score={score} /><p className="text-xs text-slate-500">{tags.join(' · ')}</p>{comment && <p className="whitespace-pre-wrap break-words text-sm leading-6">{comment}</p>}<p className="text-xs text-slate-500">提交后不可修改。双方提交或评价期结束后公开。</p></div> : <>
      <fieldset disabled={busy} className="space-y-3"><legend className="text-sm font-semibold">合作体验</legend><div className="flex gap-1" role="radiogroup" aria-label="总评分">{[1, 2, 3, 4, 5].map((value) => <label key={value} className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl"><input type="radio" name={`${formId}-score`} value={value} checked={score === value} onChange={() => { setScore(value); setError(''); }} className="peer sr-only" required /><Star aria-hidden="true" className={`h-8 w-8 rounded-sm peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-[var(--role-primary)] ${score >= value ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`} /><span className="sr-only">{value} 星</span></label>)}</div><p className="text-xs text-slate-500">{score ? ['很不满意', '不满意', '一般', '满意', '非常满意'][score - 1] : '请选择 1～5 星'}</p></fieldset>
      <fieldset className="space-y-3"><legend className="text-sm font-semibold">评价标签<span className="ml-2 text-xs font-normal text-slate-400">可选，最多 3 个</span></legend><div className="flex flex-wrap gap-2">{EVALUATION_TAGS[state.direction!].map((tag) => <button key={tag} type="button" aria-pressed={tags.includes(tag)} disabled={!tags.includes(tag) && tags.length >= 3} onClick={() => setTags(tags.includes(tag) ? tags.filter((value) => value !== tag) : [...tags, tag])} className={`min-h-10 rounded-full border px-3 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--role-primary)] disabled:opacity-40 ${tags.includes(tag) ? 'role-primary-soft role-primary-text border-[var(--role-primary-border)]' : 'border-slate-200 bg-white text-slate-600'}`}>{tag}</button>)}</div></fieldset>
      <label className="block space-y-2"><span className="text-sm font-semibold">文字评价<span className="ml-2 text-xs font-normal text-slate-400">可选</span></span><Textarea rows={4} maxLength={500} value={comment} onChange={(event) => setComment(event.target.value)} /><span className="block text-right text-xs text-slate-400">{comment.length}/500</span></label>
      <p className="text-xs text-slate-500">双方提交或评价期结束后公开</p>
    </>}
    <ErrorMessage message={error} />
    <div className={mobile ? 'fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur' : ''}><div className="mx-auto flex max-w-xl gap-3">{confirming && <Button type="button" variant="outline" disabled={busy} onClick={() => setConfirming(false)} className="h-11">返回修改</Button>}<Button form={formId} type="submit" disabled={busy} className="h-11 flex-1 role-primary-bg text-white">{busy ? '正在提交…' : confirming ? '确认提交评价' : '提交评价'}</Button></div></div>
  </form>;
}

export function OrderEvaluationPanel({ orderId, mobile = false }: { orderId: string; mobile?: boolean }) {
  const requestSequence = useRef(0);
  const [state, setState] = useState<OrderEvaluationState | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const sequence = ++requestSequence.current;
    try { const result = await request(`/orders/${encodeURIComponent(orderId)}`); if (sequence === requestSequence.current) { setState(result.data); setError(''); } }
    catch (error: any) { if (sequence === requestSequence.current) setError(error.message); }
  }, [orderId]);
  const refresh = useCallback(() => { void load(); }, [load]);
  useEffect(refresh, [refresh]); useEvaluationRefresh(refresh);
  return <section className="space-y-4"><ErrorMessage message={error} />{!state && !error && <p role="status" className="py-8 text-center text-sm text-slate-400">正在加载评价…</p>}{state && <><div className="rounded-2xl border border-slate-200 bg-white p-4"><h2 className="text-base font-bold">{state.title}</h2><p className="mt-2 text-sm text-slate-500">评价对象：{state.targetName}</p>{state.deadlineAt && state.status === 'open' && <p className="mt-2 text-xs text-slate-400">截止 {date(state.deadlineAt)}</p>}{state.status === 'paused' && <p className="mt-2 text-sm text-amber-700">{state.reason || '纠纷处理中，评价已暂停'}</p>}{state.status === 'unavailable' && <p className="mt-2 text-sm text-slate-500">{state.reason}</p>}{state.status === 'closed' && <p className="mt-2 text-sm text-slate-500">评价已关闭</p>}{state.submitted && state.status === 'open' && <p className="mt-2 text-xs text-slate-500">已提交，等待双方提交或评价期结束后公开</p>}{state.status === 'published' && <p className="mt-2 text-xs text-slate-500">评价期已结束或双方已提交</p>}</div>{state.canSubmit && <div className="rounded-2xl border border-slate-200 bg-white p-4"><EvaluationForm key={orderId} state={state} mobile={mobile} onSubmitted={setState} /></div>}{state.evaluations.map((item) => <EvaluationCard key={item.id} item={item} onChanged={refresh} />)}</>}</section>;
}

export function OrderEvaluationEntry({ orderId, mobile = false, compact = false }: { orderId: string; mobile?: boolean; compact?: boolean }) {
  const [state, setState] = useState<OrderEvaluationState | null>(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => {
    if (!['advertiser', 'designer'].includes(getCurrentUser()?.role || '')) return;
    void request(`/orders/${encodeURIComponent(orderId)}`).then((result) => setState(result.data)).catch(() => setState(null));
  }, [orderId]);
  useEffect(load, [load]); useEvaluationRefresh(load);
  if (!state || state.status === 'unavailable') return null;
  const label = state.canSubmit ? state.direction === 'advertiser_to_designer' ? '评价设计师' : '评价品牌方' : state.status === 'paused' ? '评价已暂停' : state.submitted ? '查看评价' : '合作评价';
  return <>{mobile ? <Link href={`/mobile/evaluations/orders/${encodeURIComponent(orderId)}`} className="inline-flex min-h-11 items-center rounded-xl role-primary-soft px-4 text-xs font-semibold role-primary-text">{label}</Link> : <Button variant="outline" onClick={() => setOpen(true)} className={`${compact ? 'h-8 text-xs' : 'h-11'} rounded-xl role-primary-text`}>{label}</Button>}<Modal open={open} onOpenChange={setOpen}><ModalContent className="max-w-xl rounded-2xl bg-white"><ModalHeader><ModalTitle>合作评价</ModalTitle><ModalDescription>{state.title}</ModalDescription></ModalHeader><div className="py-4"><OrderEvaluationPanel orderId={orderId} /></div></ModalContent></Modal></>;
}

export function MyEvaluations({ mobile = false, initialTab = 'pending' }: { mobile?: boolean; initialTab?: string }) {
  const [tab, setTab] = useState(['pending', 'received', 'sent'].includes(initialTab) ? initialTab : 'pending');
  const [items, setItems] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const load = useCallback(async (nextPage = 1) => {
    setLoading(true); setError('');
    try { const result = await request(`/mine?tab=${tab}&page=${nextPage}`); setItems(result.data); setPage(nextPage); setHasMore(result.hasMore); }
    catch (error: any) { setError(error.message); } finally { setLoading(false); }
  }, [tab]);
  const refresh = useCallback(() => { void load(); }, [load]);
  useEffect(refresh, [refresh]); useEvaluationRefresh(refresh);
  return <section className="space-y-4">{!mobile && <h1 className="text-xl font-bold">我的评价</h1>}<div className="flex gap-2" aria-label="评价分类">{[['pending', '待评价'], ['received', '收到的评价'], ['sent', '发出的评价']].map(([value, label]) => <button key={value} type="button" aria-pressed={tab === value} onClick={() => setTab(value)} className={`min-h-10 rounded-full px-4 text-sm font-semibold ${tab === value ? 'role-primary-bg text-white' : 'border border-slate-200 bg-white text-slate-500'}`}>{label}</button>)}</div><ErrorMessage message={error} />{loading ? <p role="status" className="py-10 text-center text-sm text-slate-400">正在加载…</p> : items.length ? items.map((item) => tab === 'pending' ? <article key={item.orderId} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4"><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-bold">{item.title}</h2><p className="mt-1 text-xs text-slate-500">{item.targetName} · {item.status === 'paused' ? '评价已暂停' : `截止 ${date(item.deadlineAt)}`}</p></div>{mobile ? <Link href={`/mobile/evaluations/orders/${encodeURIComponent(item.orderId)}`} className="inline-flex min-h-11 shrink-0 items-center rounded-xl role-primary-soft px-3 text-xs font-semibold role-primary-text">{item.status === 'paused' ? '查看' : '去评价'}</Link> : <Button variant="outline" onClick={() => setSelected(item.orderId)} className="h-11 shrink-0 role-primary-text">{item.status === 'paused' ? '查看' : '去评价'}</Button>}</article> : <EvaluationCard key={item.id} item={item} onChanged={refresh} />) : !error && <p className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-400">{tab === 'pending' ? '暂无待评价订单' : '暂无评价'}</p>}<Pagination page={page} hasMore={hasMore} loading={loading} load={load} /><Modal open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}><ModalContent className="max-w-xl rounded-2xl bg-white"><ModalHeader><ModalTitle>合作评价</ModalTitle><ModalDescription>订单合作体验</ModalDescription></ModalHeader><div className="py-4">{selected && <OrderEvaluationPanel orderId={selected} />}</div></ModalContent></Modal></section>;
}

export function EvaluationManagement() {
  const [tab, setTab] = useState('reports');
  const [filter, setFilter] = useState('open');
  const [items, setItems] = useState<Array<OrderEvaluation | EvaluationReport>>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [decision, setDecision] = useState<{ item: OrderEvaluation; action: string } | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (nextPage = 1) => {
    setLoading(true); setError('');
    try { const result = await request(`/management/${tab}?${tab === 'reports' ? 'status' : 'visibility'}=${filter}&page=${nextPage}`); setItems(result.data); setPage(nextPage); setHasMore(result.hasMore); }
    catch (error: any) { setError(error.message); } finally { setLoading(false); }
  }, [tab, filter]);
  const refresh = useCallback(() => { void load(); }, [load]);
  useEffect(refresh, [refresh]); useEvaluationRefresh(refresh);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!decision) return; setBusy(true);
    try { await request(`/management/${decision.item.id}`, { method: 'POST', body: JSON.stringify({ action: decision.action, reason }) }); toast.success('处理完成'); setDecision(null); refresh(); changed(); }
    catch (error: any) { toast.error(error.message); } finally { setBusy(false); }
  };
  return <section className="space-y-4"><h1 className="text-xl font-bold">合作评价管理</h1><div className="flex flex-wrap gap-2">{[['reports', '举报与申诉'], ['list', '全部评价']].map(([value, label]) => <Button key={value} variant={tab === value ? 'default' : 'outline'} className={tab === value ? 'role-primary-bg text-white' : ''} onClick={() => { setTab(value); setFilter(value === 'reports' ? 'open' : 'all'); }}>{label}</Button>)}<Select value={filter} onValueChange={setFilter}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger><SelectContent>{(tab === 'reports' ? [['open', '待处理'], ['resolved', '已处理']] : [['all', '全部'], ['visible', '正常'], ['hidden', '已隐藏']]).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div><ErrorMessage message={error} />{loading ? <p role="status" className="py-10 text-center text-sm text-slate-400">正在加载…</p> : items.length ? items.map((record) => {
    const report = 'evaluation' in record ? record : null;
    const item = report ? report.evaluation : record as OrderEvaluation;
    return <div key={record.id} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">{report && <div className="p-2"><p className="text-sm font-semibold">{report.reason} · {report.reporterName}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-600">{report.description}</p>{report.resolution && <p className="mt-2 text-xs text-slate-500">处理结果：{report.resolution}</p>}</div>}<EvaluationCard item={item} actions={false} onChanged={refresh} /><div className="flex flex-wrap justify-end gap-2">{report?.status === 'open' && <Button variant="outline" onClick={() => { setDecision({ item, action: 'keep' }); setReason(''); }}>保留评价</Button>}<Button variant="outline" onClick={() => { setDecision({ item, action: item.visibility === 'hidden' ? 'restore' : 'hide' }); setReason(''); }}>{item.visibility === 'hidden' ? '恢复评价' : '隐藏评价'}</Button></div></div>;
  }) : !error && <p className="rounded-2xl bg-white py-12 text-center text-sm text-slate-400">暂无记录</p>}<Pagination page={page} hasMore={hasMore} loading={loading} load={load} /><Modal open={Boolean(decision)} onOpenChange={(open) => !open && !busy && setDecision(null)}><ModalContent className="max-w-md rounded-2xl bg-white"><ModalHeader><ModalTitle>{decision?.action === 'hide' ? '隐藏评价' : decision?.action === 'restore' ? '恢复评价' : '保留评价'}</ModalTitle><ModalDescription>处理理由将通知相关用户，并记录操作日志</ModalDescription></ModalHeader><form onSubmit={submit} className="space-y-4 py-4"><label className="block space-y-2"><span className="text-sm font-semibold">处理理由</span><Textarea required rows={4} disabled={busy} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} /></label><Button type="submit" disabled={busy} className="h-11 w-full role-primary-bg text-white">{busy ? '处理中…' : '确认处理'}</Button></form></ModalContent></Modal></section>;
}
