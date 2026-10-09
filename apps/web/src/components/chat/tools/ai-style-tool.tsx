'use client';

import { useState } from 'react';
import { WandSparkles } from 'lucide-react';
import { ToolDialog } from './tool-dialog';
import { ToolButton, inputClass, primaryClass, type SendCard } from './tool-ui';

const styles = [
  ['新中式禅意微墨', '东方美学 · 呼吸感', '宣纸微纹、黛绿与素白水墨、宋体留白'],
  ['现代极简科技', '冷白通透 · 3D光影', '冷白背景、悬浮硬光、清晰参数层级'],
  ['自然有机治愈', '原木暖调 · 亲和力', '原木场景、晨曦柔光、自然生活感'],
  ['轻奢高定黑金', '哑光黑金 · 大牌感', '黑金配色、局部聚光、精致衬线字'],
  ['多巴胺新锐撞色', '活力吸睛 · 转化率', '高饱和撞色、动态几何构图'],
  ['3D立体悬浮空间', '悬浮展台 · 空间感', '立体展台、边缘轮廓光与景深'],
  ['杂志画报复古风', '胶片质感 · 文艺排版', '复古颗粒、画报排版与古典字体'],
  ['幻彩极光渐变风', '光晕流动 · 潮流美学', '弥散光晕、磨砂玻璃和渐变高光'],
] as const;
const palettes = [['#234e40', '#d4af37'], ['#0284c7', '#e0f2fe'], ['#78350f', '#fef3c7'], ['#0f172a', '#eab308'], ['#10b981', '#f43f5e'], ['#6366f1', '#a855f7'], ['#44403c', '#b91c1c'], ['#ec4899', '#06b6d4']];

export function AiStyleTool({ requirements, onSend }: { requirements: string; onSend: SendCard }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [selected, setSelected] = useState(styles.map((_, index) => index));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const send = async () => {
    if (!prompt.trim()) { setError('请填写客户诉求或从订单需求提取'); return; }
    if (selected.length < 2) { setError('请至少保留两个风格方向'); return; }
    setBusy(true); setError('');
    try {
      const sent = await onSend({ kind: 'choice', source: 'style', title: '视觉风格 8 选 1', prompt: prompt.trim().slice(0, 500), options: selected.map(index => ({ id: `style_${index + 1}`, label: styles[index][0], detail: `${styles[index][1]}；${styles[index][2]}` })) });
      if (sent) setOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '发送失败'); }
    finally { setBusy(false); }
  };
  return <><ToolButton icon={WandSparkles} label="AI风格8选1" description="整理八个风格方向，请品牌方在聊天中选定" onClick={() => setOpen(true)} />{open && <ToolDialog title="视觉风格 8 选 1" description="先用风格框架整理可选方向；尚未连接 AI 生图服务，不会生成效果图。" onClose={() => setOpen(false)} footer={<div className="flex items-center justify-between gap-3"><p role={error ? 'alert' : undefined} className="text-xs text-rose-600">{error}</p><button type="button" disabled={busy} onClick={() => void send()} className={primaryClass}>{busy ? '发送中…' : '发送风格选择卡'}</button></div>}><label className="text-xs font-semibold text-slate-700">客户诉求<textarea value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={500} rows={3} placeholder="输入产品、目标人群和风格诉求" className={`${inputClass} mt-2 resize-y`} /></label><button type="button" onClick={() => setPrompt(requirements.slice(0, 500))} className="mt-2 text-xs font-semibold text-indigo-600">从当前订单需求提取</button><div className="mt-5 grid gap-2 sm:grid-cols-2">{styles.map((style, index) => <label key={style[0]} className={`flex cursor-pointer items-start gap-2 rounded-xl border p-3 ${selected.includes(index) ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200'}`}><input type="checkbox" checked={selected.includes(index)} onChange={() => setSelected(current => current.includes(index) ? current.filter(item => item !== index) : [...current, index].sort())} /><span className="h-12 w-12 shrink-0 rounded-lg" style={{ background: `linear-gradient(135deg, ${palettes[index][0]}, ${palettes[index][1]})` }} /><span><span className="block text-xs font-bold">{style[0]}</span><span className="mt-1 block text-[11px] text-slate-500">{style[1]} · {style[2]}</span></span></label>)}</div></ToolDialog>}</>;
}
