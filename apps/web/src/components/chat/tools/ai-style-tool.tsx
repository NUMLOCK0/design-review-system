'use client';

import { useMemo, useState } from 'react';
import { Check, LoaderCircle, RefreshCw, Upload, WandSparkles } from 'lucide-react';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { parseChatCard } from '@/lib/chat-cards';
import { fetchWithAuth } from '@/lib/auth';
import { uploadFile } from '@/lib/upload';
import { ToolDialog } from './tool-dialog';
import { ToolButton, inputClass, primaryClass, type SendCard } from './tool-ui';

type ConversationMessage = { id: string; senderName: string; body: string; createdAt?: string };
type Reference = { id: string; name: string; url: string; source: 'chat' | 'upload'; senderName?: string; createdAt?: string };
type Palette = { role: string; hex: string };
type StyleDirection = { id: string; name: string; mood: string; colors: Palette[] };
type GeneratedStyles = { summary: string; styles: StyleDirection[] };
type AiModel = { id: string; name: string; model: string | null; capability: 'text' | 'vision' | 'image' };

export function AiStyleTool({ conversationId, requirements, messages, onSend, intakeMode = false }: {
  conversationId: string;
  requirements: string;
  messages: ConversationMessage[];
  onSend: SendCard;
  intakeMode?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [selectedReferences, setSelectedReferences] = useState<string[]>([]);
  const [uploadedReferences, setUploadedReferences] = useState<Reference[]>([]);
  const [generated, setGenerated] = useState<GeneratedStyles | null>(null);
  const [models, setModels] = useState<AiModel[]>([]);
  const [modelProfileId, setModelProfileId] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const conversationReferences = useMemo(() => {
    const found = new Map<string, Reference>();
    for (const message of messages) {
      const card = parseChatCard(message.body);
      const attachments = card?.kind === 'work_card' || card?.kind === 'choice' ? card.attachments || [] : [];
      for (const attachment of attachments) {
        const match = /\/api\/upload\/(?:previews|assets)\/([a-zA-Z0-9_-]+)/.exec(attachment.url);
        if (match && !found.has(match[1])) found.set(match[1], { id: match[1], name: attachment.name, url: attachment.url, source: 'chat', senderName: message.senderName, createdAt: message.createdAt });
      }
      // Some older/imported messages store an image URL directly in the message body
      // instead of a structured card attachment. Keep those selectable too.
      for (const match of message.body.matchAll(/\/api\/upload\/(?:previews|assets)\/([a-zA-Z0-9_-]+)/g)) {
        const id = match[1];
        if (id && !found.has(id)) found.set(id, { id, name: `聊天图片 · ${message.senderName}`, url: match[0], source: 'chat', senderName: message.senderName, createdAt: message.createdAt });
      }
    }
    return [...found.values()];
  }, [messages]);
  const references = useMemo(() => [...conversationReferences, ...uploadedReferences].filter((item, index, all) => all.findIndex(other => other.id === item.id) === index), [conversationReferences, uploadedReferences]);

  const openTool = () => {
    setDescription(requirements.slice(0, 2000));
    setSelectedReferences(conversationReferences.slice(-4).map(item => item.id));
    setGenerated(null);
    setError('');
    setOpen(true);
    void (async () => {
      try {
        const response = await fetchWithAuth('/image-studio/model-profiles');
        const result = await response.json();
        if (!response.ok || !result?.success) throw new Error(result?.message || '加载 AI 模型失败');
        const chatModels = (Array.isArray(result.data) ? result.data as AiModel[] : []).filter((item) => item.capability === 'text' || item.capability === 'vision');
        const available = chatModels.some((item) => item.capability === 'vision') ? chatModels.filter((item) => item.capability === 'vision') : chatModels;
        setModels(available);
        setModelProfileId((current) => available.some((item) => item.id === current) ? current : available[0]?.id || '');
        if (!available.length) setError('没有已启用的图文模型档案，请联系管理员在模型设置中配置。');
      } catch (cause) { setError(cause instanceof Error ? cause.message : '加载 AI 模型失败'); }
    })();
  };
  const toggleReference = (id: string) => {
    setSelectedReferences(current => current.includes(id) ? current.filter(item => item !== id) : current.length >= 6 ? current : [...current, id]);
    setGenerated(null);
  };
  const uploadReference = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('请选择图片文件'); return; }
    if (file.size > 20 * 1024 * 1024) { setError('参考图不能超过 20 MB'); return; }
    if (uploadedReferences.length >= 8) { setError('最多上传 8 张图片'); return; }
    setUploading(true); setError('');
    try {
      const result = await uploadFile(file, 'order-reference-images');
      const item: Reference = { id: result.assetId, name: result.filename, url: result.url, source: 'upload' };
      setUploadedReferences(current => [...current, item]);
      setSelectedReferences(current => current.length < 6 ? [...current, item.id] : current);
      setGenerated(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '参考图上传失败'); }
    finally { setUploading(false); }
  };
  const generate = async () => {
    if (!modelProfileId) { setError('请先选择一个已启用的模型'); return; }
    setBusy(true); setError(''); setGenerated(null);
    try {
      const response = await fetchWithAuth('/chat/style-directions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationType: intakeMode ? 'intake' : 'order', conversationId, description: description.trim(), referenceImageIds: selectedReferences, modelProfileId: modelProfileId }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(result?.message || 'AI 风格生成失败');
      if (!Array.isArray(result.data?.styles) || result.data.styles.length !== 8) throw new Error('AI 没有返回完整的 8 种风格，请重试');
      setGenerated({ summary: String(result.data.summary || ''), styles: result.data.styles as StyleDirection[] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'AI 风格生成失败'); }
    finally { setBusy(false); }
  };
  const send = async () => {
    if (!generated || generated.styles.length !== 8) return;
    setBusy(true); setError('');
    try {
      const prompt = [`聊天识别：${generated.summary}`, description.trim() ? `补充说明：${description.trim()}` : ''].filter(Boolean).join('；').slice(0, 500);
      const attachments = references.filter(item => selectedReferences.includes(item.id)).slice(0, 8).map(({ name, url }) => ({ name: name.slice(0, 120), url }));
      const sent = await onSend({ kind: 'choice', source: 'style', title: 'AI 配色风格 8 选 1', prompt, options: generated.styles.map(style => ({ id: style.id, label: style.name, detail: `${style.mood} · ${style.colors.map(color => `${color.role} ${color.hex}`).join(' / ')}` })), ...(attachments.length ? { attachments } : {}) });
      if (sent) setOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '风格卡发送失败'); }
    finally { setBusy(false); }
  };

  return <>
    <ToolButton icon={WandSparkles} label="AI风格8选1" description="识别会话需求和参考图，生成八组定制配色" onClick={openTool} />
    {open && <ToolDialog title="AI 配色风格 8 选 1" description="AI 会读取当前会话记录、订单需求和你选中的参考图，生成 8 组可比较的配色提案。" onClose={() => !busy && !uploading && setOpen(false)} footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between"><p role={error ? 'alert' : undefined} className="min-h-5 text-xs text-rose-600">{error}</p><div className="flex justify-end gap-2"><button type="button" disabled={busy || uploading || !modelProfileId} onClick={() => void generate()} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 px-3 py-2 text-xs font-semibold text-indigo-700 disabled:opacity-40">{busy && !generated ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{generated ? '重新生成' : '生成 8 组配色'}</button><button type="button" disabled={busy || uploading || !generated} onClick={() => void send()} className={primaryClass}>{busy && generated ? '发送中…' : '发送到聊天'}</button></div></div>}>
      <div className="space-y-5">
        <section className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-indigo-800">已读取当前会话</p><p className="mt-1 text-[11px] leading-5 text-slate-500">{messages.length} 条消息 · 自动提取沟通内容、表单答案与历史协作卡片</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-indigo-600 shadow-sm">AI 识别</span></div>
          <label className="mt-3 block text-xs font-semibold text-slate-700">补充风格要求 <span className="font-normal text-slate-400">可选</span><textarea value={description} onChange={event => { setDescription(event.target.value); setGenerated(null); }} maxLength={2000} rows={3} placeholder="例如：更年轻、适合母婴人群，避免大面积粉色；保持品牌的自然感。" className={`${inputClass} mt-2 resize-y bg-white/90`} /></label>
          {requirements.trim() && <p className="mt-2 text-[10px] text-slate-400">已自动带入订单需求，可在上方补充具体偏好。</p>}
          <label className="mt-3 block text-xs font-semibold text-slate-700">图文理解模型<select value={modelProfileId} onChange={(event) => { setModelProfileId(event.target.value); setGenerated(null); }} disabled={!models.length || busy} className={`${inputClass} mt-2 bg-white`}><option value="">选择已启用模型</option>{models.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.model || '默认模型'}</option>)}</select><span className="mt-1 block text-[10px] font-normal text-slate-400">此任务会发送选中的参考图，请选择支持图像输入的模型。</span></label>
        </section>

        <section>
          <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-bold text-slate-800">参考图</h3><p className="mt-1 text-[11px] text-slate-400">直接从当前聊天记录点选图片，也可上传；最多选 6 张</p></div><label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-700"><Upload className="h-3.5 w-3.5" />{uploading ? '上传中…' : '上传图片'}<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" disabled={uploading || uploadedReferences.length >= 8} onChange={event => { void uploadReference(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label></div>
          {references.length ? <div className="mt-3 grid max-h-80 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">{references.map(item => { const selected = selectedReferences.includes(item.id); return <button key={item.id} type="button" aria-pressed={selected} onClick={() => toggleReference(item.id)} className={`group relative overflow-hidden rounded-xl border text-left ${selected ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200'}`}><AuthenticatedImage src={item.url} alt={item.name} className="aspect-square w-full object-cover" /><span className="absolute left-1.5 top-1.5 rounded-md bg-slate-950/65 px-1.5 py-1 text-[9px] text-white">{item.source === 'chat' ? `聊天 · ${item.senderName || '图片'}` : '新上传'}</span><span className={`absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full ${selected ? 'bg-indigo-600 text-white' : 'bg-white/90 text-slate-400'}`}>{selected ? <Check className="h-3 w-3" /> : <span className="text-[10px]">＋</span>}</span><span className="block truncate bg-white px-2 py-1.5 text-[10px] text-slate-600">{item.name}</span><span className="block truncate bg-white px-2 pb-1.5 text-[9px] text-slate-400">{item.createdAt ? new Date(item.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : item.source === 'chat' ? '来自聊天记录' : ''}</span></button>; })}</div> : <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center"><p className="text-xs font-medium text-slate-600">聊天中还没有可用参考图</p><p className="mt-1 text-[10px] text-slate-400">聊天中的卡片图片会自动列在这里；也可上传商品图或品牌视觉</p></div>}
        </section>

        {generated && <section>
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2.5"><p className="text-[10px] font-bold text-emerald-800">需求识别摘要</p><p className="mt-1 text-xs leading-5 text-emerald-900">{generated.summary}</p></div>
          <div className="mt-4 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-800">8 组配色提案</h3><span className="text-[10px] text-slate-400">发送后由品牌方选择 1 组</span></div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">{generated.styles.map((style, index) => <article key={style.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex h-10">{style.colors.map(color => <span key={`${style.id}-${color.role}`} className="flex-1" style={{ backgroundColor: color.hex }} title={`${color.role} ${color.hex}`} />)}</div><div className="p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold text-slate-800">0{index + 1} · {style.name}</p><p className="mt-1 text-[10px] text-slate-500">{style.mood}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] text-slate-500">配色方案</span></div><div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1">{style.colors.map(color => <p key={`${style.id}-${color.role}-label`} className="truncate text-[9px] text-slate-400">{color.role} <span className="font-mono text-slate-600">{color.hex}</span></p>)}</div></div></article>)}</div>
        </section>}
      </div>
    </ToolDialog>}
  </>;
}
