<template>
  <view class="page"><text class="eyebrow">品牌方账户</text><view class="title">{{ user?.name || '我的账户' }}</view><view class="panel space-top"><view class="row"><text class="muted">当前身份</text><text>品牌方</text></view><view class="row space-top"><text class="muted">账号</text><text class="account-email">{{ user?.email }}</text></view></view><view class="hint">需求资料、确认记录和设计成果与工作台同步。仅本人参与的项目可见。</view><button class="secondary" @tap="logout">退出登录</button></view>
</template>
<script setup lang="ts">
import { ref } from 'vue';
import { onShow } from '@dcloudio/uni-app';
import { clearSession, getSession, requireSession, type MiniUser } from '../../lib/api';
const user = ref<MiniUser | null>(null);
onShow(() => { if (requireSession()) user.value = getSession()!.user; });
function logout() { uni.showModal({ title: '退出登录', content: '未发送消息与草稿会保留在此设备，重新登录同一账号可继续。', success: result => { if (result.confirm) { clearSession(); uni.reLaunch({ url: '/pages/login/login' }); } } }); }
</script>
<style scoped>.account-email { font-size:26rpx; max-width:70%; word-break:break-all; }</style>
