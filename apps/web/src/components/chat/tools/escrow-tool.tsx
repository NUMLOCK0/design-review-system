'use client';

import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { fetchWithAuth } from '@/lib/auth';
import { ToolDialog } from './tool-dialog';
import { ToolButton, primaryClass, type SendCard } from './tool-ui';

type Finance = { budget: number; depositRate: number | null; depositAmount: number | null; paymentStatus: string };
const statusText: Record<string, string> = { deposit_pending: '待支付定金', deposit_paid: '定金已支付', balance_pending: '待支付尾款', paid: '已结清', unknown: '状态待确认' };

export function EscrowTool({ orderId, onSend, intakeMode = false }: { orderId: string; onSend: SendCard; intakeMode?: boolean }) {
  const [open, setOpen] = useState(false);
  const [finance, setFinance] = useState<Finance | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const openTool = async () => {
    setOpen(true); setLoading(true); setError(''); setFinance(null);
    if (intakeMode) { setLoading(false); return; }
    try {
      const response = await fetchWithAuth(`/chat/orders/${encodeURIComponent(orderId)}/finance`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '订单支付信息读取失败');
      setFinance(result.data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '读取失败'); }
    finally { setLoading(false); }
  };
  const send = async () => {
    if (!finance || finance.depositAmount === null || finance.depositRate === null) return;
    setBusy(true); setError('');
    try {
      const sent = await onSend({ kind: 'work_card', templateId: 'escrow', title: '订单定金与支付节点说明', fields: [
        { label: '订单金额', value: `¥${finance.budget.toFixed(2)}` },
        { label: '定金比例', value: `${Math.round(finance.depositRate * 100)}%` },
        { label: '定金金额', value: `¥${finance.depositAmount.toFixed(2)}` },
        { label: '当前状态', value: statusText[finance.paymentStatus] || finance.paymentStatus },
        { label: '支付入口', value: '请品牌方在订单管理中按正式支付流程操作' },
      ], attachments: [] });
      if (sent) setOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '发送失败'); }
    finally { setBusy(false); }
  };
  return <><ToolButton icon={ShieldCheck} label="定金节点" description={intakeMode ? "邀请会话未关联订单，查看订单会话中的真实支付节点" : "查看真实订单定金状态并发送说明"} onClick={() => void openTool()} />{open && <ToolDialog title="定金与支付节点" description={intakeMode ? "此工具需要关联订单才能提供真实支付信息。" : "金额和状态来自当前订单；此处只发送说明，不会发起或确认支付。"} onClose={() => setOpen(false)} footer={<div className="flex items-center justify-between gap-3"><p role={error ? 'alert' : undefined} className="text-xs text-rose-600">{error}</p>{intakeMode ? <button type="button" onClick={() => setOpen(false)} className={primaryClass}>知道了</button> : <button type="button" disabled={busy || loading || finance?.depositAmount == null || finance?.depositRate == null} onClick={() => void send()} className={primaryClass}>发送支付节点说明</button>}</div>}>{intakeMode ? <p className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-800">当前邀请会话没有关联订单，系统无法读取真实订单金额或支付状态。关联到订单后，可在订单会话中查看并发送定金节点说明。</p> : loading ? <p className="text-sm text-slate-500">正在读取订单金额…</p> : finance ? <dl className="grid gap-3 sm:grid-cols-2">{[['订单金额', `¥${finance.budget.toFixed(2)}`], ['定金比例', finance.depositRate == null ? '未设置' : `${Math.round(finance.depositRate * 100)}%`], ['定金金额', finance.depositAmount == null ? '未设置' : `¥${finance.depositAmount.toFixed(2)}`], ['当前状态', statusText[finance.paymentStatus] || finance.paymentStatus]].map(([label, value]) => <div key={label} className="rounded-lg bg-slate-50 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 text-sm font-bold">{value}</dd></div>)}</dl> : null}</ToolDialog>}</>;
}
