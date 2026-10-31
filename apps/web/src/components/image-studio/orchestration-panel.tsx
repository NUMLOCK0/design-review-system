'use client';
import { useEffect, useRef, useState } from 'react';
import { fetchWithAuth } from '@/lib/auth';

type Run = { id: string; status: string; planVersion: number; tasks: Array<{ id: string; title: string; kind: string; agentName?: string | null; status: string; dependsOn?: string[]; errorMessage?: string; downloadUrl?: string; result?: { summary?: string; checks?: Array<{ assetId: string; criterion: string; status: string; evidence: string }> } }> };
const labels: Record<string, string> = { draft: '待启动', pending: '待执行', running: '执行中', queued: '排队中', waiting_user: '等待确认', failed: '执行失败', completed: '已完成', cancelling: '停止中', cancelled: '已停止', stale: '方案已更新' };
export function OrchestrationPanel({ projectId, planVersion, refreshKey, connected, onUpdate }: { projectId: string; planVersion?: number; refreshKey: number; connected: boolean; onUpdate: (active: boolean, hasRun: boolean, completedPlanVersion: number | null) => void }) {
  const [runs, setRuns] = useState<Run[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const callback = useRef(onUpdate); callback.current = onUpdate;
  const load = async () => {
    const res = await fetchWithAuth(`/image-studio/projects/${projectId}/orchestrations`); const body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.message || '制作状态读取失败');
    return body.data as Run[];
  };
  useEffect(() => {
    let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      let failed = false;
      try {
        const next = await load(); if (cancelled) return; setRuns(next); setError('');
        const currentPlanRun = next.find((run) => run.planVersion === planVersion);
        callback.current(next.some((run) => ['running', 'cancelling'].includes(run.status)),
          next.some((run) => ['running', 'waiting_user', 'cancelling'].includes(run.status)) || (currentPlanRun?.status === 'failed'),
          currentPlanRun?.status === 'completed' ? currentPlanRun.planVersion : null);
      }
      catch (e) { failed = true; if (!cancelled) setError(e instanceof Error ? e.message : '状态读取失败'); }
      // Socket notifications can be missed, including tasks that complete without a job.
      // Keep a bounded refresh even while connected so the team status stays accurate.
      if (!cancelled) timer = setTimeout(() => void poll(), connected && !failed ? 10000 : 5000);
    };
    void poll(); return () => { cancelled = true; clearTimeout(timer); };
  }, [projectId, planVersion, refreshKey, connected]);
  const control = async (runId: string, action: string, taskId?: string) => {
    setBusy(true);
    try {
      const res = await fetchWithAuth(`/image-studio/projects/${projectId}/orchestrations/${runId}/control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, taskId }) });
      const body = await res.json(); if (!res.ok || !body.success) throw new Error(body.message || '操作失败');
      setRuns(await load()); setError('');
    } catch (e) { setError(e instanceof Error ? e.message : '操作失败'); }
    finally { setBusy(false); }
  };
  if (!runs.length && !error) return null;
  const run = runs.find((r) => ['running', 'waiting_user', 'cancelling'].includes(r.status)) || runs[0];
  return <section className="mb-4 rounded-xl border border-violet-200 bg-white p-3 text-xs" aria-label="后台制作计划">
    <div className="flex items-center justify-between gap-2"><span className="font-semibold text-violet-800">创意总监 · 制作调度 {run && `· ${labels[run.status] || run.status}`}</span>{run && ['running', 'waiting_user', 'failed'].includes(run.status) && <button type="button" disabled={busy} onClick={() => void control(run.id, 'cancel')} className="text-slate-500 disabled:opacity-50">停止后续任务</button>}</div>
    <p className="mt-1 text-[11px] text-slate-500">{run?.status === 'waiting_user'
      ? `制作已暂停，等待你确认：${run.tasks.filter((task) => task.status === 'waiting_user').map((task) => task.title).join('、')}。确认后才会继续后续任务。`
      : '关闭页面后，已启动的制作会在后台继续。'}</p>
    {error && <p role="alert" className="mt-2 text-rose-600">{error}</p>}
    {run && <p className="mt-2 text-slate-500">已完成 {run.tasks.filter((task) => task.status === 'completed').length} / {run.tasks.length} 项 · 下方仅展示本次计划中的实际任务</p>}
    {run && <div className="mt-2 space-y-2">{run.tasks.map((task) => <div key={task.id} className="rounded-lg bg-slate-50 p-2">
      <div className="flex justify-between gap-2"><span>{task.title}</span><span className="shrink-0 text-slate-500">{labels[task.status] || task.status}</span></div>
      {task.agentName && <p className="mt-1 text-violet-700">负责角色：{task.agentName}</p>}
      {task.status === 'pending' && Boolean(task.dependsOn?.length) && <p className="mt-1 text-slate-500">等待：{task.dependsOn!.filter((id) => run.tasks.find((item) => item.id === id)?.status !== 'completed').map((id) => run.tasks.find((item) => item.id === id)?.title || id).join('、') || '调度执行'}</p>}
      {task.result?.summary && <p className="mt-1 text-slate-600">{task.result.summary}</p>}
      {task.result?.checks && <details className="mt-1 text-slate-500"><summary>查看审稿依据</summary>{task.result.checks.map((check, index) => <p key={index}>{check.criterion}：{check.status} · {check.evidence}</p>)}</details>}
      {task.downloadUrl && <a href={task.downloadUrl} className="mt-2 block text-violet-700">下载交付包</a>}
      {task.errorMessage && <p className="mt-1 text-rose-600">{task.errorMessage}</p>}
      {task.status === 'waiting_user' && <button type="button" disabled={busy} onClick={() => void control(run.id, task.kind === 'delivery' ? 'approve' : 'continue_automatically', task.kind === 'delivery' ? task.id : undefined)} className="mt-2 text-violet-700">{task.kind === 'delivery' ? '确认导出所选成品' : '继续自动制作'}</button>}
      {task.status === 'failed' && <button type="button" disabled={busy} onClick={() => void control(run.id, 'retry', task.id)} className="mt-2 text-violet-700">重试失败项</button>}
    </div>)}</div>}
  </section>;
}
