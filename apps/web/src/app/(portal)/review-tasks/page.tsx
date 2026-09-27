'use client';

import React, { useState, useEffect } from "react";
import * as Select from '@radix-ui/react-select';
import Link from "next/link";
import { 
  Search, 
  Plus, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Layers, 
  ChevronRight, 
  Filter, 
  Sparkles, 
  ArrowUpRight,
  Coins,
  ShieldCheck,
  RotateCcw,
  Send,
  Undo2,
  AlertTriangle,
  Eye,
  ExternalLink,
  FileArchive,
  Image as ImageIcon,
  ChevronDown,
  Download
} from "lucide-react";
import { GROUP_MAP, TASK_STATUS_MAP, PLATFORM_MAP, type ReviewTask, type PlatformType } from "@design-review/shared";
import { Button } from "@/components/ui/button";
import { AuthenticatedImage } from '@/components/authenticated-image';
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { fetchWithAuth } from "@/lib/auth";
import { useCurrentUser } from "@/hooks/use-current-user";
import ReviewWorkspaceContent from "@/components/review-workspace";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { ReferenceLinkItemsDetail } from '@/components/reference-link-items-detail';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const ORDER_STATUS_MAP: Record<string, { label: string; className: string }> = {
  pending_deposit: { label: '待支付定金', className: 'bg-orange-50 text-orange-700 border-orange-100' },
  pending_service_review: { label: '待客服审核', className: 'bg-amber-50 text-amber-700 border-amber-100' },
  published: { label: '接单中', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  claimed: { label: '已接单', className: 'bg-sky-50 text-sky-700 border-sky-100' },
  in_progress: { label: '制作中', className: 'bg-violet-50 text-violet-700 border-violet-100' },
  submitted: { label: '待作品审核', className: 'bg-indigo-50 text-indigo-700 border-indigo-100' },
  completed: { label: '已完成', className: 'bg-slate-100 text-slate-600 border-slate-200' },
  rejected: { label: '已驳回', className: 'bg-rose-50 text-rose-700 border-rose-100' },
  cancelled: { label: '已关闭', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export default function ReviewTasksPage() {
  const user = useCurrentUser();
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [operatingTaskId, setOperatingTaskId] = useState<string | null>(null);

  // 任务详情弹窗状态
  const [detailTask, setDetailTask] = useState<ReviewTask | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [loadingOrderRequirements, setLoadingOrderRequirements] = useState(false);
  const [workspaceTaskId, setWorkspaceTaskId] = useState<string | null>(null);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const res = await fetchWithAuth('/review-tasks', { cache: "no-store" });
      const json = await res.json();
      if (json.success) {
        setTasks(json.data?.list || []);
      }
    } catch (err) {
      console.error("加载任务列表失败", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  // 打开任务详情
  const handleOpenDetail = async (task: ReviewTask) => {
    setDetailTask(task);
    setShowDetailModal(true);
    if (!task.orderId) return;
    setLoadingOrderRequirements(true);
    try {
      const response = await fetchWithAuth(`/review-tasks/${task.id}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '加载图片需求失败');
      setDetailTask((current) => current?.id === task.id ? { ...current, orderImageRequirementGroups: result.data.orderImageRequirementGroups || [] } : current);
    } catch (error: any) {
      toast.error(error.message || '加载图片需求失败');
    } finally {
      setLoadingOrderRequirements(false);
    }
  };

  const handleOpenWorkspace = (taskId: string) => {
    setShowDetailModal(false);
    setWorkspaceTaskId(taskId);
  };

  const handleCloseWorkspace = () => {
    setWorkspaceTaskId(null);
    fetchTasks();
  };

  // 1. 提交审核操作 (草稿或被驳回修改后重新提交)
  const handleSubmitTask = async (taskId: string) => {
    setOperatingTaskId(taskId);
    try {
      const res = await fetchWithAuth(`/review-tasks/${taskId}/submit`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "提交失败");
      }
      toast.success("设计稿已成功提交会审！已进入初审质检流水线");
      fetchTasks();
      if (showDetailModal) setShowDetailModal(false);
    } catch (err: any) {
      toast.error(err.message || "提交审核发生错误");
    } finally {
      setOperatingTaskId(null);
    }
  };

  // 2. 退回接单操作 (放弃接单并释放回大厅)
  const handleReturnTask = async (taskId: string) => {
    setOperatingTaskId(taskId);
    try {
      const res = await fetchWithAuth(`/review-tasks/${taskId}/return`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || "退回接单失败");
      }
      toast.info("已成功退回接单，该需求已重新开放至【接单大厅】");
      fetchTasks();
      if (showDetailModal) setShowDetailModal(false);
    } catch (err: any) {
      toast.error(err.message || "退单失败");
    } finally {
      setOperatingTaskId(null);
    }
  };

  const handleAcceptTask = async (taskId: string) => {
    setOperatingTaskId(taskId);
    try {
      const task = tasks.find((item) => item.id === taskId) || detailTask;
      if (!task?.orderId) throw new Error('该任务未关联设计订单');
      const response = await fetchWithAuth(`/payments/orders/${task.orderId}/checkout`, { method: 'POST', body: JSON.stringify({ stage: 'balance' }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '生成尾款支付订单失败');
      const form = document.createElement('form');
      form.method = result.data.method;
      form.action = result.data.action;
      Object.entries(result.data.fields as Record<string, string | number>).forEach(([name, value]) => {
        const input = document.createElement('input');
        input.type = 'hidden'; input.name = name; input.value = String(value); form.appendChild(input);
      });
      document.body.appendChild(form);
      form.submit();
    } catch (error: any) {
      toast.error(error.message || '发起尾款支付失败');
    } finally {
      setOperatingTaskId(null);
    }
  };

  const downloadDelivery = async (url: string, filename: string) => {
    try {
      const response = await fetchWithAuth(url);
      if (!response.ok) throw new Error('下载失败');
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error: any) {
      toast.error(error.message || '下载失败');
    }
  };

  const filteredTasks = tasks.filter((task) => {
    const matchStatus = statusFilter === "all" || task.status === statusFilter;
    const matchKeyword = 
      !searchKeyword ||
      task.productName.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      task.taskNo.toLowerCase().includes(searchKeyword.toLowerCase()) ||
      task.designerName.toLowerCase().includes(searchKeyword.toLowerCase());
    return matchStatus && matchKeyword;
  });

  const pendingCount = tasks.filter(t => t.status === 'draft').length;
  const inReviewCount = tasks.filter(t => t.status === 'pending' || t.status === 'in_review').length;
  const rejectedCount = tasks.filter(t => t.status === 'needs_revision').length;
  const approvedCount = tasks.filter(t => t.status === 'approved').length;
  const hasListFilter = Boolean(searchKeyword || statusFilter !== 'all');
  const emptyTaskMessage = hasListFilter
    ? '暂无符合筛选条件的审核任务'
    : user?.role === 'designer'
      ? '当前没有待处理的设计任务，去接单广场承接新订单吧'
      : user?.role === 'advertiser'
        ? '当前审核节点暂无待处理任务，请稍后刷新'
        : user?.role === 'admin'
          ? '当前暂无审核任务'
          : '当前暂无待处理审核任务';
  const emptyTaskAction = !hasListFilter && user?.role === 'designer'
    ? { href: '/order-market', label: '去抢单' }
    : !hasListFilter && user?.role === 'advertiser'
      ? { href: '/advertiser/orders?create=1', label: '去发布设计订单' }
      : null;

  return (
    <div className="space-y-6">
      {/* 顶部标题栏与提审按钮 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6 rounded-3xl bg-white/70 border border-white/80 shadow-sm backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Layers className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">
              我的任务与设计提审中心
            </h1>
            <Badge variant="outline" className="bg-blue-50 text-blue-600 border-blue-200 text-[11px]">
              支持在线提审与退单释放
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchTasks}
            className="rounded-2xl text-xs h-10 px-3.5 border-slate-200 gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            刷新状态
          </Button>
          {user?.role !== 'advertiser' && (
            <Link href="/order-market">
              <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl text-xs font-semibold px-5 h-10 gap-1.5 shadow-md shadow-blue-500/20">
                <Plus className="w-4 h-4" />
                <span>去接单广场抢新单</span>
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* 指标统计面板 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-3xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-sm p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>制作中 / 待提审</span>
            <div className="w-7 h-7 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-800 font-mono tracking-tight">
              {pendingCount} <span className="text-xs font-normal text-slate-400">单</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">制作完成后点击“提交审核”</div>
          </div>
        </Card>

        <Card className="rounded-3xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-sm p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>会审质检中</span>
            <div className="w-7 h-7 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
              <Layers className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-blue-600 font-mono tracking-tight">
              {inReviewCount} <span className="text-xs font-normal text-slate-400">单</span>
            </div>
            <div className="text-[10px] text-blue-600 font-medium mt-1">审核主管多级质检中</div>
          </div>
        </Card>

        <Card className="rounded-3xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-sm p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>待修改 (驳回返修)</span>
            <div className="w-7 h-7 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
              <XCircle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-rose-600 font-mono tracking-tight">
              {rejectedCount} <span className="text-xs font-normal text-slate-400">单</span>
            </div>
            <div className="text-[10px] text-rose-600 font-medium mt-1">需依据坐标打标修改后重提</div>
          </div>
        </Card>

        <Card className="rounded-3xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-sm p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>已终审通过归档</span>
            <div className="w-7 h-7 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-emerald-600 font-mono tracking-tight">
              {approvedCount} <span className="text-xs font-normal text-slate-400">单</span>
            </div>
            <div className="text-[10px] text-emerald-600 font-medium mt-1">设计款已自动分账入账</div>
          </div>
        </Card>
      </div>

      {/* 任务列表卡片 */}
      <Card className="rounded-3xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="搜索任务单号、商品名称或设计师..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="pl-9 h-9 text-xs rounded-xl bg-white border-slate-200"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Select.Root value={statusFilter} onValueChange={setStatusFilter}><Select.Trigger className="flex h-9 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/15 sm:w-48"><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className="z-50 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-md"><Select.Viewport><Select.Item value="all" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>全部任务状态</Select.ItemText></Select.Item><Select.Item value="draft" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>待交付 (制作中)</Select.ItemText></Select.Item><Select.Item value="pending" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>待初审质检</Select.ItemText></Select.Item><Select.Item value="in_review" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>审核会审中</Select.ItemText></Select.Item><Select.Item value="needs_revision" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>待修改 (驳回)</Select.ItemText></Select.Item><Select.Item value="approved" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>终审已通过</Select.ItemText></Select.Item><Select.Item value="returned" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>已退单释放</Select.ItemText></Select.Item></Select.Viewport></Select.Content></Select.Portal></Select.Root>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-xs text-slate-400">正在同步审核任务中心数据...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="space-y-2 py-16 text-center text-xs text-slate-400">
            <p>{emptyTaskMessage}</p>
            {emptyTaskAction && <Link href={emptyTaskAction.href} className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700 hover:underline">{emptyTaskAction.label}<ArrowUpRight className="h-3.5 w-3.5" /></Link>}
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-100 overflow-hidden bg-white/90">
            <Table>
              <TableHeader className="bg-slate-50/70">
                <TableRow className="text-[11px] text-slate-500 border-slate-100">
                  <TableHead className="w-36 font-semibold">任务单号</TableHead>
                  <TableHead className="font-semibold">设计商品项目</TableHead>
                  <TableHead className="font-semibold">平台 / 类目</TableHead>
                  <TableHead className="font-semibold">切图进度</TableHead>
                  <TableHead className="font-semibold">订单价格</TableHead>
                  <TableHead className="font-semibold">当前状态</TableHead>
                  <TableHead className="font-semibold">订单状态</TableHead>
                  <TableHead className="font-semibold">更新时间</TableHead>
                  <TableHead className="text-right font-semibold">操作与流转</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {filteredTasks.map((task) => {
                  const platformMeta = PLATFORM_MAP[task.platform] || PLATFORM_MAP.universal;
                  const statusMeta = TASK_STATUS_MAP[task.status] || { label: '待处理', color: '#94a3b8' };

                  return (
                    <TableRow key={task.id} className="hover:bg-slate-50/50 transition border-slate-100">
                      <TableCell className="font-mono text-xs font-bold text-slate-800">
                        {task.taskNo}
                      </TableCell>

                      <TableCell className="max-w-xs">
                        <div className="text-xs font-bold text-slate-800 truncate">
                          {task.productName}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {task.sku || '未指定SKU'} · 接单设计师: {task.designerName}
                        </div>
                      </TableCell>

                      <TableCell>
                        <Badge variant="outline" className="text-[10px] bg-white border-slate-200">
                          {platformMeta.label}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-xs">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="text-emerald-600 font-bold">{task.approvedCount} 通过</span>
                          <span className="text-slate-300">/</span>
                          <span className="text-slate-600 font-bold">{task.totalImages} 张</span>
                        </div>
                      </TableCell>

                      <TableCell className="text-xs font-mono font-bold text-emerald-600">
                        ¥{task.designerPayout || 680}
                      </TableCell>

                      <TableCell>
                        <span
                          className="text-[10px] px-2.5 py-1 rounded-full font-bold inline-block"
                          style={{ color: statusMeta.color, backgroundColor: `${statusMeta.color}15` }}
                        >
                          {statusMeta.label}
                        </span>
                      </TableCell>

                      <TableCell>
                        {(() => {
                          const orderStatus = task.orderStatus ? ORDER_STATUS_MAP[task.orderStatus] : undefined;
                          return <Badge variant="outline" className={`text-[10px] ${orderStatus?.className || 'border-slate-200 bg-slate-50 text-slate-500'}`}>{orderStatus?.label || task.orderStatus || '暂无关联订单'}</Badge>;
                        })()}
                      </TableCell>

                      <TableCell className="text-[11px] text-slate-400">
                        {task.createdAt ? new Date(task.createdAt).toLocaleDateString() : '刚刚'}
                      </TableCell>

                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* 统一查看详情按钮 */}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenDetail(task)}
                            className="h-7 text-[11px] rounded-xl px-2.5 text-slate-600 hover:text-blue-600 hover:bg-slate-100 gap-1 font-medium"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            查看详情
                          </Button>

                          {/* 状态 1: 待交付制作中 (可提交审核 / 可退单) */}
                          {task.status === 'draft' && (
                            <>
                              <Link href={`/review-submit?taskId=${encodeURIComponent(task.id)}`}>
                                <Button size="sm" variant="outline" className="h-7 text-[11px] rounded-xl px-2.5 border-slate-300 text-slate-700">
                                  上传素材
                                </Button>
                              </Link>

                              <ConfirmAction title="确认提交审核？" description="提交后任务将进入审核流程，提交的素材会通知审核人员处理。" confirmText="确认提交" tone="warning" onConfirm={() => handleSubmitTask(task.id)} disabled={operatingTaskId === task.id}><Button size="sm" disabled={operatingTaskId === task.id} className="h-7 text-[11px] rounded-xl px-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1 shadow-sm"><Send className="w-3 h-3" />提交审核</Button></ConfirmAction>

                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="sm" variant="ghost" className="h-7 text-[11px] rounded-xl text-rose-500 hover:text-rose-600 hover:bg-rose-50 gap-1">
                                    <Undo2 className="w-3 h-3" />
                                    退单
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent className="bg-white rounded-3xl p-6">
                                  <AlertDialogHeader>
                                    <AlertDialogTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                                      <AlertTriangle className="w-5 h-5 text-amber-500" />
                                      确认退回接单？
                                    </AlertDialogTitle>
                                    <AlertDialogDescription className="text-xs text-slate-500">
                                      退单后，该设计需求将重新释放回【接单大厅】供其他设计师承接，当前任务将被关闭。
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter className="mt-4 gap-2">
                                    <AlertDialogCancel className="rounded-xl text-xs">取消</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleReturnTask(task.id)}
                                      className="rounded-xl text-xs bg-rose-600 hover:bg-rose-700 text-white"
                                    >
                                      确认退回接单
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </>
                          )}

                          {/* 状态 2: 待修改驳回 (可查看批注 / 重新提交审核) */}
                          {task.status === 'needs_revision' && (
                            <>
                              <Button size="sm" variant="outline" onClick={() => handleOpenWorkspace(task.id)} className="h-7 text-[11px] rounded-xl px-2.5 border-rose-200 text-rose-600 bg-rose-50/50">
                                查看批注
                              </Button>
                              <ConfirmAction title="确认重新提交审核？" description="重新提交后会再次进入审核流程，审核人员将按最新素材进行处理。" confirmText="确认重新提审" tone="warning" onConfirm={() => handleSubmitTask(task.id)} disabled={operatingTaskId === task.id}><Button size="sm" disabled={operatingTaskId === task.id} className="h-7 text-[11px] rounded-xl px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1 shadow-sm"><Send className="w-3 h-3" />重新提审</Button></ConfirmAction>
                            </>
                          )}

                          {/* 状态 3: 待审核 / 审核中 (进入审核工作台) */}
                          {(task.status === 'pending' || task.status === 'in_review') && (
                            <Button size="sm" variant="ghost" onClick={() => handleOpenWorkspace(task.id)} className="h-7 text-[11px] rounded-xl text-blue-600 hover:text-blue-700 gap-1 font-semibold">
                              审核进度
                              <ChevronRight className="w-3 h-3" />
                            </Button>
                          )}

                          {/* 状态 4: 已通过 (查看终审结果) */}
                          {task.status === 'approved' && (
                            <Button size="sm" variant="ghost" onClick={() => handleOpenWorkspace(task.id)} className="h-7 text-[11px] rounded-xl text-emerald-600 hover:text-emerald-700 gap-1 font-semibold">
                              终审成果
                              <ChevronRight className="w-3 h-3" />
                            </Button>
                          )}

                          {/* 状态 5: 已退单 */}
                          {task.status === 'returned' && (
                            <span className="text-[11px] text-slate-400">已释放</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* 任务详情查看弹窗 (Modal) */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-2xl bg-white rounded-3xl p-6 max-h-[85vh] overflow-y-auto">
          {detailTask && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline" className="font-mono text-xs text-blue-600 border-blue-200 bg-blue-50">
                    {detailTask.taskNo}
                  </Badge>
                  <span
                    className="text-[10px] px-2.5 py-0.5 rounded-full font-bold"
                    style={{
                      color: TASK_STATUS_MAP[detailTask.status]?.color || '#64748b',
                      backgroundColor: `${TASK_STATUS_MAP[detailTask.status]?.color || '#64748b'}15`
                    }}
                  >
                    {TASK_STATUS_MAP[detailTask.status]?.label}
                  </span>
                </div>
                <DialogTitle className="text-base font-bold text-slate-800 mt-2">
                  {detailTask.productName}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  款号/SKU: {detailTask.sku || '未指定'} · 目标平台: {PLATFORM_MAP[detailTask.platform]?.label || '全网通用'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 my-3 text-xs">
                {/* 核心指标卡片 */}
                <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <div>
                    <div className="text-[10px] text-slate-400">订单价格</div>
                    <div className="font-extrabold text-base text-emerald-600 font-mono mt-0.5">
                      ¥{detailTask.designerPayout || 680}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">切图完成进度</div>
                    <div className="font-extrabold text-base text-slate-800 font-mono mt-0.5">
                      {detailTask.approvedCount} / {detailTask.totalImages} 张
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">返修驳回次数</div>
                    <div className="font-extrabold text-base text-amber-600 font-mono mt-0.5">
                      {detailTask.rejectCount || 0} / 3 次
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="font-bold text-slate-800">订单图片设计需求</div>
                  {loadingOrderRequirements && !detailTask.orderImageRequirementGroups ? <div className="rounded-xl bg-slate-50 p-4 text-center text-xs text-slate-400">正在加载图片需求…</div> : detailTask.orderImageRequirementGroups?.length ? <Tabs key={detailTask.id} defaultValue="requirement-group-0" className="w-full min-w-0">
                    <TabsList className="flex h-10 w-full justify-start gap-1 overflow-x-auto rounded-xl bg-slate-50 p-1">
                      {detailTask.orderImageRequirementGroups.map((group, groupIndex) => <TabsTrigger key={group.id || groupIndex} value={`requirement-group-${groupIndex}`} className="h-8 max-w-56 shrink-0 rounded-lg px-3 text-xs text-slate-500 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm">{group.name || `第 ${groupIndex + 1} 组`}<span className="ml-1 text-[10px] text-slate-400">{group.imageItems?.length || group.quantity || 0} 张</span></TabsTrigger>)}
                    </TabsList>
                    {detailTask.orderImageRequirementGroups.map((group, groupIndex) => {
                      const imageItems = group.imageItems?.length ? group.imageItems : (group.materialImages?.length ? group.materialImages : ['']).map((materialImage, imageIndex) => ({ id: `${group.id}-${imageIndex}`, materialImage, description: imageIndex === 0 ? group.description : '', referenceImages: imageIndex === 0 ? group.referenceImages : [], referenceLinks: imageIndex === 0 ? group.referenceLinks : [], referenceLinkItems: undefined, referenceLinkDescription: undefined }));
                      return <TabsContent key={group.id || groupIndex} value={`requirement-group-${groupIndex}`} className="mt-3"><div className="rounded-2xl border border-slate-200 bg-white p-3"><div className="mb-3 flex items-center justify-between gap-3"><h4 className="font-semibold text-slate-800">{groupIndex + 1}. {group.name}</h4><span className="shrink-0 text-[11px] text-slate-400">{imageItems.length} 张 · {group.dimensions || group.groupType}</span></div><div className="space-y-3">{imageItems.map((item, imageIndex) => <div key={item.id || imageIndex} className="rounded-xl bg-slate-50/70 p-3"><div className="mb-2 flex items-center justify-between"><span className="font-semibold text-slate-700">第 {imageIndex + 1} 张</span><span className="text-[10px] text-slate-400">{group.dimensions || '标准尺寸'}</span></div><div className="grid gap-3 sm:grid-cols-2">{item.materialImage && <div><p className="mb-1 font-medium text-slate-500">素材原图</p><AuthenticatedImage src={item.materialImage} alt={`${group.name}素材原图${imageIndex + 1}`} className="aspect-square w-full rounded-lg border border-slate-200 bg-white object-cover" /></div>}{item.description && <div className="sm:col-span-2"><p className="mb-1 font-medium text-slate-500">设计要点</p><p className="whitespace-pre-wrap break-words rounded-lg bg-white p-2 leading-5">{item.description}</p></div>}<ReferenceLinkItemsDetail item={item} /></div></div>)}</div></div></TabsContent>;
                    })}
                  </Tabs> : <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-slate-400">暂无订单图片设计需求</div>}
                </div>

                {/* 关联图片分组与切图列表 */}
                <div className="space-y-2">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-blue-600" />
                    待审切图与规格明细 ({detailTask.groups?.length || 0} 个分组)
                  </div>
                  
                  {detailTask.groups && detailTask.groups.length > 0 ? (
                    <div className="space-y-2">
                      {detailTask.groups.map((grp, gIdx) => (
                        <div key={grp.id || gIdx} className="p-3 rounded-2xl border border-slate-200 bg-white space-y-2">
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                            <span>分组 #{gIdx + 1} ({GROUP_MAP[grp.groupType]?.label || grp.groupType})</span>
                            <span className="text-[10px] text-slate-400 font-mono">{grp.images?.length || 0} / {grp.requiredCount} 张</span>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {grp.images?.map((img, imgIdx) => (
                              <div key={img.id || imgIdx} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 group">
                                <AuthenticatedImage src={img.imageUrl} alt="切图" className="w-full h-full object-cover" />
                                <span className={`absolute bottom-0 inset-x-0 text-center text-[9px] text-white py-0.2 ${
                                  img.status === 'approved' ? 'bg-emerald-600/90' : (img.status === 'rejected' ? 'bg-rose-600/90' : 'bg-black/60')
                                }`}>
                                  {img.status === 'approved' ? '已通过' : (img.status === 'rejected' ? '已驳回' : '待审')}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center text-slate-400">
                      尚未上传设计切图，请点击“上传素材”进行交付
                    </div>
                  )}
                </div>

                {/* 源文件交付情况 */}
                <div className="p-3 bg-purple-50/50 rounded-2xl border border-purple-100 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <FileArchive className="w-4 h-4 text-purple-600" />
                    <div>
                    <div className="font-bold text-slate-800">分层源文件 (PSD/AI/ZIP){detailTask.requiresPsd && <span className="ml-1 text-rose-500">· 订单要求必交</span>}</div>
                      <div className="text-[10px] text-slate-400">{detailTask.sourceFileName || '未上传源文件包'}</div>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-white text-purple-700 border-purple-200 text-[10px]">
                    {detailTask.sourceFileName ? '已附带' : '待上传'}
                  </Badge>
                </div>
                {user?.role === 'advertiser' && detailTask.acceptedAt && (
                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3">
                    <div className="mb-2 text-xs font-bold text-emerald-800">验收交付文件</div>
                    <div className="flex flex-wrap gap-2">
                      {detailTask.sourceFileUrl && <Button type="button" variant="outline" onClick={() => downloadDelivery(detailTask.sourceFileUrl!, detailTask.sourceFileName || '设计源文件')} className="h-8 rounded-xl border-emerald-200 bg-white text-xs text-emerald-700"><Download className="mr-1 h-3.5 w-3.5" />下载源文件</Button>}
                      {detailTask.groups?.flatMap((group) => group.images.filter((image) => image.originalAssetId).map((image) => <Button type="button" key={image.id} variant="outline" onClick={() => downloadDelivery(`/upload/assets/${image.originalAssetId}`, `设计原图-${image.imageIndex}`)} className="h-8 rounded-xl border-emerald-200 bg-white text-xs text-emerald-700"><Download className="mr-1 h-3.5 w-3.5" />下载原图 {image.imageIndex}</Button>))}
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 mt-2">
                <Button variant="outline" onClick={() => setShowDetailModal(false)} className="rounded-xl text-xs">
                  关闭
                </Button>
                {detailTask.status === 'draft' && (
                  <ConfirmAction title="确认提交审核？" description="提交后任务将进入审核流程，提交的素材会通知审核人员处理。" confirmText="确认提交" tone="warning" onConfirm={() => handleSubmitTask(detailTask.id)} disabled={operatingTaskId === detailTask.id}><Button disabled={operatingTaskId === detailTask.id} className="rounded-xl text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1"><Send className="w-3.5 h-3.5" />立即提交审核</Button></ConfirmAction>
                )}
                {(detailTask.status === 'pending' || detailTask.status === 'in_review' || detailTask.status === 'needs_revision' || detailTask.status === 'approved') && (
                  <Button onClick={() => handleOpenWorkspace(detailTask.id)} className="rounded-xl text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1">
                    进入审核工作台
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                )}
                {user?.role === 'advertiser' && detailTask.status === 'approved' && !detailTask.acceptedAt && (
                  <ConfirmAction title="确认支付尾款并验收？" description="确认后将发起尾款支付，验收完成后会开放无水印原图和源文件下载。" confirmText="确认支付并验收" tone="warning" onConfirm={() => handleAcceptTask(detailTask.id)} disabled={operatingTaskId === detailTask.id}><Button disabled={operatingTaskId === detailTask.id} className="rounded-xl bg-emerald-600 text-xs text-white hover:bg-emerald-700"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />支付尾款并确认验收</Button></ConfirmAction>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(workspaceTaskId)}
        onOpenChange={(open) => {
          if (!open) handleCloseWorkspace();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="fixed inset-0 left-0 top-0 z-50 h-screen w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 bg-slate-950 p-0 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right duration-300"
        >
          <DialogTitle className="sr-only">审核作业工作台</DialogTitle>
          <DialogDescription className="sr-only">全屏审核图片、添加坐标批注并更新审核状态</DialogDescription>
          {workspaceTaskId && (
            <ReviewWorkspaceContent taskId={workspaceTaskId} onClose={handleCloseWorkspace} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
