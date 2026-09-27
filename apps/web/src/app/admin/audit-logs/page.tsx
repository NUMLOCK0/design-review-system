'use client';

import { useEffect, useState } from 'react';
import { FileClock, RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { fetchWithAuth } from '@/lib/auth';
import { toast } from 'sonner';

type AuditLog = {
  id: string;
  operatorId: string;
  operatorName: string;
  module: string;
  action: string;
  targetType?: string;
  targetId?: string;
  summary: string;
  detail?: Record<string, unknown>;
  ipAddress?: string;
  createdAt: string;
};

const moduleLabels: Record<string, string> = {
  auth: '登录安全',
  system_config: '系统配置',
  users: '用户管理',
  order_audit: '订单审核',
  review_rules: '审核规则',
  designer_moderation: '设计师审核',
  withdrawals: '提现审核',
  service_tasks: '客服工作台'
};

const actionLabels: Record<string, string> = {
  login: '登录',
  update: '更新',
  create: '创建',
  role_change: '角色调整',
  status_change: '状态调整',
  approve: '通过',
  reject: '驳回',
  approve_publication: '通过发布审核',
  reject_publication: '驳回发布审核',
  portfolio_status_change: '作品状态调整',
  profile_status_change: '主页状态调整'
};

const modules = [{ value: '', label: '全部模块' }, ...Object.entries(moduleLabels).map(([value, label]) => ({ value, label }))];

export default function AdminAuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [keyword, setKeyword] = useState('');
  const [operator, setOperator] = useState('');
  const [module, setModule] = useState('');
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const loadLogs = async (nextPage = page) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ keyword, operator, module, page: String(nextPage), pageSize: String(pageSize) });
      const response = await fetchWithAuth(`/admin/audit-logs?${params}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '加载操作日志失败');
      setLogs(result.data || []);
      setTotal(result.total || 0);
    } catch (error: any) {
      toast.error(error.message || '加载操作日志失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(1); void loadLogs(1); }, [module]);
  const changePage = (nextPage: number) => { setPage(nextPage); void loadLogs(nextPage); };

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-3 sm:space-y-5 sm:p-6 lg:p-8">
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-white/80 bg-white/70 p-6 shadow-sm backdrop-blur-md md:flex-row md:items-center">
        <div className="flex items-center gap-3"><div className="role-primary-gradient flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-md"><FileClock className="h-5 w-5" /></div><div><h1 className="text-xl font-bold tracking-tight text-slate-800">后台操作日志</h1><p className="mt-1 text-xs text-slate-500">记录登录、配置、用户、订单审核、提现及设计师内容审核等关键操作，共 {total} 条</p></div></div>
        <Button variant="outline" onClick={() => void loadLogs()} disabled={loading} className="h-9 rounded-xl text-xs"><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />刷新日志</Button>
      </div>

      <Card className="rounded-3xl border border-white/80 bg-white/75 shadow-sm backdrop-blur-sm">
        <CardHeader className="space-y-4 pb-3">
          <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">{modules.map((item) => <button key={item.value || 'all'} type="button" onClick={() => setModule(item.value)} className={`rounded-lg px-3 py-1.5 text-xs transition ${module === item.value ? 'bg-white font-semibold text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{item.label}</button>)}</div>
          <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); changePage(1); }}><div className="relative min-w-0 flex-1 basis-full sm:basis-48"><Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" /><Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索操作内容、动作、对象ID" className="h-9 rounded-xl pl-9 text-xs" /></div><Input value={operator} onChange={(event) => setOperator(event.target.value)} placeholder="操作人" className="h-9 min-w-0 flex-1 rounded-xl text-xs sm:w-36 sm:flex-none" /><Button type="submit" className="h-9 shrink-0 rounded-xl px-3 text-xs">搜索</Button></form>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? <div className="p-12 text-center text-xs text-slate-400">正在加载日志…</div> : logs.length === 0 ? <div className="p-12 text-center text-xs text-slate-400">暂无符合条件的操作日志</div> : <><div className="divide-y divide-slate-100">{logs.map((log) => <div key={log.id} className="flex flex-col gap-2 px-6 py-4 md:flex-row md:items-start md:justify-between"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="border-blue-100 bg-blue-50/70 px-1.5 py-0 text-[10px] text-blue-700">{moduleLabels[log.module] || log.module}</Badge><Badge variant="outline" className="border-slate-200 px-1.5 py-0 text-[10px] text-slate-500">{actionLabels[log.action] || log.action}</Badge><span className="text-[11px] font-semibold text-slate-700">{log.operatorName}</span></div><p className="mt-2 text-xs text-slate-700">{log.summary}</p>{log.detail && <p className="mt-1 truncate text-[10px] text-slate-400">{JSON.stringify(log.detail)}</p>}</div><div className="shrink-0 text-left text-[10px] text-slate-400 md:text-right"><p>{new Date(log.createdAt).toLocaleString('zh-CN')}</p>{log.ipAddress && <p className="mt-1">IP {log.ipAddress}</p>}{log.targetId && <p className="mt-1">对象 {log.targetId}</p>}</div></div>)}</div><AdminPagination page={page} pageSize={pageSize} total={total} onPageChange={changePage} /></>}
        </CardContent>
      </Card>
    </div>
  );
}
