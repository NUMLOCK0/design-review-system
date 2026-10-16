<template>
  <view class="video-frame">
    <video v-if="localPath" :src="localPath" controls show-center-play-btn enable-progress-gesture object-fit="contain" class="video-player" />
    <view v-else class="video-placeholder" @tap="loadVideo">
      <view class="play-icon">{{ loading ? '…' : '▶' }}</view>
      <text class="video-hint">{{ loading ? '正在加载视频…' : error || '点击加载并播放' }}</text>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import { downloadAsset } from '../lib/api';

const props = defineProps<{ src: string }>();
const localPath = ref('');
const loading = ref(false);
const error = ref('');
let sequence = 0;

watch(() => props.src, () => {
  sequence++;
  localPath.value = '';
  loading.value = false;
  error.value = '';
});

async function loadVideo() {
  if (loading.value) return;
  const attempt = ++sequence;
  loading.value = true;
  error.value = '';
  try {
    const path = await downloadAsset(props.src);
    if (attempt === sequence) localPath.value = path;
  } catch (cause) {
    if (attempt === sequence) error.value = cause instanceof Error ? cause.message : '视频加载失败，点击重试';
  } finally {
    if (attempt === sequence) loading.value = false;
  }
}
</script>
<style scoped>
.video-frame { width:100%; min-height:180rpx; background:#0f172a; }
.video-player { width:100%; height:360rpx; }
.video-placeholder { width:100%; height:300rpx; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14rpx; background:linear-gradient(145deg,#1e293b,#334155); color:#fff; }
.play-icon { width:72rpx; height:72rpx; display:flex; align-items:center; justify-content:center; padding-left:4rpx; border:2rpx solid rgba(255,255,255,.7); border-radius:50%; background:rgba(255,255,255,.12); font-size:26rpx; }
.video-hint { color:rgba(255,255,255,.82); font-size:21rpx; }
</style>
