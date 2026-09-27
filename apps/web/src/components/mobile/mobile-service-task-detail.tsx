'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Clock3, CreditCard, FileCheck2, MessageSquareWarning, UserRound } from 'lucide-react';
import type { DesignOrder, OrderDispute, WithdrawalRequest } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { ReferenceLinkItemsDetail } from '@/components/reference-link-items-detail';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

type TaskType = 'order_audit' | 'dispute' | 'withdrawal_review';
type ServiceItem = { id: string; type: TaskType; title: string; subtitle: string; statusLabel: string; assigneeId?: string; assigneeName?: string; completed: boolean; payload: DesignOrder | OrderDispute | WithdrawalRequest };
const money = (amount: number) => `¥${Number(amount || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function MobileServiceTaskDetail() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const type = params.get('type') as TaskType;
  const [task, setTask] = useState<ServiceItem | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [operating, setOperating] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const response = await fetchWithAuth(`/service/tasks/${type}/${encodeURIComponent(id)}`); const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.message || '待办加载失败'); setTask(result.data); }
    catch (error) { toast.error(error instanceof Error ? error.message : '待办加载失败'); }
    finally { setLoading(false); }
  }, [id, type]);
  useEffect(() => { if (['order_audit', 'dispute', 'withdrawal_review'].includes(type)) void load(); else setLoading(false); }, [load, type]);

  const operate = async (action: 'approve' | 'reject' | 'mediation' | 'resolve' | 'escalate' | 'refund' | 'claim') => {
    if (!task) return;
    const isRefund = action === 'refund';
    if ((action === 'reject' || action === 'resolve' || action === 'escalate') && !comment.trim()) return toast.error('请先填写处理意见');
    if (isRefund && !comment.trim()) return toast.error('请填写原支付渠道的退款流水号');
    const confirmation = isRefund ? '已在原支付渠道完成退款，并确认登记流水号？' : action === 'claim' ? '确认领取这条纠纷任务？' : `确认${({ approve: '审核通过', reject: '驳回', mediation: '进入调解', resolve: '结案', escalate: '升级处理' } as Record<string,string>)[action] || action}？`;
    if (!window.confirm(confirmation)) return;
    setOperating(true);
    try {
      let response: Response;
      if (action === 'claim') response = await fetchWithAuth(`/service/tasks/${task.type}/${task.id}/claim`, { method: 'POST' });
      else if (isRefund) response = await fetchWithAuth(`/design-orders/${task.id}/deposit-refund/confirm`, { method: 'POST', body: JSON.stringify({ refundTradeNo: comment.trim() }) });
      else {
        const endpoint = task.type === 'order_audit' ? `/design-orders/${task.id}/publication-review` : task.type === 'withdrawal_review' ? `/wallet/withdrawals/${task.id}/review` : `/disputes/${task.id}/action`;
        response = await fetchWithAuth(endpoint, { method: 'POST', body: JSON.stringify({ action, comment: comment.trim() }) });
      }
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '操作失败');
      if (action !== 'claim') await fetchWithAuth('/service/logs', { method: 'POST', body: JSON.stringify({ taskType: task.type, taskId: task.id, action: isRefund ? 'refund_original_channel' : action, comment: comment.trim() }) });
      toast.success(result.message || '已完成处理'); setComment(''); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : '操作失败'); }
    finally { setOperating(false); }
  };

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">正在加载待办…</div>;
  if (!task) return <div className="space-y-4"><PageBack /><div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">待办不存在或已处理</div></div>;
  const order = task.type === 'order_audit' ? task.payload as DesignOrder : null;
  const dispute = task.type === 'dispute' ? task.payload as OrderDispute : null;
  const withdrawal = task.type === 'withdrawal_review' ? task.payload as WithdrawalRequest : null;
  const refund = Boolean(order?.depositRefundStatus === 'pending');
  const actionable = !task.completed;
  return <section className="space-y-4 pb-4"><PageBack /><header className="rounded-[20px] bg-white p-4 shadow-sm"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl role-primary-soft role-primary-text">{order ? <FileCheck2 className="h-5 w-5" /> : withdrawal ? <CreditCard className="h-5 w-5" /> : <MessageSquareWarning className="h-5 w-5" />}</span><div className="min-w-0 flex-1"><h1 className="text-sm font-extrabold">{task.title}</h1><p className="mt-1 break-all text-[11px] text-slate-400">{task.subtitle}</p></div><span className="shrink-0 rounded-full role-primary-soft px-2.5 py-1 text-[10px] font-semibold role-primary-text">{task.statusLabel}</span></div>{task.assigneeId && <p className="mt-3 text-[11px] text-slate-500">负责人：{task.assigneeName || '已领取'}</p>}</header>
    {order && <><section className="space-y-3 rounded-[20px] bg-white p-4 shadow-sm"><h2 className="text-sm font-bold">订单信息</h2><div className="grid grid-cols-2 gap-3 text-xs">{[['发布方',order.creatorName],['订单编号',order.orderNo],['订单预算',money(order.budget)],['交付时间',order.deadline ? new Date(order.deadline).toLocaleDateString('zh-CN') : '协商']].map(([k,v]) => <div key={k}><p className="text-[10px] text-slate-400">{k}</p><p className="mt-1 break-words font-semibold text-slate-700">{v}</p></div>)}</div>{order.requirements && <div><p className="mb-1 text-xs font-semibold">整体要求</p><p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{order.requirements}</p></div>}</section>{order.imageRequirementGroups?.map((group) => <section key={group.id} className="space-y-3 rounded-[20px] bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-sm font-bold">{group.name}</h2><span className="text-[10px] text-slate-400">{group.dimensions || group.groupType}</span></div>{(group.imageItems || []).map((item, index) => <div key={item.id} className="space-y-2 border-t border-slate-100 pt-3"><p className="text-xs font-semibold">第 {index + 1} 张</p>{item.materialImage && <AuthenticatedImage src={item.materialImage} alt="客户素材原图" className="max-h-[55dvh] w-full rounded-xl bg-slate-50 object-contain" />}{item.description && <p className="whitespace-pre-wrap text-xs leading-5 text-slate-600">设计要点：{item.description}</p>}<ReferenceLinkItemsDetail item={item} compact /></div>)}</section>)}</>}
    {withdrawal && <section className="space-y-3 rounded-[20px] bg-white p-4 shadow-sm"><h2 className="text-sm font-bold">提现申请</h2><Info label="申请人" value={withdrawal.designerName} /><Info label="提现金额" value={money(withdrawal.amount)} /><Info label="开户行" value={withdrawal.bankAccount.bankName} /><Info label="持卡人" value={withdrawal.bankAccount.holderName} /><Info label="银行卡号" value={`尾号 ${withdrawal.bankAccount.accountNo.slice(-4)}`} /></section>}
    {dispute && <section className="space-y-3 rounded-[20px] bg-white p-4 shadow-sm"><h2 className="text-sm font-bold">纠纷信息</h2><Info label="发起人" value={dispute.initiatorName} /><Info label="对方" value={dispute.respondentName || '—'} /><Info label="争议原因" value={dispute.reason} /><p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{dispute.description}</p>{dispute.evidenceUrls?.length ? <div className="grid grid-cols-3 gap-2">{dispute.evidenceUrls.map((url) => <AuthenticatedImage key={url} src={url} alt="纠纷证据" className="aspect-square w-full rounded-lg object-cover" />)}</div> : null}</section>}
    {actionable && <section className="space-y-3 rounded-[20px] bg-white p-4 shadow-sm"><label className="block space-y-1.5"><span className="text-xs font-bold">{refund ? '原支付渠道退款流水号' : '处理意见'} <span aria-hidden="true" className="text-rose-500">*</span></span><Textarea value={comment} onChange={(event) => setComment(event.target.value)} placeholder={refund ? '完成原路退款后填写退款流水号' : '驳回、结案、升级时必须填写'} rows={3} className="rounded-xl" /></label>{dispute && !task.assigneeId && <ActionButton disabled={operating} onClick={() => void operate('claim')} tone="neutral"><UserRound className="h-4 w-4" />领取纠纷</ActionButton>}{refund ? <ActionButton disabled={operating} onClick={() => void operate('refund')}><Check className="h-4 w-4" />登记原路退款</ActionButton> : order || withdrawal ? <div className="grid grid-cols-2 gap-2"><ActionButton disabled={operating} onClick={() => void operate('reject')} tone="danger">驳回</ActionButton><ActionButton disabled={operating} onClick={() => void operate('approve')}><Check className="h-4 w-4" />{order ? '通过并上架' : '审核通过'}</ActionButton></div> : <div className="grid grid-cols-2 gap-2"><ActionButton disabled={operating} onClick={() => void operate('mediation')} tone="neutral">进入调解</ActionButton><ActionButton disabled={operating} onClick={() => void operate('escalate')} tone="danger">升级处理</ActionButton><ActionButton disabled={operating} onClick={() => void operate('resolve')}>确认结案</ActionButton></div>}</section>}
  </section>;
}

function PageBack() { return <Link href="/mobile/tasks" className="flex h-10 items-center gap-2 text-xs font-semibold text-slate-500"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white"><ArrowLeft className="h-4 w-4" /></span>返回待办列表</Link>; }
function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] text-slate-400">{label}</p><p className="mt-1 break-words text-xs font-semibold text-slate-700">{value}</p></div>; }
function ActionButton({ children, tone = 'primary', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'primary' | 'neutral' | 'danger' }) { const colors = { primary: 'role-primary-bg text-white', neutral: 'border border-slate-200 bg-white text-slate-700', danger: 'border border-rose-200 bg-rose-50 text-rose-700' }; return <button {...props} className={`flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-3 text-xs font-bold disabled:opacity-50 ${colors[tone]} ${props.className || ''}`}>{children}</button>; }
