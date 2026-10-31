'use client';

import { Check, CircleAlert, Loader2 } from 'lucide-react';

export type RoundExecution = { roundId?: string; taskId: string; taskTitle: string; jobId?: string; status: string; error?: string; result?: string; updatedAt?: string };
export type RoundJob = { id: string; status: string; progress: number; createdAt?: string; result?: unknown; error?: { message: string } | null; context?: Record<string, any> | null; generations?: Array<{ id: string; slotKey: string; status: string; previewUrl?: string | null; outputAssetId?: string | null; error?: { message: string } | null }> };

export function getRoundActivity(roundId: string, executions: RoundExecution[], jobs: RoundJob[]) {
  const own = executions.filter((item) => item.roundId === roundId);
  const ownJobs = jobs.filter((job) => job.context?.roundId === roundId);
  const entries = ownJobs.map((job) => {
    const execution = own.find((item) => item.jobId === job.id);
    return { key: job.id, taskId: String(job.context?.taskId || execution?.taskId || ''), title: execution?.taskTitle || String(job.context?.taskTitle || '制作任务'), status: job.status, progress: job.progress, error: job.error?.message, result: execution?.result, generations: job.generations || [], at: job.createdAt || execution?.updatedAt || '' };
  });
  for (const execution of own) if (!execution.jobId || !ownJobs.some((job) => job.id === execution.jobId)) entries.push({ key: `${execution.taskId}:${execution.updatedAt || ''}`, taskId: execution.taskId, title: execution.taskTitle, status: execution.status, progress: 0, error: execution.error, result: execution.result, generations: [], at: execution.updatedAt || '' });
  return entries.sort((a, b) => a.at.localeCompare(b.at));
}

export function RoundActivity({ roundId, executions, jobs, toolEvents = [], reviews, candidateNames = {}, onFocus, onRetry, onReviewChange }: { roundId: string; executions: RoundExecution[]; jobs: RoundJob[]; toolEvents?: Array<{ type: 'skill_read'; names: string[] }>; reviews: Array<{ id: string; selected: boolean; locked: boolean }>; candidateNames?: Record<string, string>; onFocus: (taskId: string, jobId?: string) => void; onRetry: (taskId: string, jobId?: string) => void; onReviewChange: (id: string, patch: { selected?: boolean; locked?: boolean }) => void }) {
  const entries = getRoundActivity(roundId, executions, jobs);
  if (!entries.length && !toolEvents.length) return null;
  const busy = entries.some((item) => ['queued', 'running', 'cancelling'].includes(item.status));
  return <details className="mb-3 rounded-xl border border-slate-200 bg-white/80 p-2.5" open={busy || entries.some((entry) => entry.generations.some((image) => candidateNames[image.slotKey])) || undefined}>
    <summary className="cursor-pointer text-[11px] font-medium text-slate-600">{busy ? '正在执行本轮任务' : `本轮执行记录 · ${entries.length + toolEvents.length} 项`}</summary>
    <div className="mt-2 space-y-2" role="log" aria-label="本轮执行过程" aria-live="polite">{toolEvents.map((event, index) => <div key={`tool-${index}`} className="rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">✓ 已加载设计 Skill 指导{event.names.length ? `：${event.names.join('、')}` : '（未找到可读取项）'}</div>)}{entries.map((entry) => {
      const running = ['queued', 'running', 'cancelling'].includes(entry.status);
      const failed = ['failed', 'partial', 'cancelled', 'blocked'].includes(entry.status);
      return <div key={entry.key} className="rounded-lg bg-slate-50 p-2 text-[11px] leading-5">
        <div className="flex items-center gap-1.5">{running ? <Loader2 className="size-3 animate-spin text-violet-600" /> : failed ? <CircleAlert className="size-3 text-rose-500" /> : <Check className="size-3 text-emerald-600" />}<span className="min-w-0 flex-1 break-words">{entry.title}</span><span className="shrink-0 text-slate-400">{running ? `${entry.status === 'queued' ? '排队中' : '进行中'} ${entry.progress || 0}%` : failed ? '未全部完成' : '已完成'}</span></div>
        {entry.error && <p className="mt-1 break-words text-rose-600">{entry.error}</p>}
        {entry.result && <p className="mt-1 whitespace-pre-wrap break-words text-slate-500">{entry.result.slice(0, 280)}</p>}
        {entry.generations.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{entry.generations.map((image) => { const review = reviews.find((item) => item.id === image.id); const label = candidateNames[image.slotKey] || image.slotKey; return <div key={image.id} className="w-20 text-[10px] text-slate-400">{image.previewUrl ? <img src={image.previewUrl} alt={label} className="size-20 rounded-lg object-cover" /> : <div className="grid size-20 place-items-center rounded-lg bg-slate-100">{image.status === 'failed' ? '失败' : '生成中'}</div>}<span className="block truncate" title={image.error?.message || label}>{image.error?.message || label}</span>{review && image.status === 'completed' && <button type="button" onClick={() => onReviewChange(image.id, { selected: !review.selected })} className="mt-1 text-violet-600">{review.selected ? '已选成品' : '选为成品'}</button>}</div>; })}</div>}
        <div className="mt-1 flex gap-3">{entry.taskId && <button type="button" onClick={() => onFocus(entry.taskId, ownJobId(entry.key, jobs))} className="text-violet-600 hover:underline">在画布查看</button>}{failed && entry.taskId && <button type="button" onClick={() => onRetry(entry.taskId, ownJobId(entry.key, jobs))} className="text-rose-600 hover:underline">重新执行</button>}</div>
      </div>;
    })}</div>
  </details>;
}

function ownJobId(key: string, jobs: RoundJob[]) { return jobs.some((job) => job.id === key) ? key : undefined; }
