<template>
  <view class="page login-page">
    <view class="brand-mark">C</view><text class="eyebrow">COZI · BRAND COLLABORATION</text>
    <view class="title">好设计，从说清需求开始</view><view class="muted intro">与设计师沟通、填写需求、确认方案和审核设计稿。</view>
    <view class="panel login-card">
      <view class="subtitle">品牌方登录</view>
      <!-- #ifdef MP-WEIXIN -->
      <button v-if="!bindTicket" class="primary space-top" :loading="wechatBusy" :disabled="wechatBusy || busy || bindingBusy" @tap="loginWithWechat">微信快捷登录</button>
      <view v-if="!bindTicket" class="muted space-top">已绑定微信将直接登录；首次使用可绑定已有账号或创建新账号。</view>
      <view v-if="bindTicket" class="wechat-bind-panel space-top">
        <view class="bind-title">微信身份已验证</view>
        <view class="muted bind-copy">选择如何关联 COZI 品牌协作账号。验证有效期 10 分钟。</view>
        <template v-if="bindMode === 'existing'">
          <view class="field-label">已有账号（邮箱或手机号）</view><input v-model="bindIdentifier" class="input" placeholder="请输入品牌方账号" :disabled="bindingBusy" />
          <view class="field-label">账号密码</view><input v-model="bindPassword" class="input" password placeholder="请输入密码" :disabled="bindingBusy" @confirm="bindExistingAccount" />
          <button class="primary space-top" :loading="bindingBusy" :disabled="bindingBusy || !bindIdentifier.trim() || !bindPassword" @tap="bindExistingAccount">验证并绑定</button>
          <view class="bind-switch" @tap="bindMode = 'new'">没有平台账号？创建新账号</view>
        </template>
        <template v-else>
          <view class="field-label">品牌联系人姓名</view><input v-model="brandName" class="input" placeholder="请输入姓名（2–64 个字符）" :disabled="bindingBusy" />
          <button class="primary space-top" :loading="bindingBusy" :disabled="bindingBusy || brandName.trim().length < 2" @tap="createWechatAccount">创建账号并绑定微信</button>
          <view class="muted bind-note">新账号将使用当前微信作为登录凭证，请确保能够持续使用此微信。</view>
          <view class="bind-switch" @tap="bindMode = 'existing'">已有平台账号？返回绑定</view>
        </template>
        <view class="bind-cancel" @tap="cancelWechatBinding">取消，重新选择登录方式</view>
      </view>
      <!-- #endif -->
      <view v-if="error" class="error-box space-top">{{ error }}</view>
      <button v-if="!bindTicket" class="test-login-toggle" @tap="showTestLogin = !showTestLogin">{{ showTestLogin ? '收起账号登录' : '账号密码登录' }}</button>
      <view v-if="showTestLogin" class="test-login-form">
        <view class="muted">使用已有品牌方账号登录；首次登录微信后也可在上方完成绑定。</view>
        <view class="field-label">邮箱或手机号</view><input v-model="identifier" class="input" placeholder="请输入账号" :disabled="busy" />
        <view class="field-label">密码</view><input v-model="password" class="input" password placeholder="请输入密码" :disabled="busy" @confirm="login" />
        <button class="primary space-top" :loading="busy" :disabled="busy || !identifier.trim() || !password" @tap="login">登录</button>
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
const bindTicket = ref(''); const bindMode = ref<'existing' | 'new'>('existing'); const bindIdentifier = ref(''); const bindPassword = ref(''); const brandName = ref(''); const bindingBusy = ref(false);
const pendingInvite = () => String(uni.getStorageSync('cozi-pending-intake-invite') || '');
function openAfterLogin() { const token = pendingInvite(); if (token) uni.redirectTo({ url: `/pages/invite/join?token=${encodeURIComponent(token)}` }); else uni.switchTab({ url: '/pages/index/index' }); }
onShow(() => { if (getSession()?.user.role === 'advertiser') openAfterLogin(); });
async function loginWithWechat() {
  if (wechatBusy.value) return;
  wechatBusy.value = true; error.value = '';
  try {
    const code = await new Promise<string>((resolve, reject) => uni.login({ provider: 'weixin', success: result => result.code ? resolve(result.code) : reject(new Error('未获取到微信登录凭证')), fail: reject }));
    const result = await api.wechatLogin(code);
    if (result.status === 'logged_in') { saveSession({ token: result.token, user: result.user }); openAfterLogin(); return; }
    bindTicket.value = result.bindTicket; bindMode.value = 'existing'; bindIdentifier.value = ''; bindPassword.value = ''; error.value = '';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '微信登录失败，请使用账号密码登录'; }
  finally { wechatBusy.value = false; }
}
async function bindExistingAccount() {
  if (bindingBusy.value || !bindTicket.value || !bindIdentifier.value.trim() || !bindPassword.value) return;
  bindingBusy.value = true; error.value = '';
  try { const session = await api.wechatBind(bindTicket.value, bindIdentifier.value.trim(), bindPassword.value); saveSession(session); openAfterLogin(); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '账号绑定失败，请检查账号密码后重试'; }
  finally { bindingBusy.value = false; }
}
async function createWechatAccount() {
  if (bindingBusy.value || !bindTicket.value || brandName.value.trim().length < 2) return;
  bindingBusy.value = true; error.value = '';
  try { const session = await api.wechatRegister(bindTicket.value, brandName.value.trim()); saveSession(session); openAfterLogin(); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '创建账号失败，请稍后重试'; }
  finally { bindingBusy.value = false; }
}
function cancelWechatBinding() { bindTicket.value = ''; bindPassword.value = ''; bindIdentifier.value = ''; error.value = ''; }
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
.login-page { padding:100rpx 40rpx 60rpx; }.brand-mark { width:88rpx; height:88rpx; background:#2563eb; color:#fff; font-size:54rpx; border-radius:26rpx; text-align:center; line-height:88rpx; margin-bottom:44rpx; }.intro { margin-top:20rpx; }.login-card { margin-top:56rpx; }.field-label { font-size:24rpx; margin:32rpx 0 16rpx; color:#475569; }.test-login-toggle { display:block; margin:32rpx auto 0; padding:8rpx 16rpx; color:#64748b; font-size:24rpx; background:transparent; }.test-login-form { margin-top:20rpx; padding-top:24rpx; border-top:1rpx solid #edf1ef; }.footnote { text-align:center; margin-top:28rpx; }.wechat-bind-panel { padding:24rpx; border:1rpx solid #dbeafe; border-radius:18rpx; background:#f8fbff; }.bind-title { color:#1e293b; font-size:28rpx; font-weight:700; }.bind-copy { margin-top:8rpx; line-height:1.6; }.bind-switch,.bind-cancel { margin-top:24rpx; color:#2563eb; font-size:23rpx; text-align:center; }.bind-cancel { padding-top:18rpx; border-top:1rpx solid #e2e8f0; color:#64748b; }.bind-note { margin-top:14rpx; line-height:1.6; }
</style>
