<template>
  <view class="page sessions-page">
    <view class="search-box"><text class="search-icon">⌕</text><input v-model="search" class="search-input"
        placeholder="搜索项目或对话成员" /></view>
    <view class="filters"><text v-for="item in filters" :key="item.id" class="filter"
        :class="{ active: filter === item.id }" @tap="filter = item.id">{{ item.label }}</text></view>
    <view v-if="error" class="error-box" @tap="load">{{ error }} · 点击重试</view>
    <view v-if="loading && !items.length" class="empty">正在同步会话…</view>
    <view v-for="item in filtered" :key="`${item.kind}:${item.id}`" class="session-card" @tap="open(item)">
      <view class="avatar" :class="item.kind === 'intake' ? 'avatar-invite' : ''">{{ (item.counterpart ||
        item.title).slice(0, 1) }}</view>
      <view class="session-main">
        <view class="session-top"><text class="session-title">{{ item.title }}</text><text class="session-time">{{
          timeText(item.time) }}</text></view>
        <view class="session-meta"><text>{{ item.kind === 'intake' ? '邀请会话' : `${item.orderNo} · ${item.counterpart ||
            '订单协作'}` }}</text><text class="status-pill" :class="item.statusClass">{{ item.statusLabel }}</text></view>
        <view class="session-bottom"><text class="last-message">{{ item.preview }}</text><text v-if="unreadFor(item)"
            class="pending-dot">{{ unreadFor(item) > 99 ? '99+' : unreadFor(item) }}</text></view>
      </view>
    </view>
    <view v-if="!loading && !error && !filtered.length" class="empty">{{ search ? '没有找到匹配会话' : `当前账号${userName ?
      `「${userName}」` : ''}暂无会话，请确认使用受邀账号登录。` }}</view>
  </view>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow, onHide, onUnload, onPullDownRefresh } from '@dcloudio/uni-app';
import { getSession, requireSession, request, api, type IntakeSession } from '../../lib/api';
import { subscribeChatNotifications } from '../../lib/chat-live';
import { chatUnreadConversations } from '../../lib/notification-center';

type OrderConversation = { orderId: string; orderNo: string; title: string; category: string; status: string; counterpartName: string; lastBody: string; lastMessageAt: string | null };
type SessionItem = { id: string; kind: 'order' | 'intake'; title: string; orderNo: string; counterpart: string; preview: string; time: string | null; statusLabel: string; statusClass: string; pendingCount: number };
const items = ref<SessionItem[]>([]); const loading = ref(false); const error = ref(''); const search = ref(''); const filter = ref('all'); const userId = ref(''); const userName = ref('');
let timer: ReturnType<typeof setInterval> | undefined; let unsubscribeLive: (() => void) | undefined;
const filters = [{ id: 'all', label: '全部' }, { id: 'pending', label: '待处理' }, { id: 'invite', label: '邀请会话' }];
function unreadFor(item: SessionItem) { return chatUnreadConversations.value[`${item.kind}:${item.id}`] || 0; }
const filtered = computed(() => items.value.filter(item => {
  const matchesText = `${item.title} ${item.orderNo} ${item.counterpart} ${item.preview}`.toLowerCase().includes(search.value.trim().toLowerCase());
  const matchesFilter = filter.value === 'all' || (filter.value === 'pending' ? item.statusLabel.includes('待') : item.kind === 'intake');
  return matchesText && matchesFilter;
}));
onShow(() => { if (requireSession()) { userId.value = getSession()?.user.id || ''; userName.value = getSession()?.user.name || ''; void load(); if (!unsubscribeLive) unsubscribeLive = subscribeChatNotifications(() => { void load(); }); if (!timer) timer = setInterval(() => { void load(); }, 15000); } });
function stop() { if (timer) clearInterval(timer); timer = undefined; unsubscribeLive?.(); unsubscribeLive = undefined; }
onHide(stop); onUnload(stop);
onPullDownRefresh(() => { void load().finally(() => uni.stopPullDownRefresh()); });
async function load() {
  if (loading.value || !requireSession()) return;
  loading.value = true; error.value = '';
  try {
    const [ordersResult, intakesResult] = await Promise.allSettled([request<OrderConversation[]>('/chat/conversations'), api.intakeSessions()]);
    if (ordersResult.status === 'rejected' && intakesResult.status === 'rejected') throw intakesResult.reason;
    const orders = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
    const intakes = intakesResult.status === 'fulfilled' ? intakesResult.value : [];
    if (ordersResult.status === 'rejected' || intakesResult.status === 'rejected') error.value = '部分会话暂未同步，点击重试';
    const orderItems: SessionItem[] = orders.map(item => ({ id: item.orderId, kind: 'order', title: item.title, orderNo: item.orderNo, counterpart: item.counterpartName, preview: item.lastBody || item.category || '打开会话，继续沟通', time: item.lastMessageAt, statusLabel: ({ open: '沟通中', claimed: '已接单', in_progress: '设计中', submitted: '待审核', completed: '已完成', cancelled: '已关闭' } as Record<string, string>)[item.status] || '协作中', statusClass: item.status === 'submitted' ? 'status-blue' : item.status === 'completed' ? 'status-gray' : 'status-green', pendingCount: 0 }));
    const intakeItems: SessionItem[] = intakes.map((item: IntakeSession) => ({ id: item.id, kind: 'intake', title: item.title, orderNo: '', counterpart: item.creatorId === userId.value ? item.guestName || '等待对方加入' : item.creatorName, preview: item.lastSeq ? '打开查看最新沟通' : item.creatorId === userId.value ? '等待对方加入 · 点开分享会话' : '你已加入会话，可以开始沟通', time: item.updatedAt, statusLabel: item.guestId ? '沟通中' : '待邀请', statusClass: item.guestId ? 'status-green' : 'status-blue', pendingCount: 0 }));
    items.value = [...orderItems, ...intakeItems].sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime());
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '会话加载失败'; }
  finally { loading.value = false; }
}
function open(item: SessionItem) { uni.navigateTo({ url: item.kind === 'intake' ? `/pages/sessions/chat?id=${encodeURIComponent(item.id)}` : `/pages/chat/chat?orderId=${encodeURIComponent(item.id)}` }); }
function timeText(value: string | null) { if (!value) return ''; const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; const now = new Date(); return date.toDateString() === now.toDateString() ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' }); }
</script>
<style>
.sessions-page {
  min-height: 100vh;
  padding-top: 28rpx;
}

.page-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 4rpx 26rpx;
}

.page-heading .title {
  margin-bottom: 4rpx;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 14rpx;
  height: 82rpx;
  padding: 0 22rpx;
  border-radius: 18rpx;
  background: #fff;
  border: 1rpx solid #e2e8f0;
}

.search-icon {
  color: #94a3b8;
  font-size: 39rpx;
}

.search-input {
  flex: 1;
  font-size: 24rpx;
}

.filters {
  display: flex;
  gap: 12rpx;
  margin: 22rpx 0;
}

.filter {
  padding: 12rpx 24rpx;
  border-radius: 30rpx;
  background: #fff;
  border: 1rpx solid #e2e8f0;
  color: #64748b;
  font-size: 22rpx;
}

.filter.active {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}

.session-card {
  display: flex;
  gap: 20rpx;
  padding: 24rpx 18rpx;
  margin-bottom: 14rpx;
  border-radius: 22rpx;
  background: #fff;
  border: 1rpx solid #e2e8f0;
  box-shadow: 0 4rpx 18rpx rgba(30, 41, 59, .035);
}

.avatar {
  width: 76rpx;
  height: 76rpx;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #c88c66;
  color: #fff;
  font-size: 30rpx;
  font-weight: 700;
}

.avatar-invite {
  background: linear-gradient(135deg, #6366f1, #38bdf8);
}

.session-main {
  flex: 1;
  min-width: 0;
}

.session-top,
.session-meta,
.session-bottom {
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.session-top {
  justify-content: space-between;
}

.session-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 26rpx;
  font-weight: 700;
  color: #1e293b;
}

.session-time {
  flex: none;
  font-size: 19rpx;
  color: #94a3b8;
}

.session-meta {
  justify-content: space-between;
  margin-top: 9rpx;
  color: #64748b;
  font-size: 20rpx;
}

.session-meta>text:first-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-pill {
  flex: none;
  border-radius: 30rpx;
  padding: 7rpx 14rpx;
  font-size: 18rpx;
}

.status-blue {
  background: #eff6ff;
  color: #2563eb;
}

.status-green {
  background: #ecfdf5;
  color: #047857;
}

.status-gray {
  background: #f1f5f9;
  color: #475569;
}

.session-bottom {
  justify-content: space-between;
  margin-top: 10rpx;
}

.last-message {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #64748b;
  font-size: 21rpx;
}

.pending-dot {
  min-width: 30rpx;
  height: 30rpx;
  line-height: 30rpx;
  padding: 0 6rpx;
  border-radius: 50rpx;
  text-align: center;
  background: #e46855;
  color: #fff;
  font-size: 17rpx;
}
</style>
