<template>
  <view class="protected-image" @tap="preview">
    <image v-if="localPath" :src="localPath" mode="aspectFit" class="image" />
    <text v-else class="image-status">{{ error || '图片加载中…' }}</text>
  </view>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import { downloadAsset } from '../lib/api';
const props = defineProps<{ src: string }>();
const localPath = ref(''); const error = ref(''); let sequence = 0;
watch(() => props.src, async value => {
  const attempt = ++sequence; localPath.value = ''; error.value = '';
  if (!value) return;
  try { const path = await downloadAsset(value); if (attempt === sequence) localPath.value = path; }
  catch (cause) { if (attempt === sequence) error.value = cause instanceof Error ? cause.message : '图片加载失败'; }
}, { immediate: true });
function preview() { if (localPath.value) uni.previewImage({ urls: [localPath.value] }); }
</script>
<style scoped>
.protected-image { background:#f0f5f4; border-radius:16rpx; min-height:120rpx; display:flex; align-items:center; justify-content:center; }
.image { width:100%; height:340rpx; }.image-status { padding:24rpx; color:#64746e; font-size:24rpx; }
</style>
