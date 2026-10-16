<template>
  <view class="account-page" :style="{ paddingTop: `${statusBarHeight + 14}px` }">
    <view class="brand-header">
      <view class="brand-lockup"><text class="brand-name">COZI</text><view class="brand-divider"></view><text class="brand-caption">品牌协作</text></view>
      <view class="notice-button" @tap="showNotifications"><image class="header-icon" src="/static/icons/notification.png" mode="aspectFit" /><text v-if="notificationCount" class="notice-count">{{ notificationCount > 99 ? '99+' : notificationCount }}</text></view>
    </view>

    <view class="profile-header" @tap="showAccountInfo">
      <image v-if="user?.avatarUrl" class="avatar avatar-image" :src="user.avatarUrl" mode="aspectFill" />
      <view v-else class="avatar">{{ userInitial }}</view>
      <view class="profile-copy">
        <view class="profile-name">{{ user?.name || '我的账户' }}</view>
        <view class="profile-meta">{{ roleLabel }}<text v-if="user?.email" class="profile-separator">·</text><text v-if="user?.email" class="profile-email">{{ user.email }}</text></view>
      </view>
      <image class="profile-chevron" src="/static/icons/arrow-right.png" mode="aspectFit" />
    </view>

    <view class="organization-card">
      <view class="organization-top">
        <view class="organization-mark"><image class="organization-icon" src="/static/icons/shop.png" mode="aspectFit" /></view>
        <view class="organization-copy">
          <view class="organization-title-row"><text class="organization-title">品牌协作账号</text><text class="role-pill">{{ roleLabel }}</text></view>
          <view class="organization-subtitle">使用当前账号管理项目与设计协作</view>
        </view>
        <image class="chevron-icon" src="/static/icons/arrow-right.png" mode="aspectFit" />
      </view>
      <view class="account-metrics">
        <view class="metric"><text class="metric-label">账号角色</text><text class="metric-value">{{ roleLabel }}</text></view>
        <view class="metric"><text class="metric-label">登录状态</text><text class="metric-value status-value">正常</text></view>
        <view class="metric"><text class="metric-label">账号编号</text><text class="metric-value metric-id">{{ accountId }}</text></view>
      </view>
    </view>

    <view class="shortcuts-card">
      <view v-for="item in shortcuts" :key="item.label" class="shortcut" @tap="item.action">
        <view class="shortcut-icon" :class="`icon-${item.tone}`"><image class="shortcut-image" :src="item.icon" mode="aspectFit" /></view>
        <view class="shortcut-label">{{ item.label }}</view>
        <image class="shortcut-chevron" src="/static/icons/arrow-right.png" mode="aspectFit" />
      </view>
    </view>

    <view class="settings-card">
      <view class="setting-row" @tap="openBilling"><image class="setting-icon" src="/static/icons/checkbox.png" mode="aspectFit" /><text class="setting-label">订单账单</text><image class="chevron-icon" src="/static/icons/arrow-right.png" mode="aspectFit" /></view>
      <view class="setting-divider"></view>
      <view class="setting-row" @tap="showAccountInfo"><image class="setting-icon" src="/static/icons/auth.png" mode="aspectFit" /><text class="setting-label">账号与安全</text><image class="chevron-icon" src="/static/icons/arrow-right.png" mode="aspectFit" /></view>
      <view class="setting-divider"></view>
      <view class="setting-row" @tap="showHelp"><image class="setting-icon" src="/static/icons/help.png" mode="aspectFit" /><text class="setting-label">帮助与反馈</text><image class="chevron-icon" src="/static/icons/arrow-right.png" mode="aspectFit" /></view>
    </view>

    <button class="logout-button" :loading="loggingOut" @tap="logout">退出登录</button>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { api, clearSession, getSession, requireSession, type MiniUser } from '../../lib/api';

const user = ref<MiniUser | null>(null);
const statusBarHeight = ref(20);
const loggingOut = ref(false);
const notificationCount = ref(0);
const roleLabel = computed(() => user.value?.role === 'advertiser' ? '品牌方' : '协作成员');
const userInitial = computed(() => user.value?.name?.trim().slice(0, 1) || '我');
const accountId = computed(() => user.value?.id ? `${user.value.id.slice(0, 6)}…` : '—');
const shortcuts = [
  { label: '订单管理', icon: '/static/icons/folder-add.png', tone: 'blue', action: openOrders },
  { label: '需求资料', icon: '/static/icons/compose.png', tone: 'green', action: openRequirements },
  { label: '设计成果', icon: '/static/icons/image.png', tone: 'purple', action: openReviews },
  { label: '确认记录', icon: '/static/icons/checkbox.png', tone: 'orange', action: openConfirmations },
];

onShow(() => {
  if (!requireSession()) return;
  user.value = getSession()?.user || null;
  void api.messageSummary().then(result => { notificationCount.value = result.unreadCount; }).catch(() => { notificationCount.value = 0; });
  try { statusBarHeight.value = uni.getSystemInfoSync().statusBarHeight || 20; } catch { statusBarHeight.value = 20; }
});

function openOrders() { uni.switchTab({ url: '/pages/orders/index' }); }
function openBilling() { uni.navigateTo({ url: '/pages/billing/index' }); }
function openReviews() { uni.navigateTo({ url: '/pages/reviews/index' }); }
async function openRequirements() { await openFirstProject('requirements'); }
async function openConfirmations() { await openFirstProject('confirmations'); }
async function openFirstProject(section: 'requirements' | 'confirmations') {
  if (!requireSession()) return;
  try {
    const orders = await api.orders(0);
    if (!orders.length) { uni.showToast({ title: '暂无项目，项目创建后可在此查看', icon: 'none' }); return; }
    uni.navigateTo({ url: `/pages/requirements/index?orderId=${encodeURIComponent(orders[0].orderId)}${section === 'confirmations' ? '&section=confirmations' : ''}` });
  } catch (cause) {
    uni.showToast({ title: cause instanceof Error ? cause.message : '项目加载失败，请稍后重试', icon: 'none' });
  }
}
function showNotifications() { uni.navigateTo({ url: '/pages/messages/index' }); }
function showAccountInfo() {
  const account = user.value;
  uni.showModal({ title: '账号与安全', content: `身份：${roleLabel.value}\n登录账号：${account?.email || '未绑定邮箱'}\n账号编号：${account?.id || '—'}`, showCancel: false, confirmText: '知道了' });
}
function showHelp() { uni.showModal({ title: '帮助与反馈', content: '如需协助，请通过品牌协作项目中的会话联系设计师。', showCancel: false, confirmText: '知道了' }); }
function logout() {
  if (loggingOut.value) return;
  uni.showModal({ title: '退出登录', content: '未发送消息与草稿会保留在此设备，重新登录同一账号可继续。', success: result => {
    if (!result.confirm) return;
    loggingOut.value = true;
    clearSession();
    uni.reLaunch({ url: '/pages/login/login', complete: () => { loggingOut.value = false; } });
  } });
}
</script>

<style scoped>
.account-page { min-height:100vh; padding-left:28rpx; padding-right:28rpx; padding-bottom:38rpx; background:linear-gradient(180deg,#f1f6fd 0%,#f5f8fc 100%); }
.brand-header { height:76rpx; display:flex; align-items:center; justify-content:space-between; margin:0 16rpx 22rpx; }
.brand-lockup { display:flex; align-items:center; gap:16rpx; }
.brand-name { color:#2563eb; font-size:42rpx; line-height:1; font-weight:800; letter-spacing:-1rpx; }
.brand-divider { width:1rpx; height:34rpx; background:#cbd5e1; }
.brand-caption { color:#64748b; font-size:27rpx; font-weight:600; }
.notice-button { position:relative; width:64rpx; height:64rpx; display:flex; align-items:center; justify-content:center; border-radius:50%; color:#1e293b; }
.header-icon { width:48rpx; height:48rpx; }
.notice-count { position:absolute; top:0; right:-8rpx; min-width:26rpx; height:26rpx; padding:0 5rpx; border:3rpx solid #f1f6fd; border-radius:20rpx; background:#ef5b50; color:#fff; text-align:center; font-size:16rpx; line-height:26rpx; }
.profile-header { min-height:172rpx; display:flex; align-items:center; gap:24rpx; padding:8rpx 16rpx 22rpx; }
.avatar { width:132rpx; height:132rpx; flex:none; display:flex; align-items:center; justify-content:center; border:6rpx solid #fff; border-radius:50%; background:linear-gradient(145deg,#dbeafe,#c7d2fe); color:#3158a8; font-size:52rpx; font-weight:700; box-shadow:0 4rpx 16rpx rgba(30,64,175,.08); }
.avatar-image { display:block; }
.profile-copy { flex:1; min-width:0; }
.profile-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#0f172a; font-size:39rpx; line-height:1.35; font-weight:750; }
.profile-meta { display:flex; align-items:center; min-width:0; margin-top:9rpx; color:#64748b; font-size:24rpx; }
.profile-separator { margin:0 10rpx; }
.profile-email { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.profile-chevron { width:36rpx; height:36rpx; margin-left:4rpx; }
.organization-card,.shortcuts-card,.settings-card { border-radius:24rpx; background:#fff; box-shadow:0 5rpx 20rpx rgba(30,41,59,.035); }
.organization-card { margin:10rpx 0 22rpx; padding:30rpx 28rpx 25rpx; }
.organization-top { display:flex; align-items:center; gap:20rpx; padding-bottom:25rpx; }
.organization-mark { width:78rpx; height:78rpx; flex:none; display:flex; align-items:center; justify-content:center; border-radius:50%; background:#f1f5f9; color:#2563eb; font-size:36rpx; font-weight:800; }
.organization-icon { width:48rpx; height:48rpx; }
.chevron-icon { width:36rpx; height:36rpx; flex:none; }
.organization-copy { flex:1; min-width:0; }
.organization-title-row { display:flex; align-items:center; gap:12rpx; }
.organization-title { color:#0f172a; font-size:29rpx; font-weight:700; }
.role-pill { padding:6rpx 14rpx; border-radius:12rpx; background:#eff6ff; color:#2563eb; font-size:20rpx; }
.organization-subtitle { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:8rpx; color:#64748b; font-size:21rpx; }
.account-metrics { display:flex; border-top:1rpx solid #e9eef5; padding-top:22rpx; }
.metric { flex:1; min-width:0; display:flex; flex-direction:column; gap:8rpx; padding-left:20rpx; }
.metric:first-child { padding-left:4rpx; }
.metric + .metric { border-left:1rpx solid #e9eef5; }
.metric-label { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#64748b; font-size:20rpx; }
.metric-value { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#1e293b; font-size:25rpx; font-weight:700; }
.status-value { color:#059669; }
.metric-id { font-size:21rpx; }
.shortcuts-card { display:flex; gap:12rpx; margin-bottom:22rpx; padding:22rpx 18rpx; }
.shortcut { position:relative; flex:1; min-width:0; min-height:166rpx; display:flex; flex-direction:column; align-items:center; justify-content:center; border:1rpx solid #edf1f6; border-radius:18rpx; }
.shortcut-icon { width:82rpx; height:82rpx; display:flex; align-items:center; justify-content:center; border-radius:50%; }
.shortcut-image { width:68rpx; height:68rpx; }
.icon-blue { color:#2563eb; background:#eff6ff; }.icon-green { color:#10b981; background:#ecfdf5; }.icon-purple { color:#8b5cf6; background:#f5f3ff; }.icon-orange { color:#f59e0b; background:#fff7ed; }
.shortcut-label { overflow:hidden; max-width:100%; margin-top:12rpx; color:#0f172a; font-size:22rpx; font-weight:650; white-space:nowrap; }
.shortcut-chevron { position:absolute; right:5rpx; bottom:21rpx; width:26rpx; height:26rpx; }
.settings-card { margin-bottom:22rpx; padding:0 28rpx; }
.setting-row { height:106rpx; display:flex; align-items:center; gap:22rpx; }
.setting-icon { width:48rpx; height:48rpx; flex:none; }
.setting-label { flex:1; color:#1e293b; font-size:27rpx; font-weight:600; }
.setting-divider { height:1rpx; background:#e9eef5; }
.logout-button { height:82rpx; margin:0; border:2rpx solid #cbd5e1; border-radius:18rpx; background:rgba(255,255,255,.72); color:#2563eb; font-size:29rpx; font-weight:700; line-height:78rpx; }
.logout-button::after { border:0; }
</style>
