<template>
  <view class="page detail-page">
    <view v-if="error" class="error-box" @tap="load">{{ error }} · 点击重试</view>
    <view v-if="loading && !order" class="empty">正在加载订单…</view>
    <template v-if="order">
      <view class="hero"><view class="hero-top"><text class="hero-no">{{ order.orderNo }}</text><text class="hero-status">{{ statusLabel(order) }}</text></view><view class="hero-title">{{ order.title }}</view><view class="hero-meta">{{ order.category || '视觉设计' }} · {{ platformLabel(order.platform) }}</view><view class="hero-bottom"><text>订单预算</text><text class="hero-price">¥{{ money(order.budget) }}</text></view></view>

      <view v-if="order.publicationStatus === 'pending_deposit'" class="notice"><text class="notice-title">待付定金 ¥{{ money(order.depositAmount) }}</text><text class="notice-copy">订单创建成功。当前支付通道提供扫码付款，请在 Web 移动端完成支付；支付到账后订单会进入客服审核。</text></view>
      <view v-if="order.publicationStatus === 'rejected'" class="notice rejected"><text class="notice-title">客服审核未通过</text><text class="notice-copy">{{ order.publicationReviewComment || '请修改订单资料后重新提交。' }}</text></view>
      <view v-if="order.depositRefundStatus" class="notice"><text class="notice-title">{{ order.depositRefundStatus === 'refunded' ? '定金已退款' : '定金退款处理中' }}</text><text class="notice-copy">订单记录与退款进度会保留在这里。</text></view>

      <view class="section"><view class="section-title">交付要求</view><view class="metric-row"><view class="metric"><text>交付图片</text><text>{{ imageCount(order) }} 张</text></view><view class="metric"><text>交付日期</text><text>{{ dateText(order.deadline) }}</text></view><view class="metric"><text>优先级</text><text>{{ urgencyLabel(order.urgency) }}</text></view></view><view class="requirement" v-if="order.requirements">{{ order.requirements }}</view><view class="requirement muted" v-else>暂无补充说明，后续可在会话中完善需求。</view><view v-if="order.requiresPsd" class="tag">需要 PSD 源文件</view></view>
      <view v-if="order.imageRequirementGroups?.length" class="section"><view class="section-title">图片清单</view><view v-for="(group, index) in order.imageRequirementGroups" :key="group.id" class="group"><view class="group-title"><text>{{ index + 1 }}. {{ group.name }}</text><text>{{ group.imageItems?.length || group.quantity }} 张</text></view><text v-if="group.dimensions" class="group-meta">{{ group.dimensions }}</text><view v-for="(item, itemIndex) in group.imageItems || []" :key="item.id" class="image-item"><text class="image-index">第 {{ itemIndex + 1 }} 张</text><text class="image-description">{{ item.description || group.description || '具体内容在沟通中确认' }}</text></view></view></view>

      <view v-if="progress?.task" class="section"><view class="section-title">设计与审核进度</view><view class="progress-summary"><text>{{ taskLabel(progress.task.status) }}</text><text>通过 {{ progress.task.approvedCount }} / 需修改 {{ progress.task.rejectedCount }}</text></view><view v-for="node in progress.nodes" :key="node.level" class="progress-node"><text class="node-index" :class="{ current: node.level === progress.task.currentLevel }">{{ node.level }}</text><view><text class="node-title">第 {{ node.level }} 级审核</text><text class="node-names">{{ node.reviewerNames.join('、') || '待指定' }} · {{ node.approvalMode === 'all' ? '全员通过' : '任一通过' }}</text></view></view></view>

      <view class="section"><view class="section-title">下一步</view><view v-if="canCollaborate" class="link-row" @tap="openChat"><text>项目会话与表单</text><text>去沟通 ›</text></view><view v-if="canCollaborate" class="link-row" @tap="openRequirements"><text>需求资料与确认</text><text>查看 ›</text></view><view v-if="order.taskId" class="link-row" @tap="openReview"><text>设计稿与批注</text><text>去审核 ›</text></view><view class="link-row" @tap="openBilling"><text>订单账单</text><text>查看 ›</text></view><view v-if="!canCollaborate && !order.taskId" class="section-hint">订单进入协作阶段后，可从这里查看会话、需求和设计稿。</view></view>

      <view class="section"><view class="section-title">订单信息</view><view class="info-row"><text>审核流程</text><text>{{ order.reviewRuleName || '—' }}</text></view><view class="info-row"><text>设计师</text><text>{{ order.claimedByName || '待接单' }}</text></view><view class="info-row"><text>创建时间</text><text>{{ dateTimeText(order.createdAt) }}</text></view></view>

      <view v-if="canEdit || canResubmit || canRepublish || canCancel" class="actions"><button v-if="canEdit" class="action primary" @tap="edit">编辑订单</button><button v-if="canResubmit" class="action primary" :loading="operating" @tap="confirmAction('resubmit')">重新提交审核</button><button v-if="canRepublish" class="action primary" :loading="operating" @tap="confirmAction('republish')">重新发布</button><button v-if="canCancel" class="action danger" :loading="operating" @tap="confirmAction('cancel')">关闭订单</button></view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow, onPullDownRefresh } from '@dcloudio/uni-app';
import type { DesignOrder, PlatformType, TaskStatus } from '@design-review/shared';
import { api, requireSession, type OrderProgress } from '../../lib/api';

const id = ref(''); const order = ref<DesignOrder | null>(null); const progress = ref<OrderProgress | null>(null); const loading = ref(false); const operating = ref(false); const error = ref('');
const canCollaborate = computed(() => ['claimed', 'in_progress', 'submitted', 'completed'].includes(order.value?.status || ''));
const canEdit = computed(() => Boolean(order.value && (order.value.status === 'open' || order.value.publicationStatus === 'rejected') && !['deposit_paid', 'balance_pending', 'paid'].includes(order.value.paymentStatus || '')));
const canResubmit = computed(() => order.value?.publicationStatus === 'rejected');
const canRepublish = computed(() => order.value?.status === 'cancelled' && order.value.publicationStatus !== 'rejected');
const canCancel = computed(() => Boolean(order.value && ['open', 'pending_service_review'].includes(order.value.status) && order.value.publicationStatus !== 'rejected' && !(order.value.paymentStatus === 'deposit_pending' && order.value.depositOutTradeNo) && (!['deposit_paid', 'balance_pending', 'paid'].includes(order.value.paymentStatus || '') || (['published', 'pending_service_review'].includes(order.value.publicationStatus || '') && !order.value.claimedById))));
onLoad(options => { id.value = String(options?.id || ''); });
onShow(() => { if (requireSession()) void load(); });
onPullDownRefresh(() => { void load().finally(() => uni.stopPullDownRefresh()); });
async function load() {
  if (!id.value || loading.value || !requireSession()) return;
  loading.value = true; error.value = '';
  try {
    order.value = await api.designOrder(id.value);
    progress.value = null;
    if (['claimed', 'in_progress', 'submitted', 'completed'].includes(order.value.status)) progress.value = await api.orderProgress(id.value).catch(() => null);
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '订单加载失败'; }
  finally { loading.value = false; }
}
function confirmAction(action: 'cancel' | 'resubmit' | 'republish') {
  const labels = { cancel: ['关闭订单', '关闭后订单不能继续设计；已有定金将按现有退款流程处理。'], resubmit: ['重新提交审核', '请确认订单资料已修改完成。'], republish: ['重新发布订单', '系统会复制一笔新订单，原订单与财务记录保留。'] } as const;
  uni.showModal({ title: labels[action][0], content: labels[action][1], success: result => { if (result.confirm) void operate(action); } });
}
async function operate(action: 'cancel' | 'resubmit' | 'republish') {
  if (operating.value) return; operating.value = true;
  try { const result = await api.orderAction(id.value, action); uni.showToast({ title: action === 'cancel' ? '订单已关闭' : action === 'resubmit' ? '已提交审核' : '新订单已创建', icon: 'success' }); if (action === 'republish') uni.redirectTo({ url: `/pages/orders/detail?id=${encodeURIComponent(result.id)}` }); else await load(); }
  catch (cause) { uni.showToast({ title: cause instanceof Error ? cause.message : '操作失败', icon: 'none' }); }
  finally { operating.value = false; }
}
function edit() { uni.navigateTo({ url: `/pages/orders/edit?id=${encodeURIComponent(id.value)}` }); }
function openChat() { uni.navigateTo({ url: `/pages/chat/chat?orderId=${encodeURIComponent(id.value)}` }); }
function openRequirements() { uni.navigateTo({ url: `/pages/requirements/index?orderId=${encodeURIComponent(id.value)}` }); }
function openReview() { if (order.value?.taskId) uni.navigateTo({ url: `/pages/detail/detail?id=${encodeURIComponent(order.value.taskId)}` }); }
function openBilling() { uni.navigateTo({ url: '/pages/billing/index' }); }
function statusLabel(value: DesignOrder) { const key = value.publicationStatus === 'rejected' ? 'rejected' : value.status === 'open' ? value.publicationStatus || value.status : value.status; return ({ pending_deposit: '待付定金', pending_service_review: '待客服审核', published: '待接单', claimed: '已接单', in_progress: '设计中', submitted: '待作品审核', completed: '已完成', rejected: '已驳回', cancelled: '已关闭' } as Record<string, string>)[key] || '协作中'; }
function platformLabel(value: PlatformType) { return ({ tmall: '天猫', taobao: '淘宝', douyin: '抖音', pinduoduo: '拼多多', universal: '全平台' } as Record<PlatformType, string>)[value] || '全平台'; }
function urgencyLabel(value: DesignOrder['urgency']) { return ({ normal: '标准', urgent: '加急', super_urgent: '特急' })[value]; }
function taskLabel(value: TaskStatus) { return ({ draft: '设计师制作中', pending: '待审核', in_review: '审核中', needs_revision: '待修改', approved: '已通过', returned: '已退单', archived: '已归档' })[value]; }
function imageCount(value: DesignOrder) { return (value.imageRequirementGroups || []).reduce((sum, group) => sum + (group.imageItems?.length || group.quantity || 0), 0); }
function money(value?: number) { return Number(value || 0).toFixed(2); }
function dateText(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '待定' : date.toLocaleDateString('zh-CN'); }
function dateTimeText(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN'); }
</script>

<style scoped>
.detail-page { min-height:100vh; background:#f4f7fb; }.hero { padding:28rpx; margin-bottom:20rpx; border-radius:25rpx; background:linear-gradient(125deg,#1d4ed8,#6366f1); color:#fff; }.hero-top,.hero-bottom { display:flex; justify-content:space-between; align-items:center; gap:12rpx; }.hero-no,.hero-meta,.hero-bottom>text:first-child { color:rgba(255,255,255,.77); font-size:20rpx; }.hero-status { padding:6rpx 15rpx; border-radius:24rpx; background:rgba(255,255,255,.18); font-size:20rpx; }.hero-title { margin:24rpx 0 8rpx; font-size:34rpx; font-weight:750; line-height:1.4; }.hero-bottom { margin-top:27rpx; padding-top:20rpx; border-top:1rpx solid rgba(255,255,255,.2); }.hero-price { font-size:38rpx; font-weight:750; }.notice { display:flex; flex-direction:column; gap:8rpx; margin-bottom:20rpx; padding:22rpx 24rpx; border-radius:18rpx; background:#fff7ed; color:#92400e; }.notice.rejected { background:#fff1f2; color:#be123c; }.notice-title { font-size:25rpx; font-weight:700; }.notice-copy { font-size:21rpx; line-height:1.65; }.section { margin-bottom:20rpx; padding:25rpx; border-radius:21rpx; background:#fff; }.section-title { margin-bottom:20rpx; color:#0f172a; font-size:27rpx; font-weight:750; }.metric-row { display:flex; gap:10rpx; }.metric { flex:1; min-width:0; padding:15rpx; border-radius:13rpx; background:#f8fafc; }.metric text { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }.metric text:first-child { color:#94a3b8; font-size:19rpx; }.metric text:last-child { margin-top:7rpx; color:#334155; font-size:22rpx; font-weight:650; }.requirement { margin-top:20rpx; color:#475569; font-size:23rpx; line-height:1.75; white-space:pre-wrap; }.tag { display:inline-block; margin-top:14rpx; padding:8rpx 13rpx; border-radius:10rpx; background:#eff6ff; color:#2563eb; font-size:20rpx; }.group { padding:16rpx 0; border-top:1rpx solid #f1f5f9; }.group-title { display:flex; justify-content:space-between; color:#1e293b; font-size:23rpx; font-weight:650; }.group-title text:last-child { color:#64748b; font-size:20rpx; }.group-meta { display:block; margin-top:5rpx; color:#94a3b8; font-size:19rpx; }.image-item { display:flex; gap:13rpx; margin-top:14rpx; padding:13rpx; border-radius:12rpx; background:#f8fafc; }.image-index { flex:none; color:#2563eb; font-size:20rpx; }.image-description { color:#475569; font-size:21rpx; line-height:1.55; }.progress-summary { display:flex; justify-content:space-between; gap:10rpx; padding:15rpx; border-radius:13rpx; background:#eff6ff; color:#1d4ed8; font-size:20rpx; }.progress-node { display:flex; align-items:center; gap:15rpx; padding:16rpx 0; border-bottom:1rpx solid #f1f5f9; }.node-index { width:43rpx; height:43rpx; display:flex; align-items:center; justify-content:center; border-radius:50%; background:#e2e8f0; color:#64748b; font-size:20rpx; }.node-index.current { background:#2563eb; color:#fff; }.node-title,.node-names { display:block; }.node-title { color:#334155; font-size:22rpx; font-weight:650; }.node-names { margin-top:5rpx; color:#94a3b8; font-size:19rpx; }.link-row,.info-row { display:flex; justify-content:space-between; gap:12rpx; padding:18rpx 0; border-top:1rpx solid #f1f5f9; font-size:22rpx; }.link-row { color:#1e293b; }.link-row text:last-child { color:#2563eb; }.info-row { color:#64748b; }.info-row text:last-child { color:#334155; text-align:right; }.section-hint { color:#94a3b8; font-size:21rpx; line-height:1.65; }.actions { display:flex; gap:12rpx; flex-wrap:wrap; padding-bottom:30rpx; }.action { flex:1; min-width:180rpx; margin:0; border-radius:15rpx; font-size:23rpx; }.action::after { border:0; }.action.primary { background:#2563eb; color:#fff; }.action.danger { background:#fff1f2; color:#be123c; }
</style>
