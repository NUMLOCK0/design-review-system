'use client';

import { useEffect, useState } from 'react';
import { ArrowLeftRight, History, LoaderCircle, UserRound, X } from 'lucide-react';
import { fetchWithAuth } from '@/lib/auth';
import { toast } from 'sonner';

type Agent = { id: string; name: string; department?: string };
type Assignment = { assignedServiceId?: string | null; assignedServiceName?: string | null; assignedById?: string | null; assignedByName?: string | null; updatedAt?: string | null };
type Transfer = { fromServiceName?: string | null; toServiceName: string; transferredByName: string; note: string; createdAt: string };

export function ServiceTransferControl({ type, conversationId, currentUserId, assignment, onAssigned }: {
  type: 'order' | 'intake'; conversationId: string; currentUserId?: string; assignment?: Assignment | null;
  onAssigned: (next: Assignment) => void;
}) {
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [history, setHistory] = useState<Transfer[]>([]);
  const [targetId, setTargetId] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    Promise.all([
      fetchWithAuth('/chat/service-agents').then(async (response) => { const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.message || '客服列表加载失败'); return result.data as Agent[]; }),
      fetchWithAuth(type === 'order' ? `/chat/orders/${encodeURIComponent(conversationId)}/transfers` : `/intake-sessions/${encodeURIComponent(conversationId)}/transfers`).then(async (response) => { const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.message || '转接记录加载失败'); return result.data as Transfer[]; }),
    ]).then(([list, records]) => {
      if (!active) return;
      setAgents(list); setHistory(records);
      setTargetId(assignment?.assignedServiceId || currentUserId || list[0]?.id || '');
    }).catch((error) => { if (active) toast.error(error instanceof Error ? error.message : '客服信息加载失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, type, conversationId, currentUserId, assignment?.assignedServiceId]);

  const transfer = async () => {
    if (!targetId) return toast.error('请选择接待客服');
    setSaving(true);
    try {
      const response = await fetchWithAuth(type === 'order' ? `/chat/orders/${encodeURIComponent(conversationId)}/transfer` : `/intake-sessions/${encodeURIComponent(conversationId)}/transfer`, { method: 'POST', body: JSON.stringify({ toServiceId: targetId, note: note.trim() }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '会话转接失败');
      onAssigned(result.data); setHistory((items) => [{ fromServiceName: assignment?.assignedServiceName, toServiceName: result.data.assignedServiceName, transferredByName: result.data.assignedByName, note: note.trim(), createdAt: result.data.updatedAt }, ...items]);
      setOpen(false); setNote(''); toast.success(`已转交给 ${result.data.assignedServiceName}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : '会话转接失败'); }
    finally { setSaving(false); }
  };

  return <>
    <button type="button" onClick={() => setOpen(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-700"><ArrowLeftRight className="h-3.5 w-3.5" /><span className="hidden sm:inline">转接客服</span><span className="sm:hidden">转接</span></button>
    {open && <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="service-transfer-title" className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-2xl">
      <header className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-blue-600">客服协作</p><h2 id="service-transfer-title" className="mt-1 text-lg font-bold text-slate-900">转接接待客服</h2></div><button type="button" disabled={saving} onClick={() => setOpen(false)} aria-label="关闭" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></header>
      <p className="mt-2 text-xs leading-5 text-slate-500">转接后，新客服负责回复。会话和历史消息会完整保留。</p>
      <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-xs"><span className="text-slate-500">当前接待：</span><span className="font-semibold text-slate-800">{assignment?.assignedServiceName || '尚未指派'}</span></div>
      <label className="mt-4 block text-xs font-semibold text-slate-700">交给客服</label>
      {loading ? <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-xs text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" />正在加载客服列表…</div> : <select value={targetId} onChange={(event) => setTargetId(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400">{!agents.length && <option value="">暂无可接待客服</option>}{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}{agent.id === currentUserId ? '（我）' : ''}{agent.department ? ` · ${agent.department}` : ''}</option>)}</select>}
      <label className="mt-4 block text-xs font-semibold text-slate-700">交接说明（选填）</label><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} placeholder="简要说明已处理事项或需要跟进的内容" className="mt-2 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-blue-400" />
      <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="flex items-center gap-1.5 text-xs font-bold text-slate-700"><History className="h-3.5 w-3.5" />交接记录</h3>{history.length ? <div className="mt-3 max-h-40 space-y-3 overflow-y-auto">{history.map((item, index) => <div key={`${item.createdAt}-${index}`} className="border-l-2 border-blue-100 pl-3 text-[11px]"><p className="font-semibold text-slate-700">{item.fromServiceName || '待分配'} → {item.toServiceName}</p><p className="mt-0.5 text-slate-400">{item.transferredByName} · {new Date(item.createdAt).toLocaleString('zh-CN')}</p>{item.note && <p className="mt-1 whitespace-pre-wrap text-slate-500">{item.note}</p>}</div>)}</div> : <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400"><UserRound className="h-3.5 w-3.5" />暂无转接记录</p>}</div>
      <button type="button" disabled={loading || saving || !targetId || targetId === assignment?.assignedServiceId} onClick={() => void transfer()} className="mt-5 h-11 w-full rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40">{saving ? '正在转接…' : '确认转接'}</button>
    </section></div>}
  </>;
}
