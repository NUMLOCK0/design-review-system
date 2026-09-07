'use client';

import { useEffect, useState } from 'react';
import { CheckCheck, Mail, RefreshCw } from 'lucide-react';
import type { SiteMessage } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { useCurrentUser } from '@/hooks/use-current-user';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

const typeMap: Record<SiteMessage['type'], { label: string; className: string }> = {
  system: { label: '系统', className: 'bg-slate-100 text-slate-600' },
  order: { label: '订单', className: 'bg-blue-50 text-blue-700' },
  review: { label: '审核', className: 'bg-indigo-50 text-indigo-700' },
  dispute: { label: '纠纷', className: 'bg-rose-50 text-rose-700' },
  announcement: { label: '公告', className: 'bg-amber-50 text-amber-700' },
};

export default function MessagesPage() {
  const user = useCurrentUser();
  const router = useRouter();
  const [messages, setMessages] = useState<SiteMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadMessages = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetchWithAuth('/messages?page=1&pageSize=50');
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '加载站内信失败');
      setMessages(result.data?.list || []);
      setUnreadCount(result.data?.unreadCount || 0);
    } catch (error: any) {
      toast.error(error.message || '加载站内信失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMessages(); }, [user?.id]);

  const markRead = async (message: SiteMessage) => {
    if (!message.isRead) {
      await fetchWithAuth('/messages/' + message.id + '/read', { method: 'POST' });
      setMessages((current) => current.map((item) => item.id === message.id ? { ...item, isRead: true, readAt: new Date().toISOString() } : item));
      setUnreadCount((count) => Math.max(0, count - 1));
    }
    if (message.link) router.push(message.link);
  };

  const markAllRead = async () => {
    const response = await fetchWithAuth('/messages/read-all', { method: 'POST' });
    if (!response.ok) return toast.error('操作失败');
    setMessages((current) => current.map((message) => ({ ...message, isRead: true })));
    setUnreadCount(0);
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600"><Mail className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">站内信</h1>
            <p className="mt-1 text-xs text-slate-500">{unreadCount ? unreadCount + ' 条未读' : '暂无未读消息'}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadMessages} disabled={loading} className="h-9 rounded-xl text-xs"><RefreshCw className={'mr-1.5 h-3.5 w-3.5 ' + (loading ? 'animate-spin' : '')} />刷新</Button>
          <Button variant="outline" onClick={markAllRead} disabled={!unreadCount} className="h-9 rounded-xl text-xs"><CheckCheck className="mr-1.5 h-3.5 w-3.5" />全部已读</Button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading && <div className="p-10 text-center text-sm text-slate-400">加载中…</div>}
        {!loading && messages.length === 0 && <div className="p-10 text-center text-sm text-slate-400">暂无站内信</div>}
        {!loading && messages.map((message) => {
          const type = typeMap[message.type];
          return (
            <button key={message.id} onClick={() => markRead(message)} className="flex w-full items-start gap-3 border-b border-slate-100 p-5 text-left transition last:border-0 hover:bg-slate-50">
              <span className={'mt-1 h-2.5 w-2.5 shrink-0 rounded-full ' + (message.isRead ? 'bg-slate-200' : 'bg-blue-600')} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className={'text-sm ' + (message.isRead ? 'font-medium text-slate-700' : 'font-bold text-slate-900')}>{message.title}</h2>
                  <Badge className={'text-[10px] ' + type.className}>{type.label}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-slate-500">{message.content}</p>
                <p className="mt-2 text-xs text-slate-400">{message.senderName || '系统通知'} · {new Date(message.createdAt).toLocaleString('zh-CN')}</p>
              </div>
              {message.link && <span className="shrink-0 pt-1 text-xs text-blue-600">查看</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
