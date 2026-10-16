<template>
  <view class="mask" @tap="requestClose">
    <view class="sheet" @tap.stop>
      <view class="handle" />
      <view class="heading"><view><text class="title">批注交稿图片</text><text class="subtitle">点选图片位置，再写清楚需要调整的内容</text></view><text class="close" @tap="requestClose">关闭</text></view>
      <view v-if="error" class="error">{{ error }}</view>
      <view v-if="loading" class="state">正在加载本订单的交稿图片…</view>
      <view v-else-if="!images.length" class="state">还没有可批注的交稿图片，设计师提交后会显示在这里。</view>
      <template v-else>
        <scroll-view scroll-x class="image-list" :show-scrollbar="false">
          <view v-for="item in images" :key="item.imageId" class="image-option" :class="{ selected: item.imageId === selected?.imageId, disabled: sending }" @tap="!sending && selectImage(item)">
            <text class="image-option-title">{{ item.productName }}</text><text class="image-option-meta">{{ groupLabel(item.groupType) }} · 第 {{ item.imageIndex }} 张</text><text class="image-option-marks">{{ marksFor(item).length ? `${marksFor(item).length} 处标记` : `第 ${item.version} 版` }}</text>
          </view>
        </scroll-view>
        <view v-if="selected" class="selected-info"><text>{{ selected.taskNo || '交稿' }} · {{ selected.productName }}</text><text>图片版本 {{ selected.version }}</text></view>
        <view v-if="selected" class="board-shell"><image-annotation-board :key="selected.imageId" :src="selected.imageUrl" :order-id="orderId" :annotations="marksFor(selected)" :editable="true" :waiting-for-point="placingPoint" @add="addPoint" /></view>
        <view class="mark-tools"><text class="tip">{{ placingPoint ? '点击图片添加标记' : '先添加标记点，再填写对应修改意见' }}</text><button class="add-mark" :disabled="!selected || markCount >= 12 || sending" @tap="placingPoint = !placingPoint">{{ placingPoint ? '完成选点' : '＋ 添加标记点' }}</button></view>
        <scroll-view v-if="selected && currentMarks.length" scroll-y class="mark-list">
          <view v-for="(mark, index) in currentMarks" :key="mark.id" class="mark-row"><text class="mark-number">{{ index + 1 }}</text><textarea v-model="mark.comment" class="comment" :maxlength="200" auto-height placeholder="例如：标题下移一点，给产品留出空间" /><text class="remove" @tap="removeMark(mark.id)">删除</text></view>
        </scroll-view>
        <view class="footer"><text class="count">{{ currentMarks.length }}/12 处 · 每处都要写明修改意见</text><button class="submit" :disabled="!canSubmit || sending" @tap="submit">{{ sending ? '发送中…' : '发送批注到会话' }}</button></view>
      </template>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api, uuid, type DeliverableImage } from '../lib/api';
import ImageAnnotationBoard from './image-annotation-board.vue';

type Mark = { id: string; x: number; y: number; comment: string };
type SendCommand = { taskId: string; imageId: string; imageVersion: number; clientMessageId: string; annotations: Array<{ x: number; y: number; comment: string }> };
const props = defineProps<{ orderId: string }>();
const emit = defineEmits<{ (event: 'close'): void; (event: 'sent'): void }>();
const images = ref<DeliverableImage[]>([]); const selected = ref<DeliverableImage | null>(null);
const marks = ref<Mark[]>([]); const loading = ref(true); const sending = ref(false); const placingPoint = ref(false); const error = ref('');
let pendingCommand: SendCommand | null = null;
const currentMarks = computed(() => marks.value);
const markCount = computed(() => marks.value.length);
const canSubmit = computed(() => Boolean(selected.value && currentMarks.value.length && currentMarks.value.every(mark => mark.comment.trim()) && !loading.value));
watch(marks, () => { pendingCommand = null; }, { deep: true });

void loadImages();
async function loadImages() {
  loading.value = true; error.value = '';
  try { images.value = await api.deliverableImages(props.orderId); selected.value = images.value[0] || null; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '交稿图片加载失败，请重试'; }
  finally { loading.value = false; }
}
function marksFor(image: DeliverableImage) { return selected.value?.imageId === image.imageId ? marks.value : []; }
function groupLabel(value: string) { return ({ main_1_1: '1:1 方形主图', main_3_4: '3:4 竖版主图', main_4_3: '4:3 横版主图', main_16_9: '16:9 横幅主图', main_9_16: '9:16 竖版海报', detail: '详情页长图' } as Record<string, string>)[value] || '交稿图片'; }
function selectImage(image: DeliverableImage) {
  if (selected.value?.imageId === image.imageId) return;
  const change = () => { marks.value = []; selected.value = image; placingPoint.value = false; pendingCommand = null; error.value = ''; };
  if (!marks.value.length) return change();
  uni.showModal({ title: '切换交稿图片', content: '当前图片的批注还没有发送，切换后会清空这些修改意见。', confirmText: '切换图片', success: result => { if (result.confirm) change(); } });
}
function requestClose() {
  if (sending.value) return;
  if (!marks.value.length) return emit('close');
  uni.showModal({ title: '放弃未发送的批注？', content: '当前批注只保存在本次编辑中，关闭后会清空。', confirmText: '放弃批注', success: result => { if (result.confirm) emit('close'); } });
}
function addPoint(point: { x: number; y: number }) {
  const image = selected.value; if (!image || markCount.value >= 12) return;
  marks.value = [...marks.value, { id: uuid(), x: point.x, y: point.y, comment: '' }];
  placingPoint.value = false; pendingCommand = null;
}
function removeMark(markId: string) {
  if (!selected.value) return;
  marks.value = currentMarks.value.filter(mark => mark.id !== markId);
  pendingCommand = null;
}
async function submit() {
  const image = selected.value; if (!image || !canSubmit.value || sending.value) return;
  error.value = '';
  if (!pendingCommand) pendingCommand = { taskId: image.taskId, imageId: image.imageId, imageVersion: image.version, clientMessageId: uuid(), annotations: currentMarks.value.map(mark => ({ x: mark.x, y: mark.y, comment: mark.comment.trim() })) };
  sending.value = true;
  try { await api.createAnnotation(props.orderId, pendingCommand); emit('sent'); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '批注发送失败，请重试'; }
  finally { sending.value = false; }
}
</script>

<style scoped>
.mask { position:fixed; z-index:120; inset:0; display:flex; align-items:flex-end; background:rgba(15,23,42,.52); }.sheet { width:100%; max-height:94dvh; display:flex; flex-direction:column; overflow-y:auto; box-sizing:border-box; padding:12rpx 24rpx calc(22rpx + env(safe-area-inset-bottom)); border-radius:30rpx 30rpx 0 0; background:#fff; }.handle { width:72rpx; height:8rpx; margin:0 auto 18rpx; border-radius:8rpx; background:#cbd5e1; }.heading { display:flex; align-items:flex-start; justify-content:space-between; gap:18rpx; padding-bottom:18rpx; }.title { display:block; color:#0f172a; font-size:30rpx; font-weight:750; }.subtitle { display:block; margin-top:8rpx; color:#64748b; font-size:20rpx; }.close { padding:7rpx 0 7rpx 18rpx; color:#64748b; font-size:21rpx; }.error { margin:4rpx 0 14rpx; padding:13rpx 16rpx; border-radius:12rpx; background:#fff1f2; color:#be123c; font-size:21rpx; }.state { padding:60rpx 24rpx; text-align:center; color:#64748b; font-size:23rpx; line-height:1.6; }.image-list { flex:none; white-space:nowrap; margin:0 -24rpx 14rpx; padding:0 24rpx; }.image-option { display:inline-flex; flex-direction:column; width:230rpx; margin-right:12rpx; padding:14rpx; box-sizing:border-box; border:1rpx solid #e2e8f0; border-radius:15rpx; background:#f8fafc; vertical-align:top; }.image-option.selected { border-color:#3b82f6; background:#eff6ff; box-shadow:0 0 0 1rpx #3b82f6 inset; }.image-option.disabled { opacity:.65; }.image-option-title { overflow:hidden; color:#1e293b; font-size:21rpx; font-weight:700; text-overflow:ellipsis; white-space:nowrap; }.image-option-meta,.image-option-marks { margin-top:6rpx; color:#64748b; font-size:18rpx; }.image-option-marks { color:#2563eb; }.selected-info { display:flex; justify-content:space-between; gap:16rpx; margin:0 2rpx 10rpx; color:#64748b; font-size:19rpx; }.board-shell { flex:none; max-height:42vh; overflow:auto; }.mark-tools { display:flex; align-items:center; justify-content:space-between; gap:12rpx; padding:12rpx 0; }.tip { flex:1; color:#64748b; font-size:18rpx; line-height:1.45; }.add-mark { flex:none; margin:0; padding:10rpx 16rpx; border-radius:12rpx; background:#eff6ff; color:#1d4ed8; font-size:20rpx; line-height:1.4; }.add-mark::after,.submit::after { border:0; }.add-mark[disabled] { opacity:.45; }.mark-list { flex:1; min-height:0; max-height:24vh; border-top:1rpx solid #f1f5f9; }.mark-row { display:flex; align-items:flex-start; gap:12rpx; padding:13rpx 0; border-bottom:1rpx solid #f1f5f9; }.mark-number { flex:none; display:flex; width:38rpx; height:38rpx; align-items:center; justify-content:center; border-radius:50%; background:#ef4444; color:white; font-size:19rpx; font-weight:700; }.comment { flex:1; min-height:48rpx; max-height:100rpx; padding:5rpx 8rpx; color:#1e293b; font-size:21rpx; line-height:1.5; }.remove { flex:none; padding:9rpx 2rpx; color:#94a3b8; font-size:19rpx; }.footer { flex:none; padding-top:13rpx; border-top:1rpx solid #e2e8f0; }.count { display:block; color:#94a3b8; font-size:18rpx; }.submit { width:100%; height:78rpx; margin:12rpx 0 0; border-radius:14rpx; background:linear-gradient(110deg,#2563eb,#4f46e5); color:white; font-size:23rpx; font-weight:700; line-height:78rpx; }.submit[disabled] { opacity:.4; }
</style>
