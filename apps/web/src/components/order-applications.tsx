'use client';

import Link from 'next/link';
import { EvaluationRating } from '@/components/order-evaluations';
import { useCallback, useEffect, useState } from 'react';
import type { DesignOrder, DesignerPortfolio, OrderApplication, OrderApplicationStatus } from '@design-review/shared';
import { fetchWithAuth, getCurrentUser } from '@/lib/auth';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalDescription } from '@/components/ui/modal';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { toast } from 'sonner';

const money = (value: number) => `¥${Number(value || 0).toFixed(2)}`;
const labels: Record<OrderApplicationStatus, string> = { pending: '等待品牌方确认', approved: '已通过 · 接单成功', rejected: '申请未通过', withdrawn: '已撤回', closed: '已关闭' };
const statusColors: Record<OrderApplicationStatus, string> = { pending: 'bg-amber-50 text-amber-700', approved: 'bg-emerald-50 text-emerald-700', rejected: 'bg-rose-50 text-rose-700', withdrawn: 'bg-slate-100 text-slate-500', closed: 'bg-slate-100 text-slate-500' };

async function request(path: string, options?: RequestInit) {
  const response = await fetchWithAuth(path, options);
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || '申请处理失败');
  return result;
}

function ApplicationForm({ order, initial, invitationId, onSubmitted, onRefresh }: { order: DesignOrder; initial?: OrderApplication; invitationId?: string; onSubmitted: () => void; onRefresh: () => void }) {
  const [extra, setExtra] = useState(String(initial?.extraAmount ?? 0));
  const [message, setMessage] = useState(initial?.message || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const total = Math.round((order.budget + Number(extra || 0)) * 100) / 100;
  const balance = Math.round((total - Number(order.depositAmount || 0)) * 100) / 100;
  const payout = Math.round((total - Math.round(balance * order.platformCommissionRate * 100) / 100) * 100) / 100;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!/^\d+(\.\d{1,2})?$/.test(extra) || Number(extra) > 99999999) return setError('请输入有效加价金额，最多两位小数');
    if (Number(extra) > 0 && !message.trim()) return setError('请说明加价原因');
    setSaving(true); setError('');
    try {
      const body = { extraAmount: extra, message, version: initial?.version, action: 'accept' };
      const path = initial ? `/order-applications/${initial.id}` : invitationId ? `/invitations/${invitationId}/respond` : `/design-orders/${order.id}/applications`;
      const result = await request(path, { method: initial ? 'PATCH' : 'POST', body: JSON.stringify(body) });
      toast.success(result.message); onSubmitted();
    } catch (reason: any) { setError(reason.message); }
    finally { setSaving(false); }
  };
  return <form onSubmit={submit} className="space-y-5 py-3">
    <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">原订单预算</p><p className="mt-1 text-xl font-bold text-slate-900">{money(order.budget)}</p></div>
    <label className="block space-y-2"><span className="text-sm font-semibold">加价金额（元）</span><Input name="extraAmount" inputMode="decimal" type="number" min="0" max="99999999" step="0.01" required value={extra} onChange={(event) => setExtra(event.target.value)} className="h-11" /></label>
    <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 p-4"><div><p className="text-xs text-slate-500">最终报价</p><p className="mt-1 text-lg font-bold role-primary-text">{money(total)}</p></div><div><p className="text-xs text-slate-500">预计到手收入</p><p className="mt-1 text-lg font-bold text-slate-900">{money(payout)}</p></div><p className="col-span-2 text-xs text-slate-500">已付定金 {money(Number(order.depositAmount || 0))} · 最终尾款 {money(balance)}</p></div>
    <label className="block space-y-2"><span className="text-sm font-semibold">申请说明{Number(extra) > 0 ? ' / 加价原因（必填）' : '（可选）'}</span><Textarea rows={3} maxLength={2000} required={Number(extra) > 0} value={message} onChange={(event) => setMessage(event.target.value)} /></label>
    {error && <div className="space-y-2"><p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p><Button type="button" variant="outline" onClick={onRefresh}>重新加载最新申请</Button></div>}
    <Button disabled={saving} type="submit" className="h-11 w-full role-primary-bg text-white">{saving ? '正在提交…' : initial ? '保存修改' : '提交申请'}</Button>
  </form>;
}

export function OrderApplicationDialog({ orderId, invitationId, onClose, onSubmitted }: { orderId: string | null; invitationId?: string; onClose: () => void; onSubmitted?: () => void }) {
  const [order, setOrder] = useState<DesignOrder | null>(null);
  const [initial, setInitial] = useState<OrderApplication>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true); setError('');
    try {
      const [orderResult, mine] = await Promise.all([request(`/design-orders/${orderId}`), request('/order-applications/mine')]);
      setOrder(orderResult.data); setInitial(mine.data.find((item: OrderApplication) => item.orderId === orderId));
    } catch (reason: any) { setError(reason.message); }
    finally { setLoading(false); }
  }, [orderId]);
  useEffect(() => { setOrder(null); setInitial(undefined); void load(); }, [load]);
  return <Modal open={Boolean(orderId)} onOpenChange={(open) => !open && onClose()}><ModalContent className="max-w-xl rounded-2xl bg-white"><ModalHeader><ModalTitle>{initial ? '我的接单申请' : '申请接单'}</ModalTitle><ModalDescription>{order?.title}</ModalDescription></ModalHeader>
    {loading ? <p className="py-10 text-center text-sm text-slate-500">正在加载申请…</p> : error ? <div className="space-y-3 py-5"><p role="alert" className="text-sm text-rose-600">{error}</p><Button variant="outline" onClick={() => void load()}>重试</Button></div> : initial && initial.status !== 'pending' ? <div className="space-y-3 py-5"><p>{labels[initial.status]}</p><p className="text-sm text-slate-500">{initial.reviewComment}</p>{['closed', 'withdrawn'].includes(initial.status) && order?.status === 'open' && <Button onClick={() => setInitial(undefined)} className="h-11 role-primary-bg text-white">重新申请</Button>}<Link className="role-primary-text" href={typeof window !== 'undefined' && window.location.pathname.startsWith('/mobile') ? '/mobile/applications' : '/applications'}>查看我的申请</Link></div> : order && <ApplicationForm key={`${orderId}-${initial?.version || 0}`} order={order} initial={initial} invitationId={invitationId} onSubmitted={() => { onClose(); onSubmitted?.(); }} onRefresh={() => void load()} />}
  </ModalContent></Modal>;
}

export function ApplyForOrderButton({ orderId, invitationId, label = '申请接单', className, onSubmitted }: { orderId: string; invitationId?: string; label?: string; className?: string; onSubmitted?: () => void }) {
  const [open, setOpen] = useState(false);
  return <><Button onClick={() => setOpen(true)} className={className || 'h-10 role-primary-bg text-white'}>{label}</Button><OrderApplicationDialog orderId={open ? orderId : null} invitationId={invitationId} onClose={() => setOpen(false)} onSubmitted={onSubmitted} /></>;
}

export function BrandOrderApplications({ order, mobile = false, applicationId, onUpdated }: { order: DesignOrder; mobile?: boolean; applicationId?: string; onUpdated?: () => void }) {
  const [items, setItems] = useState<OrderApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<DesignerPortfolio | null>(null);
  const [decision, setDecision] = useState<{ application: OrderApplication; action: 'approve' | 'reject' } | null>(null);
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [decisionError, setDecisionError] = useState('');
  const load = useCallback(async () => {
    try { const result = await request(`/design-orders/${order.id}/applications`); setItems(result.data); setError(''); }
    catch (reason: any) { setError(reason.message); } finally { setLoading(false); }
  }, [order.id]);
  useEffect(() => { setLoading(true); void load(); const refresh = () => void load(); window.addEventListener('messages-realtime', refresh); return () => window.removeEventListener('messages-realtime', refresh); }, [load]);
  const user = getCurrentUser();
  const canManage = user?.role === 'advertiser' && (order.creatorId === user.id || (user.isOrganizationAdmin && Boolean(user.organizationId) && order.organizationId === user.organizationId));
  if (!canManage) return null;
  const decide = async () => {
    if (!decision) return;
    if (decision.action === 'reject' && !comment.trim()) return setDecisionError('请填写拒绝原因');
    setSaving(true); setDecisionError('');
    try {
      const result = await request(`/order-applications/${decision.application.id}/${decision.action}`, { method: 'POST', body: JSON.stringify({ version: decision.application.version, comment }) });
      toast.success(result.message); setDecision(null); await load(); onUpdated?.();
    } catch (reason: any) { setDecisionError(reason.message); await load(); }
    finally { setSaving(false); }
  };
  return <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">接单申请</h2><span className="rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">{items.filter((item) => item.status === 'pending').length} 个待处理</span></div>
    {applicationId && !loading && !error && !items.some((item) => item.id === applicationId) && <p className="text-sm text-slate-500">申请不存在或不属于该订单。</p>}
    {loading ? <p className="py-6 text-center text-sm text-slate-500">正在加载申请…</p> : error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : !items.length ? <p className="py-6 text-center text-sm text-slate-500">暂未收到设计师申请。</p> : items.filter((item) => !applicationId || item.id === applicationId).map((item) => {
      const works = item.designer?.portfolios || [];
      const publicWorks = works.slice(0, 3);
      return <article key={item.id} className="space-y-3 rounded-xl border border-slate-200 p-4"><div className="flex items-start gap-3">{item.designer?.avatarUrl ? <AuthenticatedImage src={item.designer.avatarUrl} alt={item.designerName} className="h-11 w-11 rounded-xl object-cover" /> : <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl role-primary-soft font-bold role-primary-text">{item.designerName.slice(0, 1)}</span>}<div className="min-w-0 flex-1"><p className="font-semibold">{item.designerName}</p><p className="mt-1 text-xs text-slate-500">{[item.designer?.headline || '设计师', item.designer?.categories.join('、')].filter(Boolean).join(' · ')}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${statusColors[item.status]}`}>{mobile && item.status === 'pending' ? '待确认' : labels[item.status]}</span></div>
        <EvaluationRating userId={item.designerId} mobile={mobile} />
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3">{[['原预算', item.originalBudget], ['申请加价', item.extraAmount], ['最终总价', item.quotedTotal]].map(([label, value]) => <div key={label}><p className="text-xs text-slate-500">{label}</p><p className={`mt-1 font-bold ${label === '最终总价' ? 'role-primary-text' : 'text-slate-900'}`}>{money(Number(value))}</p></div>)}</div>
        {item.message && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{item.message}</p>}
        {publicWorks.length > 0 && <div className="space-y-2"><p className="text-xs text-slate-500">公开作品 · 共 {works.length} 件</p><div className="grid grid-cols-3 gap-2">{publicWorks.map((work) => <button type="button" key={work.id} onClick={() => setPreview(work)} className="overflow-hidden rounded-xl border border-slate-200 text-left focus-visible:ring-2 focus-visible:ring-[var(--role-primary)]"><AuthenticatedImage src={work.coverUrl} alt={work.title} className="aspect-[4/3] w-full object-cover" /><p className="truncate p-2 text-xs">{work.title}</p></button>)}</div></div>}
        {!item.designer && <p className="text-xs text-amber-700">该设计师主页当前未公开，审批前需重新核验资料与作品。</p>}
        {item.reviewComment && <p className="text-xs text-slate-500">处理说明：{item.reviewComment}</p>}
        <div className="flex flex-wrap items-center gap-2"><Link href={`${mobile ? '/mobile' : ''}/designers/${encodeURIComponent(item.designerId)}`} target={mobile ? undefined : '_blank'} className="mr-auto inline-flex min-h-10 items-center text-xs font-semibold role-primary-text">查看完整主页与作品 →</Link>{mobile && !applicationId && <Link href={`/mobile/orders/${order.id}/applications/${item.id}`} className="inline-flex min-h-10 items-center text-xs font-semibold role-primary-text">申请详情 →</Link>}{item.status === 'pending' && order.status === 'open' && (!mobile || Boolean(applicationId)) && <><Button variant="outline" className="h-10 text-xs" onClick={() => { setDecision({ application: item, action: 'reject' }); setComment(''); setDecisionError(''); }}>拒绝</Button><Button className="h-10 role-primary-bg text-xs text-white" onClick={() => { setDecision({ application: item, action: 'approve' }); setDecisionError(''); }}>同意接单</Button></>}</div>
      </article>;
    })}
    <Modal open={Boolean(decision)} onOpenChange={(open) => !open && !saving && setDecision(null)}><ModalContent className="max-w-md rounded-2xl bg-white"><ModalHeader><ModalTitle>{decision?.action === 'approve' ? '确认设计师与最终报价' : '拒绝接单申请'}</ModalTitle><ModalDescription>{decision?.application.designerName} · {order.title}</ModalDescription></ModalHeader>{decision && <div className="space-y-4 py-4">{decision.action === 'approve' ? <><div className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm"><p>最终总价 <b>{money(decision.application.quotedTotal)}</b></p><p>已付定金 {money(decision.application.depositAmount)}</p><p>剩余尾款 <b>{money(decision.application.balanceAmount)}</b></p></div></> : <label className="block space-y-2"><span className="text-sm font-semibold">拒绝原因（必填）</span><Textarea value={comment} onChange={(event) => { setComment(event.target.value); setDecisionError(''); }} maxLength={1000} rows={3} /></label>}{decisionError && <p role="alert" className="text-sm text-rose-600">{decisionError}</p>}<Button disabled={saving || Boolean(decisionError)} onClick={() => void decide()} className="h-11 w-full role-primary-bg text-white">{saving ? '处理中…' : decision.action === 'approve' ? '确认同意' : '确认拒绝'}</Button>{decisionError && <Button variant="outline" onClick={() => setDecision(null)} className="w-full">返回查看最新申请</Button>}</div>}</ModalContent></Modal>
    <Modal open={Boolean(preview)} onOpenChange={(open) => !open && setPreview(null)}><ModalContent className="max-w-3xl rounded-2xl bg-white"><ModalHeader><ModalTitle>{preview?.title}</ModalTitle><ModalDescription>{preview?.description}</ModalDescription></ModalHeader><div className="space-y-3 py-4">{preview?.imageUrls.map((url, index) => <AuthenticatedImage key={`${url}-${index}`} src={url} alt={`${preview.title} 第 ${index + 1} 张`} className="h-auto w-full rounded-xl" />)}</div></ModalContent></Modal>
  </section>;
}

export function MyOrderApplications({ mobile = false }: { mobile?: boolean }) {
  const [items, setItems] = useState<OrderApplication[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [editing, setEditing] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { const result = await request('/order-applications/mine'); setItems(result.data); setError(''); }
    catch (reason: any) { setError(reason.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); const refresh = () => void load(); window.addEventListener('messages-realtime', refresh); return () => window.removeEventListener('messages-realtime', refresh); }, [load]);
  const withdraw = async (item: OrderApplication) => {
    try { await request(`/order-applications/${item.id}/withdraw`, { method: 'POST', body: JSON.stringify({ version: item.version }) }); toast.success('申请已撤回'); await load(); }
    catch (reason: any) { toast.error(reason.message); await load(); }
  };
  return <section className="space-y-4"><div className="flex items-center justify-between"><h1 className="text-xl font-bold">我的接单申请</h1><Link href={mobile ? '/mobile/orders' : '/order-market'} className="text-xs font-semibold role-primary-text">浏览订单 →</Link></div><div className="flex flex-wrap gap-2">{[['all', '全部'], ...Object.entries(labels)].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-10 rounded-full px-3 text-xs ${filter === value ? 'role-primary-bg text-white' : 'bg-white text-slate-600'}`}>{label}</button>)}</div>
    {loading ? <p className="py-10 text-center text-sm text-slate-500">正在加载申请…</p> : error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : !items.filter((item) => filter === 'all' || item.status === filter).length ? <p className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">暂无对应申请。</p> : items.filter((item) => filter === 'all' || item.status === filter).map((item) => <article key={item.id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h2 className="truncate text-sm font-bold">{item.orderTitle}</h2><p className="mt-1 text-xs text-slate-500">{item.orderNo}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${statusColors[item.status]}`}>{labels[item.status]}</span></div><p className="text-sm">报价 <b className="role-primary-text">{money(item.quotedTotal)}</b><span className="ml-3 text-xs text-slate-500">加价 {money(item.extraAmount)} · 预计所得 {money(item.designerPayout)}</span></p>{item.message && <p className="whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">{item.message}</p>}{item.reviewComment && <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{item.reviewComment}</p>}<p className="text-[11px] text-slate-400">更新于 {new Date(item.updatedAt).toLocaleString('zh-CN')}</p><div className="flex gap-2">{['closed', 'withdrawn'].includes(item.status) && <Button variant="outline" onClick={() => setEditing(item.orderId)} className="h-10 text-xs">重新申请</Button>}{item.status === 'pending' && <><Button variant="outline" onClick={() => setEditing(item.orderId)} className="h-10 text-xs">修改申请与报价</Button><ConfirmAction title="撤回接单申请？" description="撤回后品牌方将无法同意此申请。" confirmText="确认撤回" onConfirm={() => withdraw(item)}><Button variant="outline" className="h-10 text-xs">撤回</Button></ConfirmAction></>}{item.status === 'approved' && item.taskId && <Button asChild className="h-10 role-primary-bg text-xs text-white"><Link href={mobile ? `/mobile/tasks/${item.taskId}` : `/review-tasks?taskId=${encodeURIComponent(item.taskId)}`}>进入设计任务</Link></Button>}</div></article>)}
    <OrderApplicationDialog orderId={editing} onClose={() => setEditing(null)} onSubmitted={() => void load()} />
  </section>;
}
