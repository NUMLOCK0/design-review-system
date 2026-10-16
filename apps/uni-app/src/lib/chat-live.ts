import { API_BASE, getSession, request, type ChatMessage, type IntakeMessage } from './api';

export type ChatSignal = { type: 'connected' } | { type: 'chat:message'; kind: 'order' | 'intake'; conversationId: string; seq: number; message?: ChatMessage | IntakeMessage } | { type: 'site:message'; unreadCount: number };

const listeners = new Set<(signal: ChatSignal) => void>();
let socket: UniNamespace.SocketTask | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
let retryDelay = 1000;
let connecting = false;
let connected = false;

export function isChatLiveConnected() { return connected; }

function emit(signal: ChatSignal) { for (const listener of listeners) listener(signal); }

function scheduleReconnect() {
  if (!listeners.size || reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined;
    void connect();
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 2, 15000);
}

async function connect() {
  if (!listeners.size || socket || connecting || !getSession()) return;
  connecting = true;
  const attempt = generation;
  try {
    const { ticket } = await request<{ ticket: string }>('/chat/socket-ticket', 'POST');
    if (attempt !== generation || !listeners.size) return;
    const url = `${API_BASE.replace(/\/api$/, '').replace(/^http/, 'ws')}/chat/live?ticket=${encodeURIComponent(ticket)}`;
    const task = uni.connectSocket({ url, complete: () => {} });
    socket = task;
    task.onOpen(() => {
      if (socket !== task) return;
      connected = true;
      retryDelay = 1000;
      emit({ type: 'connected' });
    });
    task.onMessage(event => {
      if (socket !== task) return;
      try {
        const signal = JSON.parse(String(event.data)) as ChatSignal;
        if (signal.type === 'chat:message' && (signal.kind === 'order' || signal.kind === 'intake') && typeof signal.conversationId === 'string') emit(signal);
        if (signal.type === 'site:message' && Number.isFinite(signal.unreadCount)) emit(signal);
      } catch { /* Ignore malformed notifications; the next REST sync recovers messages. */ }
    });
    task.onClose(() => { if (socket === task) { connected = false; socket = undefined; scheduleReconnect(); } });
    task.onError(() => {
      if (socket !== task) return;
      connected = false;
      socket = undefined;
      try { task.close({}); } catch { /* The connection may already be closed. */ }
      scheduleReconnect();
    });
  } catch { if (attempt === generation) scheduleReconnect(); }
  finally { connecting = false; if (attempt !== generation && listeners.size && !socket) void connect(); }
}

export function subscribeChatNotifications(listener: (signal: ChatSignal) => void) {
  listeners.add(listener);
  void connect();
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    generation++;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
    socket?.close({});
    socket = undefined;
    connected = false;
    retryDelay = 1000;
  };
}
