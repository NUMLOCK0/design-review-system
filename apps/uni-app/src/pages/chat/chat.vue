<template>
  <view class="chat-page">
    <view class="chat-header"><text class="back" @tap="back">‹</text><view class="header-copy"><view class="header-title">{{ workspace?.title || '项目协作' }}</view><view class="header-subtitle">{{ workspace?.orderNo }} · {{ syncing ? '同步中' : '消息自动同步' }}</view></view><text class="header-action" @tap="openRequirements">档案</text></view>
    <view class="quick-links"><view class="quick-link" @tap="openRequirements">表单与需求 <text>{{ workspace?.forms.length || 0 }}</text></view><view class="quick-link" @tap="openRequirements">{{ workspace?.requirements[0] ? `正式需求 v${workspace.requirements[0].version}` : '完善需求 →' }}</view></view>
    <view v-if="error" class="error-box chat-error" @tap="sync">{{ error }} · 点击重试</view>
    <scroll-view scroll-y class="timeline" :scroll-into-view="scrollTarget" scroll-with-animation>
      <view v-if="!messages.length && !syncing" class="empty">从这里开始沟通，或进入「表单与需求」填写资料。</view>
      <view v-for="message in visibleMessages" :id="`message-${message.id}`" :key="message.id" class="message" :class="{ mine: message.senderId === userId }">
        <text class="sender">{{ message.senderName }}</text>
        <view v-if="recalledIds.has(message.id)" class="muted">消息已撤回</view>
        <view v-else-if="choiceCard(message)" class="workflow-card"><text class="eyebrow">{{ choiceCard(message)?.source === 'style' ? '八方向风格选择' : '组合发单选择题' }}</text><view class="subtitle">{{ choiceCard(message)?.title }}</view><view class="muted space-top">{{ choiceCard(message)?.prompt }}</view><view v-for="option in choiceCard(message)?.options" :key="option.id" class="choice-option" :class="{ chosen: choiceAnswers[message.id]?.optionId === option.id }" @tap="answerChoice(message, option)"><text>{{ option.label }}</text><text v-if="option.detail" class="muted">{{ option.detail }}</text></view><view v-if="choiceAnswers[message.id]" class="card-action">品牌方已选择：{{ choiceAnswers[message.id].optionLabel }}</view></view>
        <view v-else-if="workflow(message)" class="workflow-card" @tap="openWorkflow(message)"><text class="eyebrow">{{ workflowLabel(message) }}</text><view class="subtitle">{{ workflow(message)?.title }}</view><view class="muted space-top">{{ workflow(message)?.description }}</view><view class="card-action">查看与处理 →</view></view>
        <view v-else class="bubble"><text class="break">{{ readableBody(message) }}</text></view>
      </view>
      <view v-for="pending in pendingList" :key="pending.clientMessageId" class="message mine"><text class="sender">{{ pending.error || '待发送，联网后自动重试' }}</text><view class="bubble pending-bubble"><text class="break">{{ pending.body }}</text></view><view v-if="pending.error" class="row pending-actions"><text @tap="retry(pending)">立即重试</text><text @tap="discard(pending)">放弃待发</text></view></view>
      <view id="chat-bottom" class="chat-bottom" />
    </scroll-view>
    <view class="composer"><view class="composer-tools"><view class="tool-pill" @tap="openRequirements">＋ 工具</view><view class="tool-pill primary-tool" @tap="openRequirements">需求单</view><view class="tool-pill" @tap="openRequirements">表单与确认</view></view><view class="composer-row"><textarea v-model="draft" class="message-input" :maxlength="5000" auto-height placeholder="沟通需求、补充说明…" :disabled="closed" /><button class="send" :disabled="!draft.trim() || sending || closed" @tap="send">发送</button></view></view>
  </view>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app';
import { parseWorkflowMessage, type CollaborationWorkspace } from '@design-review/shared';
import { api, getSession, requireSession, type ChatMessage } from '../../lib/api';
import { acknowledgeMessages, flushOutbox, pendingMessages, queueMessage, retryMessage, discardMessage, type PendingMessage } from '../../lib/outbox';
const orderId = ref(''); const workspace = ref<CollaborationWorkspace | null>(null); const messages = ref<ChatMessage[]>([]); const pendingList = ref<PendingMessage[]>([]);
const draft = ref(''); const error = ref(''); const syncing = ref(false); const sending = ref(false); const scrollTarget = ref(''); const userId = ref(''); let cursor = 0; let timer: ReturnType<typeof setInterval> | undefined; let active = false;
const closed = computed(() => ['cancelled', 'completed'].includes(workspace.value?.status || ''));
const draftKey = () => `cozi-chat-draft:${userId.value}:${orderId.value}`;
onLoad(options => { orderId.value = String(options?.orderId || ''); userId.value = getSession()?.user.id || ''; draft.value = uni.getStorageSync(draftKey()) || ''; });
watch(draft, value => { if (userId.value && orderId.value) { try { uni.setStorageSync(draftKey(), value); } catch { error.value = '本地草稿未保存，请检查设备存储'; } } });
onShow(() => { if (!requireSession()) return; active = true; void sync(); if (!timer) timer = setInterval(() => { void sync(); }, 5000); });
function stop() { active = false; if (timer) clearInterval(timer); timer = undefined; }
onHide(stop); onUnload(stop);
async function sync() {
  if (syncing.value || !orderId.value || !active) return;
  syncing.value = true;
  try {
    await flushOutbox(orderId.value);
    let more = true; let changed = false;
    while (more && active) {
      const page = await api.messages(orderId.value, cursor);
      if (page.messages.length) {
        cursor = page.messages[page.messages.length - 1].seq;
        const known = new Set(messages.value.map(item => item.id));
        messages.value.push(...page.messages.filter(item => !known.has(item.id))); changed = true;
        acknowledgeMessages(orderId.value, page.messages);
      }
      more = page.hasMore && page.messages.length > 0;
    }
    workspace.value = await api.workspace(orderId.value); pendingList.value = pendingMessages(orderId.value); error.value = '';
    if (changed) { scrollTarget.value = ''; await nextTick(); scrollTarget.value = 'chat-bottom'; }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '同步失败'; }
  finally { syncing.value = false; }
}
async function send() {
  if (sending.value || closed.value) return;
  sending.value = true;
  try { queueMessage(orderId.value, draft.value); draft.value = ''; pendingList.value = pendingMessages(orderId.value); await flushOutbox(orderId.value); await sync(); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '消息尚未发送'; }
  finally { sending.value = false; pendingList.value = pendingMessages(orderId.value); }
}
async function retry(message: PendingMessage) {
  await retryMessage(orderId.value, message.clientMessageId); pendingList.value = pendingMessages(orderId.value); await sync();
}
function discard(message: PendingMessage) {
  uni.showModal({ title: '放弃待发消息', content: '仅移除此设备上的待发消息，已发送的消息不会撤回。', success: result => { if (result.confirm) { discardMessage(orderId.value, message.clientMessageId); pendingList.value = pendingMessages(orderId.value); } } });
}
const recalledIds = computed(() => new Set(messages.value.flatMap(message => {
  if (!message.body.startsWith('COZI_CHAT_CARD_V1:')) return [];
  try { const card = JSON.parse(message.body.slice('COZI_CHAT_CARD_V1:'.length)); return card.kind === 'recall' && typeof card.targetMessageId === 'string' ? [card.targetMessageId] : []; } catch { return []; }
})));
const visibleMessages = computed(() => messages.value.filter(message => {
  if (!message.body.startsWith('COZI_CHAT_CARD_V1:')) return true;
  try { return JSON.parse(message.body.slice('COZI_CHAT_CARD_V1:'.length)).kind !== 'recall'; } catch { return true; }
}));
type ChoiceOption = { id: string; label: string; detail: string };
type ChoiceCard = { kind: 'choice'; source: 'combo' | 'style'; title: string; prompt: string; options: ChoiceOption[] };
function choiceCard(message: ChatMessage): ChoiceCard | null {
  if (!message.body.startsWith('COZI_CHAT_CARD_V1:')) return null;
  try { const card = JSON.parse(message.body.slice('COZI_CHAT_CARD_V1:'.length)); return card?.kind === 'choice' && Array.isArray(card.options) ? card as ChoiceCard : null; } catch { return null; }
}
const choiceAnswers = computed<Record<string, { optionId: string; optionLabel: string }>>(() => {
  const result: Record<string, { optionId: string; optionLabel: string }> = {};
  for (const message of messages.value) {
    if (!message.body.startsWith('COZI_CHAT_CARD_V1:')) continue;
    try { const card = JSON.parse(message.body.slice('COZI_CHAT_CARD_V1:'.length)); if (card?.kind === 'choice_answer') result[card.choiceMessageId] = { optionId: card.optionId, optionLabel: card.optionLabel }; } catch { /* Keep malformed messages readable. */ }
  }
  return result;
});
function answerChoice(message: ChatMessage, option: ChoiceOption) {
  if (getSession()?.user.role !== 'advertiser' || message.senderId === userId.value || choiceAnswers.value[message.id]) return;
  uni.showModal({ title: '确认选择', content: option.label, success: result => { if (!result.confirm) return; try {
    queueMessage(orderId.value, `COZI_CHAT_CARD_V1:${JSON.stringify({ kind: 'choice_answer', choiceMessageId: message.id, optionId: option.id, optionLabel: option.label, note: '' })}`);
    pendingList.value = pendingMessages(orderId.value); void flushOutbox(orderId.value).then(() => sync()).catch(cause => { error.value = cause instanceof Error ? cause.message : '选择尚未发送'; });
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '选择尚未保存'; } } });
}
const workflow = (message: ChatMessage) => parseWorkflowMessage(message.body);
function workflowLabel(message: ChatMessage) { return ({ form: '需求表单', confirmation: '需求确认', requirement: '正式需求单', execution: '设计执行' })[workflow(message)!.kind]; }
function readableBody(message: ChatMessage) {
  if (!message.body.startsWith('COZI_CHAT_CARD_V1:')) return message.body;
  try {
    const card = JSON.parse(message.body.slice('COZI_CHAT_CARD_V1:'.length));
    if (card.kind === 'work_card') return `${card.title}\n${card.fields.map((field: { label: string; value: string }) => `${field.label}：${field.value}`).join('\n')}`;
    if (card.kind === 'proposal') return `${card.title}\nA：${card.optionA}\n${card.detailA}\nB：${card.optionB}\n${card.detailB}`;
    if (card.kind === 'recall') return '对方撤回了一条消息';
    if (card.kind === 'choice') return `待选择：${card.title}`;
    if (card.kind === 'choice_answer') return `已选择：${card.optionLabel}${card.note ? `；${card.note}` : ''}`;
    return `${card.decision === 'confirmed' ? '已确认' : card.kind === 'decision' ? `选择方案 ${card.option}` : '协作反馈'}${card.note ? `：${card.note}` : ''}`;
  } catch { return '历史协作卡片，请在工作台查看。'; }
}
function openRequirements() { uni.navigateTo({ url: `/pages/requirements/index?orderId=${encodeURIComponent(orderId.value)}` }); }
function back() { uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/sessions/index' }) }); }
function openWorkflow(message: ChatMessage) {
  const card = workflow(message); if (!card) return;
  if (card.kind === 'form') return uni.navigateTo({ url: `/pages/forms/detail?orderId=${encodeURIComponent(orderId.value)}&formId=${card.entityId}` });
  uni.navigateTo({ url: `/pages/requirements/detail?orderId=${encodeURIComponent(orderId.value)}&${card.kind === 'confirmation' ? 'candidateId' : 'requirementId'}=${card.entityId}` });
}
</script>
<style scoped>
.chat-page { height:100vh; height:100dvh; display:flex; flex-direction:column; background:#f8fafc; padding-top:env(safe-area-inset-top); box-sizing:border-box; }.chat-header { min-height:98rpx; display:flex; align-items:center; gap:20rpx; padding:0 26rpx; background:#fff; border-bottom:1rpx solid #e2e8f0; }.back { width:44rpx; font-size:54rpx; line-height:1; color:#334155; }.header-copy { flex:1; min-width:0; }.header-title { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:29rpx; font-weight:700; color:#1e293b; }.header-subtitle { margin-top:6rpx; font-size:20rpx; color:#64748b; }.header-action { padding:12rpx 17rpx; border-radius:24rpx; color:#2563eb; background:#eff6ff; font-size:20rpx; font-weight:650; }.quick-links { display:flex; gap:12rpx; padding:15rpx 22rpx; background:#fff; border-bottom:1rpx solid #e2e8f0; }.quick-link { background:#eff6ff; border-radius:12rpx; padding:12rpx 18rpx; font-size:20rpx; color:#2563eb; }.quick-link text { margin-left:12rpx; }.chat-error { margin:14rpx 20rpx 0; }.timeline { flex:1; min-height:0; height:0; padding:0 28rpx; box-sizing:border-box; }.message { margin:28rpx 0; display:flex; align-items:flex-start; flex-direction:column; }.message.mine { align-items:flex-end; }.sender { color:#94a3b8; font-size:20rpx; margin:0 4rpx 10rpx; }.bubble { max-width:84%; padding:20rpx 25rpx; background:white; border:1rpx solid #e2e8f0; border-radius:6rpx 20rpx 20rpx 20rpx; color:#334155; font-size:26rpx; line-height:1.7; }.message.mine .bubble { background:#eff6ff; border-color:#dbeafe; color:#1e40af; border-radius:20rpx 6rpx 20rpx 20rpx; }.pending-bubble { opacity:.65; }.pending-actions { gap:24rpx; color:#2563eb; font-size:22rpx; padding-top:14rpx; }.workflow-card { width:88%; box-sizing:border-box; background:white; border:1rpx solid #dbeafe; border-radius:20rpx; padding:26rpx; }.card-action { padding-top:18rpx; margin-top:18rpx; border-top:1rpx solid #e2e8f0; font-size:23rpx; color:#2563eb; }.chat-bottom { height:20rpx; }.composer { display:block; padding:12rpx 20rpx calc(16rpx + env(safe-area-inset-bottom)); background:white; border-top:1rpx solid #e2e8f0; }.composer-tools { display:flex; gap:12rpx; overflow-x:auto; padding-bottom:12rpx; }.tool-pill { padding:10rpx 17rpx; border-radius:24rpx; background:#f1f5f9; color:#64748b; font-size:19rpx; white-space:nowrap; }.primary-tool { background:#eff6ff; color:#2563eb; }.composer-row { display:flex; gap:14rpx; align-items:flex-end; }.message-input { flex:1; min-height:70rpx; max-height:190rpx; padding:14rpx 18rpx; border:1rpx solid #e2e8f0; border-radius:15rpx; box-sizing:border-box; background:#f8fafc; font-size:25rpx; }.send { height:68rpx; line-height:68rpx; background:linear-gradient(110deg,#2563eb,#4f46e5); color:white; font-size:23rpx; font-weight:650; border-radius:14rpx; margin:0; padding:0 22rpx; }.send::after { border:0; }
.choice-option { margin-top:16rpx; padding:16rpx; border:1rpx solid #e2e8f0; border-radius:12rpx; display:flex; flex-direction:column; gap:6rpx; font-size:24rpx; }.choice-option.chosen { border-color:#bfdbfe; background:#eff6ff; }
</style>
