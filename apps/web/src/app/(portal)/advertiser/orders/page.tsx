'use client';
import { OrderEvaluationEntry } from '@/components/order-evaluations';
import { BrandOrderApplications } from '@/components/order-applications';

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Modal, ModalContent, ModalHeader, ModalFooter } from '@/components/ui/modal';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { DesignerInviteDrawer } from '@/components/designer-invite-drawer';
import { ReferenceLinkItemsDetail } from '@/components/reference-link-items-detail';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { toast } from 'sonner';
import { OrderModeDropdownButton } from '@/components/order-mode-dropdown';

const statusMap: Record<string, { label: string; className: string }> = {
  pending_deposit: { label: '待支付定金', className: 'bg-orange-50 text-orange-700' },
  pending_service_review: { label: '待客服审核', className: 'bg-amber-50 text-amber-700' },
  published: { label: '已上架待接单', className: 'bg-emerald-50 text-emerald-700' },
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

function OrderRequirementsDetail({ order }: { order: DesignOrder }) {
  return <div className="space-y-4 text-xs text-slate-600">
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><p>平台：<b>{order.platform}</b></p><p>预算：<b>¥{order.budget}</b></p><p>截止：<b>{new Date(order.deadline).toLocaleDateString('zh-CN')}</b></p><p>设计师：<b>{order.claimedByName || '待接单'}</b></p><p>PSD 源文件：<b className={order.requiresPsd ? 'text-rose-600' : ''}>{order.requiresPsd ? '需要交付' : '不需要'}</b></p></div>
    <div className="rounded-2xl bg-slate-50 p-3 leading-6 whitespace-pre-wrap">{order.requirements || '暂无整体需求说明'}</div>
    <p>审核流：<b>{order.reviewRuleName || '未绑定'}</b></p>
    {order.imageRequirementGroups?.length ? <div className="space-y-3"><div className="flex items-center justify-between"><h3 className="text-sm font-semibold text-slate-800">图片需求详情</h3><span className="text-[11px] text-slate-400">共 {order.imageRequirementGroups.length} 组</span></div><Tabs key={order.id} defaultValue="brand-order-group-0" className="min-w-0">
      <TabsList className="flex h-9 w-full justify-start gap-1 overflow-x-auto rounded-xl bg-slate-50 p-1">
        {order.imageRequirementGroups.map((group, groupIndex) => <TabsTrigger key={group.id || groupIndex} value={`brand-order-group-${groupIndex}`} className="h-7 max-w-56 flex-none rounded-lg px-3 text-xs text-slate-500 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm">{group.name || `第 ${groupIndex + 1} 组`}<span className="ml-1 text-[10px] text-slate-400">{group.imageItems?.length || group.quantity || 0} 张</span></TabsTrigger>)}
      </TabsList>
      {order.imageRequirementGroups.map((group, groupIndex) => {
        const imageItems = group.imageItems?.length ? group.imageItems : (group.materialImages?.length ? group.materialImages : ['']).map((materialImage, imageIndex) => ({ id: `${group.id}-${imageIndex}`, materialImage, description: imageIndex === 0 ? group.description : '', referenceImages: imageIndex === 0 ? group.referenceImages : [], referenceLinks: imageIndex === 0 ? group.referenceLinks : [], referenceLinkItems: undefined, referenceLinkDescription: undefined }));
        return <TabsContent key={group.id || groupIndex} value={`brand-order-group-${groupIndex}`} className="mt-2"><div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><div className="flex items-center justify-between gap-3"><h4 className="font-semibold text-slate-800">{groupIndex + 1}. {group.name}</h4><span className="shrink-0 text-[11px] text-slate-400">{imageItems.length} 张 · {group.dimensions || group.groupType}</span></div><div className="mt-3 space-y-3">{imageItems.map((item, imageIndex) => <div key={item.id || imageIndex} className="rounded-xl bg-slate-50/70 p-3"><div className="mb-2 flex items-center justify-between"><span className="font-semibold text-slate-700">第 {imageIndex + 1} 张</span><span className="text-[10px] text-slate-400">{group.dimensions || '标准尺寸'}</span></div><div className="grid gap-3 sm:grid-cols-2">{item.materialImage && <div><p className="mb-1 font-medium text-slate-500">素材原图</p><a href={item.materialImage} target="_blank" rel="noreferrer"><AuthenticatedImage src={item.materialImage} alt={`${group.name}素材原图${imageIndex + 1}`} className="aspect-square w-full rounded-lg border border-slate-200 bg-white object-cover transition hover:opacity-85" /></a></div>}{item.description && <div className="sm:col-span-2"><p className="mb-1 font-medium text-slate-500">设计要点</p><p className="whitespace-pre-wrap break-words rounded-lg bg-white p-2 leading-5">{item.description}</p></div>}<ReferenceLinkItemsDetail item={item} /></div></div>)}</div></div></TabsContent>;
      })}
    </Tabs></div> : <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-slate-400">暂无图片需求详情</div>}
  </div>;
}

export default function AdvertiserOrdersPage() {
  const [orders, setOrders] = useState<DesignOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({ all: 0 });
  const [inviteOrder, setInviteOrder] = useState<DesignOrder | null>(null);
  const [applicationsOrder, setApplicationsOrder] = useState<DesignOrder | null>(null);
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
      if (reset) setStatusCounts(result.counts || { all: 0 });
      setPage(targetPage);
      setHasMore(Boolean(result.hasMore));
    } catch (error: any) {
      toast.error(error.message || '加载订单失败');
    } finally {
      if (reset) setLoading(false);
      else setLoadingMore(false);
    }
  };

  useEffect(() => {
    const orderId = new URLSearchParams(window.location.search).get('orderId');
    if (!orderId) return;
    fetchWithAuth(`/design-orders/${encodeURIComponent(orderId)}`).then((response) => response.json()).then((result) => { if (result.success) setApplicationsOrder(result.data); });
  }, []);
  useEffect(() => {
    const refresh = () => void loadOrders({ reset: true, nextPage: 1 });
    window.addEventListener('messages-realtime', refresh);
    return () => window.removeEventListener('messages-realtime', refresh);
  }, [statusFilter, keyword]);
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

  const republish = async (order: DesignOrder) => {
    setOperatingId(order.id);
    try {
      const response = await fetchWithAuth(`/design-orders/${order.id}/republish`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '重新发布失败');
      toast.success(result.message);
      void loadOrders({ reset: true, nextPage: 1 });
      await startPayment(result.data, 'deposit');
    } catch (error: any) {
      toast.error(error.message || '重新发布失败');
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
          <OrderModeDropdownButton label="新增设计订单" className="inline-flex h-9 items-center rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700" />
        </div>
      </div>

      <DesignerInviteDrawer open={Boolean(inviteOrder)} onOpenChange={(open) => !open && setInviteOrder(null)} order={inviteOrder} onUpdated={loadOrders} />

      <Modal open={Boolean(payment)} onOpenChange={(open) => { if (!open) closePayment(); }}>
        <ModalContent className="w-[calc(100%-2rem)] max-w-lg overflow-hidden rounded-3xl border-0 bg-white p-0 shadow-2xl">
          <ModalHeader className="border-b border-slate-100 bg-gradient-to-br from-blue-50 via-white to-indigo-50 px-6 py-5">
            <DialogTitle className="flex items-center gap-2 text-base text-slate-900"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm"><QrCode className="h-5 w-5" /></span>{payment?.stage === 'deposit' ? '支付订单定金' : '支付订单尾款'}</DialogTitle>
            <DialogDescription className="pl-11 text-xs text-slate-500">订单：{payment?.order.title}</DialogDescription>
          </ModalHeader>
          {payment && <div className="space-y-4 px-6 py-5">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              {([['wxpay', '微信支付'], ['alipay', '支付宝']] as const).map(([type, label]) => <button key={type} type="button" disabled={payment.loading} onClick={() => { if (type !== payment.type) void startPayment(payment.order, payment.stage, type); }} className={`rounded-lg px-3 py-2.5 text-xs font-semibold transition ${payment.type === type ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:bg-white/60 hover:text-slate-700'}`}>{label}</button>)}
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 text-center">
              <p className="text-xs font-medium text-slate-500">本次应付</p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">¥{payment.amount.toFixed(2)}</p>
              {payment.loading ? <div className="flex h-52 flex-col items-center justify-center gap-2 text-xs text-slate-400"><Loader2 className="h-7 w-7 animate-spin text-blue-600" />正在生成支付二维码…</div> : payment.paid ? <div className="flex h-52 flex-col items-center justify-center gap-2 text-sm font-semibold text-emerald-600"><CheckCircle2 className="h-12 w-12" />支付成功</div> : payment.qrcode ? <div className="mt-3 flex flex-col items-center gap-2"><div className="rounded-xl bg-white p-3 shadow-sm"><QRCodeSVG value={payment.qrcode} size={180} includeMargin /></div><p className="text-[11px] text-slate-500">请使用{payment.type === 'wxpay' ? '微信' : '支付宝'}扫码支付</p></div> : <div className="flex h-52 items-center justify-center text-xs text-rose-500">未获取到支付二维码，请重试</div>}
            </div>
            <p className="text-center text-[11px] text-slate-400">支付完成后页面会自动确认订单状态</p>
            {payment.paid && <Button onClick={closePayment} className="w-full rounded-xl bg-emerald-600 text-xs text-white hover:bg-emerald-700">完成</Button>}
          </div>}
        </ModalContent>
      </Modal>

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">共 <span className="font-semibold text-slate-800">{loading ? '-' : totalOrders}</span> 个订单</p>
          <div className="flex w-full gap-2 sm:w-auto"><div className="relative min-w-0 flex-1 sm:w-64"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') setKeyword(searchInput.trim()); }} placeholder="搜索订单名称" className="h-9 rounded-xl pl-9 text-xs" /></div><Button variant="outline" onClick={() => setKeyword(searchInput.trim())} className="h-9 rounded-xl text-xs">搜索</Button></div>
        </div>
        <Tabs value={statusFilter} onValueChange={setStatusFilter}>
          <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl bg-slate-50 p-1">
            {statusFilters.map((status) => <TabsTrigger key={status.value} value={status.value} className="h-8 flex-none rounded-lg px-3 text-xs text-slate-500 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm">{status.label} <span className="ml-1 rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] leading-none text-slate-500 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700">{statusCounts[status.value] || 0}</span></TabsTrigger>)}
          </TabsList>
        </Tabs>
      </div>

      <div className="space-y-2">
        {loading && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400">正在加载订单…</div>}
        {!loading && orders.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">还没有订单，先发布一个设计需求吧</div>}
        {orders.map((order) => {
          const status = order.depositRefundStatus === 'pending'
            ? { label: '已取消 · 定金退款中', className: 'bg-amber-50 text-amber-700' }
            : order.depositRefundStatus === 'refunded'
              ? { label: '已取消 · 定金已退', className: 'bg-slate-100 text-slate-600' }
              : statusMap[orderStatus(order)] || { label: order.status, className: 'bg-slate-100 text-slate-600' };
          const canEdit = order.status === 'open' || order.publicationStatus === 'rejected';
          const canCancel = ['open', 'pending_service_review'].includes(order.status)
            && order.publicationStatus !== 'rejected'
            && !(order.paymentStatus === 'deposit_pending' && Boolean(order.depositOutTradeNo))
            && (!['deposit_paid', 'balance_pending', 'paid'].includes(order.paymentStatus || '')
              || (['published', 'pending_service_review'].includes(order.publicationStatus || '') && !order.claimedById));
          const canPayDeposit = order.status === 'open'
            && order.publicationStatus === 'pending_deposit'
            && order.paymentStatus === 'deposit_pending';
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
                  <p className="mt-0.5">创建：{new Date(order.createdAt).toLocaleString('zh-CN')}</p>
                  <p className="mt-0.5">截止：{new Date(order.deadline).toLocaleDateString('zh-CN')}</p>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap justify-end gap-1.5 border-t border-slate-100 pt-2">
                {order.paymentStatus === 'paid' && <OrderEvaluationEntry orderId={order.id} compact />}
                <Button variant="outline" onClick={() => setApplicationsOrder(order)} className="h-8 rounded-xl text-xs">接单申请{order.pendingApplicationCount ? ` (${order.pendingApplicationCount})` : ''}</Button>
                <Button variant="outline" onClick={() => setDetailOrder(order)} className="h-8 rounded-xl text-xs">查看详情</Button>
                {canEdit && <Link href={`/advertiser/orders/new?edit=${encodeURIComponent(order.id)}`}><Button variant="outline" className="h-8 rounded-xl text-xs">编辑订单</Button></Link>}
                {canPayDeposit && <Button onClick={() => startPayment(order, 'deposit')} disabled={operatingId === order.id} className="h-8 rounded-xl bg-orange-500 text-xs text-white hover:bg-orange-600">支付定金 ¥{order.depositAmount?.toFixed(2)}</Button>}
                {order.publicationStatus === 'rejected' && <ConfirmAction title="确认重新提交订单？" description="重新提交后订单会再次进入客服审核，当前修改内容将正式生效。" confirmText="确认重新提交" onConfirm={() => operate(order, 'resubmit')} disabled={operatingId === order.id} tone="warning"><Button disabled={operatingId === order.id} className="h-8 rounded-xl bg-amber-500 text-xs text-white hover:bg-amber-600">重新提交</Button></ConfirmAction>}
                {order.status === 'cancelled' && order.publicationStatus !== 'rejected' && <ConfirmAction title="确认重新发布订单？" description="系统会保留原关闭订单，并复制生成一笔新的待支付订单。" confirmText="确认重新发布" onConfirm={() => republish(order)} disabled={operatingId === order.id} tone="warning"><Button disabled={operatingId === order.id} className="h-8 rounded-xl bg-blue-600 text-xs text-white hover:bg-blue-700">重新发布</Button></ConfirmAction>}
                {order.status === 'open' && order.publicationStatus === 'published' && <Button variant="outline" onClick={() => setInviteOrder(order)} className="h-8 rounded-xl border-blue-200 text-xs text-blue-600 hover:bg-blue-50">邀请接单</Button>}
                {hasProgress && <Button variant="outline" onClick={() => openProgress(order)} className="h-8 rounded-xl border-blue-200 text-xs text-blue-600">查看进度</Button>}
                {order.status === 'completed' && <Link href="/advertiser/billing"><Button variant="outline" className="h-8 rounded-xl border-emerald-200 text-xs text-emerald-600">查看账单</Button></Link>}
                {canCancel && <ConfirmAction title="确认取消订单？" description={['deposit_paid', 'balance_pending', 'paid'].includes(order.paymentStatus || '') ? `订单取消后将停止接单，客服会按原支付渠道退还定金 ¥${Number(order.depositAmount || 0).toFixed(2)}。已接单订单不能直接取消。` : '取消后订单将停止后续处理，已发出的未完成邀请也无法继续接单。此操作不可直接恢复。'} confirmText="确认取消订单" onConfirm={() => operate(order, 'cancel')} disabled={operatingId === order.id}><Button variant="ghost" disabled={operatingId === order.id} className="h-8 rounded-xl text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700">取消订单</Button></ConfirmAction>}
              </div>
            </article>
          );
        })}
        {!loading && orders.length > 0 && !hasMore && <p className="py-3 text-center text-[11px] text-slate-400">没有更多订单了</p>}
        {loadingMore && <p className="py-3 text-center text-[11px] text-slate-400">正在加载更多…</p>}
        <div ref={loadMoreRef} className="h-1" />
      </div>

      <Drawer direction="right" open={Boolean(applicationsOrder)} onOpenChange={(open) => !open && setApplicationsOrder(null)}><DrawerContent className="h-full max-h-full w-full max-w-[calc(100vw-1rem)] overflow-hidden rounded-l-3xl bg-white [--drawer-width:720px]"><DrawerHeader className="border-b border-slate-100 p-5"><DrawerTitle>{applicationsOrder?.title} · 接单申请</DrawerTitle><DrawerDescription>查看设计师作品与报价，确认后正式接单</DrawerDescription></DrawerHeader><div className="min-h-0 flex-1 overflow-y-auto p-4">{applicationsOrder && <BrandOrderApplications order={applicationsOrder} onUpdated={() => { void loadOrders(); fetchWithAuth(`/design-orders/${applicationsOrder.id}`).then((response) => response.json()).then((result) => { if (result.success) setApplicationsOrder(result.data); }); }} />}</div></DrawerContent></Drawer>
      <Modal open={Boolean(detailOrder)} onOpenChange={(open) => !open && setDetailOrder(null)}>
        <ModalContent className="max-h-[85vh] max-w-3xl overflow-y-auto rounded-3xl bg-white">
          <ModalHeader><DialogTitle>{detailOrder?.title}</DialogTitle><DialogDescription>{detailOrder?.orderNo} · {detailOrder?.category}</DialogDescription></ModalHeader>
          {detailOrder && <OrderRequirementsDetail order={detailOrder} />}
          {detailOrder?.paymentStatus === 'paid' && <div className="mt-4"><OrderEvaluationEntry orderId={detailOrder.id} /></div>}
        </ModalContent>
      </Modal>

      <Drawer direction="right" open={Boolean(progressOrder)} onOpenChange={(open) => { if (!open) { setProgressOrder(null); setProgress(null); } }}>
        <DrawerContent className="h-full max-h-full overflow-y-auto rounded-l-3xl bg-white p-6 [--drawer-width:32rem]">
          <DrawerHeader className="p-0 pb-5"><DrawerTitle>订单进度</DrawerTitle><DrawerDescription>{progressOrder?.orderNo} · {progressOrder?.title}</DrawerDescription></DrawerHeader>
          {progressLoading ? <div className="py-12 text-center text-sm text-slate-400">正在加载进度…</div> : !progress?.task ? <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-400">订单已进入执行流程，等待设计师接单并创建任务。</div> : <OrderProgressPanel progress={progress} />}
        </DrawerContent>
      </Drawer>

    </section>
  );
}
