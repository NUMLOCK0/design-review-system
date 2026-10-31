'use client';

import { Check, ChevronDown, Download, Loader2, Play, RefreshCw, Sparkles } from 'lucide-react';

export type WorkbenchTaskMessage = {
  id: string; title: string; kindLabel: string; reason: string; outputs: string[]; skills: string[];
  dependencies: string[]; status: string; statusLabel: string; progress?: number; result?: string;
  error?: string; exportUrl?: string; actionLabel: string; disabled: boolean; disabledReason?: string;
};

type Review = {
  id: string; slotKey: string; status: string; outputAssetId: string | null; previewUrl: string | null;
  selected: boolean; locked: boolean; error: { message: string } | null;
};

function AgentAvatar() {
  return <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f0ebff] text-[#7547ff]"><Sparkles className="size-4" /></span>;
}

export function WorkbenchTaskMessages({ tasks, reviews, canvasReady, onExecute, onFocus, onReviewChange, onStartAll, startAllDisabled, startAllReason, startAllBusy, startAllCompleted, activeTaskTitle, showPlan = true }: {
  tasks: WorkbenchTaskMessage[]; reviews: Review[]; canvasReady: boolean;
  onExecute: (id: string) => void; onFocus: (id: string) => void;
  onReviewChange: (id: string, patch: { selected?: boolean; locked?: boolean }) => void;
  onStartAll: () => void; startAllDisabled: boolean; startAllReason?: string; startAllBusy: boolean;
  startAllCompleted?: boolean;
  activeTaskTitle?: string;
  showPlan?: boolean;
}) {
  if (!tasks.length && !reviews.length) return null;
  const finished = tasks.filter((task) => task.status === 'completed').length;
  const results = tasks.filter((task) => ['queued', 'running', 'completed', 'partial', 'failed'].includes(task.status));
  const images = reviews.filter((item) => item.outputAssetId || item.status === 'failed').slice(0, 20);
  if (!showPlan && !results.length && !images.length) return null;

  return <div className="mt-6 space-y-6" aria-label="Agent 制作消息">
    {showPlan && tasks.length > 0 && <div className="flex items-start gap-3"><AgentAvatar /><div className="min-w-0 flex-1 overflow-hidden rounded-2xl rounded-tl-md border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3.5 py-3"><div className="flex items-center justify-between gap-2"><h3 className="text-xs font-semibold text-slate-800">这次的制作计划</h3><span className="text-[10px] text-slate-400">{finished}/{tasks.length} 已完成</span></div><p className="mt-1 text-[11px] leading-5 text-slate-500">按任务顺序逐项执行；生成的图片会放到画布中，需要人工确认的步骤会保留待处理。</p><button type="button" aria-label="一键开始制作" title={startAllReason} disabled={startAllDisabled} onClick={onStartAll} className="mt-3 inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-[#7547ff] px-3 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-violet-200">{startAllBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}{startAllBusy ? '正在按计划制作…' : startAllCompleted ? '制作已完成' : '一键开始制作'}</button>{startAllBusy && activeTaskTitle && <p className="mt-1.5 truncate text-[10px] text-violet-600">当前步骤：{activeTaskTitle}</p>}{!startAllBusy && startAllDisabled && startAllReason && <p className="mt-1.5 text-[10px] leading-4 text-slate-400">{startAllReason}</p>}</div>
      <ol className="divide-y divide-slate-100">{tasks.map((task, index) => {
        const busy = ['queued', 'running'].includes(task.status);
        return <li key={task.id} className="px-3.5 py-3">
          <div className="flex items-start gap-2.5"><span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[10px] ${task.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : busy ? 'bg-violet-50 text-violet-600' : task.status === 'failed' ? 'bg-rose-50 text-rose-600' : 'bg-slate-100 text-slate-400'}`}>{task.status === 'completed' ? <Check className="size-3" /> : busy ? <Loader2 className="size-3 animate-spin" /> : index + 1}</span><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><h4 className="text-xs font-medium leading-5 text-slate-700">{task.title}</h4><span className={`shrink-0 pt-0.5 text-[10px] ${busy ? 'text-violet-600' : task.status === 'completed' ? 'text-emerald-600' : 'text-slate-400'}`}>{task.statusLabel}</span></div>
          <details className="mt-1"><summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] text-slate-400">{task.kindLabel}<ChevronDown className="size-3" /></summary><div className="mt-2 space-y-1.5 text-[11px] leading-5 text-slate-500">{task.reason && <p>{task.reason}</p>}{task.dependencies.length > 0 && <p>先完成：{task.dependencies.join('、')}</p>}{task.outputs.length > 0 && <p>交付内容：{task.outputs.join('、')}</p>}{task.skills.length > 0 && <p>使用 Skills：{task.skills.join('、')}</p>}</div></details>
          <div className="mt-2 flex flex-wrap items-center gap-2"><button type="button" aria-label={`${task.actionLabel}：${task.title}`} disabled={task.disabled} title={task.disabledReason} onClick={() => onExecute(task.id)} className="inline-flex h-7 items-center gap-1 rounded-lg bg-violet-50 px-2.5 text-[10px] font-medium text-violet-700 hover:bg-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400">{busy ? <Loader2 className="size-3 animate-spin" /> : task.status === 'failed' ? <RefreshCw className="size-3" /> : <Play className="size-3" />}{task.actionLabel}</button><button type="button" disabled={!canvasReady} onClick={() => onFocus(task.id)} className="h-7 text-[10px] text-slate-400 hover:text-violet-600 disabled:opacity-40">在画布查看</button></div>{task.disabledReason && !busy && task.status !== 'completed' && <p className="mt-1 text-[10px] leading-4 text-slate-400">{task.disabledReason}</p>}
          </div></div>
        </li>;
      })}</ol>
    </div></div>}

    <div className="space-y-4" role="log" aria-label="任务进度与结果" aria-live="polite" aria-relevant="additions text">{results.map((task) => {
      const busy = ['queued', 'running'].includes(task.status);
      const failed = task.status === 'failed';
      const progress = Math.max(0, Math.min(100, Number(task.progress) || 0));
      return <div key={task.id} className="flex items-start gap-3"><AgentAvatar /><article className={`min-w-0 flex-1 rounded-2xl rounded-tl-md px-3.5 py-3 ${failed ? 'bg-rose-50' : busy ? 'bg-violet-50' : 'bg-[#f4f5f9]'}`}>
        <p className={`text-xs font-medium leading-5 ${failed ? 'text-rose-700' : 'text-slate-700'}`}>{busy ? `${task.status === 'queued' ? '已安排' : '正在'}：${task.title}` : task.status === 'partial' ? `部分完成：${task.title}` : failed ? `未完成：${task.title}` : `已完成：${task.title}`}</p>
        {busy ? <div className="mt-2"><div className="flex items-center justify-between text-[10px] text-violet-600"><span>{task.status === 'queued' ? '正在等待执行' : '正在制作，完成后会在这里回复'}</span>{task.progress !== undefined && <span>{progress}%</span>}</div>{task.progress !== undefined && <div role="progressbar" aria-label={task.title} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="mt-2 h-1.5 overflow-hidden rounded-full bg-violet-100"><div className="h-full rounded-full bg-violet-500 transition-[width]" style={{ width: `${progress}%` }} /></div>}</div> : <>
          <p className={`mt-1.5 whitespace-pre-wrap break-words text-[11px] leading-6 ${failed ? 'text-rose-600' : 'text-slate-500'}`}>{task.error || (task.result ? task.result.slice(0, 360) : failed ? '这一步未能完成，请重试。' : task.status === 'partial' ? '部分输出已完成，可以在画布中查看。' : '这一步已完成，可以在画布中查看。')}</p>
          {task.result && task.result.length > 360 && <details className="mt-2"><summary className="cursor-pointer text-[10px] text-violet-600">展开完整结果</summary><p className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap break-words text-[11px] leading-6 text-slate-600">{task.result}</p></details>}
          <div className="mt-2 flex flex-wrap items-center gap-3">{failed ? <button type="button" disabled={task.disabled} onClick={() => onExecute(task.id)} className="text-[11px] font-medium text-rose-600 disabled:opacity-40">重新执行</button> : <button type="button" disabled={!canvasReady} onClick={() => onFocus(task.id)} className="text-[11px] text-violet-600 disabled:opacity-40">在画布查看</button>}{task.exportUrl && <a href={task.exportUrl} className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-600"><Download className="size-3" />下载交付包</a>}</div>
        </>}
      </article></div>;
    })}</div>

    {images.length > 0 && <div className="flex items-start gap-3"><AgentAvatar /><section className="min-w-0 flex-1 rounded-2xl rounded-tl-md border border-slate-200 bg-white p-3.5" aria-label="审稿与成品"><div className="mb-3 flex items-center justify-between"><h3 className="text-xs font-semibold text-slate-700">生成结果</h3><span className="text-[10px] text-slate-400">{reviews.filter((item) => item.selected).length} 张已选成品</span></div><div className="space-y-3">{images.map((item, index) => <div key={item.id} className="flex gap-3"><div className="size-16 shrink-0 overflow-hidden rounded-lg bg-slate-50">{item.previewUrl ? <img src={item.previewUrl} alt={`生成图片 ${index + 1}`} className="size-full object-cover" /> : <span className="grid size-full place-items-center text-[10px] text-slate-400">生成失败</span>}</div><div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-700">图片 {index + 1}</p>{item.error && <p className="mt-1 break-words text-[10px] text-rose-600">{item.error.message}</p>}<div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={item.status !== 'completed'} onClick={() => onReviewChange(item.id, { selected: !item.selected })} className={`rounded-lg px-2 py-1.5 text-[10px] disabled:opacity-40 ${item.selected ? 'bg-violet-600 text-white' : 'border border-slate-200 text-slate-500'}`}>{item.selected ? '已选成品' : '选为成品'}</button><button type="button" disabled={item.status !== 'completed'} onClick={() => onReviewChange(item.id, { locked: !item.locked })} className="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] text-slate-500 disabled:opacity-40">{item.locked ? '已锁定' : '锁定'}</button></div></div></div>)}</div></section></div>}
  </div>;
}
