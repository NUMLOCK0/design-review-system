'use client';
import { useRef, useState } from 'react';
import { FileText, Loader2, Paperclip } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/auth';
import { materialClipboardFiles } from './material-clipboard';

type Asset = { id: string; kind: string; role: string; filename: string; mimeType: string; previewUrl: string; size?: number };
const labels: Record<string, string> = { product: '商品图', brand_logo: '品牌 Logo', packaging: '包装素材', competitor: '竞品参考', other: '其他图片', report: 'PDF 文档' };
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(path, options); const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || '素材操作失败');
  return result.data as T;
}

export function MaterialsPanel({ projectId, assets, onRefresh }: { projectId: string; assets: Asset[]; onRefresh: () => Promise<void> }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false);
  const [imageRole, setImageRole] = useState('other'); const fileRef = useRef<HTMLInputElement>(null);
  const materials = assets.filter((asset) => asset.kind === 'document' && asset.role === 'report' || asset.kind === 'image' && Object.hasOwn(labels, asset.role));
  const upload = async (files: FileList | File[] | null) => {
    const list = Array.from(files || []); if (!list.length || busy) return;
    setBusy(true); let completed = 0;
    try {
      for (const file of list) {
        const pdf = file.type === 'application/pdf' && /\.pdf$/i.test(file.name);
        if (!(pdf || ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) || file.size <= 0 || file.size > 25 * 1024 * 1024) throw new Error(`「${file.name}」不受支持，请选择 25 MB 以内的 PDF、PNG、JPEG、WebP 或 GIF`);
        const signed = await request<{ assetId: string; uploadUrl: string; contentType: string }>('/upload/presign', { method: 'POST', body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size, folder: 'image-studio' }) });
        const uploaded = await fetch(signed.uploadUrl, { method: 'PUT', headers: { 'Content-Type': signed.contentType }, body: file, redirect: 'error' });
        if (!uploaded.ok) throw new Error(`「${file.name}」上传失败`);
        await request('/upload/complete', { method: 'POST', body: JSON.stringify({ assetId: signed.assetId }) });
        await request(`/image-studio/projects/${projectId}/assets`, { method: 'POST', body: JSON.stringify({ mediaAssetId: signed.assetId, role: pdf ? 'report' : imageRole }) });
        completed++;
      }
      toast.success(`已整理 ${completed} 个素材`);
    } catch (error) { toast.error(`${error instanceof Error ? error.message : '素材上传失败'}${completed ? `；已保存 ${completed} 个素材` : ''}`); }
    finally { await onRefresh().catch(() => toast.error('素材列表刷新失败')); setBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  };
  const pasteMaterials = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const items = materialClipboardFiles(event.clipboardData);
    if (!items.length) return;
    event.preventDefault(); event.stopPropagation();
    if (busy) { toast.error('正在上传素材，请稍后再粘贴'); return; }
    void upload(items);
  };
  const download = async (asset: Asset) => {
    try {
      const response = await fetchWithAuth(`/image-studio/assets/${encodeURIComponent(asset.id)}/download`);
      if (!response.ok) throw new Error('下载失败');
      const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = asset.filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { toast.error(error instanceof Error ? error.message : '下载失败'); }
  };
  return <div data-canvas-shortcuts-ignore onPaste={open ? pasteMaterials : undefined} className="mb-3 rounded-xl border border-slate-200 bg-white"><button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between p-3 text-left text-sm font-medium text-slate-700"><span className="flex items-center gap-2"><Paperclip className="size-4" />项目素材 <span className="text-xs font-normal text-slate-400">{materials.length} 项</span></span><span className="text-xs text-violet-600">{open ? '收起' : '整理素材'}</span></button>{open && <div className="space-y-3 border-t border-slate-100 p-3"><div className="flex flex-wrap items-center gap-2 text-xs"><label>上传图片归类为 <select value={imageRole} disabled={busy} onChange={(e) => setImageRole(e.target.value)} className="rounded border px-2 py-1">{['other', 'product', 'brand_logo', 'packaging', 'competitor'].map((role) => <option key={role} value={role}>{labels[role]}</option>)}</select></label><button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className="rounded-lg bg-violet-600 px-3 py-1.5 text-white disabled:opacity-50">{busy ? <><Loader2 className="mr-1 inline size-3 animate-spin" />上传中</> : '上传素材'}</button><input ref={fileRef} type="file" multiple accept="application/pdf,.pdf,image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => void upload(e.target.files)} /></div><div role="group" tabIndex={0} aria-label="粘贴素材区域" className="rounded-lg border border-dashed border-violet-200 bg-violet-50/40 px-3 py-3 text-center text-xs text-slate-600 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100">点击此处后按 Ctrl+V / ⌘V 粘贴图片或剪贴板支持的 PDF 文件</div><p className="text-xs text-slate-500">PDF 自动归类为文档（包括检测报告）。可在商品调查中读取；提取内容需对照原件核实。</p>{materials.length ? <div className="max-h-64 space-y-2 overflow-y-auto">{materials.map((asset) => <div key={asset.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-100 p-2"><div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded bg-slate-50">{asset.kind === 'image' ? <img src={asset.previewUrl} alt="" className="size-full object-contain" /> : <FileText className="size-5 text-slate-400" />}</div><div className="min-w-0 flex-1"><p className="truncate text-xs" title={asset.filename}>{asset.filename}</p><p className="text-[10px] text-slate-400">{labels[asset.role] || asset.role}</p></div>{asset.kind === 'image' ? <select aria-label={`更改素材分类：${asset.filename}`} value={asset.role} disabled={busy} onChange={(event) => { const role = event.target.value; setBusy(true); void request(`/image-studio/projects/${projectId}/assets/${asset.id}`, { method: 'PATCH', body: JSON.stringify({ role }) }).then(onRefresh).catch((error) => toast.error(error instanceof Error ? error.message : '分类保存失败')).finally(() => setBusy(false)); }} className="max-w-24 rounded border px-1 py-1 text-xs">{['product', 'brand_logo', 'packaging', 'competitor', 'other'].map((role) => <option key={role} value={role}>{labels[role]}</option>)}</select> : <button type="button" onClick={() => void download(asset)} className="rounded border px-2 py-1 text-xs">下载</button>}<button type="button" disabled={busy} aria-label={`从项目移除：${asset.filename}`} onClick={() => { setBusy(true); void request(`/image-studio/projects/${projectId}/assets/${asset.id}`, { method: 'DELETE' }).then(onRefresh).catch((error) => toast.error(error instanceof Error ? error.message : '移除失败')).finally(() => setBusy(false)); }} className="rounded border px-2 py-1 text-xs text-slate-500 disabled:opacity-50">移除</button></div>)}</div> : <p className="text-xs text-slate-400">暂无素材</p>}</div>}</div>;
}
