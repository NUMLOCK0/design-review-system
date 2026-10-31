'use client';
import { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/lib/auth';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
type Image = { outputAssetId: string | null; previewUrl: string | null; selected: boolean; status: string; slotKey: string };
export function PsdExportDialog({ projectId, images }: { projectId: string; images: Image[] }) {
  const [open, setOpen] = useState(false); const [width, setWidth] = useState(1024); const [height, setHeight] = useState(1024);
  const [layers, setLayers] = useState<Array<{ assetId: string; name: string; left: number; top: number; width: number; height: number }>>([]);
  const [title, setTitle] = useState(''); const [error, setError] = useState(''); const [job, setJob] = useState<{ id: string; exportId: string } | null>(null); const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!job || !open) return;
    let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetchWithAuth(`/image-studio/jobs/${job.id}`); const body = await res.json();
        if (cancelled) return; if (!res.ok || !body.success) throw new Error(body.message || '读取导出进度失败');
        setStatus(body.data.status);
        if (['completed', 'failed', 'cancelled'].includes(body.data.status)) { if (body.data.error?.message) setError(body.data.error.message); return; }
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : '读取失败'); }
      if (!cancelled) timer = setTimeout(() => void poll(), 2500);
    };
    void poll(); return () => { cancelled = true; clearTimeout(timer); };
  }, [job, open]);
  const start = async () => {
    setBusy(true); setError('');
    try {
      const res = await fetchWithAuth(`/image-studio/projects/${projectId}/layered-exports`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ width, height,
        layers: [...layers.map((layer) => ({ ...layer, kind: 'image' })), ...(title.trim() ? [{ kind: 'text', name: '标题文字', text: title.trim(), left: 0, top: 0, font: 'Microsoft YaHei', fontSize: 48, color: '#111111' }] : [])] }) });
      const body = await res.json(); if (!res.ok || !body.success) throw new Error(body.message || '导出提交失败');
      setJob({ id: body.data.jobId, exportId: body.data.id }); setStatus('queued');
    } catch (e) { setError(e instanceof Error ? e.message : '导出失败'); }
    finally { setBusy(false); }
  };
  const working = busy || Boolean(job && !['completed', 'failed', 'cancelled'].includes(status));
  return <><button type="button" className="text-xs text-violet-700" onClick={() => { setLayers([...new Map(images.filter((i) => i.selected && i.status === 'completed' && i.outputAssetId).map((i) => [i.outputAssetId, { assetId: i.outputAssetId!, name: i.slotKey, left: 0, top: 0, width, height }])).values()].slice(0, 12)); setOpen(true); }}>PSD 图层组装</button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[85vh] overflow-y-auto bg-white"><DialogHeader><DialogTitle>导出分层 PSD</DialogTitle><DialogDescription>使用已选择的成品作为独立图层，按列表从下到上叠放；可调整每层位置和尺寸。此操作不会自动拆解图片元素。文字以原生文字层保留，字体替换及首次重绘可能因 Photoshop 环境不同而变化。</DialogDescription></DialogHeader>
      <fieldset disabled={working} className="space-y-3 text-xs"><div className="flex gap-3">{([['画布宽', width, setWidth], ['画布高', height, setHeight]] as const).map(([label, value, setter]) => <label key={label}>{label}<input type="number" min={1} max={4096} value={value} onChange={(e) => setter(Number(e.target.value))} className="mt-1 block w-24 rounded border p-2" /></label>)}</div>
        {layers.map((layer, index) => <div key={layer.assetId} className="rounded border p-2"><input aria-label={`图层 ${index + 1} 名称`} value={layer.name} onChange={(e) => setLayers((current) => current.map((item, n) => n === index ? { ...item, name: e.target.value } : item))} className="mb-2 w-full rounded border p-2" /><div className="grid grid-cols-4 gap-2">{(['left', 'top', 'width', 'height'] as const).map((key) => <label key={key}>{({ left: 'X', top: 'Y', width: '宽', height: '高' })[key]}<input aria-label={`图层 ${index + 1} ${key}`} type="number" value={layer[key]} onChange={(e) => setLayers((current) => current.map((item, n) => n === index ? { ...item, [key]: Number(e.target.value) } : item))} className="mt-1 w-full rounded border p-1" /></label>)}</div></div>)}
        <label className="block">标题文字（可选）<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} className="mt-1 w-full rounded border p-2" /></label>
      </fieldset>
      {!layers.length && <p className="text-xs text-amber-700">请先在生成结果中选择成品，再打开图层组装。</p>}{error && <p role="alert" className="text-xs text-rose-600">{error}</p>}
      {status === 'completed' && job && <a href={`/api/image-studio/exports/${job.exportId}/download`} className="text-sm text-violet-700">下载 PSD</a>}
      <button type="button" disabled={working || !layers.length} onClick={() => void start()} className="rounded bg-violet-600 px-3 py-2 text-sm text-white disabled:opacity-50">{working ? '正在后台导出…' : '生成 PSD 文件'}</button>
    </DialogContent></Dialog>
  </>;
}
