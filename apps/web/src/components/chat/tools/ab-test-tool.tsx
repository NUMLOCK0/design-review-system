'use client';

import { useState } from 'react';
import { Scale } from 'lucide-react';
import { ToolDialog } from './tool-dialog';
import { ToolButton, inputClass, primaryClass, type SendCard } from './tool-ui';

export function AbTestTool({ onSend }: { onSend: SendCard }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('视觉方向 A/B 盲测');
  const [a, setA] = useState(''); const [aDetail, setADetail] = useState('');
  const [b, setB] = useState(''); const [bDetail, setBDetail] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const send = async () => {
    if (![title, a, aDetail, b, bDetail].every(value => value.trim())) { setError('请填写标题和两套方案的名称、说明'); return; }
    setBusy(true); setError('');
    try { if (await onSend({ kind: 'proposal', title: title.trim(), optionA: a.trim(), optionB: b.trim(), detailA: aDetail.trim(), detailB: bDetail.trim() })) setOpen(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '发送失败'); }
    finally { setBusy(false); }
  };
  return <><ToolButton icon={Scale} label="A/B盲测" description="发送两套方案供品牌方选定" onClick={() => setOpen(true)} />{open && <ToolDialog title="A/B 风格盲测" description="只展示方案内容；品牌方的选择会保存为聊天决策记录。" onClose={() => setOpen(false)} footer={<div className="flex items-center justify-between gap-3"><p role={error ? 'alert' : undefined} className="text-xs text-rose-600">{error}</p><button type="button" disabled={busy} onClick={() => void send()} className={primaryClass}>发送 A/B 选择卡</button></div>}><div className="space-y-4"><label className="block text-xs font-semibold">卡片标题<input value={title} onChange={event => setTitle(event.target.value)} maxLength={80} className={`${inputClass} mt-1`} /></label>{([['A', a, setA, aDetail, setADetail], ['B', b, setB, bDetail, setBDetail]] as const).map(([key, name, setName, detail, setDetail]) => <div key={key} className="rounded-xl border p-3"><p className="text-xs font-bold text-indigo-700">方案 {key}</p><input value={name} onChange={event => setName(event.target.value)} maxLength={80} placeholder="方案名称" className={`${inputClass} mt-2`} /><textarea value={detail} onChange={event => setDetail(event.target.value)} maxLength={600} rows={3} placeholder="构图、色彩、核心优势" className={`${inputClass} mt-2 resize-y`} /></div>)}</div></ToolDialog>}</>;
}
