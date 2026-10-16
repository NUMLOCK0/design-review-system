<template>
  <view class="page messages-page">
    <view class="section-title"><text>消息分类</text><text v-if="unreadCount" class="read-all" @tap="markAll">全部已读</text></view>
    <view v-if="error" class="error-box" @tap="load">{{ error }} · 点击重试</view>
    <view v-if="loading && !categories.length" class="empty">正在同步消息…</view>
    <view v-for="category in categories" :key="category.type" class="category-card" @tap="openCategory(category.type)"><view class="category-icon" :class="`tone-${category.type}`">{{ icons[category.type] }}</view><view class="category-main"><view class="category-top"><text class="category-name">{{ names[category.type] }}</text><text class="date">{{ category.latest ? timeText(category.latest.createdAt) : '' }}</text></view><text class="preview">{{ category.latest?.title || '暂无消息' }}</text></view><view v-if="category.unreadCount" class="unread-badge">{{ category.unreadCount > 99 ? '99+' : category.unreadCount }}</view><text v-else class="chevron">›</text></view>
    <view v-if="!loading && !error && !categories.some(item => item.total)" class="empty">暂时没有消息，新的协作动态会显示在这里。</view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onHide, onShow, onPullDownRefresh, onUnload } from '@dcloudio/uni-app';
import type { SiteMessage, SiteMessageType } from '@design-review/shared';
import { api, requireSession } from '../../lib/api';
import { refreshUnreadCounts, siteUnreadCount } from '../../lib/notification-center';
import { subscribeChatNotifications } from '../../lib/chat-live';
type Category = { type: SiteMessageType; total: number; unreadCount: number; latest: Pick<SiteMessage, 'id' | 'title' | 'content' | 'createdAt'> | null };
const names: Record<SiteMessageType, string> = { system: '系统消息', order: '订单消息', review: '审核消息', dispute: '纠纷消息', announcement: '平台公告' };
const icons: Record<SiteMessageType, string> = { system: '系', order: '单', review: '审', dispute: '纠', announcement: '告' };
const categories = ref<Category[]>([]); const unreadCount = ref(0); const loading = ref(false); const error = ref('');
let unsubscribeLive: (() => void) | undefined;
onShow(() => { if (requireSession()) { void load(); if (!unsubscribeLive) unsubscribeLive = subscribeChatNotifications(signal => { if (signal.type === 'site:message') void load(); }); } });
function stop() { unsubscribeLive?.(); unsubscribeLive = undefined; }
onHide(stop); onUnload(stop);
onPullDownRefresh(() => { void load().finally(() => uni.stopPullDownRefresh()); });
async function load() {
  if (!requireSession() || loading.value) return;
  loading.value = true; error.value = '';
  try { const result = await api.messageSummary(); categories.value = result.categories; unreadCount.value = result.unreadCount; siteUnreadCount.value = result.unreadCount; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '消息加载失败'; }
  finally { loading.value = false; }
}
async function markAll() {
  if (loading.value || !unreadCount.value) return;
  loading.value = true;
  try { await api.markMessagesRead(); unreadCount.value = 0; siteUnreadCount.value = 0; categories.value = categories.value.map(item => ({ ...item, unreadCount: 0 })); void refreshUnreadCounts(); uni.showToast({ title: '已全部标记为已读', icon: 'success' }); }
  catch (cause) { uni.showToast({ title: cause instanceof Error ? cause.message : '操作失败', icon: 'none' }); }
  finally { loading.value = false; }
}
function openCategory(type: SiteMessageType) { uni.navigateTo({ url: `/pages/messages/category?type=${type}` }); }
function timeText(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; const now = new Date(); return date.toDateString() === now.toDateString() ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }); }
</script>

<style scoped>
.messages-page { min-height:100vh; background:#f4f7fb; }.read-all { padding:8rpx 0 8rpx 14rpx; color:#2563eb; font-size:22rpx; }
.section-title { display:flex; align-items:center; justify-content:space-between; margin:6rpx 2rpx 18rpx; color:#1e293b; font-size:28rpx; font-weight:700; }.category-card { display:flex; align-items:center; gap:17rpx; min-height:116rpx; padding:18rpx 20rpx; margin-bottom:13rpx; border-radius:19rpx; background:#fff; border:1rpx solid #e9eef5; }.category-icon { width:72rpx; height:72rpx; flex:none; display:flex; align-items:center; justify-content:center; border-radius:21rpx; font-size:26rpx; font-weight:700; }.tone-system { color:#475569; background:#f1f5f9; }.tone-order { color:#2563eb; background:#eff6ff; }.tone-review { color:#7c3aed; background:#f5f3ff; }.tone-dispute { color:#b45309; background:#fff7ed; }.tone-announcement { color:#059669; background:#ecfdf5; }.category-main { flex:1; min-width:0; }.category-top { display:flex; justify-content:space-between; gap:10rpx; }.category-name { color:#1e293b; font-size:25rpx; font-weight:700; }.date { color:#94a3b8; font-size:19rpx; }.preview { display:block; overflow:hidden; margin-top:9rpx; color:#64748b; font-size:21rpx; text-overflow:ellipsis; white-space:nowrap; }.unread-badge { min-width:32rpx; padding:4rpx 9rpx; border-radius:20rpx; color:#fff; background:#ef5b50; text-align:center; font-size:17rpx; }.chevron { color:#cbd5e1; font-size:32rpx; }
</style>
