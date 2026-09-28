'use client';

import { useEffect } from 'react';
import { fetchWithAuth, type UserInfo } from '@/lib/auth';

export interface MessageRealtimeUpdate {
  kind: 'sync' | 'new' | 'read' | 'read-all';
  unreadCount: number;
  type?: string;
  messageId?: string;
}

export function useMessageRealtime(userId?: UserInfo['id']) {
  useEffect(() => {
    if (!userId) return;
    const source = new EventSource('/api/messages/events', { withCredentials: true });
    const handleUpdate = (event: MessageEvent<string>) => {
      try {
        const update = JSON.parse(event.data) as MessageRealtimeUpdate;
        window.dispatchEvent(new CustomEvent<MessageRealtimeUpdate>('messages-realtime', { detail: update }));
        window.dispatchEvent(new CustomEvent<number>('messages-unread-change', { detail: update.unreadCount }));
      } catch {
        // Ignore malformed events and keep the stream open for subsequent updates.
      }
    };
    source.addEventListener('messages:update', handleUpdate as EventListener);
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) void fetchWithAuth('/messages/summary').catch(() => undefined);
    };
    return () => {
      source.removeEventListener('messages:update', handleUpdate as EventListener);
      source.close();
    };
  }, [userId]);
}
