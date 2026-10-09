<template>
  <view class="page login-page">
    <view class="brand-mark">C</view><text class="eyebrow">COZI · BRAND COLLABORATION</text>
    <view class="title">好设计，从说清需求开始</view><view class="muted intro">与设计师沟通、填写需求、确认方案和审核设计稿。</view>
    <view class="panel login-card">
      <view class="subtitle">品牌方登录</view>
      <!-- #ifdef MP-WEIXIN -->
      <button class="primary space-top" :loading="wechatBusy" :disabled="wechatBusy || busy" @tap="loginWithWechat">微信一键登录</button>
      <view class="muted space-top">使用当前微信身份登录，首次使用将自动创建品牌方协作账号</view>
      <!-- #endif -->
      <view v-if="error" class="error-box space-top">{{ error }}</view>
      <button class="test-login-toggle" @tap="showTestLogin = !showTestLogin">{{ showTestLogin ? '收起测试登录' : '测试账号登录' }}</button>
      <view v-if="showTestLogin" class="test-login-form">
        <view class="muted">仅用于开发联调和测试</view>
        <view class="field-label">邮箱或手机号</view><input v-model="identifier" class="input" placeholder="请输入测试账号" :disabled="busy" />
        <view class="field-label">密码</view><input v-model="password" class="input" password placeholder="请输入测试密码" :disabled="busy" @confirm="login" />
        <button class="primary space-top" :loading="busy" :disabled="busy || !identifier.trim() || !password" @tap="login">测试登录</button>
      </view>
    </view>
    <view class="muted footnote">微信登录后可直接加入邀请会话并继续沟通。</view>
  </view>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { api, getSession, saveSession } from '../../lib/api';
const identifier = ref(''); const password = ref(''); const busy = ref(false); const wechatBusy = ref(false); const error = ref('');
const showTestLogin = ref(false);
const pendingInvite = () => String(uni.getStorageSync('cozi-pending-intake-invite') || '');
function openAfterLogin() { const token = pendingInvite(); if (token) uni.redirectTo({ url: `/pages/invite/join?token=${encodeURIComponent(token)}` }); else uni.switchTab({ url: '/pages/index/index' }); }
onShow(() => { if (getSession()?.user.role === 'advertiser') openAfterLogin(); });
async function loginWithWechat() {
  if (wechatBusy.value) return;
  wechatBusy.value = true; error.value = '';
  try {
    const code = await new Promise<string>((resolve, reject) => uni.login({ provider: 'weixin', success: result => result.code ? resolve(result.code) : reject(new Error('未获取到微信登录凭证')), fail: reject }));
    const session = await api.wechatLogin(code);
    saveSession(session); openAfterLogin();
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '微信登录失败，请使用账号密码登录'; }
  finally { wechatBusy.value = false; }
}
async function login() {
  if (busy.value || !identifier.value.trim() || !password.value) return;
  busy.value = true; error.value = '';
  try {
    const session = await api.login(identifier.value.trim(), password.value);
    if (session.user.role !== 'advertiser') throw new Error('请使用品牌方账号登录');
    saveSession(session); password.value = ''; openAfterLogin();
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '登录失败'; }
  finally { busy.value = false; }
}
</script>
<style scoped>
.login-page { padding:100rpx 40rpx 60rpx; }.brand-mark { width:88rpx; height:88rpx; background:#2563eb; color:#fff; font-size:54rpx; border-radius:26rpx; text-align:center; line-height:88rpx; margin-bottom:44rpx; }.intro { margin-top:20rpx; }.login-card { margin-top:56rpx; }.field-label { font-size:24rpx; margin:32rpx 0 16rpx; color:#475569; }.test-login-toggle { display:block; margin:32rpx auto 0; padding:8rpx 16rpx; color:#64748b; font-size:24rpx; background:transparent; }.test-login-form { margin-top:20rpx; padding-top:24rpx; border-top:1rpx solid #edf1ef; }.footnote { text-align:center; margin-top:28rpx; }
</style>
