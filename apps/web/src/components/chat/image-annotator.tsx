'use client';

import { useEffect, useRef, useState } from 'react';

type Tool = 'pin' | 'rect' | 'circle' | 'arrow';
type Mark = { tool: Tool; x: number; y: number; x2: number; y2: number; note: string };
const tools: Array<{ id: Tool; label: string }> = [{ id: 'pin', label: '编号点' }, { id: 'rect', label: '矩形圈选' }, { id: 'circle', label: '圆形圈选' }, { id: 'arrow', label: '箭头指向' }];

export function ImageAnnotator({ file, onCancel, onSave }: { file: File; onCancel: () => void; onSave: (file: File, notes: string[]) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [tool, setTool] = useState<Tool>('pin');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { imageRef.current = image; setReady(true); };
    image.onerror = () => setError('图片读取失败，请重新上传');
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const canvas = canvasRef.current; const image = imageRef.current;
    if (!canvas || !image || !ready) return;
    const width = Math.min(1200, image.naturalWidth);
    const height = Math.round(width * image.naturalHeight / image.naturalWidth);
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.drawImage(image, 0, 0, width, height);
    ctx.strokeStyle = '#ef4444'; ctx.fillStyle = '#ef4444'; ctx.lineWidth = Math.max(3, width / 250);
    marks.forEach((mark, index) => {
      const x = mark.x * width; const y = mark.y * height;
      const x2 = mark.x2 * width; const y2 = mark.y2 * height;
      if (mark.tool === 'pin') {
        ctx.beginPath(); ctx.arc(x, y, Math.max(14, width / 45), 0, Math.PI * 2); ctx.fill();
      } else if (mark.tool === 'rect') {
        ctx.strokeRect(Math.min(x, x2), Math.min(y, y2), Math.abs(x2 - x), Math.abs(y2 - y));
      } else if (mark.tool === 'circle') {
        ctx.beginPath(); ctx.ellipse((x + x2) / 2, (y + y2) / 2, Math.max(2, Math.abs(x2 - x) / 2), Math.max(2, Math.abs(y2 - y) / 2), 0, 0, Math.PI * 2); ctx.stroke();
      } else {
        const angle = Math.atan2(y2 - y, x2 - x);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - 22 * Math.cos(angle - Math.PI / 6), y2 - 22 * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(x2, y2); ctx.lineTo(x2 - 22 * Math.cos(angle + Math.PI / 6), y2 - 22 * Math.sin(angle + Math.PI / 6)); ctx.stroke();
      }
      const labelX = Math.max(16, Math.min(width - 16, x));
      const labelY = Math.max(16, Math.min(height - 16, y));
      if (mark.tool !== 'pin') { ctx.beginPath(); ctx.arc(labelX, labelY, 15, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#fff'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(index + 1), labelX, labelY);
      ctx.fillStyle = '#ef4444';
    });
  }, [marks, ready]);

  const position = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (marks.length >= 12) return;
    startRef.current = position(event); event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const start = startRef.current; startRef.current = null;
    if (!start || marks.length >= 12) return;
    let end = position(event);
    if (tool !== 'pin' && Math.abs(end.x - start.x) + Math.abs(end.y - start.y) < 0.02) end = { x: Math.min(1, start.x + 0.1), y: Math.min(1, start.y + 0.1) };
    setMarks(current => [...current, { tool, ...start, x2: end.x, y2: end.y, note: '' }]);
  };
  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas || !marks.length || marks.some(mark => !mark.note.trim())) return;
    canvas.toBlob(blob => {
      if (!blob) { setError('批注图片生成失败，请重试'); return; }
      onSave(new File([blob], `批注-${file.name.replace(/\.[^.]+$/, '')}.png`, { type: 'image/png' }), marks.map((mark, index) => `${index + 1}. ${mark.note.trim()}`));
    }, 'image/png');
  };

  return <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/70 p-3" role="dialog" aria-modal="true" aria-label="图片批注"><div className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white">
    <header className="flex items-center justify-between border-b p-4"><div><h3 className="font-bold">多点视觉批注</h3><p className="text-xs text-slate-500">选择标记工具，在图片上点击或拖拽，再填写每处修改意见</p></div><button type="button" onClick={onCancel} className="text-sm text-slate-500">关闭</button></header>
    <div className="flex flex-wrap gap-2 border-b p-3">{tools.map(item => <button key={item.id} type="button" onClick={() => setTool(item.id)} className={`rounded-lg px-3 py-2 text-xs ${tool === item.id ? 'bg-rose-100 font-bold text-rose-700' : 'bg-slate-100 text-slate-600'}`}>{item.label}</button>)}<button type="button" onClick={() => setMarks([])} disabled={!marks.length} className="ml-auto text-xs text-slate-500 disabled:opacity-40">清空标记</button></div>
    <div className="min-h-0 overflow-y-auto p-4"><canvas ref={canvasRef} onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={() => { startRef.current = null; }} className="mx-auto max-h-[55dvh] max-w-full cursor-crosshair rounded-lg border object-contain" style={{ touchAction: 'none' }} aria-label="拖拽添加批注标记" />{marks.map((mark, index) => <label key={index} className="mt-2 flex items-center gap-2 text-sm"><span className="w-6 shrink-0 font-bold text-rose-600">{index + 1}</span><input value={mark.note} onChange={event => setMarks(current => current.map((item, i) => i === index ? { ...item, note: event.target.value } : item))} maxLength={200} placeholder="描述此处要修改的内容" className="min-w-0 flex-1 rounded-lg border p-2" /><button type="button" onClick={() => setMarks(current => current.filter((_, i) => i !== index))} className="text-xs text-slate-500">删除</button></label>)}{error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}</div>
    <footer className="flex justify-between gap-3 border-t p-4"><button type="button" onClick={() => setMarks(current => current.slice(0, -1))} disabled={!marks.length} className="text-sm text-slate-500 disabled:opacity-40">撤销上一个</button><button type="button" onClick={save} disabled={!marks.length || marks.some(mark => !mark.note.trim())} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">保存批注图</button></footer>
  </div></div>;
}
