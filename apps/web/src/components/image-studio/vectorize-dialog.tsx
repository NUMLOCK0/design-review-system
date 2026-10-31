'use client';
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { fetchWithAuth } from '@/lib/auth';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { CanvasNodeData } from '@infinite-canvas/types/canvas';

type Mode = 'detail' | 'smooth';
type Result = { svg: string; width: number; height: number; mode: Mode; pathCount: number; bytes: number; differencePng: string };
type Task = { id: string; status: string; loaded?: boolean; result?: Result; error?: { message?: string } | null };
type OcrTask = { id: string; status: string; loaded?: boolean; result?: { candidates: string[] }; error?: { message?: string } | null };
type Typography = { editable: string; outlined: string; width: number; height: number; text: string; font: string; fontVersion: string; weight: number; color: string; size: number; spacing: number };
const labels: Record<Mode, string> = { detail: '保留细节', smooth: '轮廓平滑' };

export function VectorizeDialog({ node, projectId, open, onClose, onApply, initialBrand = '', visionProfileId }: { node?: CanvasNodeData; projectId: string; open: boolean; onClose: () => void; onApply: (node: CanvasNodeData, svg: string, outlineSvg?: string, dimensions?: { width: number; height: number }, typography?: Omit<Typography, 'editable' | 'outlined' | 'width' | 'height'>) => Promise<void>; initialBrand?: string; visionProfileId?: string }) {
  const [mode, setMode] = useState<Mode>('detail');
  const [tasks, setTasks] = useState<Partial<Record<Mode, Task>>>({});
  const [ocrTask, setOcrTask] = useState<OcrTask>();
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [brand, setBrand] = useState('');
  const [fontWeight, setFontWeight] = useState<400 | 700>(400);
  const [fontSize, setFontSize] = useState(64);
  const [spacing, setSpacing] = useState(0);
  const [color, setColor] = useState('#222222');
  const [typography, setTypography] = useState<Typography>();
  const requestKeys = useRef<Partial<Record<Mode | 'ocr', string>>>({});
  useEffect(() => { delete requestKeys.current.ocr; }, [visionProfileId]);
  const key = node?.metadata?.storageKey || '';
  const studioId = node?.metadata?.imageStudioAssetId || /^studio-image-asset:([\w-]+)$/.exec(key)?.[1];
  const workspaceId = /^image:oss:(asset_[a-f0-9]{32})$/i.exec(key)?.[1];
  const assetId = studioId || workspaceId;
  const source = studioId ? 'studio' : 'workspace';
  const task = tasks[mode];
  const svg = task?.result?.svg || '';
  useEffect(() => { setTypography(undefined); }, [task?.id, mode]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setTasks({}); setOcrTask(undefined); setError(''); setMode('detail'); setBrand(initialBrand); setTypography(undefined); requestKeys.current = {};
    if (!assetId) { setLoading(false); return; }
    setLoading(true);
    const query = new URLSearchParams({ assetId, source });
    void fetchWithAuth(`/image-studio/projects/${projectId}/vectorize-jobs/latest?${query}`).then(async (response) => {
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || '无法恢复转换任务');
      if (alive) { setTasks({ detail: data.data?.detail, smooth: data.data?.smooth }); setOcrTask(data.data?.ocr); }
    }).catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : '无法恢复转换任务'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, node?.id, assetId, source, projectId, initialBrand]);

  const needsPoll = (value?: Task) => value && (!value.loaded || ['queued', 'running', 'cancelling'].includes(value.status));
  const detailId = needsPoll(tasks.detail) ? tasks.detail?.id : undefined;
  const smoothId = needsPoll(tasks.smooth) ? tasks.smooth?.id : undefined;
  useEffect(() => {
    if (!open || (!detailId && !smoothId)) return;
    let alive = true; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const ids = [detailId, smoothId].filter((id): id is string => Boolean(id));
      await Promise.all(ids.map(async (id) => {
        try {
          const response = await fetchWithAuth(`/image-studio/jobs/${encodeURIComponent(id)}`);
          const data = await response.json();
          if (!response.ok || !data.success) throw new Error(data.message || '读取任务失败');
          if (alive) setError((current) => current === '暂时无法获取任务进度，将自动重试' ? '' : current);
          if (alive) setTasks((old) => {
            const entry = (Object.entries(old) as Array<[Mode, Task | undefined]>).find(([, value]) => value?.id === id);
            if (!entry) return old;
            return { ...old, [entry[0]]: { id, status: data.data.status, loaded: true, result: data.data.result || undefined, error: data.data.error } };
          });
        } catch { if (alive) setError('暂时无法获取任务进度，将自动重试'); }
      }));
      if (alive) timer = setTimeout(() => void poll(), 3000);
    };
    void poll();
    return () => { alive = false; clearTimeout(timer); };
  }, [open, detailId, smoothId]);

  const ocrPollId = ocrTask && (!ocrTask.loaded || ['queued', 'running', 'cancelling'].includes(ocrTask.status)) ? ocrTask.id : undefined;
  useEffect(() => {
    if (!open || !ocrPollId) return;
    let alive = true; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetchWithAuth(`/image-studio/jobs/${encodeURIComponent(ocrPollId)}`);
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error('读取识别任务失败');
        if (alive) setError((current) => current === '暂时无法获取识别进度，将自动重试' ? '' : current);
        if (alive) setOcrTask((old) => old?.id === ocrPollId ? { id: ocrPollId, status: data.data.status, loaded: true, result: data.data.result || undefined, error: data.data.error } : old);
      } catch { if (alive) setError('暂时无法获取识别进度，将自动重试'); }
      if (alive) timer = setTimeout(() => void poll(), 3000);
    };
    void poll(); return () => { alive = false; clearTimeout(timer); };
  }, [open, ocrPollId]);

  const recognize = async () => {
    if (!assetId || !visionProfileId || busy || loading) return;
    setBusy(true); setError('');
    try {
      const idempotencyKey = requestKeys.current.ocr || `logo-ocr:${crypto.randomUUID()}`; requestKeys.current.ocr = idempotencyKey;
      const response = await fetchWithAuth(`/image-studio/projects/${projectId}/vectorize-jobs`, { method: 'POST', body: JSON.stringify({ assetId, source, mode: 'ocr', visionProfileId, idempotencyKey }) });
      const data = await response.json(); if (!response.ok || !data.success) throw new Error(data.message || '文字识别提交失败');
      delete requestKeys.current.ocr; setOcrTask(data.data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '文字识别提交失败'); }
    finally { setBusy(false); }
  };

  const generate = async () => {
    if (!assetId || busy || loading) return;
    setBusy(true); setError('');
    try {
      const idempotencyKey = requestKeys.current[mode] || `vector:${crypto.randomUUID()}`;
      requestKeys.current[mode] = idempotencyKey;
      const response = await fetchWithAuth(`/image-studio/projects/${projectId}/vectorize-jobs`, { method: 'POST', body: JSON.stringify({ assetId, source, mode, idempotencyKey }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '提交转换任务失败');
      delete requestKeys.current[mode];
      setTasks((old) => ({ ...old, [mode]: result.data }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : '提交转换任务失败'); }
    finally { setBusy(false); }
  };
  const compose = async () => {
    if (!task?.id || !svg || !brand.trim() || busy) return;
    setBusy(true); setError(''); setTypography(undefined);
    try {
      const response = await fetchWithAuth(`/image-studio/projects/${projectId}/vectorize-jobs/${encodeURIComponent(task.id)}/typography`, { method: 'POST', body: JSON.stringify({ text: brand, weight: fontWeight, size: fontSize, spacing, color }) });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || '文字排版失败');
      setTypography(data.data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '文字排版失败'); }
    finally { setBusy(false); }
  };
  const downloadPng = async () => {
    if (!task?.result || busy) return;
    setBusy(true); setError('');
    try {
      const result = typography || task.result;
      const url = URL.createObjectURL(new Blob([typography?.outlined || task.result.svg], { type: 'image/svg+xml' }));
      try {
        const image = new Image();
        await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('无法生成 PNG')); image.src = url; });
        const canvas = document.createElement('canvas'); canvas.width = result.width; canvas.height = result.height;
        const context = canvas.getContext('2d'); if (!context) throw new Error('无法生成 PNG');
        context.drawImage(image, 0, 0);
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('无法生成 PNG')), 'image/png'));
        const pngUrl = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = pngUrl; link.download = 'logo-vector-preview.png'; link.click();
        setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
      } finally { URL.revokeObjectURL(url); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : '无法生成 PNG'); }
    finally { setBusy(false); }
  };
  const running = task && ['queued', 'running', 'cancelling'].includes(task.status);
  return <Dialog open={open} onOpenChange={(value) => { if (!value && !busy) onClose(); }}><DialogContent className="max-h-[90vh] max-w-5xl grid-cols-[minmax(0,1fr)] overflow-x-hidden overflow-y-auto bg-white">
    <DialogHeader><DialogTitle>制作矢量 Logo</DialogTitle><DialogDescription>对比原图和转换结果；可在下方单独添加品牌文字并生成可编辑版和转曲版。</DialogDescription></DialogHeader>
    <div className="flex flex-wrap items-center gap-3 text-sm">{(['detail', 'smooth'] as Mode[]).map((option) => <button key={option} type="button" disabled={busy} onClick={() => setMode(option)} className={`rounded-lg border px-3 py-2 ${mode === option ? 'border-violet-600 bg-violet-50 text-violet-700' : ''}`}>{labels[option]}{tasks[option]?.status === 'completed' ? ' ✓' : ''}</button>)}<button type="button" onClick={() => void generate()} disabled={busy || loading || Boolean(running) || !assetId} className="rounded-lg bg-violet-600 px-3 py-2 text-white disabled:opacity-50">{running ? '后台转换中…' : task?.status === 'failed' ? '重试转换' : svg ? '重新转换' : '生成预览'}</button>{(running || loading || busy) && <Loader2 className="size-4 animate-spin" />}</div>
    {!assetId && <p role="alert" className="text-sm text-red-600">请等待图片保存到工作台后再转换</p>}
    {running && <p className="text-sm text-slate-500">任务正在后台执行，可以关闭窗口，稍后重新打开查看。</p>}
    {(error || task?.error?.message || task?.status === 'failed') && <p role="alert" className="text-sm text-red-600">{error || task?.error?.message || '转换失败，请重试'}</p>}
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">{[{ title: '原图', url: node?.metadata?.content || '' }, { title: 'SVG 预览', url: svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : '' }, { title: '差异高亮', url: task?.result?.differencePng ? `data:image/png;base64,${task.result.differencePng}` : '' }].map((item) => <div key={item.title} className="min-w-0 rounded-xl border border-slate-200 p-3"><p className="mb-2 text-sm font-medium">{item.title}</p><div className="flex h-56 w-full min-w-0 items-center justify-center overflow-hidden bg-slate-50">{item.url ? <img src={item.url} alt={item.title} className="block h-full w-full min-w-0 object-contain" /> : <span className="text-xs text-slate-400">生成后可在此对比</span>}</div></div>)}</div>
    {task?.result && <p className="text-xs text-slate-500">{task.result.width} × {task.result.height} · {task.result.pathCount} 条路径 · {(task.result.bytes / 1024).toFixed(1)} KB。差异图以白色背景比较，红色表示像素差异，仅供辅助检查。</p>}
    {svg && <div className="rounded-xl border border-slate-200 px-3 py-2 text-xs"><div className="flex flex-wrap items-center gap-2"><button type="button" disabled={busy || loading || !visionProfileId || Boolean(ocrTask && ['queued', 'running', 'cancelling'].includes(ocrTask.status))} onClick={() => void recognize()} className="rounded border px-2 py-1.5 text-violet-700 disabled:opacity-50">{ocrTask && ['queued', 'running', 'cancelling'].includes(ocrTask.status) ? '正在识别…' : ocrTask ? '重新识别文字' : '识别图片文字'}</button><span className="text-slate-500">将图片发送给当前选择的图片理解模型，可能产生模型调用费用；识别结果需手动核对。</span></div>{!visionProfileId && <p className="mt-1 text-amber-700">请先在工作台选择图片理解模型，也可以直接输入品牌名称。</p>}{ocrTask?.status === 'failed' && <p role="alert" className="mt-1 text-red-600">{ocrTask.error?.message || '识别失败，请重试或手动输入'}</p>}{ocrTask?.status === 'completed' && <div className="mt-2 flex flex-wrap items-center gap-2"><span>识别候选：</span>{ocrTask.result?.candidates?.length ? ocrTask.result.candidates.map((candidate) => <button type="button" key={candidate} onClick={() => { setBrand(candidate); setTypography(undefined); }} className="rounded border border-violet-200 px-2 py-1 text-violet-700">{candidate}</button>) : <span className="text-slate-500">未识别到可确认的文字，请手动输入。</span>}</div>}</div>}
    {svg && <section className="rounded-xl border border-slate-200 p-3"><h3 className="text-sm font-semibold">添加品牌文字</h3><p className="mt-1 text-xs text-slate-500">文字将排在原图下方，不会擦除原图中已有文字。转曲版使用思源黑体；可编辑版在未安装该字体的设备上可能使用替代字体。</p><fieldset disabled={busy} className="mt-3 flex flex-wrap items-end gap-3 text-xs"><label className="grid gap-1">品牌名称<input value={brand} maxLength={80} onChange={(e) => { setBrand(e.target.value); setTypography(undefined); }} className="rounded border px-2 py-1.5 text-sm" placeholder="输入确认后的品牌名称" /></label><label className="grid gap-1">字重<select value={fontWeight} onChange={(e) => { setFontWeight(Number(e.target.value) as 400 | 700); setTypography(undefined); }} className="rounded border px-2 py-1.5"><option value={400}>常规</option><option value={700}>粗体</option></select></label><label className="grid gap-1">字号<input type="number" min={24} max={180} value={fontSize} onChange={(e) => { setFontSize(Number(e.target.value)); setTypography(undefined); }} className="w-20 rounded border px-2 py-1.5" /></label><label className="grid gap-1">字间距<input type="number" min={0} max={20} value={spacing} onChange={(e) => { setSpacing(Number(e.target.value)); setTypography(undefined); }} className="w-20 rounded border px-2 py-1.5" /></label><label className="grid gap-1">颜色<input type="color" value={color} onChange={(e) => { setColor(e.target.value); setTypography(undefined); }} className="h-8 w-12 rounded border" /></label><button type="button" disabled={busy || !brand.trim()} onClick={() => void compose()} className="rounded-lg border border-violet-300 px-3 py-2 text-violet-700 disabled:opacity-50">生成文字排版</button></fieldset>{typography && <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="flex h-40 w-full min-w-0 items-center justify-center overflow-hidden rounded bg-slate-50"><img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(typography.outlined)}`} alt="带品牌文字的 Logo 预览" className="block h-full w-full min-w-0 object-contain" /></div><p className="min-w-0 break-words text-xs text-slate-500">预览为转曲版<br />文字：{typography.text}<br />字体：{typography.font}</p></div>}</section>}
    <div className="flex justify-end gap-2"><button type="button" onClick={onClose} disabled={busy} className="rounded-lg border px-3 py-2 text-sm">关闭</button><button type="button" onClick={() => void downloadPng()} disabled={!svg || busy} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">下载 PNG</button><button type="button" disabled={!svg || busy} onClick={() => { if (!node) return; setBusy(true); setError(''); void onApply(node, typography?.editable || svg, typography?.outlined, typography ? { width: typography.width, height: typography.height } : undefined, typography ? { text: typography.text, font: typography.font, fontVersion: typography.fontVersion, weight: typography.weight, color: typography.color, size: typography.size, spacing: typography.spacing } : undefined).then(onClose).catch((cause) => setError(cause instanceof Error ? cause.message : '保存失败')).finally(() => setBusy(false)); }} className="rounded-lg bg-violet-600 px-3 py-2 text-sm text-white disabled:opacity-50">添加到画布</button></div>
  </DialogContent></Dialog>;
}
