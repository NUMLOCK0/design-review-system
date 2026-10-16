<template>
  <view class="page reviews-page">
    <text class="eyebrow">COZI · 设计审稿</text><view class="title">设计成果</view><text class="muted intro">查看每一版设计，逐图标记修改意见。</text>
    <view class="summary"><view><text class="summary-number">{{ tasks.length }}</text><text>已加载成果</text></view><view><text class="summary-number">{{ pendingCount }}</text><text>待我审核</text></view><view><text class="summary-number">{{ revisionCount }}</text><text>待修改</text></view></view>
    <scroll-view scroll-x class="filters" :show-scrollbar="false"><view class="filter-row"><text v-for="item in filters" :key="item.id" class="filter" :class="{ active: filter === item.id }" @tap="filter = item.id">{{ item.label }}</text></view></scroll-view>
    <view v-if="error" class="error-box" @tap="load(true)">{{ error }} · 点击重试</view>
    <view v-for="task in filteredTasks" :key="task.id" class="task-card" @tap="open(task.id)"><view class="row"><text class="task-no">{{ task.taskNo }}</text><text class="task-status" :class="`status-${task.status}`">{{ statusText(task.status) }}</text></view><view class="task-title">{{ task.productName }}</view><view class="task-meta">{{ task.designerName }} · 第 {{ task.version }} 稿 · 共 {{ task.totalImages }} 张</view><view class="task-footer"><text>已通过 {{ task.approvedCount }} / {{ task.totalImages }}</text><text v-if="task.rejectedCount">待改 {{ task.rejectedCount }}</text><text class="open-label">打开审稿 ›</text></view></view>
    <view v-if="!filteredTasks.length && !error" class="empty">{{ loading ? '加载成果…' : filter === 'all' ? '设计师提交的成果将显示在这里。' : '当前筛选下没有设计成果。' }}</view>
    <button v-if="hasMore" class="secondary" :loading="loading" :disabled="loading" @tap="load(false)">加载更多</button>
  </view>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import type { ReviewTask } from '@design-review/shared';
import { request, requireSession } from '../../lib/api';
const tasks = ref<ReviewTask[]>([]); const loading = ref(false); const error = ref(''); const page = ref(1); const hasMore = ref(false);
const filters = [{ id: 'all', label: '全部' }, { id: 'pending', label: '待审核' }, { id: 'needs_revision', label: '需修改' }, { id: 'approved', label: '已通过' }];
const filter = ref('all');
const filteredTasks = computed(() => tasks.value.filter(task => filter.value === 'all' || (filter.value === 'pending' ? ['pending', 'in_review'].includes(task.status) : task.status === filter.value)));
const pendingCount = computed(() => tasks.value.filter(task => ['pending', 'in_review'].includes(task.status)).length);
const revisionCount = computed(() => tasks.value.filter(task => task.status === 'needs_revision').length);
onShow(() => { if (requireSession()) void load(true); });
onPullDownRefresh(() => { void load(true).finally(() => uni.stopPullDownRefresh()); });
onReachBottom(() => { if (hasMore.value) void load(false); });
async function load(reset: boolean) { if (loading.value || !requireSession()) return; loading.value = true; try { const selectedPage = reset ? 1 : page.value + 1; const result = await request<{ list: ReviewTask[]; totalPages: number }>(`/review-tasks?page=${selectedPage}&pageSize=30`); tasks.value = reset ? result.list : [...tasks.value, ...result.list.filter(item => !tasks.value.some(task => task.id === item.id))]; page.value = selectedPage; hasMore.value = selectedPage < result.totalPages; error.value = ''; } catch (cause) { error.value = cause instanceof Error ? cause.message : '加载失败'; } finally { loading.value = false; } }
function open(id: string) { uni.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(id)}` }); }
const statusText = (status: string) => ({ draft: '设计中', pending: '待审核', in_review: '审核中', needs_revision: '修改中', approved: '已通过', returned: '已退单', archived: '已归档' } as Record<string, string>)[status] || status;
</script>
<style scoped>
.reviews-page { min-height:100vh; background:#f4f7fb; }.intro { display:block; margin-top:7rpx; font-size:21rpx; }
.summary { display:flex; margin-top:26rpx; padding:25rpx 15rpx; border-radius:22rpx; background:#fff; border:1rpx solid #e8eef5; }.summary>view { flex:1; display:flex; align-items:center; flex-direction:column; gap:5rpx; color:#64748b; font-size:19rpx; }.summary>view+view { border-left:1rpx solid #e2e8f0; }.summary-number { color:#1e293b; font-size:36rpx; font-weight:750; }
.filters { width:100%; margin:25rpx 0 19rpx; white-space:nowrap; }.filter-row { display:flex; gap:11rpx; width:max-content; }.filter { padding:12rpx 24rpx; border-radius:30rpx; background:#fff; color:#64748b; font-size:21rpx; }.filter.active { background:#2563eb; color:#fff; }
.task-card { margin-bottom:15rpx; padding:25rpx; border-radius:20rpx; background:#fff; border:1rpx solid #e8eef5; }.task-no,.task-meta { color:#94a3b8; font-size:20rpx; }.task-status { padding:7rpx 14rpx; border-radius:20rpx; background:#eff6ff; color:#2563eb; font-size:19rpx; }.status-needs_revision { background:#fff7ed; color:#b45309; }.status-approved { background:#ecfdf5; color:#047857; }.task-title { margin:15rpx 0 9rpx; color:#1e293b; font-size:29rpx; font-weight:700; }.task-footer { display:flex; align-items:center; gap:15rpx; margin-top:20rpx; padding-top:18rpx; border-top:1rpx solid #f1f5f9; color:#64748b; font-size:20rpx; }.open-label { margin-left:auto; color:#2563eb; }
</style>
