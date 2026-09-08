'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, ReceiptText } from 'lucide-react';
import type { DesignOrder } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { useCurrentUser } from '@/hooks/use-current-user';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const statusMap: Record<string, { label: string; className: string }> = {
  pending_service_review: { label: '待审核', className: 'bg-amber-50 text-amber-700' },
  published: { label: '接单中', className: 'bg-emerald-50 text-emerald-700' },
  claimed: { label: '已接单', className: 'bg-blue-50 text-blue-700' },
  in_progress: { label: '制作中', className: 'bg-blue-50 text-blue-700' },
  submitted: { label: '待作品审核', className: 'bg-indigo-50 text-indigo-700' },
  completed: { label: '已完成', className: 'bg-slate-100 text-slate-600' },
  rejected: { label: '已驳回', className: 'bg-rose-50 text-rose-700' },
};

const money = (value: number) => '¥' + value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function AdvertiserBillingPage() {
  const user = useCurrentUser();
  const [orders, setOrders] = useState<DesignOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetchWithAuth('/design-orders/mine');
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '加载账单失败');
      setOrders(result.data || []);
    } catch (error: any) {
      toast.error(error.message || '加载账单失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOrders(); }, [user?.id]);

  const summary = useMemo(() => {
    const total = orders.reduce((sum, order) => sum + order.budget, 0);
    const settled = orders.filter((order) => (order.publicationStatus || order.status) === 'completed').reduce((sum, order) => sum + order.budget, 0);
    const pending = orders.filter((order) => ['pending_service_review', 'published', 'claimed', 'in_progress', 'submitted'].includes(order.publicationStatus || order.status)).reduce((sum, order) => sum + order.budget, 0);
    const frozen = orders.filter((order) => order.isDisputed).reduce((sum, order) => sum + order.budget, 0);
    return { total, settled, pending, frozen };
  }, [orders]);

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><ReceiptText className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">财务账单</h1>
            <p className="mt-1 text-xs text-slate-500">订单预算与结算明细</p>
          </div>
        </div>
        <Button variant="outline" onClick={loadOrders} disabled={loading} className="h-9 rounded-xl text-xs">
          <RefreshCw className={'mr-1.5 h-3.5 w-3.5 ' + (loading ? 'animate-spin' : '')} />刷新
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: '累计订单预算', value: summary.total, tone: 'text-slate-900' },
          { label: '已完成结算', value: summary.settled, tone: 'text-emerald-600' },
          { label: '处理中金额', value: summary.pending, tone: 'text-blue-600' },
          { label: '纠纷冻结金额', value: summary.frozen, tone: 'text-rose-600' },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">{item.label}</p>
            <p className={'mt-2 text-xl font-bold ' + item.tone}>{loading ? '-' : money(item.value)}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h2 className="text-sm font-bold text-slate-800">订单账单</h2>
        </div>
        {loading && <div className="p-10 text-center text-sm text-slate-400">加载中…</div>}
        {!loading && orders.length === 0 && <div className="p-10 text-center text-sm text-slate-400">暂无账单记录</div>}
        {!loading && orders.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">订单</th>
                  <th className="px-5 py-3 font-medium">状态</th>
                  <th className="px-5 py-3 text-right font-medium">订单预算</th>
                  <th className="px-5 py-3 text-right font-medium">平台服务费</th>
                  <th className="px-5 py-3 text-right font-medium">设计师所得</th>
                  <th className="px-5 py-3 text-right font-medium">更新时间</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => {
                  const status = statusMap[order.publicationStatus || order.status] || { label: order.status, className: 'bg-slate-100 text-slate-600' };
                  const balanceAmount = order.balanceAmount ?? (order.budget - (order.depositAmount || 0));
                  const fee = balanceAmount * order.platformCommissionRate;
                  return (
                    <tr key={order.id} className="hover:bg-slate-50">
                      <td className="max-w-[260px] px-5 py-4">
                        <p className="truncate font-semibold text-slate-800">{order.title}</p>
                        <p className="mt-1 text-slate-400">{order.orderNo}</p>
                      </td>
                      <td className="px-5 py-4"><Badge className={'text-[10px] ' + status.className}>{status.label}</Badge></td>
                      <td className="px-5 py-4 text-right font-semibold text-slate-800">{money(order.budget)}</td>
                      <td className="px-5 py-4 text-right text-slate-500">{money(fee)} · 尾款 {(order.platformCommissionRate * 100).toFixed(0)}%</td>
                      <td className="px-5 py-4 text-right text-slate-600">{money(order.designerPayout)}</td>
                      <td className="px-5 py-4 text-right text-slate-400">{new Date(order.updatedAt || order.createdAt).toLocaleDateString('zh-CN')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
