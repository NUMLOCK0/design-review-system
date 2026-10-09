'use client';

import { useState } from 'react';
import { FileInput } from 'lucide-react';
import { ORDER_FORM_PRESETS } from '@design-review/shared';
import { ToolDialog } from './tool-dialog';
import { ToolButton, createToolForm, primaryClass } from './tool-ui';

export function StandardOrderTool({ orderId, onSent }: { orderId: string; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(ORDER_FORM_PRESETS[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const preset = ORDER_FORM_PRESETS.find(item => item.id === selected)!;
  const send = async () => {
    setBusy(true); setError('');
    try { await createToolForm(orderId, 'preset', { presetId: selected }); setOpen(false); onSent(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '发送失败'); }
    finally { setBusy(false); }
  };
  return <><ToolButton icon={FileInput} label="标准发单" description="发送 13 类平台标准需求表单，品牌方可直接填写" onClick={() => setOpen(true)} />{open && <ToolDialog title="标准发单" description="选择业务类别；发送后品牌方可在当前订单中填写、保存和提交。" onClose={() => setOpen(false)} footer={<div className="flex items-center justify-between gap-3"><p role={error ? 'alert' : undefined} className="text-xs text-rose-600">{error}</p><button type="button" disabled={busy} onClick={() => void send()} className={primaryClass}>{busy ? '发送中…' : '发送填写表单'}</button></div>}><div className="grid gap-4 md:grid-cols-[200px_1fr]"><div className="max-h-96 space-y-1 overflow-y-auto">{ORDER_FORM_PRESETS.map(item => <button key={item.id} type="button" onClick={() => setSelected(item.id)} className={`w-full rounded-lg px-3 py-2 text-left text-xs ${selected === item.id ? 'bg-indigo-50 font-bold text-indigo-700' : 'hover:bg-slate-50'}`}>{item.name}</button>)}</div><div><h3 className="text-sm font-bold">{preset.name}</h3><p className="mt-1 text-xs text-slate-500">{preset.description}</p><div className="mt-4 space-y-3">{preset.sections.map(section => <div key={section.title} className="rounded-lg border p-3"><p className="text-xs font-semibold text-slate-700">{section.title}</p><p className="mt-2 text-xs leading-5 text-slate-500">{section.fields.map(field => field.label).join('、')}</p></div>)}</div></div></div></ToolDialog>}</>;
}
