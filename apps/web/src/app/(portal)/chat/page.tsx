'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, MessageCircle, Search } from 'lucide-react';
import { fetchWithAuth } from '@/lib/auth';
import { chatPreview } from '@/lib/chat-cards';

type Conversation = { orderId: string; orderNo: string; title: string; category: string; counterpartName: string; lastBody: string; lastMessageAt: string | null };

export default function ChatInboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetchWithAuth('/chat/conversations').then((response) => response.json().then((result) => {
      if (!response.ok || !result.success) throw new Error(result.message || '会话加载失败');
      if (active) setConversations(result.data);
    })).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : '会话加载失败'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = conversations.filter((item) => `${item.title} ${item.orderNo} ${item.counterpartName}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="mx-auto max-w-5xl"><div className="mb-6 flex items-end justify-between"><div><p className="text-xs font-bold role-primary-text">订单协作</p><h1 className="mt-1 text-2xl font-bold text-slate-900">协作消息</h1><p className="mt-2 text-sm text-slate-500">与当前订单的品牌方或设计师沟通，消息按订单保存。</p></div><span className="rounded-full role-primary-soft px-3 py-1 text-xs font-semibold role-primary-text">{conversations.length} 个会话</span></div><label className="mb-5 flex max-w-md items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索订单或沟通对象" className="min-w-0 flex-1 text-sm outline-none" /></label>{error && <p role="alert" className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}{loading ? <p className="py-16 text-center text-sm text-slate-400">正在加载会话…</p> : !filtered.length ? <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center"><MessageCircle className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">暂无可用会话</p><p className="mt-1 text-xs text-slate-400">订单分配设计师后，双方可在这里沟通。</p></div> : <div className="grid gap-3 md:grid-cols-2">{filtered.map((item) => <Link key={item.orderId} href={`/chat/orders/${encodeURIComponent(item.orderId)}`} className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:role-primary-border hover:shadow-md"><div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl role-primary-soft text-lg font-bold role-primary-text">{item.counterpartName?.slice(0, 1) || '订'}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{item.title}</p><p className="mt-1 truncate text-xs text-slate-400">{item.orderNo} · {item.counterpartName || '订单协作'}</p><p className="mt-2 truncate text-xs text-slate-600">{item.lastBody ? chatPreview(item.lastBody) : '打开订单开始沟通'}</p></div><ArrowRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:role-primary-text" /></Link>)}</div>}</div>;
}
