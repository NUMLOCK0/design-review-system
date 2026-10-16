<template>
  <view class="chat-page">
    <view class="status-bar" :style="{ height: `${statusBarHeight}px` }" />
    <view class="chat-header"><text class="back" @tap="back">‹</text><view class="header-copy"><view class="header-title">{{ workspace?.title || '项目协作' }}</view><view class="header-subtitle">{{ workspace?.orderNo }} · {{ syncing ? '同步中' : '消息自动同步' }}</view></view><text class="header-action" @tap="openRequirements">档案</text></view>
    <view class="quick-links"><view class="quick-link" @tap="openRequirements">表单与需求 <text>{{ workspace?.forms.length || 0 }}</text></view><view class="quick-link" @tap="openRequirements">{{ workspace?.requirements[0] ? `正式需求 v${workspace.requirements[0].version}` : '完善需求 →' }}</view><view v-if="canAnnotate" class="quick-link annotation-link" @tap="openAnnotation">图片批注</view></view>
    <view v-if="error" class="error-box chat-error" @tap="sync">{{ error }} · 点击重试</view>
    <scroll-view scroll-y class="timeline" :scroll-into-view="scrollTarget" scroll-with-animation>
      <view v-if="!messages.length && !syncing" class="empty">从这里开始沟通，或进入「表单与需求」填写资料。</view>
      <view v-for="message in visibleMessages" :id="`message-${message.id}`" :key="message.id" class="message" :class="{ mine: message.senderId === userId }">
        <text class="sender">{{ message.senderName }}</text>
        <view v-if="recalledIds.has(message.id)" class="muted">消息已撤回</view>
        <view v-else-if="choiceCard(message)" class="workflow-card"><text class="eyebrow">{{ choiceCard(message)?.source === 'style' ? 'AI 配色风格 8 选 1' : '组合发单选择题' }}</text><view class="subtitle">{{ choiceCard(message)?.title }}</view><view class="muted space-top">{{ choiceCard(message)?.prompt }}</view><view v-if="choiceCard(message)?.source === 'style' && choiceCard(message)?.attachments?.length" class="style-reference">参考图 {{ choiceCard(message)?.attachments?.length }} 张 · 已用于生成</view><view v-for="option in choiceCard(message)?.options" :key="option.id" class="choice-option" :class="{ chosen: choiceAnswers[message.id]?.optionId === option.id }" @tap="answerChoice(message, option)"><text>{{ option.label }}</text><view v-if="choiceCard(message)?.source === 'style' && paletteColors(option.detail).length" class="choice-palette"><view v-for="(color, index) in paletteColors(option.detail)" :key="`${option.id}-${index}`" class="palette-swatch" :style="{ backgroundColor: color }" /></view><text v-if="option.detail" class="muted">{{ option.detail }}</text></view><view v-if="choiceAnswers[message.id]" class="card-action">品牌方已选择：{{ choiceAnswers[message.id].optionLabel }}</view></view>
        <view v-else-if="workflow(message)" class="workflow-card" @tap="openWorkflow(message)"><text class="eyebrow">{{ workflowLabel(message) }}</text><view class="subtitle">{{ workflow(message)?.title }}</view><view class="muted space-top">{{ workflow(message)?.description }}</view><view v-if="workflow(message)?.kind === 'form'" class="form-card-meta"><text class="form-status" :class="formStatusClass(workflow(message)!.entityId)">{{ formStatusLabel(workflow(message)!.entityId) }}</text><text class="form-card-action">{{ formActionLabel(workflow(message)!.entityId) }} →</text></view><view v-else class="card-action">查看与处理 →</view></view>
        <view v-else-if="businessCard(message)" class="business-card"><view class="business-card-heading"><text class="business-card-eyebrow">业务需求卡 · {{ businessCard(message)?.revisionOf ? '修订版' : '初始版' }}</text><text class="business-card-title">{{ businessCard(message)?.title }}</text></view><view v-for="(field, index) in businessCard(message)?.fields" :key="`${message.id}-${index}`" class="business-card-field"><text class="business-card-label">{{ field.label }}</text><text class="business-card-value">{{ field.value }}</text></view><view v-if="businessCard(message)?.attachments.length" class="business-card-attachments"><protected-image v-for="item in businessCard(message)!.attachments" :key="item.url" :src="item.url" /></view></view>
        <view v-else-if="annotationCard(message)" class="annotation-card"><view class="annotation-card-heading"><view><text class="annotation-eyebrow">图片批注 · 第 {{ annotationCard(message)?.revision }} 版</text><text class="annotation-title">{{ annotationCard(message)?.productName }} · 第 {{ annotationCard(message)?.imageIndex }} 张</text></view><text class="annotation-count">{{ annotationCard(message)?.annotations.length }} 处</text></view><image-annotation-board :src="annotationCard(message)!.imageUrl" :order-id="orderId" :annotations="annotationCard(message)!.annotations" :compact="true" /><view class="annotation-notes"><view v-for="(item, index) in annotationCard(message)?.annotations" :key="item.id" class="annotation-note"><text class="annotation-note-number">{{ index + 1 }}</text><text class="annotation-note-copy">{{ item.comment }}</text></view></view><text class="annotation-task">{{ annotationCard(message)?.taskNo || '交稿图片' }} · 图片版本 {{ annotationCard(message)?.imageVersion }}</text></view>
        <view v-else-if="videoMessage(message.body)" class="image-bubble"><protected-video :src="videoMessage(message.body)!.url" /><text v-if="videoMessage(message.body)?.caption" class="image-caption">{{ videoMessage(message.body)?.caption }}</text></view><view v-else-if="imageMessage(message.body)" class="image-bubble"><protected-image v-for="item in imageMessage(message.body)!.attachments" :key="item.url" :src="item.url" :fluid="true" class="message-image" /><text v-if="imageMessage(message.body)?.caption" class="image-caption">{{ imageMessage(message.body)?.caption }}</text></view><view v-else class="bubble"><text class="break">{{ readableBody(message) }}</text></view>
      </view>
      <view v-for="pending in pendingList" :key="pending.clientMessageId" class="message mine"><text class="sender">{{ pending.error || '待发送，联网后自动重试' }}</text><view class="bubble pending-bubble"><view v-if="videoMessage(pending.body)" class="image-bubble"><protected-video :src="videoMessage(pending.body)!.url" /></view><view v-else-if="imageMessage(pending.body)" class="image-bubble"><protected-image v-for="item in imageMessage(pending.body)!.attachments" :key="item.url" :src="item.url" :fluid="true" class="message-image" /></view><text v-else class="break">{{ pending.body }}</text></view><view v-if="pending.error" class="row pending-actions"><text @tap="retry(pending)">立即重试</text><text @tap="discard(pending)">放弃待发</text></view></view>
      <view id="chat-bottom" class="chat-bottom" />
    </scroll-view>
    <view class="composer"><view v-if="mediaPickerOpen" class="media-picker-backdrop" @tap="mediaPickerOpen = false" /><view v-if="mediaPickerOpen" class="media-picker" @tap.stop><text class="media-picker-title">选择上传内容</text><button class="media-option" :disabled="uploadingMedia" @tap="chooseImage"><text class="media-option-icon">▧</text><text class="media-option-label">上传图片</text><text class="media-option-hint">从相册选择或拍照</text></button></view><view class="composer-row"><button class="image-send" aria-label="添加图片" :disabled="closed || sending || uploadingMedia" @tap="mediaPickerOpen = !mediaPickerOpen"><text class="image-send-icon">{{ uploadingMedia ? '…' : '＋' }}</text></button><textarea v-model="draft" class="message-input" :maxlength="5000" auto-height placeholder="沟通需求、补充说明…" :disabled="closed || uploadingMedia" /><button class="send" :disabled="!draft.trim() || sending || uploadingMedia || closed" @tap="send">发送</button></view></view>
    <image-annotation-composer v-if="annotationComposerOpen" :order-id="orderId" @close="annotationComposerOpen = false" @sent="annotationSent" />
    <view v-if="formPickerOpen" class="picker-mask" @tap="formPickerOpen = false"><view class="form-picker" @tap.stop><view class="picker-handle"/><view class="picker-heading"><view><text class="picker-title">选择需求表单</text><text class="picker-subtitle">选择后会作为消息卡片发送到当前会话</text></view><text class="picker-close" @tap="formPickerOpen = false">关闭</text></view><view v-if="templateError" class="error-box">{{ templateError }}</view><scroll-view scroll-y class="template-list"><view v-if="templatesLoading" class="empty">正在加载已发布表单…</view><view v-for="template in templates" :key="template.id" class="template-option" @tap="selectTemplate(template)"><view class="template-icon">表</view><view class="template-copy"><text class="template-name">{{ template.name }}</text><text class="template-desc">{{ template.description || '填写项目需求与参考资料' }}</text><text class="template-category">{{ template.category || '通用需求' }} · v{{ template.publishedVersion || template.version }}</text></view><text class="template-arrow">{{ creatingTemplate === template.id ? '发送中…' : '选择 ›' }}</text></view><view v-if="!templatesLoading && !templates.length && !templateError" class="empty">暂无已发布表单，请联系管理员发布。</view></scroll-view></view></view>
  </view>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { onLoad, onShow, onHide, onUnload } from '@dcloudio/uni-app';
import { parseWorkflowMessage, type CollaborationWorkspace, type FormTemplate } from '@design-review/shared';
import { api, getSession, requireSession, uploadAsset, uuid, type ChatMessage } from '../../lib/api';
import ProtectedImage from '../../components/protected-image.vue';
import ProtectedVideo from '../../components/protected-video.vue';
import ImageAnnotationBoard from '../../components/image-annotation-board.vue';
import ImageAnnotationComposer from '../../components/image-annotation-composer.vue';
import { acknowledgeMessages, flushOutbox, pendingMessages, queueMessage, retryMessage, discardMessage, type PendingMessage } from '../../lib/outbox';
import { isChatLiveConnected, subscribeChatNotifications } from '../../lib/chat-live';
import { markConversationRead } from '../../lib/notification-center';
const orderId = ref(''); const workspace = ref<CollaborationWorkspace | null>(null); const messages = ref<ChatMessage[]>([]); const pendingList = ref<PendingMessage[]>([]);
const draft = ref(''); const error = ref(''); const syncing = ref(false); const sending = ref(false); const uploadingMedia = ref(false); const mediaPickerOpen = ref(false); const scrollTarget = ref(''); const userId = ref(''); let cursor = 0; let lastSyncedAt = 0; let timer: ReturnType<typeof setInterval> | undefined; let unsubscribeLive: (() => void) | undefined; let active = false; let resyncRequested = false;
const statusBarHeight = ref(uni.getSystemInfoSync().statusBarHeight || 0);
const formPickerOpen = ref(false); const templates = ref<FormTemplate[]>([]); const templatesLoading = ref(false); const templateError = ref(''); const creatingTemplate = ref('');
const annotationComposerOpen = ref(false);
const closed = computed(() => ['cancelled', 'completed'].includes(workspace.value?.status || ''));
const canAnnotate = computed(() => getSession()?.user.role === 'advertiser');
const draftKey = () => `cozi-chat-draft:${userId.value}:${orderId.value}`;
onLoad(options => { orderId.value = String(options?.orderId || ''); userId.value = getSession()?.user.id || ''; draft.value = uni.getStorageSync(draftKey()) || ''; });
watch(draft, value => { if (userId.value && orderId.value) { try { uni.setStorageSync(draftKey(), value); } catch { error.value = '本地草稿未保存，请检查设备存储'; } } });
onShow(() => { if (!requireSession()) return; active = true; void sync(); if (!unsubscribeLive) unsubscribeLive = subscribeChatNotifications(signal => { if (signal.type === 'connected') { void sync(); return; } if (signal.type === 'chat:message' && signal.kind === 'order' && signal.conversationId === orderId.value) receiveLiveMessage(signal); }); if (!timer) timer = setInterval(() => { if (!isChatLiveConnected() || Date.now() - lastSyncedAt >= 60000) void sync(); }, 15000); });
function stop() { active = false; if (timer) clearInterval(timer); timer = undefined; unsubscribeLive?.(); unsubscribeLive = undefined; }
onHide(stop); onUnload(stop);
async function sync() {
  if (!orderId.value || !active) return;
  if (syncing.value) { resyncRequested = true; return; }
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
    lastSyncedAt = Date.now();
    if (active && cursor > 0) await markConversationRead('order', orderId.value, cursor).catch(() => {});
    if (changed) { scrollTarget.value = ''; await nextTick(); scrollTarget.value = 'chat-bottom'; }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '同步失败'; }
  finally { syncing.value = false; if (resyncRequested && active) { resyncRequested = false; void sync(); } }
}
function receiveLiveMessage(signal: { seq: number; message?: ChatMessage }) {
  const message = signal.message;
  if (!message || message.orderId !== orderId.value || !message.id || !message.body || message.seq !== signal.seq) { void sync(); return; }
  if (message.seq <= cursor) return;
  if (message.seq !== cursor + 1) { void sync(); return; }
  cursor = message.seq;
  lastSyncedAt = Date.now();
  if (!messages.value.some(item => item.id === message.id)) messages.value.push(message);
  acknowledgeMessages(orderId.value, [message]); pendingList.value = pendingMessages(orderId.value);
  if (active) void markConversationRead('order', orderId.value, cursor).catch(() => {});
  if (parseWorkflowMessage(message.body)) void api.workspace(orderId.value).then(value => { workspace.value = value; }).catch(() => {});
  void nextTick().then(() => { scrollTarget.value = 'chat-bottom'; });
}
async function send() {
  if (sending.value || closed.value) return;
  sending.value = true;
  try { queueMessage(orderId.value, draft.value); draft.value = ''; pendingList.value = pendingMessages(orderId.value); const saved = await flushOutbox(orderId.value); saved.forEach(message => receiveLiveMessage({ seq: message.seq, message })); pendingList.value = pendingMessages(orderId.value); if (!isChatLiveConnected() || pendingList.value.length) await sync(); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '消息尚未发送'; }
  finally { sending.value = false; pendingList.value = pendingMessages(orderId.value); }
}
function imageMessage(body: string): { caption: string; attachments: Array<{ name: string; url: string }> } | null {
  const raw = /^\/api\/upload\/previews\/asset_[a-f0-9]{32}$/.test(body.trim());
  if (raw) return { caption: '', attachments: [{ name: '会话图片', url: body.trim() }] };
  if (!body.startsWith('COZI_CHAT_CARD_V1:')) return null;
  try { const card = JSON.parse(body.slice('COZI_CHAT_CARD_V1:'.length)); if (card?.kind !== 'image' || !Array.isArray(card.attachments) || !card.attachments.length || card.attachments.some((item: any) => typeof item?.url !== 'string' || !/^\/api\/upload\/previews\/asset_[a-f0-9]{32}$/.test(item.url))) return null; return { caption: typeof card.caption === 'string' ? card.caption : '', attachments: card.attachments }; } catch { return null; }
}
type AnnotationMessageCard = { annotationId: string; taskId: string; taskNo: string; imageId: string; imageVersion: number; revision: number; productName: string; imageIndex: number; imageUrl: string; annotations: Array<{ id: string; x: number; y: number; comment: string }> };
const annotationCardCache = new WeakMap<object, AnnotationMessageCard | null>();
function annotationCard(message: ChatMessage): AnnotationMessageCard | null {
  if (annotationCardCache.has(message)) return annotationCardCache.get(message) || null;
  if (!message.body.startsWith('COZI_CHAT_CARD_V1:')) return null;
  try {
    const card = JSON.parse(message.body.slice('COZI_CHAT_CARD_V1:'.length));
    const validUrl = typeof card?.imageUrl === 'string' && /^\/api\/upload\/(?:assets|previews)\/asset_[a-f0-9]{32}$/.test(card.imageUrl);
    const annotations = Array.isArray(card?.annotations) ? card.annotations.filter((item: any) => typeof item?.id === 'string' && Number.isFinite(item.x) && Number.isFinite(item.y) && typeof item.comment === 'string') : [];
    if (card?.kind !== 'annotation' || !validUrl || !annotations.length) { annotationCardCache.set(message, null); return null; }
    const parsed = { annotationId: card.annotationId, taskId: card.taskId, taskNo: card.taskNo || '', imageId: card.imageId, imageVersion: Number(card.imageVersion), revision: Number(card.revision), productName: card.productName || '交稿图片', imageIndex: Number(card.imageIndex || 1), imageUrl: card.imageUrl, annotations };
    annotationCardCache.set(message, parsed); return parsed;
  } catch { annotationCardCache.set(message, null); return null; }
}
function openAnnotation() { if (canAnnotate.value) annotationComposerOpen.value = true; }
async function annotationSent() { annotationComposerOpen.value = false; await sync(); uni.showToast({ title: '批注已发送到会话', icon: 'success' }); }
function videoMessage(body: string): { url: string; caption: string } | null { const raw = /^\/api\/upload\/assets\/asset_[a-f0-9]{32}$/.test(body.trim()); if (raw) return { url: body.trim(), caption: '' }; if (!body.startsWith('COZI_CHAT_CARD_V1:')) return null; try { const card = JSON.parse(body.slice('COZI_CHAT_CARD_V1:'.length)); return card?.kind === 'video' && /^\/api\/upload\/assets\/asset_[a-f0-9]{32}$/.test(card.attachment?.url || '') ? { url: card.attachment.url, caption: typeof card.caption === 'string' ? card.caption : '' } : null; } catch { return null; } }
function chooseImage() { mediaPickerOpen.value = false; if (closed.value || sending.value || uploadingMedia.value) return; uni.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: result => { const path = result.tempFilePaths[0]; if (path) void sendMedia(path); } }); }
async function sendMedia(path: string) { uploadingMedia.value = true; error.value = ''; try { const url = await uploadAsset(path, true, true); queueMessage(orderId.value, url); pendingList.value = pendingMessages(orderId.value); const saved = await flushOutbox(orderId.value); saved.forEach(message => receiveLiveMessage({ seq: message.seq, message })); pendingList.value = pendingMessages(orderId.value); if (!isChatLiveConnected() || pendingList.value.length) await sync(); } catch (cause) { error.value = cause instanceof Error ? cause.message : '图片发送失败，请重试'; } finally { uploadingMedia.value = false; pendingList.value = pendingMessages(orderId.value); } }
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
type ChoiceCard = { kind: 'choice'; source: 'combo' | 'style'; title: string; prompt: string; options: ChoiceOption[]; attachments?: Array<{ name: string; url: string }> };
type BusinessCardMessage = { templateId: string; title: string; fields: Array<{ label: string; value: string }>; attachments: Array<{ name: string; url: string }>; revisionOf?: string };
const businessCardCache = new WeakMap<object, BusinessCardMessage | null>();
function businessCard(message: ChatMessage): BusinessCardMessage | null {
  if (businessCardCache.has(message)) return businessCardCache.get(message) || null;
  if (!message.body.startsWith('COZI_CHAT_CARD_V1:')) return null;
  try {
    const card = JSON.parse(message.body.slice('COZI_CHAT_CARD_V1:'.length));
    if (card?.kind !== 'work_card' || !/^biz_\d+$/.test(card.templateId || '') || typeof card.title !== 'string' || !Array.isArray(card.fields)) { businessCardCache.set(message, null); return null; }
    const parsed = { templateId: card.templateId, title: card.title, fields: card.fields.filter((field: any) => typeof field?.label === 'string' && typeof field?.value === 'string'), attachments: Array.isArray(card.attachments) ? card.attachments.filter((item: any) => typeof item?.url === 'string' && /^\/api\/upload\/previews\/[a-zA-Z0-9_-]+$/.test(item.url)) : [], revisionOf: typeof card.revisionOf === 'string' ? card.revisionOf : undefined };
    businessCardCache.set(message, parsed);
    return parsed;
  } catch { businessCardCache.set(message, null); return null; }
}
function choiceCard(message: ChatMessage): ChoiceCard | null {
  if (!message.body.startsWith('COZI_CHAT_CARD_V1:')) return null;
  try { const card = JSON.parse(message.body.slice('COZI_CHAT_CARD_V1:'.length)); return card?.kind === 'choice' && Array.isArray(card.options) ? card as ChoiceCard : null; } catch { return null; }
}
function paletteColors(detail: string) { return detail.match(/#[0-9a-fA-F]{6}\b/g)?.slice(0, 4) || []; }
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
    pendingList.value = pendingMessages(orderId.value); void flushOutbox(orderId.value).then(saved => { saved.forEach(item => receiveLiveMessage({ seq: item.seq, message: item })); pendingList.value = pendingMessages(orderId.value); if (!isChatLiveConnected() || pendingList.value.length) void sync(); }).catch(cause => { error.value = cause instanceof Error ? cause.message : '选择尚未发送'; });
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
async function openFormPicker() {
  if (closed.value) return;
  formPickerOpen.value = true; templateError.value = '';
  if (templates.value.length || templatesLoading.value) return;
  templatesLoading.value = true;
  try { templates.value = await api.templates(); }
  catch (cause) { templateError.value = cause instanceof Error ? cause.message : '表单加载失败'; }
  finally { templatesLoading.value = false; }
}
async function selectTemplate(template: FormTemplate) {
  if (creatingTemplate.value || closed.value) return;
  creatingTemplate.value = template.id; templateError.value = '';
  try {
    await api.createForm(orderId.value, template, uuid());
    formPickerOpen.value = false;
    await sync();
    uni.showToast({ title: '表单卡片已发送', icon: 'success' });
  } catch (cause) { templateError.value = cause instanceof Error ? cause.message : '发送表单失败'; }
  finally { creatingTemplate.value = ''; }
}
function formById(id: string) { return workspace.value?.forms.find(form => form.id === id); }
function formStatusLabel(id: string) { const status = formById(id)?.status; return ({ sent: '待填写', filling: '填写中', returned: '待补充', submitted: '已提交' } as Record<string, string>)[status || ''] || '需求表单'; }
function formStatusClass(id: string) { return formById(id)?.status === 'submitted' ? 'form-done' : 'form-pending'; }
function formActionLabel(id: string) { return formById(id)?.status === 'submitted' ? '查看提交' : '开始填写'; }
function back() { uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/index/index' }) }); }
function openWorkflow(message: ChatMessage) {
  const card = workflow(message); if (!card) return;
  if (card.kind === 'form') return uni.navigateTo({ url: `/pages/forms/detail?orderId=${encodeURIComponent(orderId.value)}&formId=${card.entityId}` });
  uni.navigateTo({ url: `/pages/requirements/detail?orderId=${encodeURIComponent(orderId.value)}&${card.kind === 'confirmation' ? 'candidateId' : 'requirementId'}=${card.entityId}` });
}
</script>
<style scoped>
.chat-page { height:100vh; height:100dvh; display:flex; flex-direction:column; background:#f8fafc; box-sizing:border-box; }.status-bar { flex:none; width:100%; background:#fff; }.chat-header { flex:none; min-height:98rpx; display:flex; align-items:center; gap:20rpx; padding:0 26rpx; background:#fff; border-bottom:1rpx solid #e2e8f0; }.back { width:44rpx; font-size:54rpx; line-height:1; color:#334155; }.header-copy { flex:1; min-width:0; }.header-title { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:29rpx; font-weight:700; color:#1e293b; }.header-subtitle { margin-top:6rpx; font-size:20rpx; color:#64748b; }.header-action { padding:12rpx 17rpx; border-radius:24rpx; color:#2563eb; background:#eff6ff; font-size:20rpx; font-weight:650; }.quick-links { display:flex; gap:12rpx; padding:15rpx 22rpx; background:#fff; border-bottom:1rpx solid #e2e8f0; }.quick-link { background:#eff6ff; border-radius:12rpx; padding:12rpx 18rpx; font-size:20rpx; color:#2563eb; }.quick-link text { margin-left:12rpx; }.chat-error { margin:14rpx 20rpx 0; }.timeline { flex:1; min-height:0; height:0; padding:0 28rpx; box-sizing:border-box; }.message { margin:28rpx 0; display:flex; align-items:flex-start; flex-direction:column; }.message.mine { align-items:flex-end; }.sender { color:#94a3b8; font-size:20rpx; margin:0 4rpx 10rpx; }.bubble { max-width:84%; padding:20rpx 25rpx; background:white; border:1rpx solid #e2e8f0; border-radius:6rpx 20rpx 20rpx 20rpx; color:#334155; font-size:26rpx; line-height:1.7; }.message.mine .bubble { background:#eff6ff; border-color:#dbeafe; color:#1e40af; border-radius:20rpx 6rpx 20rpx 20rpx; }.pending-bubble { opacity:.65; }.pending-actions { gap:24rpx; color:#2563eb; font-size:22rpx; padding-top:14rpx; }.workflow-card { width:88%; box-sizing:border-box; background:white; border:1rpx solid #dbeafe; border-radius:20rpx; padding:26rpx; }.card-action { padding-top:18rpx; margin-top:18rpx; border-top:1rpx solid #e2e8f0; font-size:23rpx; color:#2563eb; }.chat-bottom { height:20rpx; }.composer { position:relative; z-index:50; display:block; padding:12rpx 20rpx calc(16rpx + env(safe-area-inset-bottom)); background:white; border-top:1rpx solid #e2e8f0; }.media-picker-backdrop { position:fixed; z-index:40; inset:0; background:transparent; }.media-picker { position:absolute; z-index:60; bottom:calc(100% + 12rpx); left:20rpx; width:330rpx; padding:20rpx; border:1rpx solid #e2e8f0; border-radius:20rpx; background:white; box-shadow:0 12rpx 40rpx rgba(15,23,42,.16); }.media-picker-title { display:block; margin:0 0 12rpx 6rpx; color:#64748b; font-size:21rpx; }.media-option { width:100%; display:grid; grid-template-columns:48rpx 1fr; grid-template-rows:auto auto; align-items:center; column-gap:12rpx; margin:4rpx 0; padding:14rpx; border-radius:14rpx; background:#f8fafc; text-align:left; }.media-option::after { border:0; }.media-option-icon { grid-row:1 / 3; width:44rpx; height:44rpx; display:flex; align-items:center; justify-content:center; border-radius:12rpx; background:#eff6ff; color:#2563eb; font-size:24rpx; }.media-option-label { color:#1e293b; font-size:23rpx; font-weight:700; }.media-option-hint { color:#94a3b8; font-size:18rpx; }.composer-tools { display:flex; gap:12rpx; overflow-x:auto; padding-bottom:12rpx; }.tool-pill { padding:10rpx 17rpx; border-radius:24rpx; background:#f1f5f9; color:#64748b; font-size:19rpx; white-space:nowrap; }.primary-tool { background:#eff6ff; color:#2563eb; }.composer-row { display:flex; gap:14rpx; align-items:flex-end; }.message-input { flex:1; min-height:70rpx; max-height:190rpx; padding:14rpx 18rpx; border:1rpx solid #e2e8f0; border-radius:15rpx; box-sizing:border-box; background:#f8fafc; font-size:25rpx; }.send { height:68rpx; line-height:68rpx; background:linear-gradient(110deg,#2563eb,#4f46e5); color:white; font-size:23rpx; font-weight:650; border-radius:14rpx; margin:0; padding:0 22rpx; }.send::after { border:0; }.image-send { flex:none; min-width:68rpx; height:68rpx; display:flex; align-items:center; justify-content:center; margin:0; padding:0 10rpx; border-radius:14rpx; background:#f1f5f9; color:#475569; font-size:20rpx; }.image-send::after { border:0; }.image-send-icon { font-size:34rpx; line-height:1; }.image-bubble { width:min(76vw,520rpx); padding:10rpx; border:1rpx solid #e2e8f0; border-radius:18rpx; background:#fff; }.image-bubble :deep(.protected-image) { margin-bottom:8rpx; }.image-caption { display:block; padding:8rpx; color:#334155; font-size:23rpx; white-space:pre-wrap; }
.choice-option { margin-top:16rpx; padding:16rpx; border:1rpx solid #e2e8f0; border-radius:12rpx; display:flex; flex-direction:column; gap:6rpx; font-size:24rpx; }.choice-option.chosen { border-color:#bfdbfe; background:#eff6ff; }
.choice-palette { display:flex; gap:8rpx; margin:4rpx 0; }.palette-swatch { width:44rpx; height:26rpx; border-radius:8rpx; border:1rpx solid rgba(15,23,42,.08); }.style-reference { margin-top:16rpx; padding:14rpx 16rpx; border-radius:12rpx; background:#f5f3ff; color:#6d4fc2; font-size:21rpx; }
.form-card-meta { display:flex; align-items:center; justify-content:space-between; gap:12rpx; margin-top:20rpx; padding-top:18rpx; border-top:1rpx solid #e2e8f0; }.form-status { padding:7rpx 13rpx; border-radius:20rpx; font-size:20rpx; }.form-pending { color:#1d4ed8; background:#eff6ff; }.form-done { color:#047857; background:#ecfdf5; }.form-card-action { color:#2563eb; font-size:22rpx; font-weight:650; }
.business-card { width:92%; box-sizing:border-box; padding:22rpx; border:1rpx solid #dbeafe; border-radius:20rpx; background:#fff; box-shadow:0 4rpx 14rpx rgba(15,23,42,.04); }.business-card-heading { display:flex; flex-direction:column; gap:8rpx; padding-bottom:16rpx; border-bottom:1rpx solid #e2e8f0; }.business-card-eyebrow { color:#4f46e5; font-size:19rpx; font-weight:700; }.business-card-title { color:#0f172a; font-size:27rpx; font-weight:750; }.business-card-field { display:flex; flex-direction:column; gap:6rpx; padding:15rpx 0; border-bottom:1rpx solid #f1f5f9; }.business-card-label { color:#64748b; font-size:20rpx; font-weight:700; }.business-card-value { color:#334155; font-size:22rpx; line-height:1.65; white-space:pre-wrap; word-break:break-word; }.business-card-attachments { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10rpx; margin-top:16rpx; }.business-card-attachments :deep(.protected-image) { min-height:190rpx; }.business-card-attachments :deep(.image) { height:190rpx; }
.picker-mask { position:fixed; z-index:80; inset:0; display:flex; align-items:flex-end; background:rgba(15,23,42,.48); }.form-picker { width:100%; max-height:78vh; padding:12rpx 26rpx calc(24rpx + env(safe-area-inset-bottom)); box-sizing:border-box; border-radius:30rpx 30rpx 0 0; background:white; }.picker-handle { width:72rpx; height:8rpx; margin:0 auto 22rpx; border-radius:8rpx; background:#cbd5e1; }.picker-heading { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20rpx; }.picker-title { display:block; color:#0f172a; font-size:30rpx; font-weight:750; }.picker-subtitle { display:block; margin-top:8rpx; color:#64748b; font-size:20rpx; }.picker-close { padding:8rpx 0 8rpx 18rpx; color:#64748b; font-size:21rpx; }.template-list { max-height:58vh; }.template-option { display:flex; align-items:center; gap:18rpx; padding:22rpx 4rpx; border-top:1rpx solid #f1f5f9; }.template-icon { width:68rpx; height:68rpx; flex:none; display:flex; align-items:center; justify-content:center; border-radius:18rpx; color:#2563eb; background:#eff6ff; font-size:22rpx; font-weight:700; }.template-copy { min-width:0; flex:1; display:flex; flex-direction:column; gap:7rpx; }.template-name { color:#1e293b; font-size:24rpx; font-weight:700; }.template-desc { overflow:hidden; color:#64748b; font-size:20rpx; text-overflow:ellipsis; white-space:nowrap; }.template-category { color:#94a3b8; font-size:18rpx; }.template-arrow { flex:none; color:#2563eb; font-size:21rpx; }
.quick-links { overflow-x:auto; }.annotation-link { flex:none; background:#fff1f2; color:#be123c; font-weight:700; }.annotation-card { width:92%; box-sizing:border-box; padding:20rpx; border:1rpx solid #fecdd3; border-radius:20rpx; background:#fff; box-shadow:0 4rpx 14rpx rgba(15,23,42,.04); }.annotation-card-heading { display:flex; align-items:center; justify-content:space-between; gap:12rpx; margin-bottom:14rpx; }.annotation-eyebrow { display:block; color:#be123c; font-size:19rpx; font-weight:700; }.annotation-title { display:block; margin-top:6rpx; color:#1e293b; font-size:23rpx; font-weight:700; }.annotation-count { flex:none; padding:8rpx 12rpx; border-radius:20rpx; background:#fff1f2; color:#be123c; font-size:18rpx; }.annotation-notes { margin-top:12rpx; padding-top:8rpx; border-top:1rpx solid #f1f5f9; }.annotation-note { display:flex; align-items:flex-start; gap:10rpx; padding:8rpx 0; }.annotation-note-number { flex:none; display:flex; width:34rpx; height:34rpx; align-items:center; justify-content:center; border-radius:50%; background:#ef4444; color:#fff; font-size:18rpx; font-weight:700; }.annotation-note-copy { flex:1; padding-top:4rpx; color:#334155; font-size:21rpx; line-height:1.5; white-space:pre-wrap; word-break:break-word; }.annotation-task { display:block; margin-top:8rpx; color:#94a3b8; font-size:18rpx; }
</style>
<style scoped>
.image-bubble :deep(.protected-image.message-image) { min-height:0; }
.image-bubble :deep(.image.image-fluid) { width:100%; height:auto; }
</style>
