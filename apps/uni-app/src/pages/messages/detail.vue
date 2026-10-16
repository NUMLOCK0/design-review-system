<template>
  <view class="page detail-page">
    <view v-if="error" class="error-box" @tap="load">{{ error }} · 点击重试</view>
    <view v-if="loading && !detail" class="empty">正在加载消息…</view>
    <template v-if="detail">
      <view class="detail-card"><text class="type-label">{{ names[detail.type] }}{{ detail.senderName ? ` · ${detail.senderName}` : '' }}</text><view class="detail-title">{{ detail.title }}</view><text class="date">{{ dateTimeText(detail.createdAt) }}</text><view class="divider"></view><text class="content">{{ detail.content }}</text></view>
      <button v-if="relatedTarget" class="related-button" @tap="openRelated">{{ relatedTarget.label }} →</button>
      <view v-else class="hint">如需处理具体项目，请返回订单或会话继续操作。</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import type { SiteMessage, SiteMessageType } from '@design-review/shared';
import { api, requireSession } from '../../lib/api';
import { refreshUnreadCounts } from '../../lib/notification-center';
const names: Record<SiteMessageType, string> = { system: '系统消息', order: '订单消息', review: '审核消息', dispute: '纠纷消息', announcement: '平台公告' };
const messageId = ref(''); const detail = ref<SiteMessage | null>(null); const loading = ref(false); const error = ref('');
const relatedTarget = computed(() => {
  const link = detail.value?.link || '';
  const review = /^\/(?:review-tasks|mobile\/tasks)(?:\/([^?]+))?(?:\?.*taskId=([^&]+))?/.exec(link);
  if (review) { const id = safeLinkId(review[2] || review[1]); return id ? { label: '查看设计稿', url: `/pages/detail/detail?id=${encodeURIComponent(id)}`, tab: false } : { label: '查看设计成果', url: '/pages/reviews/index', tab: false }; }
  const order = /^\/(?:advertiser\/orders|mobile\/orders)(?:\/([^?]+))?(?:\?.*orderId=([^&]+))?/.exec(link);
  if (order) { const id = safeLinkId(order[2] || order[1]); return id ? { label: '查看订单', url: `/pages/orders/detail?id=${encodeURIComponent(id)}`, tab: false } : { label: '查看我的订单', url: '/pages/orders/index', tab: true }; }
  return null;
});
onLoad(options => { messageId.value = String(options?.id || ''); if (messageId.value && requireSession()) void load(); });
async function load() {
  if (!messageId.value || loading.value || !requireSession()) return;
  loading.value = true; error.value = '';
  try { const result = await api.messageDetail(messageId.value); detail.value = result.isRead ? result : await api.markMessageRead(messageId.value); if (!result.isRead) void refreshUnreadCounts(); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '消息加载失败'; }
  finally { loading.value = false; }
}
function safeLinkId(value?: string) { if (!value) return ''; try { return decodeURIComponent(value); } catch { return ''; } }
function openRelated() { const target = relatedTarget.value; if (!target) return; if (target.tab) uni.switchTab({ url: target.url }); else uni.navigateTo({ url: target.url }); }
function dateTimeText(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
</script>

<style scoped>
.detail-page { min-height:100vh; background:#f4f7fb; }.detail-card { padding:32rpx; border-radius:22rpx; background:#fff; border:1rpx solid #e9eef5; }.type-label { color:#2563eb; font-size:21rpx; }.detail-title { margin-top:15rpx; color:#0f172a; font-size:34rpx; line-height:1.45; font-weight:750; }.date { display:block; margin-top:12rpx; color:#94a3b8; font-size:20rpx; }.divider { height:1rpx; margin:28rpx 0; background:#e2e8f0; }.content { color:#334155; font-size:26rpx; line-height:1.9; white-space:pre-wrap; word-break:break-word; }.related-button { margin:22rpx 0; border-radius:15rpx; background:#2563eb; color:#fff; font-size:24rpx; }.related-button::after { border:0; }.hint { padding:23rpx 6rpx; color:#64748b; font-size:22rpx; line-height:1.7; }
</style>
