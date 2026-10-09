<template>
  <view class="page form-page">
    <view v-if="error" class="error-box">{{ error }}<view class="space-top" @tap="load">重新加载最新版本 →</view></view>
    <view v-if="loading && !form" class="empty">加载表单…</view>
    <template v-if="form">
      <text class="eyebrow">需求表单 · 模板 v{{ form.template.publishedVersion || form.template.version }}</text><view class="title">{{ form.template.name }}</view><view class="muted space-top">{{ form.template.description }}</view>
      <view class="row space-top"><text class="badge">{{ statusText }}</text><text class="muted">已提交 {{ form.revision }} 次</text></view>
      <view v-if="form.comment" class="hint space-top">补充说明：{{ form.comment }}</view>
      <view v-if="recovery" class="hint space-top">此设备有未保存内容。请核对最新表单后选择是否恢复。<view class="footer-actions"><button class="secondary" size="mini" @tap="restore">恢复本地内容</button><button class="secondary" size="mini" @tap="discard">舍弃本地内容</button></view></view>
      <view class="panel space-top"><form-fields :order-id="orderId" v-model="answers" :fields="form.template.fields" :readonly="readonly" @busy="uploading = $event" /></view>
      <view v-if="readonly" class="stack"><view class="hint">这份提交已保存。填写提交后，还需要核对并确认需求，才能生成正式需求单。</view><button class="primary" @tap="requirements">查看需求与确认</button><button v-if="!closed" class="secondary" :disabled="busy" @tap="revise">发起修订</button></view>
      <view v-if="!readonly" class="muted space-top">草稿暂存在此设备。点击「保存草稿」同步到其他设备；提交时会校验必填项。</view>
    </template>
    <view v-if="form && !readonly" class="form-sticky-footer"><text class="draft-label">{{ uploading ? '正在上传素材…' : '草稿暂存在此设备' }}</text><view class="form-actions"><button class="secondary" :loading="busy" :disabled="busy || uploading" @tap="save(false)">保存草稿</button><button class="primary" :loading="busy" :disabled="busy || uploading" @tap="submit">提交需求资料</button></view></view>
  </view>
</template>
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onLoad, onShow } from '@dcloudio/uni-app';
import type { CollaborationForm, FormAnswers } from '@design-review/shared';
import FormFields from '../../components/form-fields.vue';
import { api, getSession, requireSession, uuid } from '../../lib/api';
import { defaultAnswers } from '../../lib/forms';
const orderId = ref(''); const formId = ref(''); const form = ref<CollaborationForm | null>(null); const answers = ref<FormAnswers>({});
const loading = ref(false); const busy = ref(false); const uploading = ref(false); const closed = ref(false); const error = ref(''); const recovery = ref<{ answers: FormAnswers; lockVersion: number } | null>(null); let applying = false;
const localKey = () => `cozi-form-draft:${getSession()?.user.id}:${formId.value}`;
const readonly = computed(() => closed.value || form.value?.status === 'submitted' || form.value?.assigneeId !== getSession()?.user.id);
const statusText = computed(() => ({ sent: '待填写', filling: '填写中', submitted: '已提交', returned: '待补充' })[form.value?.status || 'sent']);
onLoad(options => { orderId.value = String(options?.orderId || ''); formId.value = String(options?.formId || ''); });
onShow(() => { if (requireSession() && !form.value) void load(); });
watch(answers, value => {
  if (applying || !form.value || readonly.value) return;
  try { uni.setStorageSync(localKey(), { answers: value, lockVersion: form.value.lockVersion }); }
  catch { error.value = '本地草稿未保存，请点击保存草稿同步到服务器'; }
}, { deep: true, flush: 'sync' });
async function load() {
  if (loading.value || !orderId.value || !requireSession()) return;
  loading.value = true; error.value = '';
  try {
    const workspace = await api.workspace(orderId.value); const next = workspace.forms.find(item => item.id === formId.value);
    if (!next) throw new Error('表单不存在或已失效');
    closed.value = ['completed', 'cancelled'].includes(workspace.status); form.value = next;
    applying = true; answers.value = { ...defaultAnswers(next.template.fields), ...next.answers }; applying = false;
    const stored = uni.getStorageSync(localKey());
    if (stored && next.status !== 'submitted') {
      if (stored.lockVersion === next.lockVersion) { applying = true; answers.value = stored.answers; applying = false; }
      else recovery.value = stored;
    }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '表单加载失败'; }
  finally { loading.value = false; }
}
function restore() { if (recovery.value) answers.value = recovery.value.answers; recovery.value = null; }
function discard() { uni.removeStorageSync(localKey()); recovery.value = null; }
async function save(submit: boolean) {
  if (!form.value || busy.value || uploading.value || readonly.value) return;
  busy.value = true; error.value = '';
  try { form.value = await api.saveForm(orderId.value, form.value, answers.value, submit, uuid()); uni.removeStorageSync(localKey()); recovery.value = null; uni.showToast({ title: submit ? '需求资料已提交' : '草稿已同步', icon: 'success' }); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '保存失败'; }
  finally { busy.value = false; }
}
function submit() { uni.showModal({ title: '提交需求资料', content: '提交后内容将保存为一个版本，后续修改需要发起修订。', success: result => { if (result.confirm) void save(true); } }); }
function revise() {
  if (!form.value || busy.value) return;
  uni.showModal({ title: '发起需求修订', editable: true, placeholderText: '说明需要调整的内容', success: async result => {
    if (!result.confirm || !result.content?.trim() || !form.value) return;
    busy.value = true;
    try { form.value = await api.returnForm(orderId.value, form.value, result.content.trim(), uuid()); await load(); }
    catch (cause) { error.value = cause instanceof Error ? cause.message : '修订失败'; }
    finally { busy.value = false; }
  } });
}
function requirements() { uni.navigateTo({ url: `/pages/requirements/index?orderId=${encodeURIComponent(orderId.value)}` }); }
</script>
<style scoped>
.form-page { padding-bottom:190rpx; }.form-sticky-footer { position:fixed; z-index:20; left:0; right:0; bottom:0; padding:16rpx 24rpx calc(18rpx + env(safe-area-inset-bottom)); background:rgba(255,255,255,.97); border-top:1rpx solid #e2e8f0; box-shadow:0 -8rpx 24rpx rgba(15,23,42,.06); }.draft-label { display:block; margin:0 4rpx 12rpx; color:#64748b; font-size:20rpx; }.form-actions { display:flex; gap:14rpx; }.form-actions button { flex:1; font-size:23rpx; }
</style>
