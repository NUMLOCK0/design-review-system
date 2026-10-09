'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, UserRound } from 'lucide-react';
import { fetchWithAuth, getCurrentUser } from '@/lib/auth';
import { chatPreview } from '@/lib/chat-cards';
import { CreateIntakeConversation } from './create-intake-conversation';

type OrderConversation = { orderId: string; orderNo: string; title: string; counterpartName: string; lastBody: string; status: string; assignedServiceId: string | null; assignedServiceName: string | null };
type IntakeConversation = { id: string; title: string; creatorName: string; guestName: string | null; assignedServiceId: string | null; assignedServiceName: string | null };
async function read<T>(path: string): Promise<T> {
  const response = await fetchWithAuth(path);
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || '会话加载失败');
  return result.data as T;
}
export function ServiceConversationSidebar({ activeOrderId, activeIntakeId, mobileOpen = false, onClose }: { activeOrderId?: string; activeIntakeId?: string; mobileOpen?: boolean; onClose?: () => void }) {
  const [orders, setOrders] = useState<OrderConversation[]>([]);
  const [intakes, setIntakes] = useState<IntakeConversation[]>([]);
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [error, setError] = useState('');
  const currentUserId = getCurrentUser()?.id;
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [orderList, intakeList] = await Promise.all([read<OrderConversation[]>('/chat/conversations'), read<IntakeConversation[]>('/intake-sessions')]);
        if (active) { setOrders(orderList); setIntakes(intakeList); setError(''); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : '会话加载失败'); }
    };
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [activeOrderId, activeIntakeId]);
  const query = search.trim().toLowerCase();
  const filteredOrders = useMemo(() => orders.filter(item => (ownerFilter === 'all' || (ownerFilter === 'mine' ? item.assignedServiceId === currentUserId : !item.assignedServiceId)) && `${item.title} ${item.orderNo} ${item.counterpartName}`.toLowerCase().includes(query)), [orders, query, ownerFilter, currentUserId]);
  const filteredIntakes = useMemo(() => intakes.filter(item => (ownerFilter === 'all' || (ownerFilter === 'mine' ? item.assignedServiceId === currentUserId : !item.assignedServiceId)) && `${item.title} ${item.creatorName} ${item.guestName || ''}`.toLowerCase().includes(query)), [intakes, query, ownerFilter, currentUserId]);
  return <>{mobileOpen && <button type="button" aria-label="关闭会话列表" onClick={onClose} className="fixed inset-0 z-40 bg-slate-950/40 md:hidden" />}<aside className={`${mobileOpen ? 'fixed inset-y-0 left-0 z-50 flex' : 'hidden'} w-[270px] shrink-0 flex-col border-r border-slate-200 bg-white md:static md:z-auto md:flex md:w-[240px] xl:w-[270px]`}>
    <div className="border-b border-slate-100 p-5"><div className="flex items-center justify-between gap-2"><h2 className="text-sm font-bold text-slate-900">订单会话</h2><div className="flex items-center gap-2"><span className="rounded-full role-primary-soft px-2 py-0.5 text-xs font-semibold role-primary-text">{orders.length + intakes.length}</span><CreateIntakeConversation /></div></div><label className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索会话 / 对方" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></label><div className="mt-3 grid grid-cols-3 rounded-xl bg-slate-100 p-1">{([['all', '全部'], ['mine', '我接待'], ['unassigned', '待接待']] as const).map(([value, label]) => <button key={value} type="button" onClick={() => setOwnerFilter(value)} className={`rounded-lg px-1 py-2 text-[10px] font-semibold ${ownerFilter === value ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}>{label}</button>)}</div></div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {error && <p role="alert" className="px-3 py-2 text-xs text-rose-600">{error}</p>}
      {filteredIntakes.length > 0 && <p className="px-3 pb-2 pt-3 text-[11px] font-semibold text-slate-400">邀请会话</p>}
      {filteredIntakes.map(item => <Link key={item.id} href={`/service/collaboration/${encodeURIComponent(item.id)}?type=intake`} onClick={onClose} className={`mb-1 block rounded-xl p-3 transition hover:bg-slate-50 ${item.id === activeIntakeId ? 'role-primary-soft' : ''}`}><p className="truncate text-xs font-bold text-slate-800">{item.title}</p><p className="mt-2 truncate text-[11px] text-slate-400">{item.guestName || '等待对方加入'}</p><p className="mt-1 flex items-center gap-1 truncate text-[10px] text-slate-500"><UserRound className="h-3 w-3" />{item.assignedServiceName ? `接待：${item.assignedServiceName}` : '待接待'}</p></Link>)}
      {filteredOrders.length > 0 && <p className="px-3 pb-2 pt-3 text-[11px] font-semibold text-slate-400">订单</p>}
      {filteredOrders.map(item => <Link key={item.orderId} href={`/service/collaboration/${encodeURIComponent(item.orderId)}`} onClick={onClose} className={`mb-1 block rounded-xl p-3 transition hover:bg-slate-50 ${item.orderId === activeOrderId ? 'role-primary-soft' : ''}`}><p className="truncate text-xs font-bold text-slate-800">{item.title}</p><p className="mt-2 truncate text-[11px] text-slate-400">{item.orderNo} · {item.counterpartName || '订单协作'}</p><p className="mt-1 truncate text-[11px] role-primary-text">{item.lastBody ? chatPreview(item.lastBody) : item.status}</p><p className="mt-1 flex items-center gap-1 truncate text-[10px] text-slate-500"><UserRound className="h-3 w-3" />{item.assignedServiceName ? `接待：${item.assignedServiceName}` : '待接待'}</p></Link>)}
      {!filteredOrders.length && !filteredIntakes.length && !error && <p className="px-4 py-8 text-center text-xs text-slate-400">{query ? '暂无匹配会话' : '暂无会话，点击右上角 + 创建'}</p>}
    </div>
    <p className="m-4 rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">邀请会话与订单会话都保存在服务器，可随时继续沟通。</p>
  </aside></>;
}
