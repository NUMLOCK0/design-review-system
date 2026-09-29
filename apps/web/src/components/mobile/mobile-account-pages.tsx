'use client';
import { ApplyForOrderButton } from '@/components/order-applications';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ArrowUpRight, Check, ChevronRight, Clock3, WalletCards } from 'lucide-react';
import type { DesignOrder, DesignerWallet, OrderInvitation } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { MobileSecondaryLayout } from '@/components/mobile/mobile-secondary-layout';

const money = (value: number) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
function PageTitle({ title, eyebrow }: { title: string; eyebrow: string }) { return <div className="flex items-center gap-3"><Link href="/mobile/profile" aria-label="返回个人中心" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600"><ArrowLeft className="h-5 w-5" /></Link><div><p className="text-[11px] font-semibold role-primary-text">{eyebrow}</p><h1 className="text-xl font-extrabold tracking-tight">{title}</h1></div></div>; }
function Field({ label, ...props }: React.ComponentProps<typeof Input> & { label: string }) { return <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">{label}{props.required && <span aria-hidden="true" className="ml-1 text-rose-500">*</span>}</span><Input {...props} className={`h-11 rounded-xl border-slate-200 bg-white text-sm ${props.className || ''}`} /></label>; }
function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...props} className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl role-primary-bg px-4 text-sm font-bold text-white disabled:opacity-50 ${props.className || ''}`}>{children}</button>; }

export function MobileWalletPage() {
  const [wallet, setWallet] = useState<DesignerWallet | null>(null);
  const [form, setForm] = useState({ amount: '', bankName: '', accountNo: '', holderName: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const load = async () => { try { const response = await fetchWithAuth('/wallet/my-wallet'); const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.message || '钱包加载失败'); setWallet(result.data); setForm((current) => ({ ...current, bankName: current.bankName || result.data.bankAccount?.bankName || '', holderName: current.holderName || result.data.bankAccount?.holderName || '' })); } catch (error) { toast.error(error instanceof Error ? error.message : '钱包加载失败'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); const accountNo = form.accountNo.replace(/\s/g, ''); const amount = Number(form.amount); if (!wallet || amount <= 0 || amount > wallet.availableBalance || !form.bankName.trim() || !/^\d{8,30}$/.test(accountNo) || !form.holderName.trim()) return toast.error('请检查提现金额和银行卡信息'); if (!window.confirm(`确认申请提现 ${money(amount)} 至尾号 ${accountNo.slice(-4)} 的银行卡？提交后由客服审核。`)) return; setSaving(true); try { const response = await fetchWithAuth('/wallet/withdraw', { method: 'POST', body: JSON.stringify({ amount, bankName: form.bankName.trim(), accountNo, holderName: form.holderName.trim() }) }); const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.message || '提现申请失败'); setWallet(result.data); setForm((current) => ({ ...current, amount: '', accountNo: '' })); toast.success(result.message); } catch (error) { toast.error(error instanceof Error ? error.message : '提现申请失败'); } finally { setSaving(false); } };
  return <section className="space-y-5"><PageTitle title="收益钱包" eyebrow="设计师空间" />{loading ? <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400">正在加载钱包…</div> : !wallet ? <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">暂时无法读取钱包，请刷新重试。</div> : <><div className="rounded-[24px] role-primary-bg p-5 text-white shadow-lg"><div className="flex items-center gap-2 text-white/75"><WalletCards className="h-4 w-4" /><span className="text-xs font-semibold">可提现余额</span></div><p className="mt-2 text-3xl font-extrabold">{money(wallet.availableBalance)}</p><div className="mt-5 grid grid-cols-3 gap-2 border-t border-white/20 pt-4 text-center"><div><p className="text-[10px] text-white/65">待结算</p><p className="mt-1 text-xs font-bold">{money(wallet.pendingSettlement)}</p></div><div><p className="text-[10px] text-white/65">累计收入</p><p className="mt-1 text-xs font-bold">{money(wallet.totalEarned)}</p></div><div><p className="text-[10px] text-white/65">已提现</p><p className="mt-1 text-xs font-bold">{money(wallet.withdrawnAmount)}</p></div></div></div><form onSubmit={submit} className="space-y-3 rounded-[22px] bg-white p-4 shadow-sm"><div><h2 className="text-sm font-bold">申请银行卡提现</h2><p className="mt-1 text-[11px] text-slate-400">客服审核通过后处理；驳回金额将退回钱包</p></div><Field label="提现金额（元）" type="number" inputMode="decimal" min="0.01" max={wallet.availableBalance} step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="请输入提现金额" /><div className="grid grid-cols-2 gap-3"><Field label="开户银行" required value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} placeholder="银行名称" /><Field label="持卡人" required value={form.holderName} onChange={(e) => setForm({ ...form, holderName: e.target.value })} placeholder="真实姓名" /></div><Field label="银行卡号" inputMode="numeric" autoComplete="off" required value={form.accountNo} onChange={(e) => setForm({ ...form, accountNo: e.target.value })} placeholder="请输入完整银行卡号" /><PrimaryButton disabled={saving}>{saving ? '提交中…' : '确认申请提现'}</PrimaryButton></form><div className="rounded-[22px] bg-white p-4 shadow-sm"><h2 className="text-sm font-bold">最近流水</h2>{wallet.transactions.length ? <div className="mt-2 divide-y divide-slate-100">{wallet.transactions.slice(0, 30).map((tx) => <div key={tx.id} className="flex items-center gap-3 py-3"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tx.amount >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{tx.amount >= 0 ? <ArrowUpRight className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{tx.title}</span><span className="mt-1 block text-[10px] text-slate-400">{new Date(tx.createdAt).toLocaleString('zh-CN')} · {tx.status === 'settled' ? '已结算' : tx.status === 'failed' ? '已退回' : '处理中'}</span></span><b className={`text-xs ${tx.amount >= 0 ? 'text-emerald-600' : 'text-slate-700'}`}>{tx.amount >= 0 ? '+' : ''}{money(tx.amount)}</b></div>)}</div> : <p className="py-8 text-center text-xs text-slate-400">暂无收益流水</p>}</div></>}</section>;
}

export function MobileInvitationsPage() {
  const [items, setItems] = useState<OrderInvitation[]>([]); const [loading, setLoading] = useState(true); const [operating, setOperating] = useState<string | null>(null);
  const load = async () => { try { const response = await fetchWithAuth('/invitations/mine'); const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.message || '邀请加载失败'); setItems(result.data || []); } catch (error) { toast.error(error instanceof Error ? error.message : '邀请加载失败'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const respond = async (item: OrderInvitation, action: 'accept' | 'decline') => { if (!window.confirm(action === 'accept' ? '提交后等待品牌方确认，确认继续？' : '婉拒后该邀请将失效，确认继续？')) return; setOperating(item.id); try { const response = await fetchWithAuth(`/invitations/${item.id}/respond`, { method: 'POST', body: JSON.stringify({ action }) }); const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.message || '操作失败'); toast.success(result.message); await load(); } catch (error) { toast.error(error instanceof Error ? error.message : '操作失败'); } finally { setOperating(null); } };
  const labels: Record<string, string> = { sent: '等待回应', accepted: '已回应 · 查看申请结果', declined: '已拒绝', expired: '已过期', cancelled: '已关闭', queued: '订单审核中' };
  return <section className="space-y-4"><PageTitle title="订单邀请" eyebrow="设计师空间" />{loading ? <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400">正在加载邀请…</div> : !items.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-9 text-center text-sm text-slate-400">暂时没有订单邀请</div> : items.map((item) => <article key={item.id} className="rounded-[20px] bg-white p-4 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-sm font-bold">{item.orderTitle}</h2><p className="mt-1 text-[11px] text-slate-400">{item.orderNo} · 邀请方 {item.inviterName}</p></div><span className="shrink-0 rounded-full role-primary-soft px-2.5 py-1 text-[10px] font-semibold role-primary-text">{labels[item.status] || item.status}</span></div>{item.inviteMessage && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{item.inviteMessage}</p>}<p className="mt-3 flex items-center gap-1 text-[10px] text-slate-400"><Clock3 className="h-3 w-3" />有效至 {new Date(item.expiresAt).toLocaleString('zh-CN')}</p>{item.status === 'sent' && <div className="mt-3 grid grid-cols-2 gap-2"><ApplyForOrderButton orderId={item.orderId} invitationId={item.id} label="回应并申请" onSubmitted={() => void load()} className="min-h-10 role-primary-bg text-xs text-white" /><button disabled={operating === item.id} onClick={() => void respond(item, 'decline')} className="min-h-10 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 disabled:opacity-50">婉拒</button></div>}</article>)}</section>;
}

export function MobileBillingPage() {
  const [orders, setOrders] = useState<DesignOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState<'all' | 'processing' | 'settled' | 'closed'>('all');
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = useCallback(async (nextPage = 1, append = false) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: '10', billingStatus: filter });
      const response = await fetchWithAuth(`/design-orders/mine?${params}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '账单加载失败');
      setOrders((current) => append ? [...current, ...(result.data || [])] : result.data || []);
      setCounts(result.billingCounts || {});
      setPage(nextPage);
      setHasMore(Boolean(result.hasMore));
    } catch (error) { toast.error(error instanceof Error ? error.message : '账单加载失败'); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [filter]);

  useEffect(() => { void load(); }, [load]);

  const totalBudget = orders.reduce((sum, order) => sum + order.budget, 0);
  const settledBudget = orders.filter((order) => order.paymentStatus === 'paid').reduce((sum, order) => sum + order.budget, 0);
  const processingBudget = orders.filter((order) => order.status !== 'cancelled' && order.paymentStatus !== 'paid').reduce((sum, order) => sum + order.budget, 0);
  const status = (order: DesignOrder) => order.status === 'cancelled' ? '已关闭'
    : order.paymentStatus === 'paid' ? '已结算'
    : order.paymentStatus === 'balance_pending' ? '待付尾款'
    : order.paymentStatus === 'deposit_pending' || order.publicationStatus === 'pending_deposit' ? '待付定金'
    : order.publicationStatus === 'pending_service_review' ? '审核中'
    : order.status === 'completed' ? '待验收付款' : '处理中';
  const filters: Array<{ value: typeof filter; label: string }> = [
    { value: 'all', label: '全部订单' }, { value: 'processing', label: '处理中' },
    { value: 'settled', label: '已结算' }, { value: 'closed', label: '已关闭' },
  ];

  return <MobileSecondaryLayout title="财务账单" action={<Link href="/mobile/orders" className="inline-flex min-h-10 items-center gap-1 rounded-xl px-2 text-xs font-semibold role-primary-text">订单管理<ChevronRight className="h-4 w-4" /></Link>}>
    <section className="space-y-3.5">
      <div><p className="text-xs font-semibold role-primary-text">品牌方空间</p><h2 className="mt-1 text-[25px] font-extrabold tracking-tight">订单账单</h2><p className="mt-1 text-xs text-slate-400">按订单查看预算、平台服务费与设计师所得</p></div>
      <div className="grid grid-cols-2 gap-2.5">
        {[['已加载预算', money(totalBudget)], ['已加载订单', `${orders.length} 单`], ['已结算预算', money(settledBudget)], ['处理中预算', money(processingBudget)]].map(([label, value], index) => <div key={label} className="rounded-2xl bg-white p-3.5 shadow-sm"><p className="text-[11px] text-slate-500">{label}</p><p className={`mt-1.5 text-lg font-extrabold tracking-tight ${index === 0 ? 'role-primary-text' : 'text-slate-800'}`}>{value}</p></div>)}
      </div>
      <div className="flex flex-wrap gap-2" aria-label="账单状态筛选">
        {filters.map((item) => <button key={item.value} type="button" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)} className={`min-h-9 rounded-full px-3 text-xs font-semibold ${filter === item.value ? 'role-primary-bg text-white' : 'bg-white text-slate-500'}`}>{item.label}{counts[item.value] !== undefined && <span className="ml-1 opacity-75">{counts[item.value]}</span>}</button>)}
      </div>
      <div className="flex items-center justify-between px-1"><h3 className="text-sm font-bold">账单明细</h3><span className="text-[11px] text-slate-400">按更新时间排序</span></div>
      <div className="overflow-hidden rounded-[20px] bg-white shadow-sm">
        {loading && <p className="py-10 text-center text-xs text-slate-400">正在加载账单…</p>}
        {!loading && orders.length === 0 && <div className="px-4 py-12 text-center"><WalletCards className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">暂无账单记录</p><p className="mt-1 text-xs text-slate-400">订单支付后会在这里展示</p></div>}
        {!loading && orders.map((order) => <article key={order.id} className="border-b border-slate-100 p-3.5 last:border-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1"><h4 className="truncate text-[13px] font-bold text-slate-900">{order.title}</h4><p className="mt-1.5 text-[11px] text-slate-400">{order.orderNo} · {new Date(order.updatedAt || order.createdAt).toLocaleDateString('zh-CN')}</p></div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold ${order.paymentStatus === 'paid' ? 'bg-emerald-50 text-emerald-700' : order.status === 'cancelled' ? 'bg-slate-100 text-slate-500' : 'bg-amber-50 text-amber-700'}`}>{status(order)}</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <span><span className="block text-[11px] text-slate-400">订单预算</span><b className="mt-1 block text-xs font-bold text-slate-700">{money(order.budget)}</b></span>
            <span><span className="block text-[11px] text-slate-400">平台服务费</span><b className="mt-1 block text-xs font-bold text-slate-700">{money((order.balanceAmount ?? order.budget - (order.depositAmount || 0)) * order.platformCommissionRate)}</b></span>
            <span><span className="block text-[11px] text-slate-400">设计师所得</span><b className="mt-1 block text-xs font-bold text-slate-700">{money(order.designerPayout)}</b></span>
          </div>
          <Link href={`/mobile/orders/${encodeURIComponent(order.id)}`} className="mt-3 flex min-h-9 items-center justify-end gap-1 border-t border-slate-100 pt-2 text-xs font-semibold role-primary-text">查看订单<ChevronRight className="h-4 w-4" /></Link>
        </article>)}
      </div>
      {hasMore && <button type="button" disabled={loadingMore} onClick={() => void load(page + 1, true)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-xs font-semibold role-primary-text disabled:opacity-50">{loadingMore ? '正在加载…' : '继续加载账单 ↓'}</button>}
    </section>
  </MobileSecondaryLayout>;
}
