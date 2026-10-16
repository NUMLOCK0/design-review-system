<template>
  <view class="board" :class="{ compact }">
    <view v-if="error" class="board-state"><text>{{ error }}</text><text v-if="editable" class="retry" @tap="load">重试</text></view>
    <view v-else-if="loading || !box.width" class="board-state">{{ loading ? '正在加载交稿图片…' : '图片暂不可用' }}</view>
    <view v-else class="stage-wrap">
      <view class="annotation-stage" :style="stageStyle" @tap="onStageTap">
        <image class="source-image" :src="localPath" mode="scaleToFill" />
        <view v-for="(item, index) in annotations" :key="item.id" class="pin" :style="{ left: `${item.x}%`, top: `${item.y}%` }"><text>{{ index + 1 }}</text></view>
        <view v-if="editable && waitingForPoint" class="point-hint">点选要修改的位置</view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from 'vue';
import { downloadAsset } from '../lib/api';

type AnnotationPin = { id: string; x: number; y: number; comment: string };
const props = withDefaults(defineProps<{ src: string; orderId: string; annotations?: AnnotationPin[]; editable?: boolean; waitingForPoint?: boolean; compact?: boolean }>(), {
  annotations: () => [], editable: false, waitingForPoint: false, compact: false,
});
const emit = defineEmits<{ (event: 'add', point: { x: number; y: number }): void }>();
const instance = getCurrentInstance();
const localPath = ref(''); const error = ref(''); const loading = ref(false);
const box = ref({ width: 0, height: 0 });
let requestSequence = 0;
const stageStyle = computed(() => ({ width: `${box.value.width}px`, height: `${box.value.height}px` }));

watch(() => [props.src, props.orderId] as const, () => { void load(); }, { immediate: true });

async function load() {
  const sequence = ++requestSequence;
  localPath.value = ''; error.value = ''; box.value = { width: 0, height: 0 };
  if (!props.src) { error.value = '交稿图片地址缺失'; return; }
  loading.value = true;
  try {
    const path = await downloadAsset(props.src, props.orderId);
    if (sequence !== requestSequence) return;
    const info = await new Promise<{ width: number; height: number }>((resolve, reject) => uni.getImageInfo({ src: path, success: result => resolve({ width: result.width, height: result.height }), fail: reject }));
    if (sequence !== requestSequence) return;
    localPath.value = path;
    const system = uni.getSystemInfoSync();
    const maxWidth = Math.max(200, Number(system.windowWidth || 375) * (props.compact ? 0.72 : 0.9));
    const maxHeight = Math.max(220, Number(system.windowHeight || 760) * (props.compact ? 0.24 : 0.4));
    const scale = Math.min(maxWidth / info.width, maxHeight / info.height);
    box.value = { width: Math.max(1, Math.round(info.width * scale)), height: Math.max(1, Math.round(info.height * scale)) };
  } catch (cause) {
    if (sequence === requestSequence) error.value = cause instanceof Error ? cause.message : '图片加载失败，请检查网络后重试';
  } finally { if (sequence === requestSequence) loading.value = false; }
}

function onStageTap(event: any) {
  if (!props.editable || !props.waitingForPoint || !box.value.width) return;
  const touch = event?.changedTouches?.[0] || event?.touches?.[0];
  const clientX = Number(touch?.clientX ?? event?.detail?.x);
  const clientY = Number(touch?.clientY ?? event?.detail?.y);
  const query = uni.createSelectorQuery().in(instance?.proxy as any);
  query.select('.annotation-stage').boundingClientRect((rect: any) => {
    if (!rect || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
    const x = Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100));
    const y = Math.max(0, Math.min(100, (clientY - rect.top) / rect.height * 100));
    emit('add', { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
  }).exec();
}
</script>

<style scoped>
.board { width:100%; display:flex; justify-content:center; overflow:hidden; }.stage-wrap { max-width:100%; border:1rpx solid #dbe2ea; border-radius:16rpx; overflow:hidden; background:#f1f5f9; }.annotation-stage { position:relative; max-width:100%; overflow:hidden; touch-action:manipulation; }.source-image { display:block; width:100%; height:100%; }.pin { position:absolute; display:flex; align-items:center; justify-content:center; width:42rpx; height:42rpx; border:3rpx solid #fff; border-radius:50%; transform:translate(-50%,-50%); background:#ef4444; box-shadow:0 2rpx 9rpx rgba(15,23,42,.45); color:#fff; font-size:22rpx; font-weight:750; }.point-hint { position:absolute; left:50%; bottom:12rpx; transform:translateX(-50%); padding:8rpx 14rpx; border-radius:20rpx; background:rgba(15,23,42,.72); color:#fff; font-size:19rpx; white-space:nowrap; pointer-events:none; }.board-state { min-height:180rpx; width:100%; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14rpx; border:1rpx dashed #cbd5e1; border-radius:16rpx; color:#64748b; font-size:22rpx; }.retry { color:#2563eb; font-weight:700; }
</style>
