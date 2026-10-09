import { ApiError, getSession, request, uuid, type ChatMessage } from './api';
export interface PendingMessage { clientMessageId: string; body: string; createdAt: string; error?: string }
function storageKey(orderId: string) { return `cozi-outbox:${getSession()?.user.id}:${orderId}`; }
export function pendingMessages(orderId: string): PendingMessage[] { return uni.getStorageSync(storageKey(orderId)) || []; }
export function queueMessage(orderId: string, body: string) {
  const value = body.trim();
  if (!value || value.length > 5000) throw new Error('消息须为 1–5000 字');
  const pending: PendingMessage = { clientMessageId: uuid(), body: value, createdAt: new Date().toISOString() };
  // Persist before attempting network transmission; errors leave the composer unchanged.
  uni.setStorageSync(storageKey(orderId), [...pendingMessages(orderId), pending]);
}
const sending = new Map<string, Promise<void>>();
export function flushOutbox(orderId: string) {
  const key = storageKey(orderId);
  const existing = sending.get(key);
  if (existing) return existing;
  const operation = (async () => {
    for (const pending of (uni.getStorageSync(key) || []) as PendingMessage[]) {
      if (key !== storageKey(orderId)) break;
      if (pending.error) continue;
      try {
        await request<ChatMessage>(`/chat/orders/${encodeURIComponent(orderId)}/messages`, 'POST', { clientMessageId: pending.clientMessageId, body: pending.body });
        uni.setStorageSync(key, ((uni.getStorageSync(key) || []) as PendingMessage[]).filter(item => item.clientMessageId !== pending.clientMessageId));
      } catch (error) {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500 && ![401, 408, 429].includes(error.status)) {
          uni.setStorageSync(key, ((uni.getStorageSync(key) || []) as PendingMessage[]).map(item => item.clientMessageId === pending.clientMessageId ? { ...item, error: error.message } : item));
        }
        break;
      }
    }
  })().finally(() => { sending.delete(key); });
  sending.set(key, operation);
  return operation;
}
export function acknowledgeMessages(orderId: string, messages: ChatMessage[]) {
  const mine = getSession()?.user.id;
  const ids = new Set(messages.filter(message => message.senderId === mine).map(message => message.clientMessageId));
  uni.setStorageSync(storageKey(orderId), pendingMessages(orderId).filter(message => !ids.has(message.clientMessageId)));
}
export function retryMessage(orderId: string, clientMessageId: string) {
  uni.setStorageSync(storageKey(orderId), pendingMessages(orderId).map(message => message.clientMessageId === clientMessageId ? { ...message, error: undefined } : message));
  return flushOutbox(orderId);
}
export function discardMessage(orderId: string, clientMessageId: string) {
  uni.setStorageSync(storageKey(orderId), pendingMessages(orderId).filter(message => message.clientMessageId !== clientMessageId));
}
