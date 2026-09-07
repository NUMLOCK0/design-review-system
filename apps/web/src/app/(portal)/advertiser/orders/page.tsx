'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import * as Select from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';
import type { DesignOrder, TaskStatus } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { CreateOrderDialog } from '@/components/create-order-dialog';
import { DesignerInviteDrawer } from '@/components/designer-invite-drawer';
import { toast } from 'sonner';

const statusMap: Record<string, { label: string; className: string }> = {
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
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteOrder, setInviteOrder] = useState<DesignOrder | null>(null);
  const [detailOrder, setDetailOrder] = useState<DesignOrder | null>(null);
  const [editOrder, setEditOrder] = useState<DesignOrder | null>(null);
  const [editForm, setEditForm] = useState({ title: '', budget: '', deadline: '', requirements: '' });
  const [operatingId, setOperatingId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [progressOrder, setProgressOrder] = useState<DesignOrder | null>(null);
  const [progress, setProgress] = useState<OrderProgress | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);

  const loadOrders = async () => {
    try {
      const response = await fetchWithAuth('/design-orders/mine');
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '加载订单失败');
      setOrders(result.data || []);
    } catch (error: any) {
      toast.error(error.message || '加载订单失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOrders(); }, []);
  useEffect(() => { if (new URLSearchParams(window.location.search).get('create') === '1') setCreateOpen(true); }, []);

  const operate = async (order: DesignOrder, action: 'resubmit' | 'cancel') => {
    setOperatingId(order.id);
    try {
      const response = await fetchWithAuth(`/design-orders/${order.id}/${action}`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '操作失败');
      toast.success(result.message);
      loadOrders();
    } catch (error: any) {
      toast.error(error.message || '操作失败');
    } finally {
      setOperatingId(null);
    }
  };

  const openEdit = (order: DesignOrder) => {
    setEditOrder(order);
    setEditForm({ title: order.title, budget: String(order.budget), deadline: order.deadline.slice(0, 10), requirements: order.requirements });
  };

  const saveEdit = async () => {
    if (!editOrder || !editForm.title.trim() || !editForm.budget) return;
    setOperatingId(editOrder.id);
    try {
      const response = await fetchWithAuth(`/design-orders/${editOrder.id}`, { method: 'PATCH', body: JSON.stringify({ ...editForm, title: editForm.title.trim(), budget: Number(editForm.budget), deadline: new Date(editForm.deadline).toISOString() }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '保存失败');
      toast.success(result.message || '订单已更新');
      setEditOrder(null);
      loadOrders();
    } catch (error: any) {
      toast.error(error.message || '保存失败');
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

  const filteredOrders = orders.filter((order) => statusFilter === 'all' || orderStatus(order) === statusFilter);

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

      <CreateOrderDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(order) => { loadOrders(); setInviteOrder(order); }} />
      <DesignerInviteDrawer open={Boolean(inviteOrder)} onOpenChange={(open) => !open && setInviteOrder(null)} order={inviteOrder} onUpdated={loadOrders} />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3">
        <p className="text-xs text-slate-500">共 <span className="font-semibold text-slate-800">{filteredOrders.length}</span> 个订单</p>
        <Select.Root value={statusFilter} onValueChange={setStatusFilter}><Select.Trigger className="flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs outline-none focus:border-blue-300 focus:ring-[3px] focus:ring-blue-500/15 sm:w-48"><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className="z-50 max-h-72 min-w-[12rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-md"><Select.Viewport>{statusFilters.map((status) => <Select.Item key={status.value} value={status.value} className="flex cursor-pointer items-center rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700"><Select.ItemText>{status.label}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root>
      </div>

      <div className="space-y-3">
        {loading && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400">正在加载订单…</div>}
        {!loading && orders.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">还没有订单，先发布一个设计需求吧</div>}
        {!loading && orders.length > 0 && filteredOrders.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">当前状态下没有订单</div>}
        {filteredOrders.map((order) => {
          const status = statusMap[orderStatus(order)] || { label: order.status, className: 'bg-slate-100 text-slate-600' };
          const canEdit = order.status === 'open';
          const canCancel = ['open', 'pending_service_review'].includes(order.status) && order.publicationStatus !== 'rejected';
          const hasProgress = ['claimed', 'in_progress', 'submitted', 'completed'].includes(order.status);
          return (
            <article key={order.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-sm font-bold text-slate-800">{order.title}</h2>
                    <Badge className={`text-[10px] ${status.className}`}>{status.label}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{order.orderNo} · {order.category} · 预算 ¥{order.budget}</p>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{order.publicationReviewComment || order.requirements || '暂无需求说明'}</p>
                </div>
                <div className="shrink-0 text-right text-xs text-slate-400">
                  <p>审核流：{order.reviewRuleName || '未绑定'}</p>
                  <p className="mt-1">截止：{new Date(order.deadline).toLocaleDateString('zh-CN')}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                <Button variant="outline" onClick={() => setDetailOrder(order)} className="h-8 rounded-xl text-xs">查看详情</Button>
                {canEdit && <Button variant="outline" onClick={() => openEdit(order)} className="h-8 rounded-xl text-xs">编辑订单</Button>}
                {order.publicationStatus === 'rejected' && <Button onClick={() => operate(order, 'resubmit')} disabled={operatingId === order.id} className="h-8 rounded-xl bg-amber-500 text-xs text-white hover:bg-amber-600">重新提交</Button>}
                {!['claimed', 'in_progress', 'submitted', 'completed', 'cancelled'].includes(order.status) && order.publicationStatus !== 'rejected' && <Button variant="outline" onClick={() => setInviteOrder(order)} className="h-8 rounded-xl border-blue-200 text-xs text-blue-600 hover:bg-blue-50">邀请接单</Button>}
                {hasProgress && <Button variant="outline" onClick={() => openProgress(order)} className="h-8 rounded-xl border-blue-200 text-xs text-blue-600">查看进度</Button>}
                {order.status === 'completed' && <Link href="/advertiser/billing"><Button variant="outline" className="h-8 rounded-xl border-emerald-200 text-xs text-emerald-600">查看账单</Button></Link>}
                {canCancel && <Button variant="ghost" onClick={() => operate(order, 'cancel')} disabled={operatingId === order.id} className="h-8 rounded-xl text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700">关闭订单</Button>}
              </div>
            </article>
          );
        })}
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

      <Drawer direction="right" open={Boolean(editOrder)} onOpenChange={(open) => !open && setEditOrder(null)}>
        <DrawerContent className="h-full max-h-full overflow-y-auto rounded-l-3xl bg-white p-6 [--drawer-width:64rem]"><DrawerHeader className="p-0 pb-5"><DrawerTitle>编辑订单</DrawerTitle><DrawerDescription>{editOrder?.publicationStatus === 'published' ? '保存后订单将退出接单大厅，并重新提交客服审核。' : '修改后可重新提交客服审核。'}</DrawerDescription></DrawerHeader><div className="space-y-3"><Input value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} placeholder="需求标题" /><div className="grid gap-3 sm:grid-cols-2"><Input type="number" min="50" value={editForm.budget} onChange={(event) => setEditForm({ ...editForm, budget: event.target.value })} placeholder="预算" /><Input type="date" value={editForm.deadline} onChange={(event) => setEditForm({ ...editForm, deadline: event.target.value })} /></div><Textarea rows={5} value={editForm.requirements} onChange={(event) => setEditForm({ ...editForm, requirements: event.target.value })} placeholder="需求说明" /></div><DrawerFooter className="flex-row justify-end p-0 pt-5"><Button variant="outline" onClick={() => setEditOrder(null)}>取消</Button><Button onClick={saveEdit} disabled={operatingId === editOrder?.id}>保存修改</Button></DrawerFooter></DrawerContent>
      </Drawer>
    </section>
  );
}
