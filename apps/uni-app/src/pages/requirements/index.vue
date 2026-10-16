<template>
  <view class="page">
    <text class="eyebrow">项目需求档案</text><view class="title">{{ workspace?.title || '表单与需求' }}</view>
    <view v-if="error" class="error-box space-top" @tap="load">{{ error }} · 点击重试</view>
    <view v-if="loading && !workspace" class="empty">同步需求…</view>
    <template v-if="workspace">
      <view class="section-heading">填写需求资料</view>
      <view v-for="form in workspace.forms" :key="form.id" class="panel" @tap="openForm(form.id)"><view class="row"><view class="subtitle">{{ form.template.name }}</view><text class="badge">{{ formStatus(form.status) }}</text></view><view class="muted space-top">模板 v{{ form.template.publishedVersion || form.template.version }} · 提交 {{ form.revision }} 次</view><view v-if="form.comment" class="muted">{{ form.comment }}</view><view class="link space-top">{{ form.status === 'submitted' ? '查看已提交内容' : '继续填写' }} →</view></view>
      <view v-if="!workspace.forms.length" class="hint">可等待设计师发送表单，也可以自行选择模板完善需求。</view>
      <button v-if="!closed" class="secondary" :disabled="busy" @tap="chooseTemplate">＋ 选择需求模板</button>
      <view v-if="submitted.length && !closed" class="panel space-top"><view class="subtitle">汇总并发起确认</view><view class="muted space-top">选择本次纳入需求的已提交表单。{{ workspace.designerId ? '品牌方与设计师确认同一版本。' : '当前由品牌方确认，接单后设计师需明确承接。' }}</view><checkbox-group @change="selectForms"><label v-for="form in submitted" :key="form.id" class="source-choice"><checkbox :value="form.id" :checked="selected.includes(form.id)" color="#2563eb" /><text>{{ form.template.name }} · 第 {{ form.revision }} 次提交</text></label></checkbox-group><button class="primary space-top" :disabled="busy || !selected.length" :loading="busy" @tap="createCandidate">发起需求确认</button></view>
      <view id="confirmation-section" class="section-heading">需求确认</view>
      <view v-for="candidate in workspace.candidates" :key="candidate.id" class="panel" @tap="openCandidate(candidate.id)"><view class="row"><view class="subtitle">{{ candidate.policy === 'both' ? '双方需求确认' : '品牌方需求确认' }}</view><text class="badge">{{ candidateStatus(candidate.status) }}</text></view><view class="muted space-top">{{ candidate.approvers.map(item => `${item.name}：${decisionText(item.decision)}`).join(' · ') }}</view><view class="link space-top">查看完整内容与差异 →</view></view>
      <view v-if="!workspace.candidates.length" class="muted">提交资料后可汇总并发起需求确认。</view>
      <view class="section-heading">正式需求版本</view>
      <view v-for="requirement in workspace.requirements" :key="requirement.id" class="panel" @tap="openRequirement(requirement.id)"><text class="eyebrow">{{ requirement.requirementNo }}</text><view class="row"><view class="subtitle">正式需求 v{{ requirement.version }}</view><text class="badge">{{ requirement.id === workspace.requirements[0].id ? '最新版本' : '历史版本' }}</text></view><view class="muted space-top">确认记录、表单来源与附件均可追溯。</view><view class="link space-top">查看需求单 →</view></view>
      <view v-if="!workspace.requirements.length" class="hint">完成指定参与者的确认后，系统自动生成正式需求单。</view>
    </template>
  </view>
</template>
<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { onLoad, onShow, onPullDownRefresh } from '@dcloudio/uni-app';
import type { CollaborationWorkspace } from '@design-review/shared';
import { api, requireSession, uuid } from '../../lib/api';
const orderId = ref(''); const workspace = ref<CollaborationWorkspace | null>(null); const selected = ref<string[]>([]); const error = ref(''); const loading = ref(false); const busy = ref(false); const focusConfirmations = ref(false);
const submitted = computed(() => workspace.value?.forms.filter(form => form.status === 'submitted') || []);
const closed = computed(() => ['completed', 'cancelled'].includes(workspace.value?.status || ''));
onLoad(options => { orderId.value = String(options?.orderId || ''); focusConfirmations.value = String(options?.section || '') === 'confirmations'; });
onShow(() => { if (requireSession()) void load(); });
onPullDownRefresh(() => { void load().finally(() => uni.stopPullDownRefresh()); });
async function load() {
  if (loading.value || !orderId.value) return;
  loading.value = true; error.value = '';
  try {
    workspace.value = await api.workspace(orderId.value);
    selected.value = selected.value.filter(id => submitted.value.some(form => form.id === id));
    if (!selected.value.length) selected.value = submitted.value.map(form => form.id);
    if (focusConfirmations.value) {
      focusConfirmations.value = false;
      nextTick(() => {
        const query = uni.createSelectorQuery();
        query.select('#confirmation-section').boundingClientRect();
        query.selectViewport().scrollOffset();
        query.exec(result => {
          const sectionTop = (result?.[0]?.top || 0) + (result?.[1]?.scrollTop || 0);
          uni.pageScrollTo({ scrollTop: sectionTop, duration: 240 });
        });
      });
    }
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '加载失败'; }
  finally { loading.value = false; }
}
const selectForms = (event: { detail: { value: string[] } }) => { selected.value = event.detail.value; };
async function chooseTemplate() {
  busy.value = true; error.value = '';
  try {
    const templates = await api.templates();
    if (!templates.length) throw new Error('暂无已发布模板，请联系设计师或管理员发布');
    // The native action sheet supports at most six options. A picker page handles the complete library.
    uni.navigateTo({ url: `/pages/forms/templates?orderId=${encodeURIComponent(orderId.value)}` });
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '模板加载失败'; }
  finally { busy.value = false; }
}
async function createCandidate() {
  if (!workspace.value || busy.value) return;
  busy.value = true; error.value = '';
  try { const candidate = await api.candidate(orderId.value, workspace.value, selected.value, uuid()); openCandidate(candidate.id); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '发起确认失败'; }
  finally { busy.value = false; }
}
function openForm(id: string) { uni.navigateTo({ url: `/pages/forms/detail?orderId=${encodeURIComponent(orderId.value)}&formId=${id}` }); }
function openCandidate(id: string) { uni.navigateTo({ url: `/pages/requirements/detail?orderId=${encodeURIComponent(orderId.value)}&candidateId=${id}` }); }
function openRequirement(id: string) { uni.navigateTo({ url: `/pages/requirements/detail?orderId=${encodeURIComponent(orderId.value)}&requirementId=${id}` }); }
const formStatus = (status: string) => ({ sent: '待填写', filling: '填写中', submitted: '已提交', returned: '待补充' } as Record<string, string>)[status];
const candidateStatus = (status: string) => ({ confirming: '待确认', confirmed: '已确认', rejected: '已退回', superseded: '已失效' } as Record<string, string>)[status];
const decisionText = (status: string) => ({ pending: '待确认', confirmed: '已确认', rejected: '已退回' } as Record<string, string>)[status];
</script>
<style scoped>.link { color:#2563eb; font-size:26rpx; }.source-choice { display:flex; align-items:center; gap:12rpx; padding:20rpx 0; font-size:26rpx; }</style>
