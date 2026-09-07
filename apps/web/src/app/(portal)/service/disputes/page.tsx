 'use client';

import { useEffect, useState } from 'react';
import type { OrderDispute } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function ServiceDisputesPage() {
  const [disputes, setDisputes] = useState<OrderDispute[]>([]);

  const loadDisputes = async () => {
    const response = await fetchWithAuth('/disputes');
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || '加载纠纷失败');
    setDisputes(result.data || []);
  };

  useEffect(() => {
    loadDisputes().catch((error) => toast.error(error.message || '加载纠纷失败'));
  }, []);

  const handleAction = async (id: string, action: 'mediation' | 'resolve' | 'escalate') => {
    try {
      const response = await fetchWithAuth(`/disputes/${id}/action`, {
        method: 'POST',
        body: JSON.stringify({ action, comment: action === 'resolve' ? '双方已完成客服调解' : '' })
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '处理纠纷失败');
      toast.success(result.message);
      await loadDisputes();
    } catch (error: any) {
      toast.error(error.message || '处理纠纷失败');
    }
  };

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold text-blue-600">客服工作台</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">纠纷处理中心</h1>
      </div>
      <div className="space-y-3">
        {disputes.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">当前没有待处理纠纷</div>}
        {disputes.map((dispute) => (
          <article key={dispute.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-800">订单 {dispute.orderNo}</h2>
                  <Badge variant="outline" className="text-[10px]">{dispute.status}</Badge>
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-700">{dispute.reason}</p>
                <p className="mt-1 text-xs leading-5 text-slate-500">{dispute.description}</p>
                <p className="mt-2 text-xs text-slate-400">发起人：{dispute.initiatorName}</p>
              </div>
              {dispute.status !== 'resolved' && (
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleAction(dispute.id, 'mediation')} className="h-8 rounded-xl text-xs">进入调解</Button>
                  <Button size="sm" onClick={() => handleAction(dispute.id, 'resolve')} className="h-8 rounded-xl bg-emerald-600 text-xs text-white hover:bg-emerald-700">结案</Button>
                  <Button size="sm" variant="outline" onClick={() => handleAction(dispute.id, 'escalate')} className="h-8 rounded-xl text-xs text-rose-600">升级</Button>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
