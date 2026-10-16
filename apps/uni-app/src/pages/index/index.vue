<template>
  <view class="page workbench-page">
    <view class="summary"><view class="summary-kicker">品牌方工作台</view><view class="summary-title">让好创意，顺利落地</view><view class="summary-copy">发布需求、与设计师沟通、审核每一版设计。</view><view class="hero-actions"><text class="hero-primary" @tap="createOrder">＋ 发布订单</text><text class="hero-secondary" @tap="openOrders">管理订单 ›</text></view></view>
    <view class="stats"><view class="stat" @tap="openSessions"><text class="stat-number">{{ pendingCount }}</text><text class="stat-label">待我处理</text><text class="stat-note">需求表单与确认</text></view><view class="stat" @tap="openOrders"><text class="stat-number">{{ recentOrders.length }}</text><text class="stat-label">最近订单</text><text class="stat-note">点击查看全部</text></view></view>
    <view class="row section-heading"><text>常用功能</text></view>
    <view class="quick-actions"><view class="quick-card" @tap="openSessions"><view class="quick-icon chat-icon">聊</view><view class="quick-title">会话沟通</view><view class="quick-hint">消息与表单</view></view><view class="quick-card" @tap="openReviews"><view class="quick-icon review-icon">稿</view><view class="quick-title">设计审稿</view><view class="quick-hint">标记与审核</view></view><view class="quick-card" @tap="openFirstProject"><view class="quick-icon form-icon">单</view><view class="quick-title">需求资料</view><view class="quick-hint">填写和确认</view></view></view>
    <view class="row section-heading"><text>最近订单</text><text class="open-label" @tap="openOrders">查看全部 ›</text></view>
    <view v-if="orderError" class="error-box" @tap="loadHighlights">{{ orderError }} · 点击重试</view>
    <view v-for="order in recentOrders" :key="order.id" class="recent-order" @tap="openDesignOrder(order.id)"><view class="row"><text class="order-no">{{ order.orderNo }}</text><text class="badge">{{ designStatusText(order) }}</text></view><view class="project-title">{{ order.title }}</view><view class="recent-bottom"><text>{{ order.category || '视觉设计' }}</text><text class="open-label">查看订单 ›</text></view></view>
    <view v-if="!recentOrders.length && !orderError" class="compact-empty">{{ loadingHighlights ? '正在加载订单…' : '还没有订单，点击上方发布你的设计需求。' }}</view>
    <view class="row section-heading"><text>协作项目</text><text class="open-label" @tap="openSessions">进入会话 ›</text></view>
    <view class="search-box"><text class="search-icon">⌕</text><input v-model="search" class="search-input" placeholder="搜索协作项目或订单号" /></view>
    <view v-if="error" class="error-box" @tap="load(true)">{{ error }} · 点击重试</view>
    <view v-if="loading && !orders.length" class="empty">正在同步项目…</view>
    <view v-for="order in filtered" :key="order.orderId" class="panel project" @tap="open(order.orderId)">
      <view class="row"><text class="order-no">{{ order.orderNo }}</text><text class="badge" :class="`status-${order.status}`">{{ statusText(order.status) }}</text></view>
      <view class="project-title">{{ order.title }}</view><view class="muted">{{ order.counterpartName }}</view>
      <view class="project-footer"><text v-if="order.pendingForms" class="pending">待填写 {{ order.pendingForms }}</text><text v-if="order.pendingConfirmations" class="pending">待确认 {{ order.pendingConfirmations }}</text><text v-if="!order.pendingForms && !order.pendingConfirmations" class="muted">{{ order.requirementVersion ? `正式需求 v${order.requirementVersion}` : '沟通并完善需求' }}</text><text class="open-label">进入协作 →</text></view>
    </view>
    <view v-if="!loading && !error && !filtered.length" class="empty">{{ search ? '没有找到匹配项目' : '暂无项目。工作台创建的订单会同步到这里。' }}</view>
    <button v-if="hasMore && !search" class="secondary" :loading="loading" :disabled="loading" @tap="load(false)">加载更多</button>
  </view>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import type { CollaborationOrderSummary, DesignOrder } from '@design-review/shared';
import { api, getSession, requireSession, saveSession } from '../../lib/api';
import { siteUnreadCount } from '../../lib/notification-center';
const orders = ref<CollaborationOrderSummary[]>([]); const recentOrders = ref<DesignOrder[]>([]); const search = ref(''); const error = ref(''); const orderError = ref(''); const loading = ref(false); const loadingHighlights = ref(false); const hasMore = ref(false); const userName = ref('');
const filtered = computed(() => orders.value.filter(order => `${order.title} ${order.orderNo}`.toLowerCase().includes(search.value.toLowerCase())));
const pendingForms = computed(() => orders.value.reduce((sum, order) => sum + order.pendingForms, 0));
const pendingConfirmations = computed(() => orders.value.reduce((sum, order) => sum + order.pendingConfirmations, 0));
const pendingCount = computed(() => pendingForms.value + pendingConfirmations.value);
onShow(() => { if (requireSession()) { void load(true); void loadHighlights(); } });
onPullDownRefresh(() => { void Promise.all([load(true), loadHighlights()]).finally(() => uni.stopPullDownRefresh()); });
onReachBottom(() => { if (hasMore.value) void load(false); });
async function load(reset: boolean) {
  if (loading.value || !requireSession()) return;
  loading.value = true; error.value = '';
  try {
    if (reset) { const user = await api.me(); const session = getSession(); if (user.role !== 'advertiser') throw new Error('当前账号不是品牌方'); if (session) saveSession({ ...session, user }); userName.value = user.name; }
    const list = await api.orders(reset ? 0 : orders.value.length);
    orders.value = reset ? list : [...orders.value, ...list.filter(item => !orders.value.some(order => order.orderId === item.orderId))];
    hasMore.value = list.length === 50;
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '项目加载失败'; }
  finally { loading.value = false; }
}
function statusText(status: string) { return ({ open: '需求沟通', claimed: '已接单', in_progress: '设计中', submitted: '待审核', completed: '已完成', cancelled: '已关闭' } as Record<string, string>)[status] || '协作中'; }
async function loadHighlights() {
  if (loadingHighlights.value || !requireSession()) return;
  loadingHighlights.value = true; orderError.value = '';
  try { const list = await api.designOrders('all', '', 1); recentOrders.value = list.slice(0, 3); }
  catch (cause) { orderError.value = cause instanceof Error ? cause.message : '订单加载失败'; }
  finally { loadingHighlights.value = false; }
}
function designStatusText(order: DesignOrder) { const status = order.status === 'open' ? order.publicationStatus || 'published' : order.status; return ({ pending_deposit: '待付定金', pending_service_review: '待客服审核', published: '待接单', claimed: '已接单', in_progress: '设计中', submitted: '待审核', completed: '已完成', rejected: '已驳回', cancelled: '已关闭' } as Record<string, string>)[status] || '协作中'; }
function open(id: string) { uni.navigateTo({ url: `/pages/chat/chat?orderId=${encodeURIComponent(id)}` }); }
function openDesignOrder(id: string) { uni.navigateTo({ url: `/pages/orders/detail?id=${encodeURIComponent(id)}` }); }
function openFirstProject() { if (orders.value[0]) uni.navigateTo({ url: `/pages/requirements/index?orderId=${encodeURIComponent(orders.value[0].orderId)}` }); else uni.showToast({ title: '暂无项目需求', icon: 'none' }); }
function openOrders() { uni.switchTab({ url: '/pages/orders/index' }); }
function openMessages() { uni.navigateTo({ url: '/pages/messages/index' }); }
function openSessions() { uni.switchTab({ url: '/pages/sessions/index' }); }
function openReviews() { uni.navigateTo({ url: '/pages/reviews/index' }); }
function createOrder() { uni.navigateTo({ url: '/pages/orders/edit' }); }
</script>
<style scoped>
.workbench-page { min-height:100vh; }
.summary { padding:28rpx 30rpx; border-radius:28rpx; color:#fff; background:linear-gradient(125deg,#4338ca,#7c3aed 56%,#0ea5e9); box-shadow:0 12rpx 28rpx rgba(67,56,202,.18); }.summary-kicker { display:inline-block; border-radius:30rpx; background:rgba(255,255,255,.18); padding:8rpx 18rpx; font-size:21rpx; }.summary-number-row { display:flex; align-items:baseline; gap:14rpx; margin-top:14rpx; }.summary-number { font-size:72rpx; line-height:1.1; font-weight:750; }.summary-unit { font-size:26rpx; font-weight:600; }.summary-copy { margin-top:10rpx; font-size:23rpx; color:rgba(255,255,255,.82); line-height:1.6; }.quick-actions { display:flex; gap:18rpx; margin:24rpx 0; }.quick-card { flex:1; min-width:0; padding:22rpx 20rpx; border-radius:22rpx; background:#fff; border:1rpx solid #e2e8f0; box-shadow:0 4rpx 16rpx rgba(30,41,59,.035); }.quick-icon { width:48rpx; height:48rpx; display:flex; align-items:center; justify-content:center; border-radius:16rpx; font-size:23rpx; font-weight:700; }.chat-icon { background:#eff6ff; color:#2563eb; }.form-icon { background:#fff7ed; color:#c2410c; }.quick-title { margin-top:15rpx; font-size:27rpx; font-weight:700; }.quick-hint { margin-top:7rpx; font-size:19rpx; color:#64748b; }.search-box { display:flex; align-items:center; gap:14rpx; height:82rpx; padding:0 22rpx; border-radius:18rpx; background:#fff; border:1rpx solid #e2e8f0; }.search-icon { color:#94a3b8; font-size:39rpx; }.search-input { flex:1; font-size:24rpx; }.section-heading { margin:34rpx 4rpx 18rpx; font-size:29rpx; font-weight:700; color:#1e293b; }.project { padding:26rpx; }.order-no { color:#64748b; font-size:22rpx; }.project-title { font-size:31rpx; font-weight:700; margin:18rpx 0 9rpx; color:#1e293b; }.project-footer { display:flex; gap:12rpx; align-items:center; flex-wrap:wrap; margin-top:22rpx; padding-top:20rpx; border-top:1rpx solid #f1f5f9; }.pending { font-size:20rpx; color:#a16207; background:#fef3c7; padding:8rpx 12rpx; border-radius:10rpx; }.open-label { color:#2563eb; font-size:23rpx; margin-left:auto; }.status-in_progress { background:#ecfdf5; color:#047857; }.status-submitted { background:#eff6ff; color:#2563eb; }.status-completed { background:#f1f5f9; color:#475569; }
.summary-unit { margin-left:14rpx; }
.search-input { min-width:0; width:0; }
.project-footer { column-gap:12rpx; row-gap:12rpx; }
.workbench-page { background:#f4f7fb; }
.bell { position:relative; display:flex; align-items:center; justify-content:center; width:74rpx; height:74rpx; flex:none; border-radius:22rpx; background:#fff; color:#2563eb; font-size:36rpx; }
.bell-dot { position:absolute; right:13rpx; top:11rpx; width:13rpx; height:13rpx; border-radius:50%; background:#ef4444; }
.summary { background:linear-gradient(125deg,#172642,#344870); border-radius:26rpx; box-shadow:0 12rpx 28rpx rgba(23,38,66,.14); }
.summary-kicker { background:rgba(255,255,255,.15); }.summary-title { margin-top:20rpx; font-size:36rpx; font-weight:750; }.summary-copy { margin-top:9rpx; font-size:22rpx; }
.hero-actions { display:flex; align-items:center; gap:24rpx; margin-top:28rpx; }.hero-primary { padding:15rpx 24rpx; border-radius:12rpx; background:#fff; color:#172642; font-size:22rpx; font-weight:700; }.hero-secondary { color:#fff; font-size:22rpx; }
.stats { display:flex; gap:17rpx; margin-top:18rpx; }.stat { flex:1; min-width:0; padding:20rpx 24rpx; border-radius:20rpx; background:#fff; border:1rpx solid #e8eef5; }.stat-number { display:block; color:#1e293b; font-size:40rpx; font-weight:750; }.stat-label { display:block; color:#334155; font-size:22rpx; font-weight:700; }.stat-note { display:block; margin-top:4rpx; color:#94a3b8; font-size:18rpx; }
.section-heading { margin:30rpx 4rpx 17rpx; }.quick-actions { margin:0; gap:12rpx; }.quick-card { padding:19rpx 13rpx; border-radius:18rpx; }.quick-icon { width:50rpx; height:50rpx; }.review-icon { background:#f5f3ff; color:#7c3aed; }.quick-title { font-size:22rpx; }.quick-hint { font-size:18rpx; }
.recent-order { padding:21rpx 24rpx; margin-bottom:13rpx; border-radius:20rpx; background:#fff; border:1rpx solid #e8eef5; }.recent-order .project-title { margin:12rpx 0; font-size:27rpx; }.recent-bottom { display:flex; justify-content:space-between; color:#94a3b8; font-size:20rpx; }.compact-empty { padding:28rpx; border-radius:18rpx; background:#fff; color:#94a3b8; font-size:21rpx; text-align:center; }.search-box { margin-bottom:16rpx; }
.bell-count { position:absolute; top:-9rpx; right:-9rpx; min-width:31rpx; height:31rpx; padding:0 6rpx; border-radius:20rpx; background:#ef4444; color:#fff; font-size:18rpx; font-weight:700; line-height:31rpx; text-align:center; }
</style>
