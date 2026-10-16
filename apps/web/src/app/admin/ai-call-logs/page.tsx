'use client';

import { useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { fetchWithAuth } from '@/lib/auth';

type AiCallLog = {
  id: string; source: string; operation: string; model: string; configId: string | null; profileId: string | null;
  referenceId: string | null; providerHost: string; status: 'success' | 'error'; httpStatus: number | null;
  durationMs: number; errorCode: string | null; errorMessage: string | null; createdAt: string;
};

const sources = [
  { value: '', label: '全部来源' }, { value: 'intake', label: '会话总结' },
  { value: 'ai_style', label: 'AI 配色' }, { value: 'image_studio', label: '生图工作台' },
];
const operationLabels: Record<string, string> = {
  conversation_summary: '会话总结', style_directions: '八种配色', image_edit: '图片编辑',
  image_generation: '图片生成', native_image_submit: '原生生图提交', native_image_poll: '原生生图查询', native_image_cancel: '原生生图取消',
  plan_agent_text: '方案文本 Agent', plan_agent_vision: '方案视觉 Agent',
};

export default function AdminAiCallLogsPage() {
  const [logs, setLogs] = useState<AiCallLog[]>([]);
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const pageSize = 20;

  const load = async (nextPage: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(nextPage), pageSize: String(pageSize) });
      if (status) params.set('status', status);
      if (source) params.set('source', source);
      const response = await fetchWithAuth(`/admin/ai-call-logs?${params}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '加载 AI 调用日志失败');
      setLogs(result.data || []);
      setTotal(Number(result.total || 0));
    } catch (error) { toast.error(error instanceof Error ? error.message : '加载 AI 调用日志失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { setPage(1); void load(1); }, [status, source]);
  const changePage = (nextPage: number) => { setPage(nextPage); void load(nextPage); };

  return <div className="mx-auto max-w-7xl space-y-5 p-3 sm:p-6 lg:p-8">
    <div className="flex flex-col justify-between gap-4 rounded-3xl border border-white/80 bg-white/75 p-6 shadow-sm md:flex-row md:items-center">
      <div className="flex items-center gap-3"><div className="role-primary-gradient flex h-10 w-10 items-center justify-center rounded-2xl text-white"><Activity className="h-5 w-5" /></div><div><h1 className="text-xl font-bold text-slate-800">AI 调用日志</h1><p className="mt-1 text-xs text-slate-500">记录模型调用结果、耗时与上游 API 报错；不主动保存请求正文、成功响应或 API Key。共 {total} 条</p></div></div>
      <Button type="button" variant="outline" disabled={loading} onClick={() => void load(page)} className="h-9 rounded-xl text-xs"><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />刷新</Button>
    </div>
    <Card className="rounded-3xl border-white/80 bg-white/75 shadow-sm"><CardHeader className="flex flex-row flex-wrap gap-2 pb-3">
      <select aria-label="调用结果" value={status} onChange={(event) => setStatus(event.target.value)} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs"><option value="">全部结果</option><option value="error">失败</option><option value="success">成功</option></select>
      <select aria-label="调用来源" value={source} onChange={(event) => setSource(event.target.value)} className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs">{sources.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
    </CardHeader><CardContent className="p-0">
      {loading ? <div className="p-12 text-center text-xs text-slate-400">正在加载调用日志…</div> : logs.length === 0 ? <div className="p-12 text-center text-xs text-slate-400">暂无符合条件的 AI 调用记录</div> : <><div className="divide-y divide-slate-100">{logs.map(log => <article key={log.id} className="px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={log.status === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>{log.status === 'error' ? '失败' : '成功'}</Badge><span className="text-xs font-semibold text-slate-800">{operationLabels[log.operation] || log.operation}</span><span className="text-[11px] text-slate-400">{sources.find(item => item.value === log.source)?.label || log.source}</span><span className="ml-auto text-[11px] text-slate-400">{new Date(log.createdAt).toLocaleString('zh-CN')}</span></div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500"><span>模型：{log.model || '未指定'}</span><span>服务：{log.providerHost || '未知'}</span><span>HTTP：{log.httpStatus ?? '无响应'}</span><span>耗时：{log.durationMs} ms</span>{log.referenceId && <span>关联 ID：{log.referenceId}</span>}</div>
        {log.errorMessage && <div className="mt-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800"><span className="font-semibold">{log.errorCode || 'API_ERROR'}</span> · <span className="break-words">{log.errorMessage}</span></div>}
      </article>)}</div><AdminPagination page={page} pageSize={pageSize} total={total} onPageChange={changePage} /></>}
    </CardContent></Card>
  </div>;
}
