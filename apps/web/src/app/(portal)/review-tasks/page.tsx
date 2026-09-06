'use client';

import React, { useState, useEffect } from "react";
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
  Image as ImageIcon
} from "lucide-react";
import { TASK_STATUS_MAP, PLATFORM_MAP, type ReviewTask, type PlatformType } from "@design-review/shared";
import { Button } from "@/components/ui/button";
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
import { getCurrentUser } from "@/lib/auth";

export default function ReviewTasksPage() {
  const user = getCurrentUser();
  const [tasks, setTasks] = useState<ReviewTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [operatingTaskId, setOperatingTaskId] = useState<string | null>(null);

  // 任务详情弹窗状态
  const [detailTask, setDetailTask] = useState<ReviewTask | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const res = await fetch("http://localhost:8080/api/review-tasks", { cache: "no-store" });
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
  const handleOpenDetail = (task: ReviewTask) => {
    setDetailTask(task);
    setShowDetailModal(true);
  };

  // 1. 提交审核操作 (草稿或被驳回修改后重新提交)
  const handleSubmitTask = async (taskId: string) => {
    setOperatingTaskId(taskId);
    try {
      const res = await fetch(`http://localhost:8080/api/review-tasks/${taskId}/submit`, {
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
      const res = await fetch(`http://localhost:8080/api/review-tasks/${taskId}/return`, {
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
          <p className="text-xs text-slate-500">
            随时跟踪已接取的设计任务，支持查看任务实际详情、上传切图一键提审及主动退单流转
          </p>
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
          <Link href="/order-market">
            <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-2xl text-xs font-semibold px-5 h-10 gap-1.5 shadow-md shadow-blue-500/20">
              <Plus className="w-4 h-4" />
              <span>去接单广场抢新单</span>
            </Button>
          </Link>
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
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 text-xs rounded-xl bg-white border border-slate-200 px-3 text-slate-700 outline-none"
            >
              <option value="all">全部任务状态</option>
              <option value="draft">待交付 (制作中)</option>
              <option value="pending">待初审质检</option>
              <option value="in_review">审核会审中</option>
              <option value="needs_revision">待修改 (驳回)</option>
              <option value="approved">终审已通过</option>
              <option value="returned">已退单释放</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-xs text-slate-400">正在同步审核任务中心数据...</div>
        ) : filteredTasks.length === 0 ? (
          <div className="py-16 text-center text-xs text-slate-400">
            暂无匹配的审核任务，请先去【接单与派单大厅】抢单接取
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
                              <Link href="/review-submit">
                                <Button size="sm" variant="outline" className="h-7 text-[11px] rounded-xl px-2.5 border-slate-300 text-slate-700">
                                  上传素材
                                </Button>
                              </Link>

                              <Button
                                size="sm"
                                onClick={() => handleSubmitTask(task.id)}
                                disabled={operatingTaskId === task.id}
                                className="h-7 text-[11px] rounded-xl px-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1 shadow-sm"
                              >
                                <Send className="w-3 h-3" />
                                提交审核
                              </Button>

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
                              <Link href={`/admin/review-workspace?taskId=${task.id}`}>
                                <Button size="sm" variant="outline" className="h-7 text-[11px] rounded-xl px-2.5 border-rose-200 text-rose-600 bg-rose-50/50">
                                  查看批注
                                </Button>
                              </Link>
                              <Button
                                size="sm"
                                onClick={() => handleSubmitTask(task.id)}
                                disabled={operatingTaskId === task.id}
                                className="h-7 text-[11px] rounded-xl px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1 shadow-sm"
                              >
                                <Send className="w-3 h-3" />
                                重新提审
                              </Button>
                            </>
                          )}

                          {/* 状态 3: 待审核 / 审核中 (进入审核工作台) */}
                          {(task.status === 'pending' || task.status === 'in_review') && (
                            <Link href={`/admin/review-workspace?taskId=${task.id}`}>
                              <Button size="sm" variant="ghost" className="h-7 text-[11px] rounded-xl text-blue-600 hover:text-blue-700 gap-1 font-semibold">
                                审核进度
                                <ChevronRight className="w-3 h-3" />
                              </Button>
                            </Link>
                          )}

                          {/* 状态 4: 已通过 (查看终审结果) */}
                          {task.status === 'approved' && (
                            <Link href={`/admin/review-workspace?taskId=${task.id}`}>
                              <Button size="sm" variant="ghost" className="h-7 text-[11px] rounded-xl text-emerald-600 hover:text-emerald-700 gap-1 font-semibold">
                                终审成果
                                <ChevronRight className="w-3 h-3" />
                              </Button>
                            </Link>
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
                            <span>分组 #{gIdx + 1} ({grp.groupType === 'main_1_1' ? '1:1 方形主图' : '3:4 竖版长图'})</span>
                            <span className="text-[10px] text-slate-400 font-mono">{grp.images?.length || 0} / {grp.requiredCount} 张</span>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {grp.images?.map((img, imgIdx) => (
                              <div key={img.id || imgIdx} className="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 group">
                                <img src={img.imageUrl} alt="切图" className="w-full h-full object-cover" />
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
                      <div className="font-bold text-slate-800">分层源文件 (PSD/AI/ZIP)</div>
                      <div className="text-[10px] text-slate-400">{detailTask.sourceFileName || '未上传源文件包'}</div>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-white text-purple-700 border-purple-200 text-[10px]">
                    {detailTask.sourceFileName ? '已附带' : '待上传'}
                  </Badge>
                </div>
              </div>

              <DialogFooter className="gap-2 mt-2">
                <Button variant="outline" onClick={() => setShowDetailModal(false)} className="rounded-xl text-xs">
                  关闭
                </Button>
                {detailTask.status === 'draft' && (
                  <Button
                    onClick={() => handleSubmitTask(detailTask.id)}
                    className="rounded-xl text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold gap-1"
                  >
                    <Send className="w-3.5 h-3.5" />
                    立即提交审核
                  </Button>
                )}
                {(detailTask.status === 'in_review' || detailTask.status === 'needs_revision' || detailTask.status === 'approved') && (
                  <Link href={`/admin/review-workspace?taskId=${detailTask.id}`}>
                    <Button className="rounded-xl text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold gap-1">
                      进入审核工作台
                      <ChevronRight className="w-3.5 h-3.5" />
                    </Button>
                  </Link>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
