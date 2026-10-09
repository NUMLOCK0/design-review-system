<template>
  <view class="page"><text class="eyebrow">设计成果</text><view class="title">每一稿，都有据可依</view><view class="muted space-top">查看设计成果、反馈修改意见和跟进审核进度。</view><view v-if="error" class="error-box space-top" @tap="load(true)">{{ error }} · 点击重试</view><view class="section-heading">我的设计任务</view><view v-for="task in tasks" :key="task.id" class="panel" @tap="open(task.id)"><view class="row"><text class="muted">{{ task.taskNo }}</text><text class="badge">{{ statusText(task.status) }}</text></view><view class="subtitle space-top">{{ task.productName }}</view><view class="muted space-top">{{ task.designerName }} · {{ task.totalImages }} 张 · 第 {{ task.version }} 稿</view><view class="muted">通过 {{ task.approvedCount }} · 待改 {{ task.rejectedCount }}</view></view><view v-if="!tasks.length && !error" class="empty">{{ loading ? '加载成果…' : '设计师提交的成果将显示在这里。' }}</view><button v-if="hasMore" class="secondary" :loading="loading" :disabled="loading" @tap="load(false)">加载更多</button></view>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { onShow, onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import type { ReviewTask } from '@design-review/shared';
import { request, requireSession } from '../../lib/api';
const tasks = ref<ReviewTask[]>([]); const loading = ref(false); const error = ref(''); const page = ref(1); const hasMore = ref(false);
onShow(() => { if (requireSession()) void load(true); });
onPullDownRefresh(() => { void load(true).finally(() => uni.stopPullDownRefresh()); });
onReachBottom(() => { if (hasMore.value) void load(false); });
async function load(reset: boolean) { if (loading.value || !requireSession()) return; loading.value = true; try { const selectedPage = reset ? 1 : page.value + 1; const result = await request<{ list: ReviewTask[]; totalPages: number }>(`/review-tasks?page=${selectedPage}&pageSize=30`); tasks.value = reset ? result.list : [...tasks.value, ...result.list.filter(item => !tasks.value.some(task => task.id === item.id))]; page.value = selectedPage; hasMore.value = selectedPage < result.totalPages; error.value = ''; } catch (cause) { error.value = cause instanceof Error ? cause.message : '加载失败'; } finally { loading.value = false; } }
function open(id: string) { uni.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(id)}` }); }
const statusText = (status: string) => ({ draft: '设计中', pending: '待审核', in_review: '审核中', needs_revision: '修改中', approved: '已通过', returned: '已退单', archived: '已归档' } as Record<string, string>)[status] || status;
</script>
