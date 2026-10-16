<template>
  <view class="page category-page">
    <view class="heading"><view><text class="eyebrow">消息中心</text><view class="title">{{ categoryLabel }}</view><text class="muted">{{ unreadCount }} 条未读 · 点击消息查看详情</text></view><text v-if="unreadCount" class="read-all" @tap="markAll">全部已读</text></view>
    <view v-if="error" class="error-box" @tap="load(true)">{{ error }} · 点击重试</view>
    <view v-for="message in messages" :key="message.id" class="message-card" :class="{ unread: !message.isRead }" @tap="openMessage(message.id)">
      <view class="message-top"><text class="message-title">{{ message.title }}</text><text class="message-date">{{ timeText(message.createdAt) }}</text></view>
      <text class="message-content">{{ message.content }}</text>
      <view class="message-footer"><text>{{ message.senderName || categoryLabel }}</text><text v-if="!message.isRead" class="unread-mark">未读</text><text class="chevron">›</text></view>
    </view>
    <view v-if="!loading && !error && !messages.length" class="empty">这个分类还没有消息。</view>
    <button v-if="hasMore" class="more-button" :loading="loading" @tap="load(false)">加载更多</button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onHide, onLoad, onShow, onPullDownRefresh, onUnload } from '@dcloudio/uni-app';
import type { SiteMessage, SiteMessageType } from '@design-review/shared';
import { api, requireSession } from '../../lib/api';
import { refreshUnreadCounts } from '../../lib/notification-center';
import { subscribeChatNotifications } from '../../lib/chat-live';
const names: Record<SiteMessageType, string> = { system: '系统消息', order: '订单消息', review: '审核消息', dispute: '纠纷消息', announcement: '平台公告' };
const type = ref<SiteMessageType>('system'); const categoryLabel = computed(() => names[type.value]);
const messages = ref<SiteMessage[]>([]); const unreadCount = ref(0); const loading = ref(false); const error = ref(''); const hasMore = ref(false); const page = ref(1);
let unsubscribeLive: (() => void) | undefined;
onLoad(options => { const selected = String(options?.type || 'system') as SiteMessageType; type.value = selected in names ? selected : 'system'; });
onShow(() => { if (requireSession()) { void load(true); if (!unsubscribeLive) unsubscribeLive = subscribeChatNotifications(signal => { if (signal.type === 'site:message') void load(true); }); } });
function stop() { unsubscribeLive?.(); unsubscribeLive = undefined; }
onHide(stop); onUnload(stop);
onPullDownRefresh(() => { void load(true).finally(() => uni.stopPullDownRefresh()); });
async function load(reset: boolean) {
  if (!requireSession() || loading.value) return;
  loading.value = true; error.value = '';
  try { const next = reset ? 1 : page.value + 1; const result = await api.messagesByType(type.value, next); messages.value = reset ? result.list : [...messages.value, ...result.list.filter(item => !messages.value.some(existing => existing.id === item.id))]; page.value = next; hasMore.value = result.hasMore; unreadCount.value = result.filteredUnreadCount; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '消息加载失败'; }
  finally { loading.value = false; }
}
async function markAll() {
  if (loading.value || !unreadCount.value) return;
  loading.value = true;
  try { await api.markMessagesRead(type.value); unreadCount.value = 0; messages.value = messages.value.map(item => ({ ...item, isRead: true, readAt: item.readAt || new Date().toISOString() })); void refreshUnreadCounts(); uni.showToast({ title: '已标记为已读', icon: 'success' }); }
  catch (cause) { uni.showToast({ title: cause instanceof Error ? cause.message : '操作失败', icon: 'none' }); }
  finally { loading.value = false; }
}
function openMessage(id: string) { uni.navigateTo({ url: `/pages/messages/detail?id=${encodeURIComponent(id)}` }); }
function timeText(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; const now = new Date(); return date.toDateString() === now.toDateString() ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }); }
</script>

<style scoped>
.category-page { min-height:100vh; background:#f4f7fb; }.heading { display:flex; align-items:center; justify-content:space-between; margin-bottom:28rpx; }.heading .muted { display:block; margin-top:5rpx; font-size:21rpx; }.read-all { color:#2563eb; font-size:22rpx; }
.message-card { padding:24rpx; margin-bottom:14rpx; border-radius:20rpx; background:#fff; border:1rpx solid #e9eef5; }.message-card.unread { border-left:5rpx solid #3b82f6; }.message-top { display:flex; justify-content:space-between; gap:14rpx; }.message-title { flex:1; color:#1e293b; font-size:25rpx; font-weight:700; }.message-date { flex:none; color:#94a3b8; font-size:19rpx; }.message-content { display:-webkit-box; overflow:hidden; margin-top:12rpx; color:#64748b; font-size:22rpx; line-height:1.6; -webkit-box-orient:vertical; -webkit-line-clamp:2; }.message-footer { display:flex; align-items:center; gap:10rpx; margin-top:15rpx; color:#94a3b8; font-size:19rpx; }.message-footer text:first-child { flex:1; }.unread-mark { color:#2563eb; }.chevron { color:#cbd5e1; font-size:32rpx; }.more-button { margin:22rpx 0; border-radius:16rpx; background:#fff; color:#2563eb; font-size:23rpx; }.more-button::after { border:0; }
</style>
