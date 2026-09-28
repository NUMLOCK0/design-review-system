'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Bell, CheckCheck, ChevronRight, CircleAlert, LoaderCircle, Megaphone, PackageCheck, RefreshCw, ShieldCheck } from 'lucide-react';
import type { SiteMessage, SiteMessageType } from '@design-review/shared';
import { useCurrentUser } from '@/hooks/use-current-user';
import { fetchWithAuth } from '@/lib/auth';
import { dispatchMessageUpdate, formatMessageDate, getMobileMessageLink, MESSAGE_CATEGORIES, type MessageCategorySummary } from '@/lib/messages';
import type { MessageRealtimeUpdate } from '@/hooks/use-message-realtime';
import { toast } from 'sonner';

const categoryIcon: Record<SiteMessageType, typeof Bell> = {
  system: Bell,
  order: PackageCheck,
  review: ShieldCheck,
  dispute: CircleAlert,
  announcement: Megaphone,
};

const categoryTone: Record<SiteMessageType, string> = {
  system: 'bg-slate-100 text-slate-600',
  order: 'role-primary-soft role-primary-text',
  review: 'bg-violet-50 text-violet-700',
  dispute: 'bg-amber-50 text-amber-700',
  announcement: 'bg-emerald-50 text-emerald-700',
};

const categoryName = (type: SiteMessageType) => MESSAGE_CATEGORIES.find((item) => item.type === type)?.label || '消息';
const routeRoot = (mobile: boolean) => mobile ? '/mobile/messages' : '/messages';
const categoryHref = (mobile: boolean, type: SiteMessageType) => `${routeRoot(mobile)}/category/${type}`;
const detailHref = (mobile: boolean, id: string, type: SiteMessageType) => `${routeRoot(mobile)}/category/${type}/detail/${encodeURIComponent(id)}`;

async function readJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(url, options);
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || '消息加载失败');
  return result.data as T;
}

function useMessageRefresh(onUpdate: (update: MessageRealtimeUpdate) => void) {
  useEffect(() => {
    const listener = (event: Event) => onUpdate((event as CustomEvent<MessageRealtimeUpdate>).detail);
    window.addEventListener('messages-realtime', listener);
    return () => window.removeEventListener('messages-realtime', listener);
  }, [onUpdate]);
}

export function MessageCategoryOverview({ mobile = false }: { mobile?: boolean }) {
  const user = useCurrentUser();
  const [categories, setCategories] = useState<MessageCategorySummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await readJson<{ unreadCount: number; categories: MessageCategorySummary[] }>('/messages/summary');
      setCategories(data.categories || []);
      setUnreadCount(Number(data.unreadCount) || 0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '消息加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (user) void load(); }, [user?.id, load]);
  useMessageRefresh(useCallback(() => { void load(); }, [load]));

  const markAllRead = async () => {
    try {
      const data = await readJson<{ unreadCount: number }>('/messages/read-all', { method: 'POST', body: JSON.stringify({}) });
      dispatchMessageUpdate({ kind: 'read-all', unreadCount: data.unreadCount || 0 });
      toast.success('已全部标记为已读');
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '操作失败');
    }
  };

  return <section className={`space-y-4 ${mobile ? '' : 'mx-auto max-w-4xl'}`}>
    <div className="flex items-center justify-between gap-3">
      <div>
        <h1 className={`${mobile ? 'text-xl' : 'text-2xl'} font-extrabold tracking-tight text-slate-900`}>消息</h1>
        <p className="mt-1 text-xs text-slate-500">{unreadCount ? `${unreadCount} 条未读` : '暂无未读消息'}</p>
      </div>
      <div className="flex items-center gap-2">
        {unreadCount > 0 && <button type="button" onClick={() => void markAllRead()} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50">
          <CheckCheck className="h-4 w-4" />全部已读
        </button>}
        <button type="button" aria-label="刷新消息" onClick={() => void load()} disabled={loading} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm hover:bg-slate-50 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>

    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_20px_rgba(15,23,42,.04)]">
      {loading && categories.length === 0 && <div className="flex justify-center py-12 text-slate-400"><LoaderCircle className="h-5 w-5 animate-spin" /></div>}
      {!loading && error && <div className="p-8 text-center"><p className="text-sm text-slate-500">{error}</p><button type="button" onClick={() => void load()} className="mt-3 text-sm font-semibold role-primary-text">重试</button></div>}
      {!loading && !error && categories.map((category, index) => {
        const Icon = categoryIcon[category.type];
        return <Link key={category.type} href={categoryHref(mobile, category.type)} className={`flex min-h-[82px] items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50 active:bg-slate-50 ${index ? 'border-t border-slate-100' : ''}`}>
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${categoryTone[category.type]}`}><Icon className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2"><span className="text-sm font-bold text-slate-800">{categoryName(category.type)}</span>{category.unreadCount > 0 && <span className="rounded-full role-primary-bg px-2 py-0.5 text-[10px] font-bold text-white">{category.unreadCount > 99 ? '99+' : category.unreadCount}</span>}</span>
            <span className="mt-1 block truncate text-xs text-slate-500">{category.latest?.title || '暂无消息'}</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-slate-400">
            {category.latest && <time dateTime={category.latest.createdAt}>{formatMessageDate(category.latest.createdAt)}</time>}
            <ChevronRight className="h-4 w-4" />
          </span>
        </Link>;
      })}
    </div>
  </section>;
}

export function MessageCategoryList({ type, mobile = false }: { type: string; mobile?: boolean }) {
  const user = useCurrentUser();
  const validType = MESSAGE_CATEGORIES.find((category) => category.type === type)?.type;
  const [messages, setMessages] = useState<SiteMessage[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (nextPage = 1, append = false) => {
    if (!validType) return;
    if (append) setLoadingMore(true); else setLoading(true);
    setError('');
    try {
      const data = await readJson<{ list: SiteMessage[]; filteredUnreadCount: number; hasMore: boolean }>(`/messages?type=${validType}&page=${nextPage}&pageSize=20`);
      setMessages((current) => append ? [...current, ...(data.list || [])] : data.list || []);
      setUnreadCount(data.filteredUnreadCount || 0);
      setHasMore(Boolean(data.hasMore));
      setPage(nextPage);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '消息加载失败');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [validType]);

  useEffect(() => { if (user && validType) void load(); }, [user?.id, validType, load]);
  useMessageRefresh(useCallback((update) => {
    if (!update.type || update.type === validType || update.kind === 'sync') void load();
  }, [load, validType]));

  const markAllRead = async () => {
    if (!validType) return;
    try {
      const data = await readJson<{ unreadCount: number }>('/messages/read-all', { method: 'POST', body: JSON.stringify({ type: validType }) });
      setMessages((current) => current.map((message) => ({ ...message, isRead: true, readAt: message.readAt || new Date().toISOString() })));
      dispatchMessageUpdate({ kind: 'read-all', type: validType, unreadCount: data.unreadCount || 0 });
      toast.success('本类消息已全部标记为已读');
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : '操作失败');
    }
  };

  if (!validType) return <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-500">消息分类不存在</div>;
  return <section className={`space-y-4 ${mobile ? '' : 'mx-auto max-w-4xl'}`}>
    <div className="flex items-center justify-between gap-3">
      <div><h1 className={`${mobile ? 'text-lg' : 'text-2xl'} font-extrabold tracking-tight text-slate-900`}>{categoryName(validType)}</h1><p className="mt-1 text-xs text-slate-500">{unreadCount} 条未读</p></div>
      <div className="flex items-center gap-2">
        {unreadCount > 0 && <button type="button" onClick={() => void markAllRead()} className="min-h-10 rounded-xl bg-white px-3 text-xs font-semibold text-slate-600 shadow-sm">本类全部已读</button>}
        <button type="button" aria-label="刷新消息" onClick={() => void load()} disabled={loading} className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-500 shadow-sm"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
    </div>
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_20px_rgba(15,23,42,.04)]">
      {loading && messages.length === 0 && <div className="flex justify-center py-12 text-slate-400"><LoaderCircle className="h-5 w-5 animate-spin" /></div>}
      {!loading && error && <div className="p-8 text-center"><p className="text-sm text-slate-500">{error}</p><button type="button" onClick={() => void load()} className="mt-3 text-sm font-semibold role-primary-text">重试</button></div>}
      {!loading && !error && messages.length === 0 && <p className="p-10 text-center text-sm text-slate-400">暂无{categoryName(validType)}</p>}
      {!error && messages.map((message) => <Link key={message.id} href={detailHref(mobile, message.id, message.type)} className="flex min-h-[84px] items-start gap-3 border-b border-slate-100 p-4 last:border-0 hover:bg-slate-50 active:bg-slate-50">
        <span className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${message.isRead ? 'bg-transparent' : 'role-primary-bg'}`} aria-label={message.isRead ? '已读' : '未读'} />
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2"><span className={`line-clamp-2 text-sm leading-5 ${message.isRead ? 'font-medium text-slate-700' : 'font-bold text-slate-900'}`}>{message.title}</span><time className="shrink-0 text-[11px] text-slate-400" dateTime={message.createdAt}>{formatMessageDate(message.createdAt)}</time></span>
          <span className="mt-1.5 line-clamp-2 block text-xs leading-5 text-slate-500">{message.content}</span>
          <span className="mt-2 block text-[11px] text-slate-400">{message.senderName || '系统通知'}</span>
        </span>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
      </Link>)}
    </div>
    {hasMore && <button type="button" disabled={loadingMore} onClick={() => void load(page + 1, true)} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-xs font-semibold role-primary-text disabled:opacity-50">{loadingMore && <LoaderCircle className="h-4 w-4 animate-spin" />}{loadingMore ? '正在加载…' : '加载更多'}</button>}
  </section>;
}

export function MessageDetail({ id, mobile = false }: { id: string; mobile?: boolean }) {
  const user = useCurrentUser();
  const router = useRouter();
  const [message, setMessage] = useState<SiteMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await readJson<SiteMessage>(`/messages/detail/${encodeURIComponent(id)}`);
      setMessage(data);
      if (!data.isRead) {
        try {
          const response = await fetchWithAuth(`/messages/${encodeURIComponent(id)}/read`, { method: 'POST' });
          const result = await response.json();
          if (!response.ok || !result.success) throw new Error(result.message || '标记已读失败');
          const updated = result.data as SiteMessage;
          setMessage(updated);
          dispatchMessageUpdate({ kind: 'read', type: updated.type, messageId: updated.id, unreadCount: Number(result.unreadCount) || 0 });
        } catch (cause) {
          toast.error(cause instanceof Error ? cause.message : '标记已读失败');
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '消息加载失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { if (user) void load(); }, [user?.id, load]);
  useMessageRefresh(useCallback((update) => {
    if (message && update.messageId === message.id && update.kind === 'read') setMessage((current) => current ? { ...current, isRead: true } : current);
    if (message && update.kind === 'read-all' && (!update.type || update.type === message.type)) setMessage((current) => current ? { ...current, isRead: true } : current);
  }, [message]));

  if (loading) return <div className="flex justify-center rounded-2xl bg-white py-14 text-slate-400"><LoaderCircle className="h-5 w-5 animate-spin" /></div>;
  if (error || !message) return <div className="rounded-2xl bg-white p-8 text-center"><p className="text-sm text-slate-500">{error || '消息不存在'}</p><button type="button" onClick={() => void load()} className="mt-3 text-sm font-semibold role-primary-text">重试</button></div>;

  return <article className={`${mobile ? '' : 'mx-auto max-w-3xl'} rounded-2xl bg-white p-5 shadow-[0_4px_20px_rgba(15,23,42,.04)] sm:p-7`}>
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${categoryTone[message.type]}`}>{categoryName(message.type)}</span>
      <time className="text-xs text-slate-400" dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('zh-CN')}</time>
    </div>
    <h1 className="mt-4 text-xl font-extrabold leading-8 tracking-tight text-slate-900">{message.title}</h1>
    <p className="mt-2 text-xs text-slate-500">{message.senderName || '系统通知'}</p>
    <div className="my-5 border-t border-slate-100" />
    <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{message.content}</p>
    {message.link && <button type="button" onClick={() => router.push(mobile ? getMobileMessageLink(message.link) : message.link!)} className="mt-7 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl role-primary-bg px-4 text-sm font-semibold text-white">
      查看相关内容<ArrowUpRight className="h-4 w-4" />
    </button>}
  </article>;
}
