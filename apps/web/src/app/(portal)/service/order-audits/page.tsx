 'use client';

import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import type { DesignOrder } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function ServiceOrderAuditsPage() {
  const [orders, setOrders] = useState<DesignOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const loadOrders = async () => {
    try {
      const response = await fetchWithAuth('/design-orders/service/pending');
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '加载审核队列失败');
      setOrders(result.data || []);
    } catch (error: any) {
      toast.error(error.message || '加载审核队列失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOrders(); }, []);

  const reviewOrder = async (order: DesignOrder, action: 'approve' | 'reject') => {
    try {
      const response = await fetchWithAuth(`/design-orders/${order.id}/publication-review`, {
        method: 'POST',
        body: JSON.stringify({ action, comment: action === 'approve' ? '订单信息完整，允许进入接单大厅' : '请补充需求规格与交付说明' })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '审核失败');
      toast.success(result.message);
      setOrders((current) => current.filter((item) => item.id !== order.id));
    } catch (error: any) {
      toast.error(error.message || '审核失败');
    }
  };

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold text-blue-600">客服工作台</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">订单发布审核</h1>
      </div>
      <div className="space-y-3">
        {loading && <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400">正在加载待审核订单…</div>}
        {!loading && orders.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">当前没有待审核订单</div>}
        {orders.map((order) => (
          <article key={order.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-800">{order.title}</h2>
                  <Badge variant="outline" className="text-[10px]">{order.orderNo}</Badge>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-500">{order.requirements || '暂无补充说明'}</p>
                <p className="mt-2 text-xs text-slate-400">发布方：{order.creatorName} · 预算：¥{order.budget}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="sm" onClick={() => reviewOrder(order, 'reject')} variant="outline" className="h-8 rounded-xl text-xs text-rose-600">
                  <X className="mr-1 h-3.5 w-3.5" />驳回
                </Button>
                <Button size="sm" onClick={() => reviewOrder(order, 'approve')} className="h-8 rounded-xl bg-blue-600 text-xs text-white hover:bg-blue-700">
                  <Check className="mr-1 h-3.5 w-3.5" />通过并上架
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
