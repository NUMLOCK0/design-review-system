<template>
  <view class="page orders-page">
    <view class="heading"><view><text class="eyebrow">COZI · 品牌协作</text><view class="title">我的订单</view><view class="muted">查看发布、接单、交付与审核进度。</view></view><button class="create" @tap="create">＋ 发布订单</button></view>
    <view class="search-row"><input v-model="keyword" class="search" placeholder="搜索订单名称" confirm-type="search" @confirm="load(true)" /><text class="search-action" @tap="load(true)">搜索</text></view>
    <scroll-view scroll-x class="filters" :show-scrollbar="false"><view class="filter-row"><text v-for="item in filters" :key="item.value" class="filter" :class="{ selected: status === item.value }" @tap="selectStatus(item.value)">{{ item.label }}</text></view></scroll-view>
    <view v-if="error" class="error-box" @tap="load(true)">{{ error }} · 点击重试</view>
    <view v-if="loading && !orders.length" class="empty">正在加载订单…</view>
    <view v-for="order in orders" :key="order.id" class="order-card" @tap="open(order.id)">
      <view class="card-top"><text class="order-no">{{ order.orderNo }}</text><text class="status" :class="statusTone(order)">{{ statusLabel(order) }}</text></view>
      <view class="order-title">{{ order.title }}</view>
      <view class="order-meta">{{ order.category || '视觉设计' }} · {{ platformLabel(order.platform) }} · {{ imageCount(order) }} 张</view>
      <view class="card-bottom"><view><text class="price">¥{{ money(order.budget) }}</text><text class="deadline">交付 {{ dateText(order.deadline) }}</text></view><text class="arrow">查看详情 ›</text></view>
      <view v-if="order.pendingApplicationCount" class="application-hint">{{ order.pendingApplicationCount }} 位设计师申请 · 待确认</view>
    </view>
    <view v-if="!loading && !error && !orders.length" class="empty">{{ keyword ? '没有找到匹配订单' : '还没有订单，点击右上角发布设计需求。' }}</view>
    <button v-if="hasMore" class="more" :loading="loading" :disabled="loading" @tap="load(false)">加载更多</button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onShow, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import type { DesignOrder, PlatformType } from '@design-review/shared';
import { api, requireSession } from '../../lib/api';

const filters = [
  { value: 'all', label: '全部' }, { value: 'pending_deposit', label: '待付定金' },
  { value: 'pending_service_review', label: '待客服审核' }, { value: 'published', label: '待接单' },
  { value: 'claimed', label: '已接单' }, { value: 'in_progress', label: '设计中' },
  { value: 'submitted', label: '待审核稿' }, { value: 'completed', label: '已完成' },
  { value: 'rejected', label: '已驳回' }, { value: 'cancelled', label: '已关闭' },
];
const orders = ref<DesignOrder[]>([]); const status = ref('all'); const keyword = ref(''); const error = ref(''); const loading = ref(false); const page = ref(1); const hasMore = ref(false); let loadVersion = 0;
onShow(() => { if (requireSession()) void load(true); });
onPullDownRefresh(() => { void load(true).finally(() => uni.stopPullDownRefresh()); });
onReachBottom(() => { if (hasMore.value) void load(false); });
async function load(reset: boolean) {
  if ((!reset && loading.value) || !requireSession()) return;
  const version = ++loadVersion;
  loading.value = true; error.value = '';
  try {
    const next = reset ? 1 : page.value + 1;
    const result = await api.designOrders(status.value, keyword.value.trim(), next);
    if (version !== loadVersion) return;
    orders.value = reset ? result : [...orders.value, ...result.filter(item => !orders.value.some(order => order.id === item.id))];
    page.value = next; hasMore.value = result.length === 10;
  } catch (cause) { if (version === loadVersion) error.value = cause instanceof Error ? cause.message : '订单加载失败'; }
  finally { if (version === loadVersion) loading.value = false; }
}
function selectStatus(value: string) { if (status.value === value) return; status.value = value; orders.value = []; void load(true); }
function open(id: string) { uni.navigateTo({ url: `/pages/orders/detail?id=${encodeURIComponent(id)}` }); }
function create() { uni.navigateTo({ url: '/pages/orders/edit' }); }
function statusLabel(order: DesignOrder) { const key = order.publicationStatus === 'rejected' ? 'rejected' : order.status === 'open' ? order.publicationStatus || order.status : order.status; return filters.find(item => item.value === key)?.label || '协作中'; }
function statusTone(order: DesignOrder) { if (order.status === 'completed') return 'done'; if (order.status === 'cancelled' || order.publicationStatus === 'rejected') return 'closed'; if (order.publicationStatus === 'pending_deposit' || order.status === 'submitted') return 'pending'; return 'active'; }
function platformLabel(platform: PlatformType) { return ({ tmall: '天猫', taobao: '淘宝', douyin: '抖音', pinduoduo: '拼多多', universal: '全平台' } as Record<PlatformType, string>)[platform] || '全平台'; }
function imageCount(order: DesignOrder) { return (order.imageRequirementGroups || []).reduce((sum, group) => sum + (group.imageItems?.length || group.quantity || 0), 0); }
function money(value: number) { return Number(value || 0).toFixed(2); }
function dateText(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '待定' : date.toLocaleDateString('zh-CN'); }
</script>

<style scoped>
.orders-page { min-height:100vh; background:#f4f7fb; }.heading { display:flex; align-items:center; justify-content:space-between; gap:12rpx; margin:8rpx 2rpx 28rpx; }.heading .muted { margin-top:8rpx; font-size:21rpx; }.create { flex:none; margin:0; padding:0 20rpx; height:70rpx; line-height:70rpx; border-radius:14rpx; background:#2563eb; color:#fff; font-size:22rpx; font-weight:700; }.create::after,.more::after { border:0; }.search-row { display:flex; align-items:center; padding:0 18rpx; border:1rpx solid #e2e8f0; border-radius:17rpx; background:#fff; }.search { flex:1; min-width:0; height:82rpx; font-size:24rpx; }.search-action { color:#2563eb; font-size:22rpx; font-weight:650; }.filters { width:100%; margin:22rpx 0 20rpx; white-space:nowrap; }.filter-row { display:flex; gap:12rpx; width:max-content; }.filter { display:inline-block; padding:12rpx 22rpx; border-radius:30rpx; background:#fff; color:#64748b; font-size:21rpx; }.filter.selected { background:#2563eb; color:#fff; }.order-card { margin-bottom:16rpx; padding:25rpx; border-radius:22rpx; background:#fff; border:1rpx solid #e6edf5; box-shadow:0 4rpx 16rpx rgba(30,41,59,.035); }.card-top,.card-bottom { display:flex; align-items:center; justify-content:space-between; gap:14rpx; }.order-no,.order-meta,.deadline { color:#94a3b8; font-size:20rpx; }.status { padding:7rpx 15rpx; border-radius:20rpx; font-size:19rpx; white-space:nowrap; }.status.pending { color:#b45309; background:#fff7ed; }.status.active { color:#2563eb; background:#eff6ff; }.status.done { color:#047857; background:#ecfdf5; }.status.closed { color:#64748b; background:#f1f5f9; }.order-title { margin:16rpx 0 8rpx; color:#0f172a; font-size:29rpx; font-weight:700; line-height:1.4; }.card-bottom { margin-top:22rpx; padding-top:19rpx; border-top:1rpx solid #f1f5f9; }.card-bottom>view { display:flex; flex-direction:column; gap:5rpx; }.price { color:#1e293b; font-size:29rpx; font-weight:750; }.arrow { color:#2563eb; font-size:21rpx; }.application-hint { margin-top:15rpx; padding:12rpx 14rpx; border-radius:12rpx; background:#fffbeb; color:#92400e; font-size:20rpx; }.more { margin-top:20rpx; border-radius:16rpx; background:#fff; color:#2563eb; font-size:23rpx; }
</style>
