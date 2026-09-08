'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ClipboardCheck, FilePlus2, RefreshCw, Settings2, ShieldAlert } from 'lucide-react';
import type { DesignOrder, OrderDispute, ReviewRule } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CreateOrderDialog } from '@/components/create-order-dialog';
import { toast } from 'sonner';

const statusMap: Record<string, { label: string; className: string }> = {
  pending_service_review: { label: '待客服审核', className: 'bg-amber-50 text-amber-700' },
  published: { label: '接单中', className: 'bg-emerald-50 text-emerald-700' },
  claimed: { label: '已接单', className: 'bg-blue-50 text-blue-700' },
  in_progress: { label: '制作中', className: 'bg-blue-50 text-blue-700' },
  submitted: { label: '待作品审核', className: 'bg-indigo-50 text-indigo-700' },
  completed: { label: '已完成', className: 'bg-slate-100 text-slate-600' },
  rejected: { label: '已驳回', className: 'bg-rose-50 text-rose-700' },
};

const formatDate = (value?: string) => value ? new Date(value).toLocaleDateString('zh-CN') : '-';

export default function AdvertiserDashboardPage() {
  const [orders, setOrders] = useState<DesignOrder[]>([]);
  const [rules, setRules] = useState<ReviewRule[]>([]);
  const [disputes, setDisputes] = useState<OrderDispute[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [ordersResponse, rulesResponse, disputesResponse] = await Promise.all([
        fetchWithAuth('/design-orders/mine'),
        fetchWithAuth('/review-rules/mine'),
        fetchWithAuth('/disputes'),
      ]);
      const [ordersResult, rulesResult, disputesResult] = await Promise.all([
        ordersResponse.json(),
        rulesResponse.json(),
        disputesResponse.json(),
      ]);
      if (!ordersResponse.ok || !ordersResult.success) throw new Error(ordersResult.message || '加载订单失败');
      if (!rulesResponse.ok || !rulesResult.success) throw new Error(rulesResult.message || '加载审核流失败');
      if (!disputesResponse.ok || !disputesResult.success) throw new Error(disputesResult.message || '加载纠纷失败');
      setOrders(ordersResult.data || []);
      setRules(rulesResult.data || []);
      setDisputes(disputesResult.data || []);
    } catch (error: any) {
      toast.error(error.message || '加载工作台失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDashboard(); }, []);

  const counts = useMemo(() => {
    const status = (order: DesignOrder) => order.publicationStatus || order.status;
    return {
      total: orders.length,
      pending: orders.filter((order) => ['pending_service_review', 'submitted'].includes(status(order))).length,
      active: orders.filter((order) => ['published', 'claimed', 'in_progress'].includes(status(order))).length,
      completed: orders.filter((order) => status(order) === 'completed').length,
    };
  }, [orders]);

  const recentOrders = useMemo(
    () => [...orders].sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()).slice(0, 5),
    [orders]
  );
  const openDisputes = disputes.filter((item) => item.status !== 'resolved').length;
  const activeRules = rules.filter((item) => item.isActive).length;
  const pendingServiceReview = orders.filter((order) => (order.publicationStatus || order.status) === 'pending_service_review').length;
  const pendingWorkReview = orders.filter((order) => (order.publicationStatus || order.status) === 'submitted').length;

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold text-blue-600">品牌方</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">工作台</h1>
          <p className="mt-2 text-sm text-slate-500">订单、审核流与纠纷</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadDashboard} disabled={loading} className="h-9 rounded-xl text-xs">
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />刷新
          </Button>
          <Link href="/advertiser/review-flows">
            <Button variant="outline" className="h-9 rounded-xl text-xs"><Settings2 className="mr-1.5 h-3.5 w-3.5" />审核流</Button>
          </Link>
          <Button onClick={() => setCreateOpen(true)} className="h-9 rounded-xl bg-blue-600 text-xs text-white hover:bg-blue-700"><FilePlus2 className="mr-1.5 h-3.5 w-3.5" />发布订单</Button>
        </div>
      </div>

      <CreateOrderDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(order) => {
          void loadDashboard();
          window.location.href = `/advertiser/orders?payOrderId=${encodeURIComponent(order.id)}`;
        }}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: '全部订单', value: counts.total, tone: 'text-slate-900' },
          { label: '待处理', value: counts.pending, tone: 'text-amber-600' },
          { label: '进行中', value: counts.active, tone: 'text-blue-600' },
          { label: '已完成', value: counts.completed, tone: 'text-emerald-600' },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">{item.label}</p>
            <p className={`mt-2 text-2xl font-bold ${item.tone}`}>{loading ? '-' : item.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-800">待处理事项</h2>
            </div>
            <Link href="/advertiser/orders" className="text-xs font-semibold text-blue-600 hover:text-blue-700">查看订单</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Link href="/advertiser/orders" className="rounded-xl border border-amber-100 bg-amber-50/60 p-4 transition hover:border-amber-300">
              <p className="text-xs text-amber-700">订单待处理</p>
              <p className="mt-2 text-xl font-bold text-amber-700">{loading ? '-' : pendingServiceReview}</p>
            </Link>
            <Link href="/advertiser/orders" className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-4 transition hover:border-indigo-300">
              <p className="text-xs text-indigo-700">作品待审核</p>
              <p className="mt-2 text-xl font-bold text-indigo-700">{loading ? '-' : pendingWorkReview}</p>
            </Link>
            <Link href="/advertiser/disputes" className="rounded-xl border border-rose-100 bg-rose-50/60 p-4 transition hover:border-rose-300">
              <p className="text-xs text-rose-700">处理中纠纷</p>
              <p className="mt-2 text-xl font-bold text-rose-700">{loading ? '-' : openDisputes}</p>
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-800">审核流</h2>
            </div>
            <Link href="/advertiser/review-flows" className="text-xs font-semibold text-blue-600 hover:text-blue-700">管理</Link>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-bold text-slate-900">{loading ? '-' : activeRules}</span>
            <span className="pb-1 text-xs text-slate-500">条启用中</span>
          </div>
          <p className="mt-3 text-xs text-slate-400">审核流决定作品提交后的处理方式</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">最近订单</h2>
          <Link href="/advertiser/orders" className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">全部订单<ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
        {loading && <div className="py-8 text-center text-sm text-slate-400">加载中…</div>}
        {!loading && recentOrders.length === 0 && <div className="py-8 text-center text-sm text-slate-400">暂无订单</div>}
        {!loading && recentOrders.length > 0 && (
          <div className="divide-y divide-slate-100">
            {recentOrders.map((order) => {
              const status = statusMap[order.publicationStatus || order.status] || { label: order.status, className: 'bg-slate-100 text-slate-600' };
              return (
                <Link key={order.id} href="/advertiser/orders" className="flex items-center justify-between gap-4 py-3 transition hover:bg-slate-50">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-800">{order.title}</p>
                    <p className="mt-1 text-xs text-slate-400">{order.orderNo} · {formatDate(order.updatedAt || order.createdAt)}</p>
                  </div>
                  <Badge className={`shrink-0 text-[10px] ${status.className}`}>{status.label}</Badge>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
