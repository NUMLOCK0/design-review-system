import { ref } from 'vue';
import { api, getSession, type ChatUnreadSummary } from './api';
import { isChatLiveConnected, subscribeChatNotifications, type ChatSignal } from './chat-live';

export const siteUnreadCount = ref(0);
export const chatUnreadCount = ref(0);
export const chatUnreadConversations = ref<Record<string, number>>({});

let activeUser = '';
let unsubscribeLive: (() => void) | undefined;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let signalRefreshTimer: ReturnType<typeof setTimeout> | undefined;
let refreshing: Promise<void> | undefined;
let refreshAgain = false;
let lastBadgeText: string | undefined;
let lastSummaryRefreshAt = 0;
const markedThrough = new Map<string, number>();
const pendingReadSeq = new Map<string, number>();
const pendingReadTimers = new Map<string, ReturnType<typeof setTimeout>>();

const conversationKey = (kind: 'order' | 'intake', id: string) => `${kind}:${id}`;

function updateTabBadge() {
  const text = chatUnreadCount.value > 0 ? (chatUnreadCount.value > 99 ? '99+' : String(chatUnreadCount.value)) : '';
  if (text === lastBadgeText) return;
  if (text) uni.setTabBarBadge({ index: 2, text, success: () => { lastBadgeText = text; }, fail: () => { lastBadgeText = undefined; } });
  else uni.removeTabBarBadge({ index: 2, success: () => { lastBadgeText = ''; }, fail: () => { lastBadgeText = undefined; } });
}

function applyChatSummary(summary: ChatUnreadSummary) {
  const counts: Record<string, number> = {};
  for (const item of summary.conversations) counts[conversationKey(item.kind, item.conversationId)] = item.unreadCount;
  chatUnreadConversations.value = counts;
  chatUnreadCount.value = summary.unreadCount;
  updateTabBadge();
}

async function fetchUnreadCounts() {
  const session = getSession();
  if (!session || session.user.id !== activeUser) return;
  const [site, chat] = await Promise.allSettled([api.messageSummary(), api.chatUnreadSummary()]);
  lastSummaryRefreshAt = Date.now();
  if (getSession()?.token !== session.token || activeUser !== session.user.id) return;
  if (site.status === 'fulfilled') siteUnreadCount.value = site.value.unreadCount;
  if (chat.status === 'fulfilled') applyChatSummary(chat.value);
}

export async function refreshUnreadCounts() {
  if (!activeUser) return;
  if (refreshing) { refreshAgain = true; return refreshing; }
  refreshing = (async () => { do { refreshAgain = false; await fetchUnreadCounts(); } while (refreshAgain && activeUser); })();
  try { await refreshing; } finally { refreshing = undefined; }
}

function scheduleSummaryRefresh() {
  if (signalRefreshTimer) clearTimeout(signalRefreshTimer);
  signalRefreshTimer = setTimeout(() => { signalRefreshTimer = undefined; void refreshUnreadCounts(); }, 250);
}

function handleSignal(signal: ChatSignal) {
  if (signal.type === 'site:message') siteUnreadCount.value = Math.max(0, signal.unreadCount);
  else scheduleSummaryRefresh();
}

export function startGlobalNotifications() {
  const session = getSession();
  if (!session || session.user.role !== 'advertiser') { stopGlobalNotifications(true); return; }
  if (activeUser !== session.user.id) {
    stopGlobalNotifications(true);
    activeUser = session.user.id;
    unsubscribeLive = subscribeChatNotifications(handleSignal);
    refreshTimer = setInterval(() => { if (!isChatLiveConnected() || Date.now() - lastSummaryRefreshAt >= 60000) void refreshUnreadCounts(); }, 15000);
  }
  updateTabBadge();
  void refreshUnreadCounts();
}

export function stopGlobalNotifications(clear = false) {
  unsubscribeLive?.(); unsubscribeLive = undefined;
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = undefined;
  if (signalRefreshTimer) clearTimeout(signalRefreshTimer);
  signalRefreshTimer = undefined;
  for (const timer of pendingReadTimers.values()) clearTimeout(timer);
  pendingReadTimers.clear(); pendingReadSeq.clear();
  activeUser = '';
  if (clear) {
    siteUnreadCount.value = 0;
    chatUnreadCount.value = 0;
    chatUnreadConversations.value = {};
    markedThrough.clear();
    lastBadgeText = undefined;
    updateTabBadge();
  }
}

export async function markConversationRead(kind: 'order' | 'intake', id: string, lastReadSeq: number) {
  if (!activeUser || !id || !lastReadSeq) return;
  const key = conversationKey(kind, id);
  if ((markedThrough.get(key) || 0) >= lastReadSeq) return;
  pendingReadSeq.set(key, Math.max(pendingReadSeq.get(key) || 0, lastReadSeq));
  if (pendingReadTimers.has(key)) return;
  const userId = activeUser;
  const timer = setTimeout(() => {
    pendingReadTimers.delete(key);
    const seq = pendingReadSeq.get(key) || 0;
    pendingReadSeq.delete(key);
    if (!seq || activeUser !== userId) return;
    void api.markChatRead(kind, id, seq).then(() => {
      markedThrough.set(key, Math.max(markedThrough.get(key) || 0, seq));
      scheduleSummaryRefresh();
    }).catch(() => undefined);
  }, 300);
  pendingReadTimers.set(key, timer);
}
