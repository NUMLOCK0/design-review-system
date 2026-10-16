'use client';

import { useState } from 'react';
import { Activity, AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Clock3, LoaderCircle } from 'lucide-react';

export type TaskLogEntry = {
  id: string;
  title: string;
  detail: string;
  status: 'running' | 'success' | 'error' | 'info';
  createdAt: string;
};

export type TrackedTask = {
  id: string;
  title: string;
  detail: string;
  progress?: number;
  startedAt: string;
};

export type TaskLogJob = {
  id: string;
  type: string;
  operation?: string | null;
  status: string;
  progress: number;
  phase?: string;
  error?: { message: string } | null;
  generations?: Array<{ status: string; error?: { message: string } | null }>;
  createdAt?: string;
};

const operationLabels: Record<string, string> = {
  product_analyze: '分析商品信息',
  storyboard: '生成页面方案',
  copy_generate: '生成商品文案',
  prompt_generate: '完善画面要求',
  asset_annotate: '识别商品素材',
  creative_candidates: '生成创作方向建议',
  chat_intake_extract: '整理聊天需求',
  plan_agent: '生成图片方案',
};

export function taskJobTitle(job: TaskLogJob) {
  if (job.operation && operationLabels[job.operation]) return operationLabels[job.operation];
  if (job.type === 'image_generate') return '生成商品图片';
  if (job.type === 'export') return '打包图片交付';
  return '执行工作流任务';
}

export function taskPhaseLabel(phase?: string) {
  const labels: Record<string, string> = {
    'loading-references': '读取商品和参考素材', 'requesting-ai': '请求策划 / 文案模型', 'saving-result': '保存模型返回结果',
    'upstream-queued': '图片生成服务排队', 'persisting': '保存生成图片', 'starting': '启动图片生成',
    'generation-completed': '完成当前图片，继续处理下一张', 'image-analysis': '识别商品图片',
    'screenshot-analysis': '分段识别聊天截图', 'requirement-extraction': '整理客户需求',
    'image-planning': '编排图片方案', 'verification': '核对图片方案', 'reading-assets': '读取已选交付图片',
    'completed': '任务处理完成',
  };
  return phase ? labels[phase] || phase.replaceAll('-', ' ') : '';
}

function jobTitle(job: TaskLogJob) { return taskJobTitle(job); }

function statusText(status: string) {
  const labels: Record<string, string> = {
    queued: '排队中', processing: '执行中', running: '执行中', completed: '已完成', failed: '失败', partial: '部分完成',
    cancelled: '已取消', cancelling: '正在取消',
  };
  return labels[status] || '处理中';
}

function statusIcon(status: TaskLogEntry['status']) {
  if (status === 'success') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  if (status === 'error') return <AlertCircle className="h-3.5 w-3.5 text-rose-600" />;
  if (status === 'running') return <LoaderCircle className="h-3.5 w-3.5 animate-spin text-indigo-600" />;
  return <Clock3 className="h-3.5 w-3.5 text-slate-400" />;
}

function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function ImageStudioTaskLogWindow({ entries, jobs, currentTask }: {
  entries: TaskLogEntry[];
  jobs: TaskLogJob[];
  currentTask: TrackedTask | null;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const activeJobs = jobs.filter((job) => ['queued', 'processing', 'running', 'cancelling'].includes(job.status));
  const recentJobs = jobs.filter((job) => !['queued', 'processing', 'running', 'cancelling'].includes(job.status)).slice(0, 3);
  const activeCount = activeJobs.length + (currentTask ? 1 : 0);

  return <aside aria-label="工作流任务日志" className="fixed right-3 top-20 z-[60] w-[min(370px,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white/95 text-slate-800 shadow-[0_16px_50px_rgba(15,23,42,0.18)] backdrop-blur sm:right-5 sm:top-24">
    <header className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white/90 px-4 py-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><Activity className="h-4 w-4" /></span>
        <div className="min-w-0"><h2 className="text-sm font-semibold">任务日志</h2><p className="text-[10px] text-slate-500">{activeCount ? `${activeCount} 项正在执行` : '工作流操作与后台进度'}</p></div>
      </div>
      <button type="button" aria-expanded={!collapsed} aria-label={collapsed ? '展开任务日志' : '收起任务日志'} onClick={() => setCollapsed((value) => !value)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">{collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}</button>
    </header>

    {!collapsed && <div className="max-h-[min(68vh,640px)] space-y-4 overflow-y-auto p-3.5">
      <section>
        <div className="mb-2 flex items-center justify-between"><h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">当前执行</h3><span className="text-[10px] text-slate-400">实时更新</span></div>
        {currentTask && <div className="mb-2 rounded-xl border border-indigo-100 bg-indigo-50/60 p-3">
          <div className="flex items-start gap-2"><LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-indigo-600" /><div className="min-w-0 flex-1"><p className="text-xs font-semibold">{currentTask.title}</p><p className="mt-1 break-words text-[11px] leading-4 text-slate-600">{currentTask.detail}</p></div>{typeof currentTask.progress === 'number' && <span className="text-[10px] font-semibold text-indigo-700">{currentTask.progress}%</span>}</div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-indigo-100">{typeof currentTask.progress === 'number' ? <div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${Math.max(0, Math.min(100, currentTask.progress))}%` }} /> : <div className="h-full w-2/5 animate-pulse rounded-full bg-indigo-500" />}</div>
        </div>}
        {activeJobs.length > 0 ? <div className="space-y-2">{activeJobs.map((job) => {
          const total = job.generations?.length || 0;
          const completed = job.generations?.filter((item) => item.status === 'completed').length || 0;
          const failed = job.generations?.filter((item) => item.status === 'failed').length || 0;
          const progress = Math.max(0, Math.min(100, Number(job.progress) || 0));
          return <article key={job.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs font-semibold">{jobTitle(job)}</p><p className="mt-1 text-[10px] text-slate-500">{statusText(job.status)}{job.phase ? ` · ${taskPhaseLabel(job.phase)}` : ''}{total ? ` · 已完成 ${completed}/${total} 张${failed ? ` · 失败 ${failed} 张` : ''}` : ''}</p></div><span className="shrink-0 text-[10px] font-semibold text-indigo-700">{progress}%</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} /></div>
            {job.error?.message && <p className="mt-2 break-words text-[10px] leading-4 text-rose-700">{job.error.message}</p>}
          </article>;
        })}</div> : !currentTask && <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] text-slate-500">当前没有进行中的任务。</p>}
      </section>

      {recentJobs.length > 0 && <section><h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">最近后台任务</h3><div className="space-y-1.5">{recentJobs.map((job) => <div key={job.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2"><div className="min-w-0"><p className="truncate text-[11px] font-medium">{jobTitle(job)}</p><p className="mt-0.5 text-[10px] text-slate-500">{statusText(job.status)}{job.type === 'image_generate' && job.generations?.length ? ` · ${job.generations.filter((item) => item.status === 'completed').length}/${job.generations.length} 张` : ''}</p>{job.error?.message && <p className="mt-1 break-words text-[10px] leading-4 text-rose-700">{job.error.message}</p>}</div><span className="shrink-0 text-[10px] text-slate-400">{job.status === 'completed' ? '100%' : `${Math.max(0, Math.min(100, Number(job.progress) || 0))}%`}</span></div>)}</div></section>}

      <section><div className="mb-2 flex items-center justify-between"><h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">操作记录</h3><span className="text-[10px] text-slate-400">最近 {Math.min(entries.length, 8)} 条</span></div>
        {entries.length ? <div className="space-y-2">{entries.slice(0, 8).map((entry) => <div key={entry.id} className="flex gap-2.5"><span className="mt-0.5 shrink-0">{statusIcon(entry.status)}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><p className="text-[11px] font-medium leading-4">{entry.title}</p><time className="shrink-0 text-[9px] text-slate-400">{timeLabel(entry.createdAt)}</time></div><p className="mt-0.5 break-words text-[10px] leading-4 text-slate-500">{entry.detail}</p></div></div>)}</div> : <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-[11px] text-slate-500">上传素材、保存进度和提交生成任务后会记录在这里。</p>}
      </section>
    </div>}
  </aside>;
}
