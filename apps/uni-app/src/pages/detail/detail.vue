<template>
  <view class="page">
    <view v-if="error" class="error-box" @tap="load">{{ error }} · 点击重试</view>
    <view v-if="!task && !error" class="empty">加载设计稿…</view>
    <template v-if="task">
      <text class="eyebrow">{{ task.taskNo }}</text><view class="title">{{ task.productName }}</view><view class="muted space-top">设计师：{{ task.designerName }} · 共 {{ task.totalImages }} 张</view>
      <view v-if="task.requirementVersionId && task.orderId" class="hint space-top" @tap="openRequirement">查看此稿对应的正式需求版本 →</view>
      <view v-for="image in images" :key="image.id" class="panel space-top"><protected-image :src="image.imageUrl" /><view class="row space-top"><text class="subtitle">第 {{ image.imageIndex + 1 }} 张 · 第 {{ image.version }} 稿</text><text class="badge">{{ statusText(image.status) }}</text></view><view v-if="image.designDescription" class="muted space-top break">{{ image.designDescription }}</view><view v-if="image.rejectComment" class="hint space-top">修改意见：{{ image.rejectComment }}</view><view v-if="canAct(image)" class="footer-actions"><button class="secondary" :disabled="Boolean(busy)" @tap="reject(image)">要求修改</button><button class="primary" :loading="busy === image.id" :disabled="Boolean(busy)" @tap="approve(image)">审核通过</button></view><view v-else class="muted space-top">{{ hasReviewed(image) ? '你已完成这张图的本级审核' : '当前无需你处理此图片' }}</view></view>
      <view v-if="!images.length" class="empty">设计师尚未提交图片。</view>
      <view v-if="task.status === 'approved'" class="hint">终审已通过。验收与原图下载继续遵循订单尾款和交付规则。</view>
    </template>
  </view>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import type { ReviewImage, ReviewTask } from '@design-review/shared';
import ProtectedImage from '../../components/protected-image.vue';
import { getSession, request, requireSession } from '../../lib/api';
const id = ref(''); const task = ref<(ReviewTask & { canReview: boolean }) | null>(null); const error = ref(''); const busy = ref(''); const loading = ref(false);
const images = computed(() => task.value?.groups?.flatMap(group => group.images) || []);
onLoad(options => { id.value = String(options?.id || ''); });
onShow(() => { if (requireSession()) void load(); });
async function load() { if (loading.value || !id.value) return; loading.value = true; try { task.value = await request(`/review-tasks/${encodeURIComponent(id.value)}`); error.value = ''; } catch (cause) { error.value = cause instanceof Error ? cause.message : '加载失败'; } finally { loading.value = false; } }
function hasReviewed(image: ReviewImage) { return image.reviewHistory?.some(review => review.reviewerId === getSession()?.user.id && review.level === task.value?.currentLevel && review.version === image.version); }
function canAct(image: ReviewImage) { return task.value?.canReview && ['pending', 'in_review'].includes(task.value.status) && !hasReviewed(image); }
async function review(image: ReviewImage, status: 'approved' | 'rejected', comment = '') {
  if (busy.value || !canAct(image)) return; busy.value = image.id;
  try { await request(`/review-tasks/${encodeURIComponent(id.value)}/images/${encodeURIComponent(image.id)}/review`, 'POST', { status, rejectComment: comment, rejectReasons: [] }); await load(); uni.showToast({ title: status === 'approved' ? '审核已记录' : '修改意见已提交', icon: 'success' }); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '审核失败'; }
  finally { busy.value = ''; }
}
function approve(image: ReviewImage) { uni.showModal({ title: '通过此张设计稿', content: '请确认图片符合本次需求及验收标准。', success: result => { if (result.confirm) void review(image, 'approved'); } }); }
function reject(image: ReviewImage) { uni.showModal({ title: '要求修改', editable: true, placeholderText: '请说明需要调整的内容', success: result => { if (result.confirm && result.content?.trim()) void review(image, 'rejected', result.content.trim()); } }); }
function openRequirement() { if (task.value?.orderId && task.value.requirementVersionId) uni.navigateTo({ url: `/pages/requirements/detail?orderId=${encodeURIComponent(task.value.orderId)}&requirementId=${task.value.requirementVersionId}` }); }
const statusText = (status: string) => ({ pending: '待审核', approved: '已通过', rejected: '待修改' } as Record<string, string>)[status];
</script>
