import type { SiteMessage, SiteMessageType } from '@design-review/shared';
import type { MessageRealtimeUpdate } from '@/hooks/use-message-realtime';

export const MESSAGE_CATEGORIES: Array<{ type: SiteMessageType; label: string }> = [
  { type: 'system', label: '系统消息' },
  { type: 'order', label: '订单消息' },
  { type: 'review', label: '审核消息' },
  { type: 'dispute', label: '纠纷消息' },
  { type: 'announcement', label: '平台公告' },
];

export interface MessageCategorySummary {
  type: SiteMessageType;
  total: number;
  unreadCount: number;
  latest: Pick<SiteMessage, 'id' | 'title' | 'content' | 'createdAt'> | null;
}

export function dispatchMessageUpdate(update: MessageRealtimeUpdate) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<MessageRealtimeUpdate>('messages-realtime', { detail: update }));
  window.dispatchEvent(new CustomEvent<number>('messages-unread-change', { detail: update.unreadCount }));
}

export function getMobileMessageLink(link?: string) {
  if (!link) return '/mobile';
  const [path, query] = link.split('?');
  const params = new URLSearchParams(query);
  if (path === '/evaluations' || path.startsWith('/evaluations/')) return `/mobile${link}`;
  if (path === '/service/evaluations') return '/mobile/service/evaluations';
  if (path === '/applications') return '/mobile/applications';
  if (path === '/advertiser/orders' && params.get('tab') === 'applications' && params.get('orderId')) return `/mobile/orders/${encodeURIComponent(params.get('orderId')!)}/applications`;
  if (path === '/review-tasks' && params.get('taskId')) return `/mobile/tasks/${encodeURIComponent(params.get('taskId')!)}`;
  const route = path.startsWith('/mobile/') ? path : path === '/mobile' ? path
    : path === '/advertiser/disputes' || path === '/service/disputes' ? '/mobile/disputes'
      : path.startsWith('/advertiser/orders') ? path.replace('/advertiser/orders', '/mobile/orders')
        : path === '/review-tasks' ? '/mobile/tasks'
          : path === '/invitations' ? '/mobile/invitations'
            : path === '/wallet' ? '/mobile/wallet'
              : path === '/designer/profile' ? '/mobile/profile'
                : path === '/service/portfolio-review' ? '/mobile/service/portfolio-review'
                  : path.startsWith('/service/dashboard') ? '/mobile/tasks'
                    : path === '/review-submit' ? '/mobile/review-submit'
                        : path.startsWith('/admin') ? path
                        : '/mobile';
  return query ? `${route}?${query}` : route;
}

export function formatMessageDate(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}
