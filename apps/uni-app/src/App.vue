<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app';

onLaunch(() => {
  console.log('Design Review Mini-Program launched');
});
</script>

<style>
/* 每个页面公共 css */
page {
  background-color: #e8eff8;
  color: #1e293b;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif;
}
.page { padding:32rpx 32rpx calc(48rpx + env(safe-area-inset-bottom)); }.panel { background:#fff; border:1rpx solid #e2e8f0; border-radius:24rpx; padding:30rpx; margin-bottom:24rpx; }.eyebrow { display:block; font-size:22rpx; color:#2563eb; letter-spacing:2rpx; margin-bottom:12rpx; }.title { font-size:40rpx; font-weight:700; line-height:1.45; color:#1e293b; }.subtitle { font-size:28rpx; font-weight:650; color:#1e293b; }.muted { color:#64748b; font-size:24rpx; line-height:1.7; }.row { display:flex; justify-content:space-between; align-items:center; gap:16rpx; }.stack { display:flex; flex-direction:column; gap:16rpx; }.primary { background:linear-gradient(110deg,#2563eb,#4f46e5); color:white; font-size:28rpx; font-weight:600; border-radius:16rpx; margin:0; padding:4rpx 28rpx; }.secondary { background:#eff6ff; color:#2563eb; font-size:26rpx; font-weight:600; border-radius:16rpx; margin:0; padding:4rpx 24rpx; }.primary::after,.secondary::after { border:0; }.badge { display:inline-block; background:#eff6ff; color:#2563eb; padding:6rpx 16rpx; border-radius:20rpx; font-size:22rpx; }.error-box { padding:24rpx; border-radius:16rpx; background:#fff1f2; color:#be123c; font-size:26rpx; line-height:1.6; margin-bottom:24rpx; }.empty { padding:64rpx 24rpx; text-align:center; color:#64748b; font-size:28rpx; line-height:1.8; }.input { box-sizing:border-box; min-height:88rpx; width:100%; padding:22rpx; background:#fff; border:1rpx solid #e2e8f0; border-radius:14rpx; font-size:28rpx; }.section-heading { font-size:28rpx; font-weight:650; margin:36rpx 0 20rpx; color:#1e293b; }.footer-actions { display:flex; gap:20rpx; margin-top:30rpx; }.footer-actions button { flex:1; }.break { white-space:pre-wrap; word-break:break-all; }.space-top { margin-top:24rpx; }.hint { padding:22rpx; border-radius:14rpx; background:#eff6ff; font-size:24rpx; line-height:1.7; color:#334155; margin-bottom:24rpx; }
</style>
