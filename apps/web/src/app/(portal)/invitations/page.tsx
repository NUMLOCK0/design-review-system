'use client';

import { useEffect, useState } from 'react';
import { Check, Clock3, Inbox, X } from 'lucide-react';
import type { OrderInvitation } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const label: Record<string, string> = { sent: '等待你的回应', accepted: '已接受', declined: '已拒绝', expired: '已过期', cancelled: '已关闭', queued: '订单审核中' };

export default function InvitationsPage() {
  const [items, setItems] = useState<OrderInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [operating, setOperating] = useState<string | null>(null);
  const load = async () => {
    try {
      const response = await fetchWithAuth('/invitations/mine');
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '加载邀请失败');
      setItems(result.data || []);
    } catch (error: any) { toast.error(error.message || '加载邀请失败'); } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  const respond = async (id: string, action: 'accept' | 'decline') => {
    setOperating(id);
    try {
      const response = await fetchWithAuth(`/invitations/${id}/respond`, { method: 'POST', body: JSON.stringify({ action }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '操作失败');
      toast.success(result.message);
      await load();
    } catch (error: any) { toast.error(error.message || '操作失败'); } finally { setOperating(null); }
  };
  return <section className="space-y-5">
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center gap-3"><div className="rounded-2xl bg-blue-50 p-2 text-blue-600"><Inbox className="h-5 w-5" /></div><div><p className="text-xs font-semibold text-blue-600">设计师工作台</p><h1 className="text-2xl font-bold text-slate-900">订单邀请</h1></div></div></div>
    {loading && <div className="rounded-2xl bg-white p-10 text-center text-sm text-slate-400">正在加载邀请…</div>}
    {!loading && !items.length && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">暂时没有订单邀请</div>}
    <div className="grid gap-3 md:grid-cols-2">{items.map((item) => <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-bold text-slate-800">{item.orderTitle}</h2><p className="mt-1 text-xs text-slate-400">{item.orderNo} · 来自 {item.inviterName}</p></div><Badge className="bg-blue-50 text-[10px] text-blue-700">{label[item.status] || item.status}</Badge></div>{item.inviteMessage && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">{item.inviteMessage}</p>}<p className="mt-3 flex items-center gap-1 text-[11px] text-slate-400"><Clock3 className="h-3.5 w-3.5" />有效至 {new Date(item.expiresAt).toLocaleString('zh-CN')}</p>{item.status === 'sent' && <div className="mt-4 flex gap-2"><Button disabled={operating === item.id} onClick={() => respond(item.id, 'accept')} className="h-8 flex-1 rounded-xl bg-blue-600 text-xs text-white hover:bg-blue-700"><Check className="mr-1 h-3.5 w-3.5" />接受邀请</Button><Button disabled={operating === item.id} variant="outline" onClick={() => respond(item.id, 'decline')} className="h-8 rounded-xl text-xs text-rose-600"><X className="mr-1 h-3.5 w-3.5" />婉拒</Button></div>}</article>)}</div>
  </section>;
}
