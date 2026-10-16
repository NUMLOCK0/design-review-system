<template>
  <view class="page billing-page"><view class="heading"><text class="eyebrow">品牌方空间</text><view class="title">订单账单</view><view class="muted">按订单查看预算、费用与付款进度。</view></view>
    <view class="summary"><view><text>已加载预算</text><text>¥{{ money(totalBudget) }}</text></view><view><text>已加载订单</text><text>{{ orders.length }} 单</text></view><view><text>已结算预算</text><text>¥{{ money(settledBudget) }}</text></view><view><text>处理中预算</text><text>¥{{ money(processingBudget) }}</text></view></view>
    <view class="filters"><text v-for="item in filters" :key="item.value" class="filter" :class="{ selected: filter === item.value }" @tap="selectFilter(item.value)">{{ item.label }}</text></view>
    <view class="list-heading"><text>账单明细</text><text>按订单顺序展示</text></view><view v-if="error" class="error-box" @tap="load(true)">{{ error }} · 点击重试</view><view v-if="loading && !orders.length" class="empty">正在加载账单…</view>
    <view v-for="order in orders" :key="order.id" class="bill-card" @tap="open(order.id)"><view class="bill-top"><view><text class="bill-title">{{ order.title }}</text><text class="bill-no">{{ order.orderNo }} · {{ dateText(order.updatedAt || order.createdAt) }}</text></view><text class="status" :class="order.paymentStatus === 'paid' ? 'settled' : order.status === 'cancelled' ? 'closed' : ''">{{ statusText(order) }}</text></view><view class="amounts"><view><text>订单预算</text><text>¥{{ money(order.budget) }}</text></view><view><text>平台服务费</text><text>¥{{ money(serviceFee(order)) }}</text></view><view><text>设计师所得</text><text>¥{{ money(order.designerPayout) }}</text></view></view><view class="bill-footer">查看订单详情 ›</view></view>
    <view v-if="!loading && !error && !orders.length" class="empty">当前没有{{ filter === 'all' ? '' : filters.find(item => item.value === filter)?.label }}账单。</view>
    <button v-if="hasMore" class="more" :loading="loading" :disabled="loading" @tap="load(false)">加载更多</button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import type { DesignOrder } from '@design-review/shared';
import { api, requireSession } from '../../lib/api';
type BillingFilter = 'all' | 'processing' | 'settled' | 'closed';
const filters: Array<{ value: BillingFilter; label: string }> = [{ value: 'all', label: '全部' }, { value: 'processing', label: '处理中' }, { value: 'settled', label: '已结算' }, { value: 'closed', label: '已关闭' }];
const filter = ref<BillingFilter>('all'); const orders = ref<DesignOrder[]>([]); const loading = ref(false); const error = ref(''); const page = ref(1); const hasMore = ref(false); let loadVersion = 0;
const totalBudget = computed(() => orders.value.reduce((sum, order) => sum + order.budget, 0));
const settledBudget = computed(() => orders.value.filter(order => order.paymentStatus === 'paid').reduce((sum, order) => sum + order.budget, 0));
const processingBudget = computed(() => orders.value.filter(order => order.status !== 'cancelled' && order.paymentStatus !== 'paid').reduce((sum, order) => sum + order.budget, 0));
onShow(() => { if (requireSession()) void load(true); });
onPullDownRefresh(() => { void load(true).finally(() => uni.stopPullDownRefresh()); });
onReachBottom(() => { if (hasMore.value) void load(false); });
async function load(reset: boolean) { if ((!reset && loading.value) || !requireSession()) return; const version = ++loadVersion; loading.value = true; error.value = ''; try { const next = reset ? 1 : page.value + 1; const result = await api.designOrders('all', '', next, filter.value); if (version !== loadVersion) return; orders.value = reset ? result : [...orders.value, ...result.filter(item => !orders.value.some(order => order.id === item.id))]; page.value = next; hasMore.value = result.length === 10; } catch (cause) { if (version === loadVersion) error.value = cause instanceof Error ? cause.message : '账单加载失败'; } finally { if (version === loadVersion) loading.value = false; } }
function selectFilter(value: BillingFilter) { if (filter.value === value) return; filter.value = value; orders.value = []; void load(true); }
function open(id: string) { uni.navigateTo({ url: `/pages/orders/detail?id=${encodeURIComponent(id)}` }); }
function statusText(order: DesignOrder) { if (order.status === 'cancelled') return '已关闭'; if (order.paymentStatus === 'paid') return '已结算'; if (order.paymentStatus === 'balance_pending') return '待付尾款'; if (order.paymentStatus === 'deposit_pending' || order.publicationStatus === 'pending_deposit') return '待付定金'; if (order.publicationStatus === 'pending_service_review') return '客服审核中'; return order.status === 'completed' ? '待验收付款' : '处理中'; }
function serviceFee(order: DesignOrder) { return (order.balanceAmount ?? order.budget - (order.depositAmount || 0)) * order.platformCommissionRate; }
function money(value: number) { return Number(value || 0).toFixed(2); }
function dateText(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('zh-CN'); }
</script>

<style scoped>
.billing-page { min-height:100vh; background:#f4f7fb; }.heading { margin:8rpx 4rpx 25rpx; }.heading .muted { margin-top:8rpx; font-size:21rpx; }.summary { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14rpx; }.summary>view { display:flex; flex-direction:column; gap:9rpx; padding:22rpx; border-radius:18rpx; background:#fff; }.summary text:first-child { color:#64748b; font-size:20rpx; }.summary text:last-child { color:#1e293b; font-size:27rpx; font-weight:750; }.summary>view:first-child text:last-child { color:#2563eb; }.filters { display:flex; flex-wrap:wrap; gap:12rpx; margin:25rpx 0; }.filter { padding:11rpx 20rpx; border-radius:26rpx; background:#fff; color:#64748b; font-size:21rpx; }.filter.selected { background:#2563eb; color:#fff; }.list-heading { display:flex; align-items:center; justify-content:space-between; margin-bottom:15rpx; }.list-heading text:first-child { color:#1e293b; font-size:26rpx; font-weight:700; }.list-heading text:last-child { color:#94a3b8; font-size:19rpx; }.bill-card { padding:23rpx; margin-bottom:15rpx; border-radius:20rpx; background:#fff; }.bill-top { display:flex; justify-content:space-between; gap:12rpx; }.bill-top>view { flex:1; min-width:0; }.bill-title,.bill-no { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.bill-title { color:#0f172a; font-size:25rpx; font-weight:700; }.bill-no { margin-top:7rpx; color:#94a3b8; font-size:19rpx; }.status { flex:none; align-self:flex-start; padding:7rpx 12rpx; border-radius:20rpx; background:#fff7ed; color:#b45309; font-size:19rpx; }.status.settled { background:#ecfdf5; color:#047857; }.status.closed { background:#f1f5f9; color:#64748b; }.amounts { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:9rpx; margin-top:23rpx; }.amounts>view { display:flex; flex-direction:column; gap:8rpx; }.amounts text:first-child { color:#94a3b8; font-size:18rpx; }.amounts text:last-child { color:#334155; font-size:20rpx; font-weight:700; }.bill-footer { margin-top:22rpx; padding-top:16rpx; border-top:1rpx solid #f1f5f9; color:#2563eb; text-align:right; font-size:21rpx; }.more { margin-top:20rpx; border-radius:16rpx; background:#fff; color:#2563eb; font-size:23rpx; }.more::after { border:0; }
</style>
