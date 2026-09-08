'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { QrCode, CheckCircle2, Loader2 } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { DesignOrder, TaskStatus } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { CreateOrderDialog } from '@/components/create-order-dialog';
import { DesignerInviteDrawer } from '@/components/designer-invite-drawer';
import { toast } from 'sonner';

const statusMap: Record<string, { label: string; className: string }> = {
  pending_deposit: { label: '待支付定金', className: 'bg-orange-50 text-orange-700' },
  pending_service_review: { label: '待客服审核', className: 'bg-amber-50 text-amber-700' },
  published: { label: '已上架接单', className: 'bg-emerald-50 text-emerald-700' },
  rejected: { label: '客服已驳回', className: 'bg-rose-50 text-rose-700' },
  claimed: { label: '设计师已接单', className: 'bg-blue-50 text-blue-700' },
  in_progress: { label: '设计制作中', className: 'bg-blue-50 text-blue-700' },
  submitted: { label: '作品待审核', className: 'bg-indigo-50 text-indigo-700' },
  completed: { label: '已完成', className: 'bg-slate-100 text-slate-600' },
  cancelled: { label: '已关闭', className: 'bg-slate-100 text-slate-600' },
};
const statusFilters = [{ value: 'all', label: '全部订单状态' }, ...Object.entries(statusMap).map(([value, { label }]) => ({ value, label }))];
const orderStatus = (order: DesignOrder) => order.status === 'cancelled' && order.publicationStatus !== 'rejected' ? 'cancelled' : order.publicationStatus || order.status;
const taskStatusMap: Record<TaskStatus, string> = { draft: '设计师制作中', pending: '等待当前节点审核', in_review: '当前节点审核中', needs_revision: '已退回设计师修改', approved: '审核已通过', returned: '设计师已退单', archived: '已归档' };
type OrderProgress = { task: { status: TaskStatus; currentLevel: number; totalImages: number; approvedCount: number; rejectedCount: number; designerName: string; submittedAt?: string; completedAt?: string; updatedAt?: string } | null; nodes: Array<{ level: number; reviewerNames: string[]; approvalMode: 'any' | 'all' }> };
type PaymentType = 'wxpay' | 'alipay';
type PaymentState = { order: DesignOrder; stage: 'deposit' | 'balance'; type: PaymentType; amount: number; outTradeNo?: string; qrcode?: string; loading: boolean; paid: boolean };

function OrderProgressPanel({ progress }: { progress: OrderProgress }) {
  const task = progress.task;
  if (!task) return null;
  return <div className="space-y-5">
    <div className="rounded-2xl bg-slate-50 p-4 text-xs text-slate-600">
      <div className="flex items-center justify-between gap-3"><span>当前阶段</span><span className="font-semibold text-blue-600">{taskStatusMap[task.status]}</span></div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><p className="text-lg font-bold text-slate-800">{task.totalImages}</p><p className="text-[10px] text-slate-400">交付图片</p></div><div><p className="text-lg font-bold text-emerald-600">{task.approvedCount}</p><p className="text-[10px] text-slate-400">已通过</p></div><div><p className="text-lg font-bold text-rose-500">{task.rejectedCount}</p><p className="text-[10px] text-slate-400">需修改</p></div></div>
      <p className="mt-3 text-[11px] text-slate-400">当前设计师：{task.designerName}</p>
    </div>
    <div><h3 className="mb-3 text-sm font-semibold text-slate-800">审核节点</h3>{progress.nodes.length === 0 ? <p className="text-xs text-slate-400">该订单暂未配置审核节点</p> : <div className="space-y-3">{progress.nodes.map((node) => {
      const completed = task.status === 'approved' || node.level < task.currentLevel;
      const current = !completed && node.level === task.currentLevel;
      const nodeStatus = completed ? '已完成' : current ? task.status === 'draft' ? '等待提审' : task.status === 'needs_revision' ? '退回修改中' : task.status === 'pending' ? '待审核' : '审核中' : '待进行';
      return <div key={node.level} className="flex gap-3"><span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${completed ? 'bg-emerald-100 text-emerald-700' : current ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{node.level}</span><div className="min-w-0 flex-1 border-b border-slate-100 pb-3"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-slate-700">第 {node.level} 级审核</p><span className={`text-[10px] ${current ? 'text-blue-600' : completed ? 'text-emerald-600' : 'text-slate-400'}`}>{nodeStatus}</span></div><p className="mt-1 text-[11px] text-slate-400">审核人：{node.reviewerNames.join('、') || '未指定'} · {node.approvalMode === 'all' ? '全员通过' : '任一通过'}</p></div></div>;
    })}</div>}</div>
  </div>;
}

export default function AdvertiserOrdersPage() {
  const [orders, setOrders] = useState<DesignOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<DesignOrder | null>(null);
  const [inviteOrder, setInviteOrder] = useState<DesignOrder | null>(null);
  const [detailOrder, setDetailOrder] = useState<DesignOrder | null>(null);
  const [operatingId, setOperatingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [progressOrder, setProgressOrder] = useState<DesignOrder | null>(null);
  const [progress, setProgress] = useState<OrderProgress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [pendingPaymentOrderId, setPendingPaymentOrderId] = useState<string | null>(null);
  const paymentRequestId = useRef(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const loadOrders = async ({ reset = true, nextPage }: { reset?: boolean; nextPage?: number } = {}) => {
    const targetPage = nextPage || (reset ? 1 : page + 1);
    if (reset) {
      setLoading(true);
      setLoadingMore(false);
    }
    else setLoadingMore(true);
    try {
      const query = new URLSearchParams({ status: statusFilter, keyword, page: String(targetPage), pageSize: '10' });
      const response = await fetchWithAuth(`/design-orders/mine?${query.toString()}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '加载订单失败');
      setOrders((current) => reset ? result.data || [] : [...current, ...(result.data || [])]);
      setTotalOrders(Number(result.total) || 0);
      setPage(targetPage);
      setHasMore(Boolean(result.hasMore));
    } catch (error: any) {
      toast.error(error.message || '加载订单失败');
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };

  useEffect(() => { void loadOrders({ reset: true, nextPage: 1 }); }, [statusFilter, keyword]);
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || loading || loadingMore || !hasMore) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void loadOrders({ reset: false });
    }, { rootMargin: '240px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [loading, loadingMore, hasMore, page, statusFilter, keyword]);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('create') === '1') setCreateOpen(true); }, []);

  const operate = async (order: DesignOrder, action: 'resubmit' | 'cancel') => {
    setOperatingId(order.id);
    try {
      const response = await fetchWithAuth(`/design-orders/${order.id}/${action}`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '操作失败');
      toast.success(result.message);
      void loadOrders({ reset: true, nextPage: 1 });
    } catch (error: any) {
      toast.error(error.message || '操作失败');
    } finally {
      setOperatingId(null);
    }
  };

  const openProgress = async (order: DesignOrder) => {
    setProgressOrder(order);
    setProgress(null);
    setProgressLoading(true);
    try {
      const response = await fetchWithAuth(`/design-orders/${order.id}/progress`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '加载订单进度失败');
      setProgress(result.data);
    } catch (error: any) {
      toast.error(error.message || '加载订单进度失败');
    } finally {
      setProgressLoading(false);
    }
  };

  const startPayment = async (order: DesignOrder, stage: 'deposit' | 'balance', type: PaymentType = 'wxpay') => {
    const requestId = ++paymentRequestId.current;
    setPayment({ order, stage, type, amount: stage === 'deposit' ? order.depositAmount || 0 : order.balanceAmount || 0, loading: true, paid: false });
    try {
      const response = await fetchWithAuth(`/payments/orders/${order.id}/checkout`, { method: 'POST', body: JSON.stringify({ stage, type }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '生成支付订单失败');
      if (requestId === paymentRequestId.current) {
        setPayment({ order, stage, type, amount: Number(result.data.amount) || 0, outTradeNo: result.data.outTradeNo, qrcode: result.data.qrcode, loading: false, paid: false });
      }
    } catch (error: any) {
      if (requestId === paymentRequestId.current) setPayment(null);
      toast.error(error.message || '发起支付失败');
    }
  };

  const closePayment = () => {
    paymentRequestId.current += 1;
    setPayment(null);
  };

  useEffect(() => {
    const outTradeNo = payment?.outTradeNo;
    if (!outTradeNo || payment.loading || payment.paid) return;
    let cancelled = false;
    const checkPayment = async () => {
      try {
        const response = await fetchWithAuth(`/payments/status/${encodeURIComponent(outTradeNo)}`);
        const result = await response.json();
        if (cancelled || !response.ok || !result.success) return;
        const paid = payment.stage === 'deposit'
          ? ['deposit_paid', 'paid'].includes(result.data.paymentStatus)
          : result.data.paymentStatus === 'paid';
        if (paid) {
          setPayment((current) => current?.outTradeNo === outTradeNo ? { ...current, paid: true } : current);
          void loadOrders({ reset: true, nextPage: 1 });
          toast.success(payment.stage === 'deposit' ? '定金支付成功' : '尾款支付成功');
        }
      } catch {
        // 支付状态以异步通知为准，轮询失败时保留弹窗等待下一次检查。
      }
    };
    void checkPayment();
    const timer = window.setInterval(() => void checkPayment(), 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [payment?.outTradeNo, payment?.stage, payment?.loading, payment?.paid]);

  useEffect(() => {
    const paymentOrderId = new URLSearchParams(window.location.search).get('payOrderId');
    if (paymentOrderId) setPendingPaymentOrderId(paymentOrderId);
  }, []);

  useEffect(() => {
    if (!pendingPaymentOrderId) return;
    const order = orders.find((item) => item.id === pendingPaymentOrderId);
    if (!order) return;
    setPendingPaymentOrderId(null);
    window.history.replaceState({}, '', '/advertiser/orders');
    void startPayment(order, 'deposit');
  }, [orders, pendingPaymentOrderId]);

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold text-blue-600">品牌方工作台</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">订单管理</h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setCreateOpen(true)} className="h-9 rounded-xl bg-blue-600 text-xs text-white hover:bg-blue-700">新增设计订单</Button>
        </div>
      </div>

      <CreateOrderDialog
        open={createOpen}
        editingOrder={editingOrder}
        onOpenChange={(open) => { setCreateOpen(open); if (!open) setEditingOrder(null); }}
        onCreated={(order) => { void loadOrders({ reset: true, nextPage: 1 }); void startPayment(order, 'deposit'); }}
        onUpdated={() => { setCreateOpen(false); setEditingOrder(null); void loadOrders({ reset: true, nextPage: 1 }); }}
      />
      <DesignerInviteDrawer open={Boolean(inviteOrder)} onOpenChange={(open) => !open && setInviteOrder(null)} order={inviteOrder} onUpdated={loadOrders} />

      <Dialog open={Boolean(payment)} onOpenChange={(open) => { if (!open) closePayment(); }}>
        <DialogContent className="w-[calc(100%-2rem)] max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base"><QrCode className="h-5 w-5 text-blue-600" />{payment?.stage === 'deposit' ? '支付订单定金' : '支付订单尾款'}</DialogTitle>
            <DialogDescription className="text-xs">订单：{payment?.order.title}</DialogDescription>
          </DialogHeader>
          {payment && <div className="space-y-4">
            <div className="flex rounded-xl bg-slate-100 p-1">
              {([['wxpay', '微信支付'], ['alipay', '支付宝']] as const).map(([type, label]) => <button key={type} type="button" disabled={payment.loading} onClick={() => { if (type !== payment.type) void startPayment(payment.order, payment.stage, type); }} className={`flex-1 rounded-lg px-3 py-2 text-xs font-medium transition ${payment.type === type ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{label}</button>)}
            </div>
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center">
              <p className="text-xs text-slate-500">应付金额</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">¥{payment.amount.toFixed(2)}</p>
              {payment.loading ? <div className="flex h-52 flex-col items-center justify-center gap-2 text-xs text-slate-400"><Loader2 className="h-7 w-7 animate-spin text-blue-600" />正在生成支付二维码…</div> : payment.paid ? <div className="flex h-52 flex-col items-center justify-center gap-2 text-sm font-semibold text-emerald-600"><CheckCircle2 className="h-12 w-12" />支付成功</div> : payment.qrcode ? <div className="mt-3 flex flex-col items-center gap-2"><div className="rounded-xl bg-white p-3 shadow-sm"><QRCodeSVG value={payment.qrcode} size={180} includeMargin /></div><p className="text-[11px] text-slate-500">请使用{payment.type === 'wxpay' ? '微信' : '支付宝'}扫码支付</p></div> : <div className="flex h-52 items-center justify-center text-xs text-rose-500">未获取到支付二维码，请重试</div>}
            </div>
            <p className="text-center text-[11px] text-slate-400">支付完成后页面会自动确认订单状态</p>
            {payment.paid && <Button onClick={closePayment} className="w-full rounded-xl bg-emerald-600 text-xs text-white hover:bg-emerald-700">完成</Button>}
          </div>}
        </DialogContent>
      </Dialog>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">共 <span className="font-semibold text-slate-800">{loading ? '-' : totalOrders}</span> 个订单</p>
          <div className="flex w-full gap-2 sm:w-auto"><div className="relative min-w-0 flex-1 sm:w-64"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') setKeyword(searchInput.trim()); }} placeholder="搜索订单名称" className="h-9 rounded-xl pl-9 text-xs" /></div><Button variant="outline" onClick={() => setKeyword(searchInput.trim())} className="h-9 rounded-xl text-xs">搜索</Button></div>
        </div>
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl bg-slate-50 p-1">
            {statusFilters.map((status) => <TabsTrigger key={status.value} value={status.value} className="h-8 flex-none rounded-lg px-3 text-xs text-slate-500 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm">{status.label}</TabsTrigger>)}
          </TabsList>
        </Tabs>
      </div>

      <div className="space-y-2">
        {loading && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400">正在加载订单…</div>}
        {!loading && orders.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">还没有订单，先发布一个设计需求吧</div>}
        {orders.map((order) => {
          const status = statusMap[orderStatus(order)] || { label: order.status, className: 'bg-slate-100 text-slate-600' };
          const canEdit = order.status === 'open';
          const canCancel = ['open', 'pending_service_review'].includes(order.status) && order.publicationStatus !== 'rejected';
          const hasProgress = ['claimed', 'in_progress', 'submitted', 'completed'].includes(order.status);
          return (
            <article key={order.id} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-sm font-bold text-slate-800">{order.title}</h2>
                    <Badge className={`text-[10px] ${status.className}`}>{status.label}</Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">{order.orderNo} · {order.category} · 预算 ¥{order.budget}</p>
                  <p className="mt-1 line-clamp-1 text-[11px] leading-4 text-slate-400">{order.publicationReviewComment || order.requirements || '暂无需求说明'}</p>
                </div>
                <div className="shrink-0 text-right text-xs text-slate-400">
                  <p>审核流：{order.reviewRuleName || '未绑定'}</p>
                  <p className="mt-0.5">截止：{new Date(order.deadline).toLocaleDateString('zh-CN')}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap justify-end gap-1.5 border-t border-slate-100 pt-2">
                <Button variant="outline" onClick={() => setDetailOrder(order)} className="h-8 rounded-xl text-xs">查看详情</Button>
                {canEdit && <Button variant="outline" onClick={() => { setEditingOrder(order); setCreateOpen(true); }} className="h-8 rounded-xl text-xs">编辑订单</Button>}
                {order.paymentStatus === 'deposit_pending' && <Button onClick={() => startPayment(order, 'deposit')} disabled={operatingId === order.id} className="h-8 rounded-xl bg-orange-500 text-xs text-white hover:bg-orange-600">支付定金 ¥{order.depositAmount?.toFixed(2)}</Button>}
                {order.publicationStatus === 'rejected' && <Button onClick={() => operate(order, 'resubmit')} disabled={operatingId === order.id} className="h-8 rounded-xl bg-amber-500 text-xs text-white hover:bg-amber-600">重新提交</Button>}
                {!['claimed', 'in_progress', 'submitted', 'completed', 'cancelled'].includes(order.status) && order.publicationStatus !== 'rejected' && <Button variant="outline" onClick={() => setInviteOrder(order)} className="h-8 rounded-xl border-blue-200 text-xs text-blue-600 hover:bg-blue-50">邀请接单</Button>}
                {hasProgress && <Button variant="outline" onClick={() => openProgress(order)} className="h-8 rounded-xl border-blue-200 text-xs text-blue-600">查看进度</Button>}
                {order.status === 'completed' && <Link href="/advertiser/billing"><Button variant="outline" className="h-8 rounded-xl border-emerald-200 text-xs text-emerald-600">查看账单</Button></Link>}
                {canCancel && <Button variant="ghost" onClick={() => operate(order, 'cancel')} disabled={operatingId === order.id} className="h-8 rounded-xl text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700">关闭订单</Button>}
              </div>
            </article>
          );
        })}
        {!loading && orders.length > 0 && !hasMore && <p className="py-3 text-center text-[11px] text-slate-400">没有更多订单了</p>}
        {loadingMore && <p className="py-3 text-center text-[11px] text-slate-400">正在加载更多…</p>}
        <div ref={loadMoreRef} className="h-1" />
      </div>

      <Dialog open={Boolean(detailOrder)} onOpenChange={(open) => !open && setDetailOrder(null)}>
        <DialogContent className="max-w-2xl rounded-3xl bg-white">
          <DialogHeader><DialogTitle>{detailOrder?.title}</DialogTitle><DialogDescription>{detailOrder?.orderNo} · {detailOrder?.category}</DialogDescription></DialogHeader>
          {detailOrder && <div className="grid gap-3 text-xs text-slate-600 sm:grid-cols-2"><p>平台：{detailOrder.platform}</p><p>预算：¥{detailOrder.budget}</p><p>截止：{new Date(detailOrder.deadline).toLocaleDateString('zh-CN')}</p><p>设计师：{detailOrder.claimedByName || '待接单'}</p><p className="sm:col-span-2">需求说明：{detailOrder.requirements || '暂无'}</p><p className="sm:col-span-2">审核流：{detailOrder.reviewRuleName || '未绑定'}</p></div>}
        </DialogContent>
      </Dialog>

      <Drawer direction="right" open={Boolean(progressOrder)} onOpenChange={(open) => { if (!open) { setProgressOrder(null); setProgress(null); } }}>
        <DrawerContent className="h-full max-h-full overflow-y-auto rounded-l-3xl bg-white p-6 [--drawer-width:32rem]">
          <DrawerHeader className="p-0 pb-5"><DrawerTitle>订单进度</DrawerTitle><DrawerDescription>{progressOrder?.orderNo} · {progressOrder?.title}</DrawerDescription></DrawerHeader>
          {progressLoading ? <div className="py-12 text-center text-sm text-slate-400">正在加载进度…</div> : !progress?.task ? <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">订单已进入执行流程，等待设计师接单并创建任务。</div> : <OrderProgressPanel progress={progress} />}
        </DrawerContent>
      </Drawer>

    </section>
  );
}
