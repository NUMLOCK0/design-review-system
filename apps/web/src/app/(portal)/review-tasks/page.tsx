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
  ArrowUpRight
} from "lucide-react";
import { TASK_STATUS_MAP, PLATFORM_MAP, type ReviewTask } from "@design-review/shared";
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
import { API_BASE } from "@/lib/utils";

async function getTasks(): Promise<ReviewTask[]> {
  try {
    const res = await fetch(`${API_BASE}/review-tasks`, { cache: 'no-store' });
    if (!res.ok) throw new Error('API request failed');
    const json = await res.json();
    return json.data?.list || [];
  } catch (err) {
    return [
      {
        id: 'task_001',
        taskNo: 'REV-20260905-001',
        productName: '2026秋季新款复古工装夹克外衣',
        sku: 'JK-2026-09-A',
        platform: 'tmall',
        designerId: 'u_des_1',
        designerName: '李设计师',
        status: 'in_review',
        currentLevel: 1,
        totalImages: 3,
        approvedCount: 1,
        rejectedCount: 1,
        rejectCount: 1,
        version: 1,
        urgency: 'high',
        submittedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }
    ];
  }
}

export default async function ReviewTasksPage() {
  const tasks = await getTasks();

  return (
    <div className="p-8 max-w-7xl mx-auto w-full space-y-6">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-slate-800 tracking-tight">设计审核管理中心</h1>
            <Badge variant="secondary" className="bg-blue-100 text-blue-700 font-medium">SSR 实时驱动</Badge>
          </div>
          <p className="text-xs text-slate-500 mt-1">天猫 / 淘宝 / 拼多多 / 抖音电商视觉设计图多级合规协同会审</p>
        </div>

        <Link href="/review-submit">
          <Button className="btn-crystal-blue gap-2 h-10 px-5 shadow-lg">
            <Plus className="w-4 h-4" />
            <span>提交新设计稿</span>
          </Button>
        </Link>
      </div>

      {/* 指标统计面板 (使用 Card UI) */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="glass-card border-white/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500">待审核任务</CardTitle>
            <Clock className="w-4 h-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-slate-800">12 <span className="text-xs font-normal text-amber-600">单</span></div>
            <p className="text-[11px] text-slate-400 mt-1">需在 24 小时内完成初审</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500">会审进行中</CardTitle>
            <Layers className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-blue-600">8 <span className="text-xs font-normal text-blue-500">单</span></div>
            <p className="text-[11px] text-slate-400 mt-1">在线打标与意见下发中</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500">待修改(驳回)</CardTitle>
            <XCircle className="w-4 h-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-rose-500">3 <span className="text-xs font-normal text-rose-400">单</span></div>
            <p className="text-[11px] text-slate-400 mt-1">已下发修改工单给设计师</p>
          </CardContent>
        </Card>

        <Card className="glass-card border-white/80 shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-slate-500">已终审通过归档</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-emerald-600">146 <span className="text-xs font-normal text-emerald-500">单</span></div>
            <p className="text-[11px] text-slate-400 mt-1">通过率 92.4%</p>
          </CardContent>
        </Card>
      </div>

      {/* 任务列表 Table UI */}
      <div className="glass-card p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="搜索商品名称、SKU 或任务单号..."
              className="pl-9 h-9 rounded-full bg-white/70 border-white/90 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-full bg-white/70 text-xs h-9">
              <Filter className="w-3.5 h-3.5 mr-1" /> 全部平台
            </Button>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden border border-white/80 bg-white/40">
          <Table>
            <TableHeader className="bg-white/60">
              <TableRow>
                <TableHead className="text-xs font-bold text-slate-600">任务单号 / 商品名称</TableHead>
                <TableHead className="text-xs font-bold text-slate-600">平台</TableHead>
                <TableHead className="text-xs font-bold text-slate-600">提审设计师</TableHead>
                <TableHead className="text-xs font-bold text-slate-600">单品进度</TableHead>
                <TableHead className="text-xs font-bold text-slate-600">审核状态</TableHead>
                <TableHead className="text-xs font-bold text-slate-600">提交时间</TableHead>
                <TableHead className="text-xs font-bold text-slate-600 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => {
                const statusMeta = TASK_STATUS_MAP[task.status] || { label: task.status, color: '#64748b' };
                const platformMeta = PLATFORM_MAP[task.platform] || { label: task.platform, color: '#2D8C87' };

                return (
                  <TableRow key={task.id} className="hover:bg-white/70 transition-colors">
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800 text-xs">{task.productName}</span>
                        <span className="text-[11px] text-slate-400 font-mono mt-0.5">{task.taskNo} {task.sku ? `· ${task.sku}` : ''}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[11px] bg-white/80 font-normal">
                        {platformMeta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs font-medium text-slate-700">
                      {task.designerName}
                    </TableCell>
                    <TableCell className="text-xs font-semibold text-slate-700">
                      {task.approvedCount}过 / {task.rejectedCount}驳 / {task.totalImages}张
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant="secondary"
                        className="text-[11px] font-semibold"
                        style={{ color: statusMeta.color, backgroundColor: `${statusMeta.color}15` }}
                      >
                        {statusMeta.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-slate-400">
                      {task.submittedAt ? new Date(task.submittedAt).toLocaleDateString() : '草稿'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link href={`/review-workspace?taskId=${task.id}`}>
                        <Button size="sm" variant="ghost" className="text-xs text-blue-600 hover:text-blue-700 h-8 gap-1">
                          进入工作台
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
