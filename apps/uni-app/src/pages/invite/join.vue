<template>
  <view class="page invite-page"><view class="brand-mark">C</view><view class="title">加入沟通会话</view><view class="muted space-top">登录后即可进入对方分享的会话，直接开始沟通。</view><view v-if="busy" class="panel space-top">正在接入会话…</view><view v-if="error" class="error-box space-top">{{ error }}</view><button v-if="error" class="primary space-top" @tap="join">重试加入</button><button v-if="error" class="secondary space-top" @tap="toLogin">去登录</button></view>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import { ApiError, api, getSession } from '../../lib/api';
const PENDING_INVITE_KEY = 'cozi-pending-intake-invite';
const token = ref(''); const busy = ref(false); const error = ref('');
onLoad(options => { token.value = String(options?.token || options?.scene || uni.getStorageSync(PENDING_INVITE_KEY) || ''); if (token.value) uni.setStorageSync(PENDING_INVITE_KEY, token.value); });
onShow(() => { if (!token.value) token.value = String(uni.getStorageSync(PENDING_INVITE_KEY) || ''); void join(); });
async function join() { if (busy.value) return; if (!token.value) { error.value = '邀请链接无效'; return; } if (!getSession()) return toLogin(); busy.value = true; error.value = ''; try { const session = await api.joinIntakeSession(token.value); uni.removeStorageSync(PENDING_INVITE_KEY); uni.redirectTo({ url: `/pages/sessions/chat?id=${encodeURIComponent(session.id)}` }); } catch (cause) { if (cause instanceof ApiError && cause.status === 410) uni.removeStorageSync(PENDING_INVITE_KEY); error.value = cause instanceof Error ? cause.message : '加入失败'; } finally { busy.value = false; } }
function toLogin() { uni.redirectTo({ url: '/pages/login/login' }); }
</script>
<style scoped>
.invite-page { padding-top:100rpx; }.brand-mark { width:88rpx; height:88rpx; background:#2563eb; color:#fff; font-size:54rpx; border-radius:26rpx; text-align:center; line-height:88rpx; margin-bottom:44rpx; }
</style>
