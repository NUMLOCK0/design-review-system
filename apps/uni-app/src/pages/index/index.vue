<template>
  <view class="page workbench-page">
    <view class="home-heading"><text class="eyebrow">COZI · 品牌协作</text><view class="title">把想法，变成好设计</view><view class="muted space-top">{{ userName }}，你的需求和设计进度都在这里。</view></view>
    <view class="summary"><view class="summary-kicker">今日协作</view><view class="summary-number-row"><text class="summary-number">{{ pendingCount }}</text><text class="summary-unit">项待你处理</text></view><view class="summary-copy">{{ pendingCount ? `需求资料 ${pendingForms} · 需求确认 ${pendingConfirmations}` : '需求确认、设计沟通与成果审核，随时跟进。' }}</view></view>
    <view class="quick-actions"><view class="quick-card" @tap="openFirstProject"><view class="quick-icon form-icon">单</view><view class="quick-title">填写需求单</view><view class="quick-hint">把需求整理清楚</view></view></view>
    <view class="search-box"><text class="search-icon">⌕</text><input v-model="search" class="search-input" placeholder="搜索项目名称或订单号" /></view>
    <view class="row section-heading"><text>最近项目</text><text class="open-label">{{ orders.length }} 个</text></view>
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
import type { CollaborationOrderSummary } from '@design-review/shared';
import { api, getSession, requireSession, saveSession } from '../../lib/api';
const orders = ref<CollaborationOrderSummary[]>([]); const search = ref(''); const error = ref(''); const loading = ref(false); const hasMore = ref(false); const userName = ref('你好');
const filtered = computed(() => orders.value.filter(order => `${order.title} ${order.orderNo}`.toLowerCase().includes(search.value.toLowerCase())));
const pendingForms = computed(() => orders.value.reduce((sum, order) => sum + order.pendingForms, 0));
const pendingConfirmations = computed(() => orders.value.reduce((sum, order) => sum + order.pendingConfirmations, 0));
const pendingCount = computed(() => pendingForms.value + pendingConfirmations.value);
onShow(() => { if (requireSession()) void load(true); });
onPullDownRefresh(() => { void load(true).finally(() => uni.stopPullDownRefresh()); });
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
function open(id: string) { uni.navigateTo({ url: `/pages/chat/chat?orderId=${encodeURIComponent(id)}` }); }
function openFirstProject() { if (orders.value[0]) uni.navigateTo({ url: `/pages/requirements/index?orderId=${encodeURIComponent(orders.value[0].orderId)}` }); else uni.showToast({ title: '暂无项目需求', icon: 'none' }); }
</script>
<style scoped>
.home-heading { padding:14rpx 4rpx 28rpx; }.summary { padding:28rpx 30rpx; border-radius:28rpx; color:#fff; background:linear-gradient(125deg,#4338ca,#7c3aed 56%,#0ea5e9); box-shadow:0 12rpx 28rpx rgba(67,56,202,.18); }.summary-kicker { display:inline-block; border-radius:30rpx; background:rgba(255,255,255,.18); padding:8rpx 18rpx; font-size:21rpx; }.summary-number-row { display:flex; align-items:baseline; gap:14rpx; margin-top:14rpx; }.summary-number { font-size:72rpx; line-height:1.1; font-weight:750; }.summary-unit { font-size:26rpx; font-weight:600; }.summary-copy { margin-top:10rpx; font-size:23rpx; color:rgba(255,255,255,.82); line-height:1.6; }.quick-actions { display:flex; gap:18rpx; margin:24rpx 0; }.quick-card { flex:1; min-width:0; padding:22rpx 20rpx; border-radius:22rpx; background:#fff; border:1rpx solid #e2e8f0; box-shadow:0 4rpx 16rpx rgba(30,41,59,.035); }.quick-icon { width:48rpx; height:48rpx; display:flex; align-items:center; justify-content:center; border-radius:16rpx; font-size:23rpx; font-weight:700; }.chat-icon { background:#eff6ff; color:#2563eb; }.form-icon { background:#fff7ed; color:#c2410c; }.quick-title { margin-top:15rpx; font-size:27rpx; font-weight:700; }.quick-hint { margin-top:7rpx; font-size:19rpx; color:#64748b; }.search-box { display:flex; align-items:center; gap:14rpx; height:82rpx; padding:0 22rpx; border-radius:18rpx; background:#fff; border:1rpx solid #e2e8f0; }.search-icon { color:#94a3b8; font-size:39rpx; }.search-input { flex:1; font-size:24rpx; }.section-heading { margin:34rpx 4rpx 18rpx; font-size:29rpx; font-weight:700; color:#1e293b; }.project { padding:26rpx; }.order-no { color:#64748b; font-size:22rpx; }.project-title { font-size:31rpx; font-weight:700; margin:18rpx 0 9rpx; color:#1e293b; }.project-footer { display:flex; gap:12rpx; align-items:center; flex-wrap:wrap; margin-top:22rpx; padding-top:20rpx; border-top:1rpx solid #f1f5f9; }.pending { font-size:20rpx; color:#a16207; background:#fef3c7; padding:8rpx 12rpx; border-radius:10rpx; }.open-label { color:#2563eb; font-size:23rpx; margin-left:auto; }.status-in_progress { background:#ecfdf5; color:#047857; }.status-submitted { background:#eff6ff; color:#2563eb; }.status-completed { background:#f1f5f9; color:#475569; }
</style>
