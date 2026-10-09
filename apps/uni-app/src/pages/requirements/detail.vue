<template>
  <view class="page requirements-detail-page">
    <view v-if="error" class="error-box" @tap="load">{{ error }} · 点击重新加载</view>
    <view v-if="!content && !error" class="empty">加载需求内容…</view>
    <template v-if="content">
      <text class="eyebrow">{{ requirement ? requirement.requirementNo : '需求确认候选版' }}</text>
      <view class="title">{{ content.title }}</view><view class="muted space-top">{{ requirement ? `正式需求 v${requirement.version}` : candidate?.policy === 'both' ? '品牌方与设计师确认' : '品牌方确认' }}</view>
      <view v-if="candidate && candidate.status !== 'confirming'" class="hint space-top">{{ candidateStatus }}{{ candidate.status === 'superseded' ? '，请返回需求档案查看最新版本。' : '' }}</view>
      <view v-if="changes.length" class="panel space-top"><view class="subtitle">相对上一正式版本的变化 · {{ changes.length }} 项</view><view v-for="(change, changeIndex) in changes" :key="changeIndex" class="change"><view class="change-label">{{ change.label }}</view><view class="muted break">原：{{ change.before }}</view><view class="change-new break">现：{{ change.after }}</view></view></view>
      <view class="panel space-top"><view class="subtitle">交付范围</view><view class="meta-line"><text class="muted">类型 / 平台</text><text>{{ content.category }} / {{ platformLabel }}</text></view><view class="meta-line"><text class="muted">交付时间</text><text>{{ content.deadline ? new Date(content.deadline).toLocaleString() : '未设置' }}</text></view><view class="meta-line"><text class="muted">可编辑源文件</text><text>{{ content.requiresPsd ? '需要交付' : '未要求' }}</text></view><view class="muted space-top">原始需求</view><view class="break body-copy">{{ content.originalRequirements || '未填写' }}</view></view>
      <view v-for="source in content.sources" :key="source.submissionId" class="panel"><view class="subtitle">{{ source.title }}</view><view class="muted source-meta">模板 v{{ source.templateVersion }} · 第 {{ source.revision }} 次提交</view><form-fields :order-id="orderId" :fields="source.fields" :model-value="source.answers" readonly /></view>
      <view class="panel"><view class="subtitle">确认记录</view><view v-for="approver in approvers" :key="approver.userId" class="approver"><view class="row"><text>{{ approver.name }} · {{ approver.role === 'brand' ? '品牌方' : '设计师' }}</text><text class="badge">{{ decisionText(approver.decision) }}</text></view><view v-if="approver.comment" class="muted space-top break">{{ approver.comment }}</view><view v-if="approver.actedAt" class="muted">{{ new Date(approver.actedAt).toLocaleString() }}</view></view></view>
      <view v-if="canDecide" class="panel"><view class="hint">请核对以上完整内容。确认记录仅适用于这份需求版本；修改内容后需要重新确认。</view><textarea v-model="comment" class="input comment" :maxlength="1000" placeholder="补充意见；退回时请填写需要调整的内容" /></view>
      <view v-if="requirement" class="hint">{{ executionText }} 后续设计会绑定具体需求版本，成果通过原有审核流程提交。</view>
    </template>
    <view v-if="canDecide" class="decision-sticky-footer"><button class="secondary" :disabled="busy" @tap="decide('rejected')">提出修改</button><button class="primary" :disabled="busy" :loading="busy" @tap="confirm">确认需求</button></view>
  </view>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app';
import { requirementChanges, PLATFORM_MAP, type PlatformType, type CollaborationWorkspace } from '@design-review/shared';
import FormFields from '../../components/form-fields.vue';
import { api, getSession, requireSession, uuid } from '../../lib/api';
const orderId = ref(''); const candidateId = ref(''); const requirementId = ref(''); const workspace = ref<CollaborationWorkspace | null>(null); const error = ref(''); const busy = ref(false); const loading = ref(false); const comment = ref(''); let timer: ReturnType<typeof setInterval> | undefined;
const candidate = computed(() => workspace.value?.candidates.find(item => item.id === candidateId.value));
const requirement = computed(() => workspace.value?.requirements.find(item => item.id === requirementId.value));
const content = computed(() => requirement.value?.content || candidate.value?.content);
const platformLabel = computed(() => PLATFORM_MAP[content.value?.platform as PlatformType]?.label || content.value?.platform);
const approvers = computed(() => requirement.value?.approvers || candidate.value?.approvers || []);
const canDecide = computed(() => candidate.value?.status === 'confirming' && !['completed', 'cancelled'].includes(workspace.value?.status || '') && candidate.value.approvers.some(item => item.userId === getSession()?.user.id && item.decision === 'pending'));
const changes = computed(() => { if (!content.value) return []; const previous = requirement.value ? workspace.value?.requirements.find(item => item.version === requirement.value!.version - 1) : workspace.value?.requirements[0]; return requirementChanges(previous?.content, content.value); });
const candidateStatus = computed(() => ({ confirming: '等待确认', confirmed: '确认已完成，正式需求已生成', rejected: '此版本已退回', superseded: '此版本已失效' })[candidate.value?.status || 'confirming']);
const executionText = computed(() => workspace.value?.execution?.requirementVersionId === requirement.value?.id ? '设计师已承接此需求版本。' : '需求已确认，等待设计师承接执行。');
onLoad(options => { orderId.value = String(options?.orderId || ''); candidateId.value = String(options?.candidateId || ''); requirementId.value = String(options?.requirementId || ''); });
onShow(() => { if (!requireSession()) return; void load(); timer = setInterval(() => { if (!busy.value) void load(); }, 5000); });
const stop = () => { if (timer) clearInterval(timer); timer = undefined; }; onHide(stop); onUnload(stop);
async function load() {
  if (loading.value || !orderId.value) return; loading.value = true;
  try { workspace.value = await api.workspace(orderId.value); if (!candidate.value && !requirement.value) throw new Error('需求版本不存在'); error.value = ''; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '加载失败'; }
  finally { loading.value = false; }
}
function confirm() { uni.showModal({ title: '确认此份需求', content: '确认后将记录你的确认意见，全部指定参与者确认后生成正式需求单。', success: result => { if (result.confirm) void decide('confirmed'); } }); }
async function decide(decision: 'confirmed' | 'rejected') {
  if (busy.value || !candidate.value || !canDecide.value) return;
  if (decision === 'rejected' && !comment.value.trim()) { error.value = '请填写需要补充或修改的内容'; return; }
  busy.value = true; error.value = '';
  try { const result = await api.decide(orderId.value, candidate.value, decision, comment.value.trim(), uuid()); comment.value = ''; if (result.requirementVersionId) { requirementId.value = result.requirementVersionId; candidateId.value = ''; } await load(); uni.showToast({ title: decision === 'confirmed' ? '已记录确认' : '已退回补充', icon: 'success' }); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '操作失败'; }
  finally { busy.value = false; }
}
const decisionText = (status: string) => ({ pending: '待确认', confirmed: '已确认', rejected: '已退回' } as Record<string, string>)[status];
</script>
<style scoped>
.requirements-detail-page { padding-bottom:190rpx; }.decision-sticky-footer { position:fixed; z-index:20; left:0; right:0; bottom:0; display:flex; gap:14rpx; padding:16rpx 24rpx calc(18rpx + env(safe-area-inset-bottom)); background:rgba(255,255,255,.97); border-top:1rpx solid #e2e8f0; box-shadow:0 -8rpx 24rpx rgba(15,23,42,.06); }.decision-sticky-footer button { flex:1; font-size:24rpx; }
.meta-line { display:flex; justify-content:space-between; gap:24rpx; font-size:26rpx; padding-top:24rpx; }.body-copy { font-size:28rpx; line-height:1.8; margin-top:12rpx; }.source-meta { margin:16rpx 0 30rpx; }.approver { padding-top:24rpx; margin-top:24rpx; border-top:1rpx solid #e2e8f0; font-size:26rpx; }.comment { min-height:170rpx; }.change { margin-top:24rpx; padding-top:20rpx; border-top:1rpx solid #e2e8f0; }.change-label { font-size:26rpx; margin-bottom:8rpx; }.change-new { font-size:24rpx; color:#2563eb; line-height:1.7; }
</style>
