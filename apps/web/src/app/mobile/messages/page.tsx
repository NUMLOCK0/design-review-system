'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, LoaderCircle, Mail, RefreshCw } from 'lucide-react';
import type { SiteMessage, SiteMessageType } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { useCurrentUser } from '@/hooks/use-current-user';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { MobileSecondaryLayout } from '@/components/mobile/mobile-secondary-layout';

const categories: Array<{ value: SiteMessageType | 'all'; label: string }> = [
  { value: 'all', label: '全部' }, { value: 'order', label: '订单' }, { value: 'review', label: '审核' },
  { value: 'dispute', label: '纠纷' }, { value: 'system', label: '系统' }, { value: 'announcement', label: '公告' },
];
const typeLabels: Record<SiteMessageType, string> = { system: '系统', order: '订单', review: '审核', dispute: '纠纷', announcement: '公告' };
const typeColors: Record<SiteMessageType, string> = {
  system: 'bg-slate-100 text-slate-600', order: 'role-primary-soft role-primary-text', review: 'bg-violet-50 text-violet-700',
  dispute: 'bg-amber-50 text-amber-700', announcement: 'bg-emerald-50 text-emerald-700',
};

export default function MobileMessagesPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const [messages, setMessages] = useState<SiteMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [activeType, setActiveType] = useState<SiteMessageType | 'all'>('all');

  const load = useCallback(async (nextPage = 1, append = false) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const response = await fetchWithAuth(`/messages?page=${nextPage}&pageSize=20&type=${activeType}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '消息加载失败');
      setMessages((current) => append ? [...current, ...(result.data?.list || [])] : result.data?.list || []);
      setUnread(Number(result.data?.unreadCount) || 0);
      setTotal(Number(result.data?.total) || 0);
      setPage(nextPage);
      setHasMore(Boolean(result.data?.hasMore));
    } catch (error) { toast.error(error instanceof Error ? error.message : '消息加载失败'); }
    finally { setLoading(false); setLoadingMore(false); }
  }, [activeType]);

  useEffect(() => { if (user) void load(); }, [user?.id, load]);

  const markRead = async (message: SiteMessage) => {
    try {
      if (!message.isRead) {
        const response = await fetchWithAuth(`/messages/${message.id}/read`, { method: 'POST' });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || '标记已读失败');
        setMessages((current) => current.map((item) => item.id === message.id ? { ...item, isRead: true, readAt: new Date().toISOString() } : item));
        setUnread((current) => {
          const next = Math.max(0, current - 1);
          window.dispatchEvent(new CustomEvent<number>('messages-unread-change', { detail: next }));
          return next;
        });
      }
      if (message.link) router.push(['/advertiser/disputes', '/service/disputes'].includes(message.link) ? '/mobile/disputes' : message.link);
    } catch (error) { toast.error(error instanceof Error ? error.message : '标记已读失败'); }
  };

  const markAllRead = async () => {
    try {
      const response = await fetchWithAuth('/messages/read-all', { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '操作失败');
      setMessages((current) => current.map((message) => ({ ...message, isRead: true, readAt: message.readAt || new Date().toISOString() })));
      setUnread(0);
      window.dispatchEvent(new CustomEvent<number>('messages-unread-change', { detail: 0 }));
      toast.success('已全部标记为已读');
    } catch (error) { toast.error(error instanceof Error ? error.message : '操作失败'); }
  };

  return <MobileSecondaryLayout title="站内信" fallbackHref="/mobile" action={
    <button type="button" onClick={() => void markAllRead()} disabled={!unread} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl px-2 text-xs font-semibold role-primary-text disabled:text-slate-300">
      <CheckCheck className="h-4 w-4" />全部已读
    </button>
  }>
    <section className="space-y-3.5">
      <div>
        <p className="text-xs font-semibold role-primary-text">消息中心</p>
        <div className="mt-1 flex items-end justify-between gap-3">
          <div><h2 className="text-[25px] font-extrabold tracking-tight">消息提醒</h2><p className="mt-1 text-xs text-slate-400">订单、审核与协作进展都在这里</p></div>
          <button type="button" aria-label="刷新消息" onClick={() => void load()} disabled={loading} className="mb-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-xl role-primary-soft px-3 py-2.5 text-xs text-slate-600">
        <span>未读消息 <strong className="role-primary-text">{unread} 条</strong></span>
        <span className="text-[11px] text-slate-500">点按消息查看详情</span>
      </div>

      <div className="flex flex-wrap gap-2" aria-label="消息分类">
        {categories.map((category) => <button key={category.value} type="button" aria-pressed={activeType === category.value} onClick={() => setActiveType(category.value)} className={`min-h-9 rounded-full px-3 text-xs font-semibold ${activeType === category.value ? 'role-primary-bg text-white' : 'bg-white text-slate-500'}`}>{category.label}</button>)}
      </div>

      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-bold text-slate-700">最近消息</h3>
        {!loading && <span className="text-[11px] text-slate-400">{total} 条</span>}
      </div>

      <div className="overflow-hidden rounded-[20px] bg-white shadow-[0_4px_20px_rgba(15,23,42,.035)]">
        {loading && <div className="flex items-center justify-center gap-2 px-4 py-10 text-xs text-slate-400"><LoaderCircle className="h-4 w-4 animate-spin" />正在加载消息…</div>}
        {!loading && messages.length === 0 && <div className="px-4 py-12 text-center"><Mail className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">{activeType === 'all' ? '暂无站内信' : '该分类暂无消息'}</p><p className="mt-1 text-xs text-slate-400">订单和审核动态会在这里通知你</p></div>}
        {!loading && messages.map((message) => <button key={message.id} type="button" onClick={() => void markRead(message)} className="flex w-full items-start gap-3 border-b border-slate-100 p-4 text-left last:border-0 active:bg-slate-50">
          <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${typeColors[message.type]}`}><Bell className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-start gap-1.5"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${message.isRead ? 'bg-transparent' : 'role-primary-bg'}`} /><span className={`min-w-0 flex-1 text-[13px] leading-5 ${message.isRead ? 'font-medium text-slate-700' : 'font-bold text-slate-900'}`}>{message.title}</span><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${typeColors[message.type]}`}>{typeLabels[message.type]}</span></span>
            <span className="mt-1.5 line-clamp-2 block text-xs leading-5 text-slate-500">{message.content}</span>
            <span className="mt-2 flex flex-wrap justify-between gap-x-2 gap-y-1 text-[11px] text-slate-400"><span>{message.senderName || '系统通知'}</span><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('zh-CN')}</time></span>
          </span>
        </button>)}
      </div>
      {hasMore && <button type="button" disabled={loadingMore} onClick={() => void load(page + 1, true)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-xs font-semibold role-primary-text disabled:opacity-50">{loadingMore && <LoaderCircle className="h-4 w-4 animate-spin" />}{loadingMore ? '正在加载…' : '加载更多消息'}</button>}
    </section>
  </MobileSecondaryLayout>;
}
