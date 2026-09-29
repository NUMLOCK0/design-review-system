'use client';
import { OrderApplicationDialog } from '@/components/order-applications';
import { EvaluationRating, OrderEvaluationEntry } from '@/components/order-evaluations';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, CalendarDays, Check, ChevronRight, Clock3, Copy, ExternalLink, Image as ImageIcon, LoaderCircle, MessageCircle, ShieldCheck, UsersRound } from 'lucide-react';
import { calculateOrderMinimumBudget, type DesignOrder, type ImageGroupType, type ReviewTask, type TaskStatus } from '@design-review/shared';
import { fetchWithAuth, getCurrentUser, type UserInfo } from '@/lib/auth';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { goBackOrReplace } from '@/components/mobile/mobile-navigation';
import { DesignerInviteDrawer } from '@/components/designer-invite-drawer';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { toast } from 'sonner';
import { useDesignerClaimEligibility } from '@/hooks/use-designer-claim-eligibility';
import { DesignerClaimEligibilityBanner } from '@/components/designer-claim-eligibility-banner';

type Progress = { task: null | { status: TaskStatus; currentLevel: number; totalImages: number; approvedCount: number; rejectedCount: number; designerName: string }; nodes: Array<{ level: number; reviewerNames: string[]; approvalMode: 'any' | 'all' }> };
type Payment = { stage: 'deposit' | 'balance'; type: 'wxpay' | 'alipay'; amount: number; tradeNo?: string; qr?: string; loading: boolean; paid: boolean };
const statuses: Record<string, string> = { pending_deposit: '待支付定金', pending_service_review: '待客服审核', published: '待接单', open: '待接单', claimed: '已接单', in_progress: '设计中', submitted: '待作品审核', completed: '已完成', rejected: '已驳回', cancelled: '已关闭' };
const workflowStatuses: Record<TaskStatus, string> = { draft: '设计师制作中', pending: '等待当前节点审核', in_review: '当前节点审核中', needs_revision: '已退回设计师修改', approved: '审核已通过', returned: '设计师已退单', archived: '已归档' };
const money = (value: unknown) => `¥${Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function MobileOrderDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [order, setOrder] = useState<DesignOrder | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [groupIndex, setGroupIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [operating, setOperating] = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [detailTask, setDetailTask] = useState<ReviewTask | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [servicePrice, setServicePrice] = useState('');
  const [serviceMinimum, setServiceMinimum] = useState(0);
  const [serviceComment, setServiceComment] = useState('');

  const loadOrder = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth(`/design-orders/${id}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '订单不存在或无权查看');
      setOrder(result.data);
    } catch (error) { toast.error(error instanceof Error ? error.message : '订单加载失败'); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { setUser(getCurrentUser()); void loadOrder(); }, [loadOrder]);
  useEffect(() => { if (order) setServicePrice(String(order.budget)); }, [order?.id, order?.budget]);
  useEffect(() => {
    if (user?.role !== 'customer_service' || !order || order.publicationStatus !== 'pending_service_review') return;
    fetchWithAuth('/system-config/order-pricing').then((response) => response.json()).then((result) => {
      if (!result.success || !result.data) return;
      setServiceMinimum(calculateOrderMinimumBudget(order.imageRequirementGroups, result.data.imageUnitPrices as Partial<Record<ImageGroupType, number>> || {}, Number(result.data.minOrderBudget) || 0, order.requiresPsd, Number(result.data.psdSurchargeRate) || 0, Number(result.data.imageUnitPrice) || 0));
    }).catch(() => undefined);
  }, [user?.role, order?.id, order?.publicationStatus]);
  useEffect(() => {
    if (!order || user?.role !== 'advertiser' || !['claimed', 'in_progress', 'submitted', 'completed'].includes(order.status)) return;
    fetchWithAuth(`/design-orders/${order.id}/progress`).then((response) => response.json()).then((result) => { if (result.success) setProgress(result.data); }).catch(() => undefined);
  }, [order?.id, order?.status, user?.role]);

  useEffect(() => {
    if (!order || user?.role !== 'advertiser' || order.status !== 'completed') return;
    fetchWithAuth('/review-tasks?page=1&pageSize=100').then((response) => response.json()).then((result) => {
      const task = (result.data?.list || []).find((item: ReviewTask) => item.orderId === order.id);
      if (task) setDetailTask(task);
    }).catch(() => undefined);
  }, [order?.id, order?.status, user?.role]);

  useEffect(() => {
    const tradeNo = payment?.tradeNo;
    if (!tradeNo || payment.loading || payment.paid) return;
    let cancelled = false;
    const check = async () => {
      try {
        const response = await fetchWithAuth(`/payments/status/${encodeURIComponent(tradeNo)}`);
        const result = await response.json();
        const paid = payment.stage === 'deposit' ? ['deposit_paid', 'paid'].includes(result.data?.paymentStatus) : result.data?.paymentStatus === 'paid';
        if (!cancelled && response.ok && result.success && paid) {
          setPayment((current) => current ? { ...current, paid: true } : current);
          toast.success(payment.stage === 'deposit' ? '定金支付成功' : '尾款支付成功');
          void loadOrder();
          if (payment.stage === 'balance') window.setTimeout(() => {
            fetchWithAuth('/review-tasks?page=1&pageSize=100').then((response) => response.json()).then((taskResult) => {
              const task = (taskResult.data?.list || []).find((item: ReviewTask) => item.orderId === order?.id);
              if (task) setDetailTask(task);
            }).catch(() => undefined);
          }, 800);
        }
      } catch { /* 保留二维码等待支付回调 */ }
    };
    void check();
    const timer = window.setInterval(() => void check(), 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [payment?.tradeNo, payment?.stage, payment?.loading, payment?.paid, loadOrder]);

  const status = useMemo(() => {
    if (!order) return '';
    if (order.depositRefundStatus === 'pending') return '已关闭 · 定金退款中';
    if (order.depositRefundStatus === 'refunded') return '已关闭 · 定金已退';
    const key = order.status === 'cancelled' && order.publicationStatus !== 'rejected' ? 'cancelled' : order.publicationStatus || order.status;
    return statuses[key] || key;
  }, [order]);

  const isDesigner = user?.role === 'designer';
  const claimReadiness = useDesignerClaimEligibility(isDesigner);

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">正在加载订单详情…</div>;
  if (!order) return <div className="py-16 text-center"><p className="text-sm text-slate-500">无法加载订单详情</p><button type="button" onClick={() => goBackOrReplace(router, '/mobile/orders')} className="mt-4 text-sm font-semibold role-primary-text">返回订单列表</button></div>;

  const isAdvertiser = user?.role === 'advertiser';

  const canModerate = user?.role === 'customer_service' && order.publicationStatus === 'pending_service_review';
  const canEdit = isAdvertiser && (order.status === 'open' || order.publicationStatus === 'rejected');
  const canPayDeposit = isAdvertiser && order.status === 'open' && order.publicationStatus === 'pending_deposit' && order.paymentStatus === 'deposit_pending';
  const canInvite = isAdvertiser && order.status === 'open' && order.publicationStatus === 'published';
  const canCancel = isAdvertiser && ['open', 'pending_service_review'].includes(order.status)
    && order.publicationStatus !== 'rejected'
    && !(order.paymentStatus === 'deposit_pending' && Boolean(order.depositOutTradeNo))
    && (!['deposit_paid', 'balance_pending', 'paid'].includes(order.paymentStatus || '')
      || (['published', 'pending_service_review'].includes(order.publicationStatus || '') && !order.claimedById));
  const activeGroup = order.imageRequirementGroups?.[groupIndex];
  const activeItems = activeGroup?.imageItems?.length ? activeGroup.imageItems : (activeGroup?.materialImages || ['']).map((materialImage, index) => ({ id: `${activeGroup?.id}-${index}`, materialImage, description: index === 0 ? activeGroup?.description : '', referenceImages: index === 0 ? activeGroup?.referenceImages || [] : [], referenceLinks: index === 0 ? activeGroup?.referenceLinks || [] : [], referenceLinkItems: [] }));

  const operate = async (action: 'cancel' | 'resubmit' | 'republish') => {
    if (!order) return;
    setOperating(true);
    try {
      const response = await fetchWithAuth(`/design-orders/${order.id}/${action}`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '订单操作失败');
      toast.success(result.message || '操作成功');
      if (action === 'republish' && result.data?.id) {
        setOrder(result.data);
        void startPayment(result.data, 'deposit', 'wxpay');
      } else void loadOrder();
    } catch (error) { toast.error(error instanceof Error ? error.message : '订单操作失败'); }
    finally { setOperating(false); }
  };

  const startPayment = async (target: DesignOrder, stage: 'deposit' | 'balance', type: 'wxpay' | 'alipay') => {
    setPayment({ stage, type, amount: stage === 'deposit' ? Number(target.depositAmount) : Number(target.balanceAmount), loading: true, paid: false });
    try {
      const response = await fetchWithAuth(`/payments/orders/${target.id}/checkout`, { method: 'POST', body: JSON.stringify({ stage, type }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '生成支付二维码失败');
      setPayment({ stage, type, amount: Number(result.data.amount) || 0, tradeNo: result.data.outTradeNo, qr: result.data.qrcode, loading: false, paid: false });
    } catch (error) { setPayment(null); toast.error(error instanceof Error ? error.message : '支付发起失败'); }
  };

  const claim = () => setApplyOpen(true);

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast.success('已复制'); }
    catch { toast.error('复制失败，请长按链接复制'); }
  };

  const downloadFile = async (url: string, filename: string) => {
    try {
      const response = await fetchWithAuth(url);
      if (!response.ok) throw new Error('下载失败，请稍后重试');
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = objectUrl; anchor.download = filename; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) { toast.error(error instanceof Error ? error.message : '下载失败'); }
  };

  const moderateOrder = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !serviceComment.trim()) { toast.error('请填写驳回原因'); return; }
    setOperating(true);
    try {
      const response = await fetchWithAuth(`/design-orders/${order.id}/publication-review`, { method: 'POST', body: JSON.stringify({ action, comment: serviceComment.trim() }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '订单审核失败');
      await fetchWithAuth('/service/logs', { method: 'POST', body: JSON.stringify({ taskType: 'order_audit', taskId: order.id, action, comment: serviceComment.trim() }) });
      toast.success(result.message || '审核完成'); await loadOrder();
    } catch (error) { toast.error(error instanceof Error ? error.message : '审核失败'); }
    finally { setOperating(false); }
  };

  const updateServicePrice = async () => {
    const amount = Number(servicePrice);
    if (!Number.isFinite(amount) || amount < serviceMinimum) { toast.error(`订单预算不能低于 ¥${serviceMinimum.toFixed(2)}`); return; }
    setOperating(true);
    try {
      const response = await fetchWithAuth(`/design-orders/${order.id}/service-price`, { method: 'PATCH', body: JSON.stringify({ budget: amount }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '价格更新失败');
      toast.success('订单价格已更新'); await loadOrder();
    } catch (error) { toast.error(error instanceof Error ? error.message : '价格更新失败'); }
    finally { setOperating(false); }
  };

  return <>
    <div className="space-y-5 pb-24">
      <div className="flex items-center gap-3"><button type="button" aria-label="返回订单列表" onClick={() => goBackOrReplace(router, '/mobile/orders')} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm"><ArrowLeft className="h-5 w-5" /></button><div className="min-w-0 flex-1"><p className="truncate text-[11px] text-slate-400">{order.orderNo}</p><h1 className="truncate text-lg font-extrabold">订单详情</h1></div><span className="shrink-0 rounded-full role-primary-soft px-3 py-1.5 text-[10px] font-bold role-primary-text">{status}</span></div>

      {user?.role === 'designer' && <EvaluationRating userId={order.creatorId} mobile />}
      {order.paymentStatus === 'paid' && <OrderEvaluationEntry orderId={order.id} mobile />}
      <section className="rounded-[22px] bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,.035)]"><h2 className="text-base font-bold leading-6">{order.title}</h2><p className="mt-1.5 text-xs text-slate-400">{order.category} · {order.platform} · {order.creatorName}</p><div className="mt-4 grid grid-cols-2 gap-2"><Metric label="订单金额" value={money(order.budget)} accent /><Metric label="交付截止" value={order.deadline ? new Date(order.deadline).toLocaleDateString('zh-CN') : '待确认'} /><Metric label="图片需求" value={`${(order.imageRequirementGroups || []).reduce((sum, group) => sum + (group.imageItems?.length || group.quantity || 0), 0)} 张`} /><Metric label="PSD 源文件" value={order.requiresPsd ? '需要交付' : '不需要'} /></div>{order.publicationReviewComment && <div className="mt-3 rounded-xl bg-rose-50 p-3 text-xs leading-5 text-rose-700">审核意见：{order.publicationReviewComment}</div>}<p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">{order.requirements || '暂无整体需求说明'}</p></section>

      {order.imageRequirementGroups?.length ? <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-[15px] font-bold">图片需求</h2><span className="text-[11px] text-slate-400">{order.imageRequirementGroups.length} 组</span></div><div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">{order.imageRequirementGroups.map((group, index) => <button key={group.id} onClick={() => setGroupIndex(index)} className={`min-h-10 shrink-0 rounded-xl px-3 text-xs font-semibold ${groupIndex === index ? 'role-primary-bg text-white' : 'bg-white text-slate-500'}`}>{group.name || `第 ${index + 1} 组`} <span className="ml-1 opacity-70">{group.imageItems?.length || group.quantity || 0}</span></button>)}</div>{activeGroup && <div className="space-y-3"><div className="flex items-center justify-between rounded-xl bg-white px-3.5 py-3 text-xs"><span className="font-bold text-slate-700">{activeGroup.name}</span><span className="text-slate-400">{activeGroup.dimensions || activeGroup.groupType}</span></div>{activeItems.map((item, index) => <article key={item.id || index} className="space-y-3 rounded-[20px] border border-slate-100 bg-white p-3 shadow-[0_4px_20px_rgba(15,23,42,.025)]"><div className="flex items-center justify-between"><h3 className="text-sm font-bold">第 {index + 1} 张</h3><span className="text-[10px] text-slate-400">{activeGroup.dimensions || activeGroup.groupType}</span></div>{item.materialImage && <div><p className="mb-2 text-[11px] font-semibold text-slate-500">素材原图</p><button onClick={() => setPreviewUrl(item.materialImage || '')} className="block w-full overflow-hidden rounded-xl bg-slate-50"><AuthenticatedImage src={item.materialImage} alt={`第${index + 1}张素材原图`} className="max-h-[420px] w-full object-contain" /></button></div>}<div className="rounded-xl bg-slate-50 p-3"><p className="text-[11px] font-semibold text-slate-500">设计要点</p><p className="mt-1.5 whitespace-pre-wrap text-xs leading-5 text-slate-700">{item.description || '暂无单图说明'}</p></div>{(item.referenceLinkItems?.length || item.referenceImages?.length || item.referenceLinks?.length) ? <div className="space-y-2"><p className="text-[11px] font-semibold text-slate-500">竞品参考</p>{item.referenceLinkItems?.map((reference, referenceIndex) => <div key={reference.id || referenceIndex} className="rounded-xl border border-slate-100 p-3">{reference.image && <button onClick={() => setPreviewUrl(reference.image || '')} className="mb-2 block w-full overflow-hidden rounded-lg bg-slate-50"><AuthenticatedImage src={reference.image} alt={`参考图片 ${referenceIndex + 1}`} className="max-h-64 w-full object-contain" /></button>}{reference.link && <div className="flex items-center gap-2"><a href={reference.link.match(/^https?:\/\//i) ? reference.link : `https://${reference.link}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1 break-all text-xs font-medium role-primary-text">{reference.link}<ExternalLink className="ml-1 inline h-3 w-3" /></a><button aria-label="复制参考链接" onClick={() => void copy(reference.link || '')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500"><Copy className="h-4 w-4" /></button></div>}{reference.description && <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-500">{reference.description}</p>}</div>)}{(!item.referenceLinkItems?.length) && [...(item.referenceImages || []), ...(item.referenceLinks || [])].map((reference, referenceIndex) => <p key={referenceIndex} className="break-all text-xs role-primary-text">{reference.startsWith('http') ? <a href={reference} target="_blank" rel="noreferrer">{reference}</a> : reference}</p>)}</div> : null}</article>)}</div>}</section> : <section className="rounded-2xl bg-white p-4 text-xs text-slate-400">暂无分组图片需求</section>}

      {isAdvertiser && ['claimed', 'in_progress', 'submitted', 'completed'].includes(order.status) && <section className="rounded-[20px] bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,.035)]"><div className="flex items-center gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-xl role-primary-soft role-primary-text"><ShieldCheck className="h-4 w-4" /></span><div><h2 className="text-sm font-bold">订单进度</h2><p className="text-[10px] text-slate-400">{progress?.task ? workflowStatuses[progress.task.status] : '正在同步审核节点'}</p></div></div>{progress?.task ? <><div className="mt-3 grid grid-cols-3 gap-2 text-center"><Metric label="交付图片" value={progress.task.totalImages} /><Metric label="已通过" value={progress.task.approvedCount} /><Metric label="需修改" value={progress.task.rejectedCount} /></div><div className="mt-3 space-y-3">{progress.nodes.map((node) => { const done = progress.task!.status === 'approved' || node.level < progress.task!.currentLevel; const current = !done && node.level === progress.task!.currentLevel; return <div key={node.level} className="flex gap-3"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${done ? 'bg-emerald-100 text-emerald-700' : current ? 'role-primary-bg text-white' : 'bg-slate-100 text-slate-400'}`}>{done ? <Check className="h-3.5 w-3.5" /> : node.level}</span><div className="min-w-0 flex-1 border-b border-slate-100 pb-2"><p className="text-xs font-semibold">第 {node.level} 级 · {done ? '已完成' : current ? '当前节点' : '待进行'}</p><p className="mt-1 text-[10px] text-slate-400">审核人：{node.reviewerNames.join('、') || '未指定'} · {node.approvalMode === 'all' ? '全员通过' : '任一通过'}</p></div></div>; })}</div></> : <p className="mt-3 text-xs text-slate-400">订单已进入执行流程，等待设计师接单并创建任务。</p>}</section>}

      {isAdvertiser && order.status === 'completed' && <section className="space-y-3 rounded-[20px] bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,.035)]"><div><h2 className="text-sm font-bold">确认验收与下载</h2><p className="mt-1 text-[11px] leading-5 text-slate-400">支付尾款并确认验收后，可以下载设计师交付的源文件和无水印原图。</p></div>{order.paymentStatus !== 'paid' ? <div className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800">尾款待支付：{money(order.balanceAmount)}。请使用页面底部按钮继续。</div> : detailTask?.acceptedAt ? <><div className="rounded-xl bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">已于 {new Date(detailTask.acceptedAt).toLocaleString('zh-CN')} 确认验收</div>{detailTask.sourceFileUrl && <Button variant="outline" onClick={() => void downloadFile(detailTask.sourceFileUrl!, detailTask.sourceFileName || '设计源文件')} className="h-11 w-full rounded-xl border-emerald-200 text-xs text-emerald-700"><ImageIcon className="mr-2 h-4 w-4" />下载源文件{detailTask.sourceFileName ? ` · ${detailTask.sourceFileName}` : ''}</Button>}{detailTask.groups?.flatMap((imageGroup) => imageGroup.images.filter((entry) => entry.originalAssetId).map((entry) => <Button key={entry.id} variant="outline" onClick={() => void downloadFile(`/upload/assets/${entry.originalAssetId}`, `设计原图-${entry.imageIndex}`)} className="h-11 w-full rounded-xl border-emerald-200 text-xs text-emerald-700"><ImageIcon className="mr-2 h-4 w-4" />下载无水印原图 {entry.imageIndex}</Button>))}</> : <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">尾款已支付，正在同步验收状态…</p>}</section>}

      {canModerate && <section className="space-y-3 rounded-[20px] bg-white p-4 shadow-sm"><div><h2 className="text-sm font-bold">客服审核</h2><p className="mt-1 text-[11px] leading-5 text-slate-400">审核无需领取。确认订单信息后通过上架，或填写原因驳回。</p></div>{['deposit_pending', undefined, ''].includes(order.paymentStatus) && <div className="space-y-2 rounded-xl bg-slate-50 p-3"><label className="text-xs font-semibold">调整订单金额（元）</label><div className="flex gap-2"><input type="number" min={serviceMinimum} step="0.01" value={servicePrice} onChange={(event) => setServicePrice(event.target.value)} className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[var(--role-primary)]" /><Button disabled={operating} onClick={() => void updateServicePrice()} variant="outline" className="h-11 shrink-0 rounded-xl text-xs">更新价格</Button></div><p className="text-[10px] text-slate-400">最低金额 ¥{serviceMinimum.toFixed(2)}，更新后定金与尾款会重新计算。</p></div>}<label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">审核意见（驳回时必填） <span aria-hidden="true" className="text-rose-500">*</span></span><textarea value={serviceComment} onChange={(event) => setServiceComment(event.target.value)} placeholder="审核意见；驳回时必填" rows={3} className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs outline-none focus:border-[var(--role-primary)]" /></label><div className="grid grid-cols-2 gap-2"><ConfirmAction title="确认通过并上架？" description="通过后订单将进入接单大厅。" confirmText="通过并上架" onConfirm={() => moderateOrder('approve')} disabled={operating}><Button disabled={operating} className="h-11 w-full rounded-xl role-primary-bg text-xs font-bold text-white">通过并上架</Button></ConfirmAction><ConfirmAction title="确认驳回订单？" description={serviceComment.trim() || '请填写驳回原因后确认。'} confirmText="确认驳回" tone="danger" onConfirm={() => moderateOrder('reject')} disabled={operating || !serviceComment.trim()}><Button disabled={operating || !serviceComment.trim()} variant="outline" className="h-11 w-full rounded-xl border-rose-200 text-xs text-rose-600">驳回订单</Button></ConfirmAction></div></section>}

      <section className="flex flex-wrap gap-2 text-[11px] text-slate-400"><span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />创建于 {new Date(order.createdAt).toLocaleString('zh-CN')}</span>{order.claimedByName && <span className="inline-flex items-center gap-1"><UsersRound className="h-3.5 w-3.5" />设计师 {order.claimedByName}</span>}{order.reviewRuleName && <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />审核流 {order.reviewRuleName}</span>}</section>
    </div>

    <OrderApplicationDialog orderId={applyOpen ? order.id : null} onClose={() => setApplyOpen(false)} />
    {isAdvertiser && <Link href={`/mobile/orders/${order.id}/applications`} className="mb-4 flex min-h-12 items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-sm font-semibold role-primary-text">查看设计师接单申请<ChevronRight className="h-4 w-4" /></Link>}
    {(isDesigner && order.status === 'open' && order.publicationStatus === 'published' && order.paymentStatus !== 'deposit_pending') || isAdvertiser ? <div className="fixed inset-x-0 bottom-[calc(70px+env(safe-area-inset-bottom))] z-20 border-t border-slate-200/80 bg-white/95 p-3 backdrop-blur">{isDesigner && !claimReadiness.eligibility?.canClaim && <div className="mx-auto mb-2 max-w-xl"><DesignerClaimEligibilityBanner readiness={claimReadiness} href="/mobile/designer-profile" compact /></div>}<div className="mx-auto flex max-w-xl gap-2">{isDesigner && <Button disabled={operating || claimReadiness.loading || !claimReadiness.eligibility?.canClaim} onClick={() => void claim()} className="h-12 flex-1 rounded-xl role-primary-bg text-sm font-bold text-white disabled:opacity-50">{operating ? '处理中…' : '申请接单'}</Button>}{isAdvertiser && <>{canPayDeposit && <Button onClick={() => void startPayment(order, 'deposit', 'wxpay')} className="h-12 flex-1 rounded-xl bg-orange-500 text-sm font-bold text-white">支付定金 {money(order.depositAmount)}</Button>}{order.status === 'completed' && order.paymentStatus !== 'paid' && <Button onClick={() => void startPayment(order, 'balance', 'wxpay')} className="h-12 flex-1 rounded-xl role-primary-bg text-sm font-bold text-white">支付尾款并验收 {money(order.balanceAmount)}</Button>}{order.status === 'completed' && order.paymentStatus === 'paid' && <Link href="/mobile/billing" className="flex h-12 flex-1 items-center justify-center rounded-xl role-primary-bg text-sm font-bold text-white">查看账单</Link>}{!canPayDeposit && order.status !== 'completed' && <Button variant="outline" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="h-12 flex-1 rounded-xl text-sm font-semibold">订单详情</Button>}</>}{isAdvertiser && <button onClick={() => setActionsOpen((value) => !value)} aria-label="更多订单操作" className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><ChevronRight className={`h-5 w-5 transition-transform ${actionsOpen ? 'rotate-90' : ''}`} /></button>}</div></div> : null}

    {isAdvertiser && actionsOpen && <div className="fixed bottom-[calc(126px+env(safe-area-inset-bottom))] left-1/2 z-30 grid w-[min(440px,calc(100vw-24px))] grid-cols-2 gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl sm:hidden">{canEdit && <Link href={`/mobile/orders/new?edit=${encodeURIComponent(order.id)}`} className="flex min-h-11 items-center justify-center rounded-xl bg-slate-50 text-xs font-semibold text-slate-700">编辑订单</Link>}{order.publicationStatus === 'rejected' && <ConfirmAction title="重新提交订单？" description="订单将再次进入客服审核。" confirmText="确认重新提交" tone="warning" onConfirm={() => operate('resubmit')} disabled={operating}><Button className="h-11 w-full rounded-xl bg-amber-500 text-xs text-white">重新提交</Button></ConfirmAction>}{canInvite && <Button variant="outline" onClick={() => setInviteOpen(true)} className="h-11 rounded-xl text-xs"><UsersRound className="mr-1.5 h-4 w-4" />邀请设计师</Button>}{order.status === 'cancelled' && order.publicationStatus !== 'rejected' && <ConfirmAction title="重新发布订单？" description="系统会保留原订单并创建新订单，接单前需要重新支付定金。" confirmText="确认重新发布" tone="warning" onConfirm={() => operate('republish')} disabled={operating}><Button className="h-11 w-full rounded-xl role-primary-bg text-xs text-white">重新发布</Button></ConfirmAction>}{canCancel && <ConfirmAction title="确认取消订单？" description={['deposit_paid', 'balance_pending', 'paid'].includes(order.paymentStatus || '') ? `客服将按原支付渠道退还定金 ${money(order.depositAmount)}。` : '取消后订单将停止处理，此操作不可直接恢复。'} confirmText="确认取消订单" onConfirm={() => operate('cancel')} disabled={operating}><Button variant="outline" className="h-11 w-full rounded-xl border-rose-200 text-xs text-rose-600">取消订单</Button></ConfirmAction>}<Button variant="outline" onClick={() => setActionsOpen(false)} className="h-11 rounded-xl text-xs">收起</Button></div>}

    <DesignerInviteDrawer open={inviteOpen} onOpenChange={setInviteOpen} order={order} onUpdated={() => void loadOrder()} />
    <Drawer direction="bottom" open={Boolean(payment)} onOpenChange={(open) => { if (!open) setPayment(null); }}>
      <DrawerContent className="max-h-[88dvh] rounded-t-[26px] bg-white pb-[max(env(safe-area-inset-bottom),12px)]"><DrawerHeader><DrawerTitle>{payment?.stage === 'deposit' ? '支付订单定金' : '支付订单尾款'}</DrawerTitle><DrawerDescription className="line-clamp-1">{order.orderNo} · {order.title}</DrawerDescription></DrawerHeader>{payment && <div className="space-y-4 px-4 pb-3"><div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">{(['wxpay','alipay'] as const).map((type) => <button key={type} onClick={() => type !== payment.type && void startPayment(order, payment.stage, type)} className={`min-h-11 rounded-lg text-xs font-bold ${payment.type === type ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{type === 'wxpay' ? '微信支付' : '支付宝'}</button>)}</div><div className="rounded-2xl bg-slate-50 p-4 text-center"><p className="text-xs text-slate-400">本次应付</p><p className="mt-1 text-3xl font-extrabold">{money(payment.amount)}</p>{payment.loading ? <LoaderCircle className="mx-auto my-8 h-8 w-8 animate-spin role-primary-text" /> : payment.paid ? <div className="py-8 text-sm font-semibold text-emerald-600">支付成功</div> : payment.qr ? <div className="mt-4 flex flex-col items-center gap-2"><div className="rounded-xl bg-white p-3"><QRCodeSVG value={payment.qr} size={196} includeMargin /></div><p className="text-[11px] text-slate-500">请使用{payment.type === 'wxpay' ? '微信' : '支付宝'}扫码，支付后将自动更新</p></div> : <p className="py-8 text-xs text-rose-500">未获取到支付二维码</p>}</div>{payment.paid && <Button onClick={() => setPayment(null)} className="h-12 w-full rounded-xl bg-emerald-600 text-sm text-white">完成</Button>}</div>}<DrawerFooter className="px-4 pt-1"><Button variant="outline" onClick={() => setPayment(null)} className="h-11 rounded-xl">关闭</Button></DrawerFooter></DrawerContent>
    </Drawer>
    {previewUrl && <div role="dialog" aria-modal="true" aria-label="图片预览" onClick={() => setPreviewUrl('')} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4"><button aria-label="关闭预览" onClick={() => setPreviewUrl('')} className="absolute right-4 top-[max(env(safe-area-inset-top),16px)] rounded-full bg-white/15 px-4 py-2 text-sm text-white">关闭</button><AuthenticatedImage src={previewUrl} alt="图片放大预览" className="max-h-[85dvh] max-w-full object-contain" /></div>}
  </>;
}

function Metric({ label, value, accent = false }: { label: string; value: React.ReactNode; accent?: boolean }) { return <div className="rounded-xl bg-slate-50 px-3 py-2.5"><p className="text-[10px] text-slate-400">{label}</p><p className={`mt-1 truncate text-xs font-bold ${accent ? 'role-primary-text' : 'text-slate-700'}`}>{value}</p></div>; }
