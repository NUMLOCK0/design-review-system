<template>
  <view class="page review-page">
    <view v-if="error" class="error-box" @tap="load">{{ error }} · 点击重试</view>
    <view v-if="!task && !error" class="empty">加载设计稿…</view>
    <template v-if="task">
      <text class="eyebrow">{{ task.taskNo }}</text>
      <view class="title">{{ task.productName }}</view>
      <view class="muted space-top">设计师：{{ task.designerName }} · 共 {{ task.totalImages }} 张</view>
      <view v-if="task.requirementVersionId && task.orderId" class="hint space-top" @tap="openRequirement">查看此稿对应的正式需求版本 →</view>
      <view v-for="image in images" :key="image.id" class="panel space-top review-card">
        <view class="image-heading"><view><view class="subtitle">第 {{ image.imageIndex + 1 }} 张 · 第 {{ image.version }} 稿</view><view class="muted">{{ statusText(image.status) }}</view></view><button v-if="canAct(image)" class="mark-toggle" :class="{ active: markingId === image.id }" @tap="toggleMarking(image)">{{ markingId === image.id ? '完成标记' : '＋ 标记' }}</button></view>
        <view :id="`review-image-${image.id}`" class="review-image-stage" :class="{ marking: markingId === image.id }" :style="stageStyle(image)" @tap="placeAnnotation($event, image)">
          <image v-if="imagePaths[image.id]" class="review-art" :src="imagePaths[image.id]" mode="aspectFit" @load="onImageLoad($event, image)" />
          <view v-else class="image-loading">{{ imageErrors[image.id] || '设计稿加载中…' }}</view>
          <view v-for="(annotation, index) in image.annotations || []" :key="annotation.id" class="annotation-pin" :class="{ highlighted: activeAnnotationId === annotation.id }" :style="{ left: `${annotation.x}%`, top: `${annotation.y}%`, backgroundColor: annotation.color }" @tap.stop="annotationMenu(image, annotation)"><text>{{ index + 1 }}</text></view>
        </view>
        <view v-if="markingId === image.id" class="mark-hint">点选图片上的位置添加标记，标记会与修改意见一起保存。</view>
        <view v-if="image.designDescription" class="muted space-top break">{{ image.designDescription }}</view>
        <view v-if="image.annotations?.length" class="annotation-list"><view class="annotation-title">图片标记 · {{ image.annotations.length }}</view><view v-for="(annotation, index) in image.annotations" :key="annotation.id" class="annotation-row" @tap="focusAnnotation(image, annotation)"><text class="annotation-index" :style="{ backgroundColor: annotation.color }">{{ index + 1 }}</text><text class="annotation-copy">{{ annotation.comment }}</text><text v-if="canAct(image)" class="annotation-edit">编辑</text></view></view>
        <view v-if="image.rejectComment" class="hint space-top">总体修改意见：{{ image.rejectComment }}</view>
        <view v-if="canAct(image)" class="footer-actions"><button class="secondary" :disabled="Boolean(busy)" @tap="reject(image)">退回修改</button><button class="primary" :loading="busy === image.id" :disabled="Boolean(busy)" @tap="approve(image)">确认通过</button></view>
        <view v-else class="muted space-top">{{ hasReviewed(image) ? '你已完成这张图的本级审核' : '当前无需你处理此图片' }}</view>
      </view>
      <view v-if="!images.length" class="empty">设计师尚未提交图片。</view>
      <view v-if="task.status === 'approved'" class="hint">终审已通过。验收与原图下载继续遵循订单尾款和交付规则。</view>
    </template>
  </view>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import type { AnnotationItem, ReviewImage, ReviewTask } from '@design-review/shared';
import { downloadAsset, getSession, request, requireSession, uuid } from '../../lib/api';
const id = ref('');
const task = ref<(ReviewTask & { canReview: boolean }) | null>(null);
const error = ref(''); const busy = ref(''); const loading = ref(false); const markingId = ref(''); const activeAnnotationId = ref('');
const imagePaths = ref<Record<string, string>>({}); const imageErrors = ref<Record<string, string>>({}); const imageHeights = ref<Record<string, number>>({});
const images = computed(() => task.value?.groups?.flatMap(group => group.images) || []);
onLoad(options => { id.value = String(options?.id || ''); });
onShow(() => { if (requireSession()) void load(); });
async function load() {
  if (loading.value || !id.value) return;
  loading.value = true;
  try {
    task.value = await request(`/review-tasks/${encodeURIComponent(id.value)}`); error.value = '';
    const all = task.value.groups?.flatMap(group => group.images) || [];
    await Promise.all(all.map(async image => {
      if (imagePaths.value[image.id]) return;
      try { imagePaths.value[image.id] = await downloadAsset(image.imageUrl); }
      catch (cause) { imageErrors.value[image.id] = cause instanceof Error ? cause.message : '设计稿加载失败'; }
    }));
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '加载失败'; }
  finally { loading.value = false; }
}
function hasReviewed(image: ReviewImage) { return image.reviewHistory?.some(review => review.reviewerId === getSession()?.user.id && review.level === task.value?.currentLevel && review.version === image.version); }
function canAct(image: ReviewImage) { return Boolean(task.value?.canReview && ['pending', 'in_review'].includes(task.value.status) && !hasReviewed(image)); }
function stageStyle(image: ReviewImage) {
  const width = uni.getSystemInfoSync().windowWidth || 375;
  const ratio = image.width && image.height ? image.height / image.width : 0.72;
  const height = imageHeights.value[image.id] || Math.min(width * 0.92 * ratio, (uni.getSystemInfoSync().windowHeight || 700) * 0.62);
  return { height: `${Math.max(height, 220)}px` };
}
function onImageLoad(event: any, image: ReviewImage) {
  const sourceWidth = Number(event?.detail?.width || image.width || 0); const sourceHeight = Number(event?.detail?.height || image.height || 0);
  if (!sourceWidth || !sourceHeight) return;
  uni.createSelectorQuery().select(`#review-image-${image.id}`).boundingClientRect((rect: any) => {
    if (rect?.width) imageHeights.value[image.id] = Math.min(rect.width * sourceHeight / sourceWidth, (uni.getSystemInfoSync().windowHeight || 700) * 0.62);
  }).exec();
}
function toggleMarking(image: ReviewImage) { markingId.value = markingId.value === image.id ? '' : image.id; }
async function placeAnnotation(event: any, image: ReviewImage) {
  if (markingId.value !== image.id) {
    if (imagePaths.value[image.id]) uni.previewImage({ current: imagePaths.value[image.id], urls: [imagePaths.value[image.id]] });
    return;
  }
  if (!canAct(image)) return;
  const touch = event?.changedTouches?.[0] || event?.touches?.[0] || {};
  const clientX = Number(touch.clientX ?? touch.pageX ?? event?.detail?.x); const clientY = Number(touch.clientY ?? touch.pageY ?? event?.detail?.y);
  uni.createSelectorQuery().select(`#review-image-${image.id}`).boundingClientRect(async (rect: any) => {
    if (!rect?.width || !rect?.height || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
    const x = Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100));
    const y = Math.max(0, Math.min(100, (clientY - rect.top) / rect.height * 100));
    uni.showModal({ title: `添加第 ${(image.annotations || []).length + 1} 个标记`, editable: true, placeholderText: '写下这处需要调整的内容', success: async result => {
      if (!result.confirm || !result.content?.trim()) return;
      const user = getSession()?.user;
      const annotation: AnnotationItem = { id: uuid(), type: 'pin', x: Number(x.toFixed(2)), y: Number(y.toFixed(2)), color: '#2563eb', comment: result.content.trim(), creatorId: user?.id || '', creatorName: user?.name || '', createdAt: new Date().toISOString() };
      await saveAnnotations(image, [...(image.annotations || []), annotation]);
    } });
  }).exec();
}
function annotationMenu(image: ReviewImage, annotation: AnnotationItem) {
  if (!canAct(image)) return;
  uni.showActionSheet({ itemList: ['编辑修改意见', '删除此标记'], success: result => {
    if (result.tapIndex === 0) editAnnotation(image, annotation);
    if (result.tapIndex === 1) void saveAnnotations(image, (image.annotations || []).filter(item => item.id !== annotation.id));
  } });
}
function editAnnotation(image: ReviewImage, annotation: AnnotationItem) {
  uni.showModal({ title: '编辑修改意见', editable: true, content: annotation.comment, placeholderText: '写下这处需要调整的内容', success: result => {
    if (!result.confirm || !result.content?.trim()) return;
    void saveAnnotations(image, (image.annotations || []).map(item => item.id === annotation.id ? { ...item, comment: result.content!.trim() } : item));
  } });
}
function focusAnnotation(image: ReviewImage, annotation: AnnotationItem) { activeAnnotationId.value = annotation.id; markingId.value = ''; const node = `#review-image-${image.id}`; uni.createSelectorQuery().select(node).boundingClientRect((rect: any) => rect).selectViewport().scrollOffset((offset: any) => offset).exec((results: any[]) => { const rect = results?.[0]; const offset = results?.[1]; if (rect) uni.pageScrollTo({ scrollTop: Math.max(0, rect.top + (offset?.scrollTop || 0)), duration: 220 }); }); }
async function saveAnnotations(image: ReviewImage, annotations: AnnotationItem[]) {
  if (busy.value) return;
  busy.value = `annotations:${image.id}`;
  try {
    await request(`/review-tasks/${encodeURIComponent(id.value)}/images/${encodeURIComponent(image.id)}/annotations`, 'POST', { annotations });
    if (task.value) task.value = { ...task.value, groups: task.value.groups?.map(group => ({ ...group, images: group.images.map(item => item.id === image.id ? { ...item, annotations } : item) })) };
    uni.showToast({ title: '图片标记已保存', icon: 'success' });
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '标记保存失败'; }
  finally { busy.value = ''; }
}
async function review(image: ReviewImage, status: 'approved' | 'rejected', comment = '') {
  if (busy.value || !canAct(image)) return;
  busy.value = image.id; markingId.value = '';
  try {
    await request(`/review-tasks/${encodeURIComponent(id.value)}/images/${encodeURIComponent(image.id)}/review`, 'POST', { status, rejectComment: comment, rejectReasons: [], annotations: image.annotations || [] });
    await load(); uni.showToast({ title: status === 'approved' ? '审核已记录' : '修改意见已提交', icon: 'success' });
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '审核失败'; }
  finally { busy.value = ''; }
}
function approve(image: ReviewImage) { uni.showModal({ title: '确认通过此张设计稿？', content: '请确认图片符合本次需求及验收标准。', success: result => { if (result.confirm) void review(image, 'approved'); } }); }
function reject(image: ReviewImage) { uni.showModal({ title: '退回修改', editable: true, placeholderText: '补充整体修改要求（必填）', success: result => { if (result.confirm && result.content?.trim()) void review(image, 'rejected', result.content.trim()); } }); }
function openRequirement() { if (task.value?.orderId && task.value.requirementVersionId) uni.navigateTo({ url: `/pages/requirements/detail?orderId=${encodeURIComponent(task.value.orderId)}&requirementId=${task.value.requirementVersionId}` }); }
const statusText = (status: string) => ({ pending: '待审核', approved: '已通过', rejected: '待修改' } as Record<string, string>)[status] || status;
</script>
<style scoped>
.review-page { padding-bottom:36rpx; }.review-card { overflow:hidden; }.image-heading { display:flex; align-items:center; justify-content:space-between; gap:12rpx; margin-bottom:18rpx; }.mark-toggle { flex:none; margin:0; padding:0 22rpx; height:62rpx; line-height:62rpx; border:1rpx solid #bfdbfe; border-radius:32rpx; color:#2563eb; background:#eff6ff; font-size:21rpx; }.mark-toggle::after { border:0; }.mark-toggle.active { color:white; background:#2563eb; }.review-image-stage { position:relative; width:100%; min-height:220px; overflow:hidden; border-radius:16rpx; background:#f1f5f9; }.review-image-stage.marking { outline:4rpx solid #60a5fa; }.review-art { display:block; width:100%; height:100%; }.image-loading { width:100%; height:100%; min-height:220px; display:flex; align-items:center; justify-content:center; color:#64748b; font-size:22rpx; }.annotation-pin { position:absolute; z-index:2; width:48rpx; height:48rpx; margin-left:-24rpx; margin-top:-24rpx; border:4rpx solid white; border-radius:50%; box-shadow:0 2rpx 10rpx rgba(15,23,42,.3); display:flex; align-items:center; justify-content:center; color:white; font-size:20rpx; font-weight:750; }.annotation-pin.highlighted { transform:scale(1.3); box-shadow:0 0 0 8rpx rgba(37,99,235,.18),0 2rpx 10rpx rgba(15,23,42,.3); }.mark-hint { margin-top:14rpx; padding:14rpx 18rpx; border-radius:12rpx; color:#1d4ed8; background:#eff6ff; font-size:20rpx; }.annotation-list { margin-top:20rpx; padding-top:16rpx; border-top:1rpx solid #e2e8f0; }.annotation-title { margin-bottom:10rpx; color:#475569; font-size:21rpx; font-weight:700; }.annotation-row { display:flex; align-items:center; gap:12rpx; padding:12rpx 2rpx; }.annotation-index { width:38rpx; height:38rpx; flex:none; display:flex; align-items:center; justify-content:center; border-radius:50%; color:white; font-size:18rpx; font-weight:700; }.annotation-copy { flex:1; min-width:0; color:#334155; font-size:22rpx; line-height:1.5; }.annotation-edit { color:#2563eb; font-size:20rpx; }.review-card .footer-actions { margin-top:20rpx; padding-top:18rpx; border-top:1rpx solid #e2e8f0; }.review-card .footer-actions button { flex:1; }
</style>
