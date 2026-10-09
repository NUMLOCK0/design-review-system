'use client';

import { useState } from 'react';
import { ListChecks } from 'lucide-react';
import { ToolDialog } from './tool-dialog';
import { ToolButton, primaryClass, type SendCard } from './tool-ui';

const checks = ['文案、数字和价格已核对', '抠图边缘与瑕疵已检查', '分辨率和尺寸符合目标平台', '字体、图片与肖像授权已核对', '源文件图层、命名和交付格式已检查'];

export function QualityTool({ onSend }: { onSend: SendCard }) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<boolean[]>(checks.map(() => false));
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const send = async () => {
    if (checked.some(value => !value)) { setError('请逐项完成自检后再发送'); return; }
    setBusy(true); setError('');
    try { if (await onSend({ kind: 'work_card', templateId: 'quality', title: '交付质量自检记录', fields: checks.map(label => ({ label, value: '已核对' })), attachments: [] })) setOpen(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '发送失败'); }
    finally { setBusy(false); }
  };
  return <><ToolButton icon={ListChecks} label="品质自检" description="逐项核对交付质量，保存自检记录" onClick={() => setOpen(true)} />{open && <ToolDialog title="交付前品质自检" description="此卡记录自检结果；正式交付与验收仍由订单流程处理。" onClose={() => setOpen(false)} footer={<div className="flex items-center justify-between gap-3"><p role={error ? 'alert' : undefined} className="text-xs text-rose-600">{error}</p><button type="button" disabled={busy || checked.some(value => !value)} onClick={() => void send()} className={primaryClass}>发送自检记录</button></div>}><div className="space-y-2">{checks.map((label, index) => <label key={label} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm"><input type="checkbox" checked={checked[index]} onChange={() => setChecked(current => current.map((value, i) => i === index ? !value : value))} />{label}</label>)}</div></ToolDialog>}</>;
}
