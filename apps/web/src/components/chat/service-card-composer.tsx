'use client';

import { useState } from 'react';
import { Plus, Search, Trash2, Upload, X } from 'lucide-react';
import { fetchWithAuth } from '@/lib/auth';
import type { ChatCard } from '@/lib/chat-cards';
import { SERVICE_WORK_TEMPLATES } from '@/lib/service-collaboration-templates';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { ImageAnnotator } from '@/components/chat/image-annotator';

type WorkCard = Extract<ChatCard, { kind: 'work_card' }>;
type Props = { onClose: () => void; onSend: (card: WorkCard) => Promise<boolean | undefined>; initial?: WorkCard; revisionOf?: string; allowedTemplateIds?: string[] };

export function ServiceCardComposer({ onClose, onSend, initial, revisionOf, allowedTemplateIds }: Props) {
  const [templateId, setTemplateId] = useState(initial?.templateId || 'biz_1');
  const [title, setTitle] = useState(initial?.title || SERVICE_WORK_TEMPLATES[0].title);
  const [fields, setFields] = useState(initial?.fields || SERVICE_WORK_TEMPLATES[0].fields.map((field) => ({ ...field })));
  const [attachments, setAttachments] = useState(initial?.attachments || []);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [stylePrompt, setStylePrompt] = useState('');
  const [annotationFile, setAnnotationFile] = useState<File | null>(null);
  const available = allowedTemplateIds ? SERVICE_WORK_TEMPLATES.filter(item => allowedTemplateIds.includes(item.id)) : SERVICE_WORK_TEMPLATES;
  const groups = [...new Set(available.map((item) => item.group))];

  const choose = (id: string) => {
    const template = available.find((item) => item.id === id);
    if (!template) return;
    setTemplateId(id); setTitle(template.title); setFields(template.fields.map((field) => ({ ...field }))); setAttachments([]); setError('');
  };
  const upload = async (file: File) => {
    if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) { setError('仅支持 15 MB 以内的图片'); return; }
    setBusy(true); setError('');
    try {
      const data = new FormData(); data.append('file', file); data.append('folder', 'annotations');
      const response = await fetchWithAuth('/upload', { method: 'POST', body: data });
      const result = await response.json();
      if (!response.ok || !result.success || !result.data?.url) throw new Error(result.message || '上传失败');
      setAttachments((current) => [...current, { name: file.name, url: result.data.url }].slice(0, 8));
    } catch (cause) { setError(cause instanceof Error ? cause.message : '上传失败'); }
    finally { setBusy(false); }
  };
  const send = async () => {
    const clean = fields.map((field) => ({ label: field.label.trim(), value: field.value.trim() })).filter((field) => field.label && field.value);
    if (!title.trim() || !clean.length) { setError('请填写标题和至少一个内容项'); return; }
    if (fields.length > 24 || attachments.length > 8) { setError('最多 24 个内容项和 8 张图片'); return; }
    const card: WorkCard = { kind: 'work_card', templateId, title: title.trim(), fields: clean, attachments, ...(revisionOf ? { revisionOf } : {}) };
    if (JSON.stringify(card).length + 18 > 8000) { setError('卡片内容过长，请精简后发送'); return; }
    setBusy(true); setError('');
    try { if (await onSend(card)) onClose(); }
    finally { setBusy(false); }
  };
  const fillStyles = () => {
    const topic = stylePrompt.trim() || '当前商品';
    const directions = ['极简留白', '自然生活', '科技未来', '国潮文化', '高端质感', '温暖治愈', '动感促销', '编辑式排版'];
    setFields(directions.map((direction, index) => ({ label: `方向 ${index + 1} · ${direction}`, value: `${topic}：以${direction}为视觉方向；请补充主色、构图、文案和参考案例。` })));
  };

  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="创建协作卡片"><div className="flex h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:h-[86dvh] sm:rounded-2xl"><header className="flex items-center justify-between border-b px-5 py-4"><div><p className="text-xs font-semibold text-blue-600">客服协作工具箱</p><h2 className="text-lg font-bold text-slate-900">{revisionOf ? '创建修订版本' : '发送结构化协作卡片'}</h2></div><button onClick={onClose} aria-label="关闭" className="rounded-lg p-2 hover:bg-slate-100"><X className="h-5 w-5" /></button></header><div className="grid min-h-0 flex-1 md:grid-cols-[260px_minmax(0,1fr)]"><aside className="min-h-0 overflow-y-auto border-r bg-slate-50 p-4"><label className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索卡片" className="min-w-0 flex-1 text-sm outline-none" /></label>{groups.map((group) => { const items = available.filter((item) => item.group === group && `${item.title} ${item.description}`.includes(search)); return items.length ? <div key={group} className="mt-4"><p className="mb-2 text-xs font-bold text-slate-500">{group}</p><div className="space-y-1">{items.map((item) => <button key={item.id} type="button" onClick={() => choose(item.id)} className={`w-full rounded-lg px-3 py-2 text-left text-xs ${templateId === item.id ? 'bg-blue-100 font-bold text-blue-700' : 'text-slate-600 hover:bg-white'}`}>{item.title}</button>)}</div></div> : null; })}</aside><main className="min-h-0 overflow-y-auto p-4 sm:p-6"><p className="mb-4 text-xs text-slate-500">逐项填写后发送到当前订单。发送后的卡片保留历史版本；可从消息中创建修订版。</p><label className="block text-xs font-semibold text-slate-700">卡片标题<input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} className="mt-1 w-full rounded-xl border p-3 text-sm outline-none focus:border-blue-400" /></label>{templateId === 'style_matrix' && <div className="mt-4 rounded-xl bg-blue-50 p-3"><p className="text-xs font-semibold text-blue-700">八方向灵感草案</p><div className="mt-2 flex gap-2"><input value={stylePrompt} onChange={(event) => setStylePrompt(event.target.value)} placeholder="输入商品或主题" className="min-w-0 flex-1 rounded-lg border p-2 text-sm" /><button type="button" onClick={fillStyles} className="rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white">生成草案</button></div><p className="mt-1 text-[11px] text-blue-600">使用固定风格框架生成可编辑草案。</p></div>}{templateId === 'case' && <div className="mt-4 flex flex-wrap gap-2">{['极简电商主图', '自然生活场景', '国潮活动海报'].map((name) => <button key={name} type="button" onClick={() => setFields((current) => current.map((field) => field.label === '案例名称' ? { ...field, value: name } : field))} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{name}</button>)}</div>}{templateId === 'size_guide' && <div className="mt-4 flex flex-wrap gap-2">{[['电商主图','800 × 800 px'],['小红书封面','1080 × 1440 px'],['视频封面','1080 × 1920 px']].map(([name,size]) => <button key={name} type="button" onClick={() => setFields((current) => current.map((field) => field.label === '平台' ? { ...field, value: name } : field.label === '宽 × 高' ? { ...field, value: size } : field))} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{name}</button>)}</div>}<div className="mt-5 space-y-3">{fields.map((field, index) => <div key={index} className="rounded-xl border border-slate-200 p-3"><div className="flex gap-2"><input value={field.label} onChange={(event) => setFields((current) => current.map((item, i) => i === index ? { ...item, label: event.target.value } : item))} maxLength={80} aria-label={`第 ${index + 1} 项名称`} className="min-w-0 flex-1 border-b pb-2 text-xs font-bold text-slate-700 outline-none focus:border-blue-400" /><button type="button" onClick={() => setFields((current) => current.filter((_, i) => i !== index))} aria-label={`删除第 ${index + 1} 项`}><Trash2 className="h-4 w-4 text-slate-400" /></button></div>{templateId === 'palette' && field.label.endsWith('HEX') && <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(field.value) ? field.value : '#3b82f6'} onChange={(event) => setFields((current) => current.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} aria-label={field.label} className="mt-2 h-9 w-14 cursor-pointer" />}<textarea value={field.value} onChange={(event) => setFields((current) => current.map((item, i) => i === index ? { ...item, value: event.target.value } : item))} maxLength={800} rows={field.label.includes('说明') || field.label.includes('清单') ? 3 : 2} placeholder={`填写${field.label}`} className="mt-2 w-full resize-y text-sm text-slate-800 outline-none" /></div>)}</div><button type="button" onClick={() => setFields((current) => [...current, { label: '', value: '' }])} disabled={fields.length >= 24} className="mt-3 flex items-center gap-1 rounded-lg border border-dashed px-3 py-2 text-xs text-blue-600 disabled:opacity-40"><Plus className="h-4 w-4" />增加 SKU / 参考 / 修改点</button><div className="mt-6 border-t pt-5"><p className="text-xs font-bold text-slate-700">参考图与批注图（最多 8 张）</p><p className="mt-1 text-xs text-slate-400">图片会上传并随卡片保存；具体修改点请在卡片内容中填写。</p><label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs text-slate-600"><Upload className="h-4 w-4" />上传图片<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={busy || attachments.length >= 8} onChange={(event) => { const file = event.target.files?.[0]; if (file) { if (templateId === 'annotation') setAnnotationFile(file); else void upload(file); } event.target.value = ''; }} /></label><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{attachments.map((item, index) => <div key={`${item.url}-${index}`} className="relative overflow-hidden rounded-lg border"><AuthenticatedImage src={item.url} alt={item.name} className="aspect-square w-full object-cover" /><button type="button" onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))} aria-label="删除图片" className="absolute right-1 top-1 rounded-full bg-white p-1"><X className="h-3 w-3" /></button><p className="truncate p-1 text-[10px]">{item.name}</p></div>)}</div></div></main></div><footer className="flex items-center justify-between gap-3 border-t px-5 py-3"><p role={error ? 'alert' : undefined} className="text-xs text-rose-600">{error || '发送后会保存为订单协作记录'}</p><button type="button" disabled={busy} onClick={() => void send()} className="shrink-0 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{busy ? '处理中…' : '发送卡片'}</button></footer></div>{annotationFile && <ImageAnnotator file={annotationFile} onCancel={() => setAnnotationFile(null)} onSave={(file, notes) => { setAnnotationFile(null); setFields((current) => [...current.filter((field) => !field.label.startsWith('批注 ')), ...notes.map((value, index) => ({ label: `批注 ${index + 1}`, value }))]); void upload(file); }} />}</div>;
}
