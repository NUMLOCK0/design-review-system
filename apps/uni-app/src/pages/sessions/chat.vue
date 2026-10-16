<template>
  <view class="chat-page">
    <view class="status-bar" :style="{ height: `${statusBarHeight}px` }" />
    <view class="chat-header"><text class="back" @tap="back">‹</text><view class="header-copy"><view class="header-title">{{ session?.title || '沟通会话' }}</view><view class="header-subtitle"><text class="header-contact">{{ otherName || '邀请会话' }}</text><view class="service-status" :class="{ online: session?.customerServiceOnline }"><view class="status-dot"/><text>{{ session ? (session.customerServiceOnline ? '客服在线' : '客服离线') : '客服状态加载中' }}</text></view></view></view><text class="more" @tap="showInfo = !showInfo">···</text></view>
    <view v-if="session?.creatorId === userId && !session.guestId" class="share-strip"><view><view class="share-title">邀请对方加入会话</view><view class="share-desc">生成有效期 7 天的微信分享卡片</view></view><button v-if="!invitePath" class="share-button" :loading="inviting" @tap="prepareInvite">生成分享卡片</button><button v-else class="share-button" open-type="share">分享给对方</button></view>
    <view v-if="showInfo" class="info-panel"><text>会话创建者：{{ session?.creatorName || '加载中' }}</text><text>邀请状态：{{ session?.guestId ? '对方已加入' : '等待对方加入' }}</text><text v-if="invitePath">邀请码有效期：7 天</text></view>
    <view v-if="error" class="error-box chat-error" @tap="load">{{ error }} · 点击重试</view>
    <scroll-view scroll-y enhanced :show-scrollbar="false" class="timeline" :scroll-into-view="scrollTarget" scroll-with-animation>
      <view v-if="!messages.length && !error" class="empty-chat"><view class="empty-icon">聊</view><text>{{ session?.guestId ? '会话已准备好，说说这次的设计需求吧。' : '分享会话后，对方会直接来到这里。' }}</text></view>
      <view v-for="item in visibleMessages" :key="item.id" class="message" :class="item.senderId === userId ? 'mine' : 'received'">
        <text class="sender">{{ item.senderName }}</text>
        <view v-if="intakeCard(item) && intakeCard(item)!.kind !== 'decision'" :id="intakeCard(item)!.kind === 'form' ? `form-card-${intakeCard(item)!.id}` : undefined" class="workflow-card" :class="{ 'form-card-active': intakeCard(item)!.kind === 'form' && isActiveForm(intakeCard(item)!.id) }">
          <text class="card-kicker">{{ cardLabel(intakeCard(item)!) }}</text>
          <view class="card-title">{{ intakeCard(item)!.title }}</view>
          <view v-if="intakeCard(item)!.description" class="card-description">{{ intakeCard(item)!.description }}</view>
          <template v-if="intakeCard(item)!.kind === 'form'">
            <view v-if="isActiveForm(intakeCard(item)!.id)" class="inline-form">
              <view class="form-progress-row"><view class="form-progress-copy"><text class="form-progress-count">{{ filledFieldCount(intakeCard(item)!) }}/{{ progressFieldCount(intakeCard(item)!) }} 项已填写</text><text class="form-progress-status">{{ formDraftStatus || submissionStatus(intakeCard(item)!.id) }}</text></view><view class="form-progress-track"><view class="form-progress-value" :style="{ width: `${formProgress(intakeCard(item)!)}%` }" /></view></view>
              <view v-if="formUploading" class="inline-form-hint">图片正在上传，请稍候…</view>
              <form-fields v-model="formAnswers" class="inline-form-fields" :fields="intakeCard(item)!.fields" :readonly="fillReadonly" :mobile-style="intakeCard(item)!.mobileStyle || 'comfortable'" :conversation-images="conversationImages" :invalid-label="formErrorLabel" @busy="formUploading = $event" />
              <view v-if="formError" class="error-text inline-form-error">{{ formError }}</view>
              <view class="inline-form-actions">
                <button v-if="!fillReadonly" class="inline-secondary" :disabled="sending || formUploading" @tap="saveFormDraft(intakeCard(item)!)">保存草稿</button>
                <button v-else class="inline-secondary" :disabled="formUploading" @tap="closeInlineForm">收起</button>
                <button v-if="!fillReadonly" class="inline-primary" :loading="sending || formUploading" :disabled="sending || formUploading" @tap="submitIntakeForm(intakeCard(item)!)">{{ formUploading ? '图片上传中…' : hasOwnSubmission(intakeCard(item)!.id) ? '保存修改' : '提交表单' }}</button>
              </view>
              <view v-if="hasOwnSubmission(intakeCard(item)!.id) && !fillReadonly" class="revision-hint">提交修改后会更新这份表单，并保留历史版本。</view>
            </view>
            <template v-else>
              <view class="card-meta">{{ fieldCount(intakeCard(item)!) }} 项需求 · {{ submissionStatus(intakeCard(item)!.id) }}</view>
              <view v-for="entry in submittedAnswerPreview(intakeCard(item)!.id)" :key="entry.label" class="answer-row"><text class="answer-label">{{ entry.label }}</text><protected-image v-if="entry.kind === 'image' && isImageAssetUrl(entry.value)" :src="entry.value" :fluid="true" class="answer-image"/><text v-else class="answer-value">{{ entry.value }}</text></view>
              <button class="card-action" :disabled="!canEditIntakeForm() && !submissionFor(intakeCard(item)!.id)" @tap="fillForm(intakeCard(item)!)">{{ formActionLabel(intakeCard(item)!.id) }} →</button>
            </template>
          </template>
          <template v-else-if="intakeCard(item)!.kind === 'submission'">
            <view v-for="entry in answerPreview(intakeCard(item)!)" :key="entry.label" class="answer-row"><text class="answer-label">{{ entry.label }}</text><protected-image v-if="entry.kind === 'image' && isImageAssetUrl(entry.value)" :src="entry.value" :fluid="true" class="answer-image"/><text v-else class="answer-value">{{ entry.value }}</text></view>
            <view class="card-meta">资料已提交，双方可据此发起需求确认。</view>
          </template>
          <template v-else-if="intakeCard(item)!.kind === 'confirmation'">
            <view class="card-description">纳入需求资料：{{ formNames(intakeCard(item)!) }}</view>
            <view class="card-meta">{{ confirmationStatus(intakeCard(item)!) }}</view>
            <button v-if="!myDecision(intakeCard(item)!.id) && !confirmationHasNewerSubmissions(intakeCard(item)!)" class="card-action" @tap="confirmRequirement(intakeCard(item)!)">确认需求内容</button>
            <view v-else class="decision-done">{{ confirmationHasNewerSubmissions(intakeCard(item)!) ? '表单已更新 · 此确认已过期' : myDecision(intakeCard(item)!.id) === 'confirmed' ? '你已确认' : '你已提出修改' }}</view>
          </template>
        </view>
        <view v-else-if="cardDecision(item)" class="bubble"><text>{{ decisionText(cardDecision(item)!) }}</text></view>
        <view v-else-if="videoMessage(item)" class="image-bubble"><protected-video :src="videoMessage(item)!.url" /><text v-if="videoMessage(item)?.caption" class="image-caption">{{ videoMessage(item)?.caption }}</text></view>
        <view v-else-if="imageMessage(item)" class="image-bubble"><view class="image-grid" :class="{ single: imageMessage(item)!.attachments.length === 1 }"><protected-image v-for="attachment in imageMessage(item)!.attachments" :key="attachment.url" :src="attachment.url" :fluid="true" class="message-image" /></view><text v-if="imageMessage(item)?.caption" class="image-caption">{{ imageMessage(item)?.caption }}</text></view>
        <view v-else class="bubble"><text>{{ item.body }}</text></view>
        <text v-if="item.senderId === userId" class="saved">已保存</text>
      </view>
      <view id="bottom" class="chat-bottom" />
    </scroll-view>
    <view v-if="mediaPickerOpen" class="media-picker-backdrop" @tap="mediaPickerOpen = false" />
    <view class="composer"><view v-if="mediaPickerOpen" class="media-picker" @tap.stop><text class="media-picker-title">选择发送内容</text><view class="media-picker-options"><button class="media-option" hover-class="media-option-hover" @tap="chooseImage"><view class="media-option-icon image-option">▧</view><text class="media-option-label">图片</text><text class="media-option-hint">相册或拍照</text></button></view></view><view class="composer-row"><button class="image-send" hover-class="image-send-hover" aria-label="添加图片" :disabled="sending || uploadingMedia" @tap="mediaPickerOpen = !mediaPickerOpen"><text class="image-send-icon">{{ uploadingMedia ? '…' : '＋' }}</text></button><textarea v-model="draft" class="message-input" auto-height maxlength="5000" placeholder="沟通需求、补充说明…" /><button class="send" hover-class="send-hover" :loading="sending" :disabled="sending || uploadingMedia || !draft.trim()" @tap="send">发送</button></view></view>

    <view v-if="showTools" class="modal-mask" @tap="showTools = false"><view class="tool-modal" @tap.stop><view class="modal-heading"><text class="modal-title">会话工具</text><text class="modal-close" @tap="showTools = false">×</text></view><view class="tool-option" @tap="openCombo(); showTools = false"><text class="tool-option-icon">组</text><view><text class="tool-option-title">组合发单</text><text class="tool-option-hint">组合后台发布表单中的问题，发送给会话成员填写</text></view></view><view class="tool-option" @tap="openStandard(); showTools = false"><text class="tool-option-icon">单</text><view><text class="tool-option-title">标准表单</text><text class="tool-option-hint">从后台发布的标准表单中选择一份发送</text></view></view><view v-if="submittedForms.length" class="tool-option" @tap="createConfirmation(); showTools = false"><text class="tool-option-icon">确</text><view><text class="tool-option-title">发起需求确认</text><text class="tool-option-hint">把已提交的需求资料整理成双方确认项</text></view></view></view></view>

    <view v-if="comboOpen" class="modal-mask" @tap="comboOpen = false">
      <view class="tool-modal combo-modal" @tap.stop>
        <view class="modal-heading"><view><text class="modal-title">组合发单</text><text class="modal-subtitle">选择一个或多个业务类别，再勾选需要填写的问题。</text></view><text class="modal-close" @tap="comboOpen = false">×</text></view>
        <picker :range="presets" range-key="name" :value="presetIndex" @change="selectPreset"><view class="preset-picker">{{ currentPreset.name }}<text>⌄</text></view></picker>
        <view class="category-actions"><text>{{ currentPreset.sections.reduce((total, section) => total + section.fields.length, 0) }} 个问题</text><view><text @tap="toggleCurrentCategory(true)">全选</text><text @tap="toggleCurrentCategory(false)">清空</text></view></view>
        <scroll-view scroll-y enhanced :show-scrollbar="false" class="field-list">
          <view v-for="section in currentPreset.sections" :key="section.title" class="field-section">
            <text class="section-name">{{ section.title }}</text>
            <label v-for="field in section.fields" :key="field.key" class="field-choice">
              <checkbox :checked="isFieldSelected(currentPreset.id, field.key)" color="#2563eb" @tap="toggleField(currentPreset.id, field.key)" />
              <view class="field-choice-content">
                <text class="field-choice-title">{{ field.label }}{{ field.required ? ' · 必填' : '' }}</text>
                <view v-if="field.kind === 'repeat'" class="repeat-preview">
                  <text class="repeat-preview-heading">包含的子字段 · 随子表单一起发送</text>
                  <view v-for="child in repeatChildren(field)" :key="child.key" class="repeat-preview-row" :style="{ marginLeft: `${child.depth * 16}rpx` }">
                    <view class="repeat-preview-copy"><text class="repeat-preview-label">{{ child.label }}{{ child.required ? ' · 必填' : '' }}</text><text v-if="child.detail" class="repeat-preview-detail">{{ child.detail }}</text></view>
                    <text class="repeat-preview-kind">{{ child.kindLabel }}</text>
                  </view>
                  <text v-if="!repeatChildren(field).length" class="repeat-preview-empty">尚未配置子字段</text>
                </view>
              </view>
            </label>
          </view>
        </scroll-view>
        <view class="selected-count">已选 {{ selectedCount }}/{{ comboSelectionLimit }} 项{{ comboError ? ` · ${comboError}` : '' }}</view>
        <view class="modal-actions"><button class="secondary" :disabled="sending" @tap="comboOpen = false">取消</button><button class="primary" :loading="sending" :disabled="sending || !selectedCount || selectedCount > comboSelectionLimit" @tap="sendCombo">发送组合表单</button></view>
      </view>
    </view>

    <view v-if="standardOpen" class="modal-mask" @tap="standardOpen = false"><view class="tool-modal" @tap.stop><view class="modal-heading"><view><text class="modal-title">标准发单</text><text class="modal-subtitle">选择一种需求类型，发送完整标准表单。</text></view><text class="modal-close" @tap="standardOpen = false">×</text></view><picker :range="presets" range-key="name" :value="standardIndex" @change="selectStandard"><view class="preset-picker">{{ standardPreset.name }}<text>⌄</text></view></picker><view class="card-description">{{ standardPreset.description }}</view><view class="modal-actions"><button class="secondary" :disabled="sending" @tap="standardOpen = false">取消</button><button class="primary" :loading="sending" :disabled="sending" @tap="sendStandardForm">发送标准表单</button></view></view></view>

  </view>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { onLoad, onShow, onHide, onUnload, onShareAppMessage } from '@dcloudio/uni-app';
import { createOrderPresetDraft, FORM_FIELD_KINDS, isFieldVisible, ORDER_FORM_PRESETS, type FormAnswers, type FormField, type FormMobileStyle, type FormTemplate } from '@design-review/shared';
import { api, getSession, requireSession, uploadAsset, uuid, type IntakeMessage, type IntakeSession } from '../../lib/api';
import FormFields from '../../components/form-fields.vue';
import ProtectedImage from '../../components/protected-image.vue';
import ProtectedVideo from '../../components/protected-video.vue';
import { mergeFormDefaults, validateFormAnswers } from '../../lib/forms';
import { configuredChecklistField, decodeChecklistAnswer, encodeChecklistAnswer } from '../../lib/chat-form-schema';
import { isChatLiveConnected, subscribeChatNotifications } from '../../lib/chat-live';
import { markConversationRead } from '../../lib/notification-center';
type IntakeCard = { version: 1; id: string; title: string; description?: string } & ({ kind: 'form'; fields: FormField[]; protocol?: 'chat_card'; mobileStyle?: FormMobileStyle } | { kind: 'submission'; formId: string; answers: FormAnswers } | { kind: 'confirmation'; formIds: string[] } | { kind: 'decision'; confirmationId: string; decision: 'confirmed' | 'changes'; note: string });
type FormPresetView = { id: string; name: string; description: string; template: FormTemplate; sections: Array<{ title: string; fields: FormField[] }> };
const CARD_PREFIX = 'COZI_INTAKE_CARD_V1:';
const CHAT_CARD_PREFIX = 'COZI_CHAT_CARD_V1:';
const id = ref(''); const session = ref<IntakeSession | null>(null); const messages = ref<IntakeMessage[]>([]); const draft = ref(''); const error = ref(''); const inviting = ref(false); const sending = ref(false); const syncing = ref(false); const invitePath = ref(''); const scrollTarget = ref(''); const userId = ref(''); const showInfo = ref(false); let cursor = 0; let lastSyncedAt = 0; let timer: ReturnType<typeof setInterval> | undefined; let formDraftTimer: ReturnType<typeof setTimeout> | undefined; let unsubscribeLive: (() => void) | undefined; let active = false; let resyncRequested = false; let initialPendingFormHandled = false;
const statusBarHeight = ref(uni.getSystemInfoSync().statusBarHeight || 0);
const showTools = ref(false); const comboOpen = ref(false); const comboError = ref(''); const comboSelectionLimit = 24; const presetIndex = ref(0); const standardOpen = ref(false); const standardIndex = ref(0); const selections = ref<Record<string, string[]>>({}); const fillCard = ref<Extract<IntakeCard, { kind: 'form' }> | null>(null); const formAnswers = ref<FormAnswers>({}); const formError = ref(''); const formDraftStatus = ref(''); const formUploading = ref(false); const mediaPickerOpen = ref(false); const uploadingMedia = ref(false);
const fallbackTemplates = ORDER_FORM_PRESETS.map(preset => ({ ...createOrderPresetDraft(preset), id: `preset_${preset.id}`, version: 1, publishedVersion: 1, status: 'published' as const }));
const sourceTemplates = ref<FormTemplate[]>(fallbackTemplates);
function toPresetView(template: FormTemplate): FormPresetView { const sections: FormPresetView['sections'] = []; let current = { title: template.name, fields: [] as FormField[] }; for (const field of template.fields) { if (field.kind === 'section') { if (current.fields.length) sections.push(current); current = { title: field.label, fields: [] }; } else if (!['divider', 'paragraph'].includes(field.kind)) current.fields.push(field); } if (current.fields.length) sections.push(current); return { id: template.id, name: template.name, description: template.description, template, sections }; }
const presets = computed(() => sourceTemplates.value.map(toPresetView)); const currentPreset = computed(() => presets.value[presetIndex.value] || presets.value[0]); const standardPreset = computed(() => presets.value[standardIndex.value] || presets.value[0]);
const otherName = computed(() => session.value?.creatorId === userId.value ? session.value?.guestName : session.value?.creatorName);
const intakeCards = computed(() => messages.value.map(message => ({ message, card: intakeCard(message) })).filter((entry): entry is { message: IntakeMessage; card: IntakeCard } => !!entry.card));
const submittedForms = computed(() => intakeCards.value.filter((entry): entry is { message: IntakeMessage; card: Extract<IntakeCard, { kind: 'submission' }> } => entry.card.kind === 'submission'));
const visibleMessages = computed(() => messages.value.filter(message => intakeCard(message)?.kind !== 'submission'));
const fillReadonly = computed(() => !canEditIntakeForm());
const formErrorLabel = computed(() => /「([^」]+)」/.exec(formError.value)?.[1] || '');
const selectedCount = computed(() => Object.values(selections.value).reduce((total, keys) => total + keys.length, 0));
const draftKey = () => `cozi-intake-draft:${userId.value}:${id.value}`;
onLoad(options => { id.value = String(options?.id || ''); userId.value = getSession()?.user.id || ''; draft.value = uni.getStorageSync(draftKey()) || ''; });
watch(draft, value => { if (id.value && userId.value) { try { uni.setStorageSync(draftKey(), value); } catch { error.value = '草稿未能保存在本机'; } } });
watch(formAnswers, () => {
  if (!fillCard.value || fillReadonly.value) return;
  formError.value = '';
  formDraftStatus.value = '正在保存草稿…';
  if (formDraftTimer) clearTimeout(formDraftTimer);
  const card = fillCard.value;
  const snapshot = JSON.parse(JSON.stringify(formAnswers.value)) as FormAnswers;
  formDraftTimer = setTimeout(() => { formDraftTimer = undefined; saveFormDraft(card, false, snapshot); }, 350);
}, { deep: true });
onShow(() => { if (!requireSession()) return; userId.value = getSession()?.user.id || ''; active = true; void load(); void loadPublishedFormTemplates(); if (!unsubscribeLive) unsubscribeLive = subscribeChatNotifications(signal => { if (signal.type === 'connected') { void load(); return; } if (signal.type === 'chat:message' && signal.kind === 'intake' && signal.conversationId === id.value) void receiveLiveMessage(signal); }); if (!timer) timer = setInterval(() => { if (!isChatLiveConnected() || Date.now() - lastSyncedAt >= 60000) void load(); }, 15000); });
function stop() { if (formDraftTimer) { clearTimeout(formDraftTimer); formDraftTimer = undefined; if (fillCard.value && !fillReadonly.value) saveFormDraft(fillCard.value, false); } active = false; if (timer) clearInterval(timer); timer = undefined; unsubscribeLive?.(); unsubscribeLive = undefined; }
onHide(stop); onUnload(stop);
onShareAppMessage(() => ({ title: `邀请你加入沟通：${session.value?.title || '项目需求'}`, path: invitePath.value || '/pages/sessions/index' }));
async function scrollToBottom() {
  scrollTarget.value = '';
  await nextTick();
  scrollTarget.value = 'bottom';
}
async function load() {
  if (!id.value || !active) return;
  if (syncing.value) { resyncRequested = true; return; }
  syncing.value = true;
  try {
    session.value = await api.intakeSession(id.value);
    let more = true; let changed = false; const newMessages: IntakeMessage[] = [];
    while (more && active) { const page = await api.intakeMessages(id.value, cursor); if (page.messages.length) { cursor = page.messages[page.messages.length - 1].seq; const known = new Set(messages.value.map(item => item.id)); const additions = page.messages.filter(item => !known.has(item.id)); messages.value.push(...additions); newMessages.push(...additions); changed = changed || additions.length > 0; } more = page.hasMore && !!page.messages.length; }
    error.value = ''; lastSyncedAt = Date.now(); if (changed) await scrollToBottom();
    const pendingMessage = [...newMessages].reverse().find(message => { const card = intakeCard(message); return card?.kind === 'form' && canEditIntakeForm() && !hasOwnSubmission(card.id); });
    const pendingCard = pendingMessage ? intakeCard(pendingMessage) : null;
    if (pendingCard?.kind === 'form' && !fillCard.value) {
      fillForm(pendingCard); await scrollToFormCard(pendingCard.id); initialPendingFormHandled = true;
    } else if (changed && !initialPendingFormHandled) {
      initialPendingFormHandled = true;
      const pending = [...intakeCards.value].reverse().find((entry): entry is { message: IntakeMessage; card: Extract<IntakeCard, { kind: 'form' }> } => entry.card.kind === 'form' && canEditIntakeForm() && !hasOwnSubmission(entry.card.id));
      if (pending && !fillCard.value) { fillForm(pending.card); await scrollToFormCard(pending.card.id); }
    }
    if (active && cursor > 0) await markConversationRead('intake', id.value, cursor).catch(() => {});
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '同步失败'; }
  finally { syncing.value = false; if (resyncRequested && active) { resyncRequested = false; void load(); } }
}
async function receiveLiveMessage(signal: { seq: number; message?: IntakeMessage }) {
  const message = signal.message;
  if (!message || message.sessionId !== id.value || !message.id || !message.body || message.seq !== signal.seq) { await load(); return; }
  if (message.seq <= cursor) return;
  if (message.seq !== cursor + 1) { await load(); return; }
  cursor = message.seq;
  lastSyncedAt = Date.now();
  if (!messages.value.some(item => item.id === message.id)) messages.value.push(message);
  if (session.value) session.value.lastSeq = Math.max(session.value.lastSeq, message.seq);
  if (active) void markConversationRead('intake', id.value, cursor).catch(() => {});
  const card = intakeCard(message);
  if (card?.kind === 'form' && canEditIntakeForm() && !hasOwnSubmission(card.id)) { fillForm(card); await scrollToFormCard(card.id); }
  else await scrollToBottom();
}
async function persistIntakeMessage(body: string, clientMessageId = uuid()) {
  const message = await api.sendIntakeMessage(id.value, clientMessageId, body);
  await receiveLiveMessage({ seq: message.seq, message });
  return message;
}
async function loadPublishedFormTemplates() { try { const templates = await api.templates(); if (templates.length) { sourceTemplates.value = templates; presetIndex.value = Math.min(presetIndex.value, templates.length - 1); standardIndex.value = Math.min(standardIndex.value, templates.length - 1); } } catch { /* Keep the built-in forms available while offline. */ } }
async function prepareInvite() { if (inviting.value) return; inviting.value = true; try { const result = await api.intakeInvite(id.value); invitePath.value = result.path; } catch (cause) { error.value = cause instanceof Error ? cause.message : '生成邀请失败'; } finally { inviting.value = false; } }
async function send() { const body = draft.value.trim(); if (!body || sending.value) return; sending.value = true; try { await persistIntakeMessage(body); draft.value = ''; uni.removeStorageSync(draftKey()); } catch (cause) { error.value = cause instanceof Error ? cause.message : '发送失败，消息仍保留在输入框中'; } finally { sending.value = false; } }
type ImageMessage = { caption: string; attachments: Array<{ name: string; url: string }> };
type VideoMessage = { caption: string; url: string };
const PREVIEW_URL = /^\/api\/upload\/previews\/asset_[a-f0-9]{32}$/;
const VIDEO_URL = /^\/api\/upload\/assets\/asset_[a-f0-9]{32}$/;
function messageCard(message: IntakeMessage): Record<string, any> | null {
  if (!message.body.startsWith(CHAT_CARD_PREFIX)) return null;
  try {
    const value = JSON.parse(message.body.slice(CHAT_CARD_PREFIX.length));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}
function imageMessage(message: IntakeMessage): ImageMessage | null {
  const body = message.body.trim();
  if (PREVIEW_URL.test(body)) return { caption: '', attachments: [{ name: '会话图片', url: body }] };
  const card = messageCard(message);
  if (card?.kind !== 'image' || typeof card.caption !== 'string' || !Array.isArray(card.attachments) || card.attachments.length < 1 || card.attachments.length > 9) return null;
  if (!card.attachments.every((item: any) => typeof item?.name === 'string' && typeof item?.url === 'string' && PREVIEW_URL.test(item.url))) return null;
  return { caption: card.caption, attachments: card.attachments };
}
const conversationImages = computed(() => {
  const seen = new Set<string>();
  const images: Array<{ url: string; name: string; senderName?: string }> = [];
  for (const message of [...messages.value].reverse()) {
    for (const attachment of imageMessage(message)?.attachments || []) {
      if (seen.has(attachment.url)) continue;
      seen.add(attachment.url);
      images.push({ url: attachment.url, name: attachment.name, senderName: message.senderName });
    }
  }
  return images;
});
function videoMessage(message: IntakeMessage): VideoMessage | null {
  const body = message.body.trim();
  if (VIDEO_URL.test(body)) return { caption: '', url: body };
  const card = messageCard(message);
  if (card?.kind !== 'video' || typeof card.caption !== 'string' || typeof card.attachment?.url !== 'string' || !VIDEO_URL.test(card.attachment.url)) return null;
  return { caption: card.caption, url: card.attachment.url };
}
function chooseImage() {
  mediaPickerOpen.value = false;
  if (sending.value || uploadingMedia.value) return;
  uni.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'], success: result => {
    const path = result.tempFilePaths[0];
    if (path) void sendMedia(path);
  } });
}
async function sendMedia(path: string) {
  uploadingMedia.value = true; error.value = '';
  try {
    const mediaUrl = await uploadAsset(path, true, true);
    await persistIntakeMessage(mediaUrl);
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '图片发送失败，请重试'; }
  finally { uploadingMedia.value = false; }
}
function parseIntakeCard(body: string): IntakeCard | null { if (!body.startsWith(CARD_PREFIX)) return null; try { const value = JSON.parse(body.slice(CARD_PREFIX.length)); return value?.version === 1 && typeof value.id === 'string' && ['form', 'submission', 'confirmation', 'decision'].includes(value.kind) ? value as IntakeCard : null; } catch { return null; } }
function parseChatChecklist(message: IntakeMessage): Extract<IntakeCard, { kind: 'form' }> | null {
  if (!message.body.startsWith(CHAT_CARD_PREFIX)) return null;
  try {
    const card = JSON.parse(message.body.slice(CHAT_CARD_PREFIX.length));
    if (card?.kind !== 'work_card' || card.templateId !== 'intake_checklist' || !Array.isArray(card.fields)) return null;
    const fields = card.fields.map((field: { label?: unknown; value?: unknown; kind?: unknown; options?: unknown; schema?: unknown }, index: number) => {
      if (typeof field?.label !== 'string') throw new Error('invalid form');
      const configured = configuredChecklistField(field.schema, field.label, index);
      if (configured) return configured;
      const storedOptions = Array.isArray(field.options) ? field.options.filter((option: unknown): option is string => typeof option === 'string') : [];
      const legacyOptions = typeof field.value === 'string' ? /可选项：(.+)$/.exec(field.value)?.[1].split('、').map((option: string) => option.trim()).filter(Boolean) || [] : [];
      const options = storedOptions.length ? storedOptions : legacyOptions;
      const matchesPublishedImageField = sourceTemplates.value.some(template => template.fields.some(source => source.kind === 'image' && field.label === `${template.name} · ${source.label}`));
      const kind = field.kind === 'image' || matchesPublishedImageField ? 'image' : options.length ? 'select' : 'textarea';
      return { key: `chat_field_${index}`, label: field.label, kind, required: true, placeholder: kind === 'image' ? '请选择需要上传的图片' : '请填写你的回答', width: 100, maxLength: 200, ...(options.length && kind !== 'image' ? { options: options.map(value => ({ label: value, value })) } : {}) } as FormField;
    });
    const mobileStyle = ['comfortable', 'compact', 'large'].includes(card.mobileStyle) ? card.mobileStyle as FormMobileStyle : undefined;
    return { version: 1, id: message.id, kind: 'form', protocol: 'chat_card', title: typeof card.title === 'string' ? card.title : '品牌需求表单', description: '请填写问题并提交给客服。', mobileStyle, fields };
  } catch { return null; }
}
function parseChatAnswers(message: IntakeMessage): Extract<IntakeCard, { kind: 'submission' }> | null {
  if (!message.body.startsWith(CHAT_CARD_PREFIX)) return null;
  try {
    const card = JSON.parse(message.body.slice(CHAT_CARD_PREFIX.length));
    if (card?.kind !== 'form_answers' || typeof card.formMessageId !== 'string' || !Array.isArray(card.answers)) return null;
    const formMessage = messages.value.find(item => item.id === card.formMessageId);
    const form = formMessage ? parseChatChecklist(formMessage) : null;
    const answers: FormAnswers = {};
    for (const answer of card.answers) {
      if (!Number.isInteger(answer?.fieldIndex) || typeof answer?.value !== 'string') return null;
      const field = form?.fields[answer.fieldIndex];
      answers[field?.key || `chat_field_${answer.fieldIndex}`] = field ? decodeChecklistAnswer(field, answer.value) : answer.value;
    }
    return { version: 1, id: message.id, kind: 'submission', formId: card.formMessageId, title: form?.title || '品牌需求表单', answers };
  } catch { return null; }
}
function intakeCard(message: IntakeMessage): IntakeCard | null {
  const legacy = parseIntakeCard(message.body);
  if (legacy) return legacy;
  return parseChatChecklist(message) || parseChatAnswers(message);
}
function cardLabel(card: IntakeCard) { return ({ form: '需求表单', submission: '需求资料', confirmation: '需求确认', decision: '确认记录' })[card.kind]; }
function submissionFor(formId: string, senderId?: string) { return [...submittedForms.value].reverse().find(entry => entry.card.formId === formId && (!senderId || entry.message.senderId === senderId)); }
function canEditIntakeForm() { return getSession()?.user.role === 'advertiser'; }
function hasOwnSubmission(formId: string) { return Boolean(submissionFor(formId, userId.value)); }
function displayedSubmission(formId: string) { return canEditIntakeForm() ? submissionFor(formId, userId.value) : submissionFor(formId); }
function submissionStatus(formId: string) { const latest = displayedSubmission(formId); if (!latest) return '待填写'; const revision = submittedForms.value.filter(entry => entry.card.formId === formId && entry.message.senderId === latest.message.senderId).length; return revision > 1 ? `已更新 · v${revision}` : '已提交 · v1'; }
function formActionLabel(formId: string) { if (!canEditIntakeForm()) return submissionFor(formId) ? '查看已提交资料' : '等待品牌方填写'; return hasOwnSubmission(formId) ? '修改已提交内容' : '填写需求资料'; }
function submittedAnswerPreview(formId: string) { const submission = displayedSubmission(formId); return submission ? answerPreview(submission.card) : []; }
type AnswerPreview = { label: string; value: string; kind?: FormField['kind'] };
function answerPreview(card: Extract<IntakeCard, { kind: 'submission' }>): AnswerPreview[] {
  const form = intakeCards.value.find(entry => entry.card.kind === 'form' && entry.card.id === card.formId)?.card;
  if (form?.kind !== 'form') return Object.entries(card.answers).slice(0, 5).map(([label, value]) => ({ label, value: answerText(value) }));
  const entries: AnswerPreview[] = [];
  const visit = (fields: FormField[], answers: FormAnswers, prefix = '') => {
    for (const field of fields) {
      if (!isFieldVisible(field, answers) || ['section', 'divider', 'paragraph'].includes(field.kind)) continue;
      const value = answers[field.key];
      if (field.kind === 'repeat') {
        const rows = Array.isArray(value) ? value as FormAnswers[] : [];
        rows.forEach((row, index) => visit(field.children || [], row, `${prefix}${field.label} · 第 ${index + 1} 项 · `));
        continue;
      }
      if (value === undefined || value === null || value === '' || (Array.isArray(value) && !value.length)) continue;
      if (field.kind === 'image') {
        const urls = Array.isArray(value) ? value : [value];
        urls.forEach((url, index) => entries.push({ label: `${prefix}${field.label}${urls.length > 1 ? ` ${index + 1}` : ''}`, value: String(url), kind: field.kind }));
      }
      else if (field.kind === 'file') entries.push({ label: `${prefix}${field.label}`, value: `已上传 ${Array.isArray(value) ? value.length : 1} 个文件`, kind: field.kind });
      else {
        const options = field.options || [];
        const display = Array.isArray(value)
          ? value.map(item => options.find(option => option.value === item)?.label || String(item)).join('、')
          : options.find(option => option.value === value)?.label || answerText(value);
        entries.push({ label: `${prefix}${field.label}`, value: display, kind: field.kind });
      }
    }
  };
  visit(form.fields, card.answers);
  return entries.filter((entry, index) => index < 6 || entry.kind === 'image');
}
function isImageAssetUrl(value: string) { return PREVIEW_URL.test(value); }
function answerText(value: unknown) { return Array.isArray(value) ? value.join('、') : typeof value === 'object' && value ? JSON.stringify(value) : String(value ?? ''); }
function countableFields(card: Extract<IntakeCard, { kind: 'form' }>) { return card.fields.filter(field => !['section', 'divider', 'paragraph'].includes(field.kind) && isFieldVisible(field, formAnswers.value)); }
function fieldCount(card: IntakeCard) { return card.kind === 'form' ? card.fields.filter(field => !['section', 'divider', 'paragraph'].includes(field.kind)).length : 0; }
function progressFieldCount(card: IntakeCard) { return card.kind === 'form' ? countableFields(card).length : 0; }
function filledFieldCount(card: IntakeCard) { return countableFields(card).filter(field => { const value = formAnswers.value[field.key]; return typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && !!value.trim()) || (Array.isArray(value) && value.length > 0); }).length; }
function formProgress(card: IntakeCard) { const total = progressFieldCount(card); return total ? Math.round(filledFieldCount(card) / total * 100) : 0; }
function formNames(card: IntakeCard) { if (card.kind !== 'confirmation') return ''; return card.formIds.map(formId => intakeCards.value.find(entry => entry.card.kind === 'form' && entry.card.id === formId)?.card.title || '已提交表单').join('、'); }
function isActiveForm(formId: string) { return fillCard.value?.id === formId; }
function formDraftKey(formId: string) { return `cozi-intake-form-draft:${userId.value}:${id.value}:${formId}`; }
function storedFormDraft(formId: string): FormAnswers | null {
  try {
    const saved = uni.getStorageSync(formDraftKey(formId));
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null;
    const answers = 'answers' in saved ? (saved as { answers?: unknown }).answers : saved;
    return answers && typeof answers === 'object' && !Array.isArray(answers) ? answers as FormAnswers : null;
  } catch { return null; }
}
function saveFormDraft(card: Extract<IntakeCard, { kind: 'form' }>, feedback = true, answers = formAnswers.value) {
  if (fillReadonly.value) return;
  try {
    uni.setStorageSync(formDraftKey(card.id), { answers, updatedAt: Date.now() });
    if (fillCard.value?.id === card.id) formDraftStatus.value = '草稿已保存';
    if (feedback) uni.showToast({ title: '草稿已保存', icon: 'success', duration: 1200 });
  } catch {
    if (fillCard.value?.id === card.id) formDraftStatus.value = '';
    formError.value = '草稿未能保存在本机，请保持页面打开后重试';
  }
}
async function scrollToFormCard(formId: string) {
  scrollTarget.value = '';
  await nextTick();
  scrollTarget.value = `form-card-${formId}`;
}
async function scrollToInlineFormError() {
  scrollTarget.value = '';
  await nextTick();
  scrollTarget.value = formErrorLabel.value ? 'form-first-error' : `form-card-${fillCard.value?.id || ''}`;
}
function closeInlineForm() {
  if (formUploading.value) return;
  if (fillCard.value && !fillReadonly.value) saveFormDraft(fillCard.value, false);
  if (formDraftTimer) { clearTimeout(formDraftTimer); formDraftTimer = undefined; }
  fillCard.value = null;
  formError.value = '';
  formDraftStatus.value = '';
}
function fillForm(card: IntakeCard) {
  if (card.kind !== 'form' || formUploading.value) return;
  if (fillCard.value?.id === card.id) { closeInlineForm(); return; }
  if (formDraftTimer) { clearTimeout(formDraftTimer); formDraftTimer = undefined; }
  if (fillCard.value && !fillReadonly.value) saveFormDraft(fillCard.value, false);
  const prior = canEditIntakeForm() ? submissionFor(card.id, userId.value) : submissionFor(card.id);
  const savedDraft = canEditIntakeForm() ? storedFormDraft(card.id) : null;
  fillCard.value = card;
  formAnswers.value = mergeFormDefaults(card.fields, savedDraft || prior?.card.answers || {});
  formError.value = '';
  formDraftStatus.value = savedDraft ? '已恢复草稿' : '';
  formUploading.value = false;
}
function selectPreset(event: { detail: { value: string | number } }) { presetIndex.value = Number(event.detail.value); }
function selectStandard(event: { detail: { value: string | number } }) { standardIndex.value = Number(event.detail.value); }
function isFieldSelected(presetId: string, key: string) { return (selections.value[presetId] || []).includes(key); }
function repeatChildren(field: FormField) {
  const rows: Array<{ key: string; label: string; kindLabel: string; required: boolean; detail: string; depth: number }> = [];
  const visit = (children: FormField[], depth: number, parentKey: string) => {
    for (const child of children) {
      const options = (child.options?.map(option => option.label) || child.presets || []).join('、');
      rows.push({ key: `${parentKey}.${child.key}`, label: child.label, kindLabel: FORM_FIELD_KINDS.find(item => item.kind === child.kind)?.label || child.kind, required: Boolean(child.required), detail: [child.help, options ? `可选：${options}` : ''].filter(Boolean).join(' · '), depth });
      if (child.kind === 'repeat' && depth < 3) visit(child.children || [], depth + 1, `${parentKey}.${child.key}`);
    }
  };
  visit(field.children || [], 0, field.key);
  return rows;
}
function toggleField(presetId: string, key: string) { const keys = selections.value[presetId] || []; if (!keys.includes(key) && selectedCount.value >= comboSelectionLimit) { comboError.value = `最多选择 ${comboSelectionLimit} 项，请先取消部分问题`; return; } selections.value = { ...selections.value, [presetId]: keys.includes(key) ? keys.filter(item => item !== key) : [...keys, key] }; comboError.value = ''; }
function toggleCurrentCategory(include: boolean) { const keys = currentPreset.value.sections.flatMap(section => section.fields.map(field => field.key)); const otherCount = Object.entries(selections.value).reduce((total, [presetId, selected]) => total + (presetId === currentPreset.value.id ? 0 : selected.length), 0); const available = Math.max(0, comboSelectionLimit - otherCount); if (include && keys.length > available) comboError.value = `当前类别仅剩 ${available} 项可选，已按上限选择`; else comboError.value = ''; const existing = selections.value[currentPreset.value.id] || []; const bounded = [...existing, ...keys.filter(key => !existing.includes(key))].slice(0, available); selections.value = { ...selections.value, [currentPreset.value.id]: include ? bounded : [] }; }
function openCombo() { selections.value = {}; presetIndex.value = 0; comboError.value = ''; comboOpen.value = true; }
function openStandard() { standardIndex.value = 0; standardOpen.value = true; }
function fieldsFor(presetId: string, selectedKeys: string[]) { const preset = presets.value.find(item => item.id === presetId)!; const fields: FormField[] = []; for (const section of preset.sections) { const picked = section.fields.filter(field => selectedKeys.includes(field.key)); if (!picked.length) continue; fields.push({ id: `${presetId}_section_${fields.length + 1}`, key: `${presetId}_section_${fields.length + 1}`, label: `${preset.name} · ${section.title}`, kind: 'section', required: false, width: 100 }); fields.push(...picked.map(field => ({ ...field, id: `${presetId}_${field.id}`, key: `${presetId}_${field.key}`, width: field.kind === 'textarea' ? 100 : field.width }))); } return fields; }
async function sendIntakeCard(card: IntakeCard) { const body = `${CARD_PREFIX}${JSON.stringify(card)}`; if (body.length > 4900) throw new Error('所选内容过多，请减少题目后再发送'); await persistIntakeMessage(body); }
async function sendCombo() { if (!selectedCount.value || selectedCount.value > comboSelectionLimit || sending.value) return; sending.value = true; comboError.value = ''; try { const fields = Object.entries(selections.value).filter(([, keys]) => keys.length).flatMap(([presetId, keys]) => fieldsFor(presetId, [...new Set(keys)])); const titles = Object.keys(selections.value).filter(key => selections.value[key].length).map(key => presets.find(item => item.id === key)?.name).filter(Boolean); await sendIntakeCard({ version: 1, id: uuid(), kind: 'form', title: `组合需求表单 · ${titles.join(' + ')}`, description: '请会话成员填写选中的需求问题。', mobileStyle: 'comfortable', fields }); comboOpen.value = false; } catch (cause) { comboError.value = cause instanceof Error ? cause.message : '发送失败'; } finally { sending.value = false; } }
async function sendStandardForm() { if (sending.value) return; const preset = standardPreset.value; if (!preset) return; sending.value = true; try { await sendIntakeCard({ version: 1, id: uuid(), kind: 'form', title: preset.name, description: preset.description, mobileStyle: preset.template.mobileStyle || 'comfortable', fields: fieldsFor(preset.id, preset.sections.flatMap(section => section.fields.map(field => field.key))) }); standardOpen.value = false; } catch (cause) { error.value = cause instanceof Error ? cause.message : '发送表单失败'; } finally { sending.value = false; } }
async function submitIntakeForm(card: Extract<IntakeCard, { kind: 'form' }>) {
  if (!isActiveForm(card.id) || sending.value || formUploading.value || fillReadonly.value) return;
  const validationError = validateFormAnswers(card.fields, formAnswers.value);
  if (validationError) { formError.value = validationError; await scrollToInlineFormError(); return; }
  sending.value = true; formError.value = '';
  try {
    if (card.protocol === 'chat_card') {
      const answers = card.fields.map((field, fieldIndex) => ({ fieldIndex, value: encodeChecklistAnswer(formAnswers.value[field.key]) }));
      const body = `${CHAT_CARD_PREFIX}${JSON.stringify({ kind: 'form_answers', formMessageId: card.id, answers })}`;
      await persistIntakeMessage(body);
    } else {
      await sendIntakeCard({ version: 1, id: uuid(), kind: 'submission', formId: card.id, title: card.title, answers: formAnswers.value });
    }
    if (formDraftTimer) { clearTimeout(formDraftTimer); formDraftTimer = undefined; }
    uni.removeStorageSync(formDraftKey(card.id));
    fillCard.value = null; formAnswers.value = {}; formDraftStatus.value = '';
  } catch (cause) { formError.value = cause instanceof Error ? cause.message : '提交失败，请检查网络后重试'; }
  finally { sending.value = false; }
}
async function createConfirmation() { if (!submittedForms.value.length || sending.value) return; const formIds = [...new Set(submittedForms.value.map(entry => entry.card.formId))]; sending.value = true; try { await sendIntakeCard({ version: 1, id: uuid(), kind: 'confirmation', title: '设计需求确认', formIds }); } catch (cause) { error.value = cause instanceof Error ? cause.message : '发起确认失败'; } finally { sending.value = false; } }
function decisionEntries(confirmationId: string) { return intakeCards.value.filter((entry): entry is { message: IntakeMessage; card: Extract<IntakeCard, { kind: 'decision' }> } => entry.card.kind === 'decision' && entry.card.confirmationId === confirmationId); }
function myDecision(confirmationId: string) { return [...decisionEntries(confirmationId)].reverse().find(entry => entry.message.senderId === userId.value)?.card.decision; }
function confirmationHasNewerSubmissions(card: IntakeCard) { if (card.kind !== 'confirmation') return false; const confirmation = intakeCards.value.find(entry => entry.card.kind === 'confirmation' && entry.card.id === card.id); if (!confirmation) return false; return card.formIds.some(formId => submittedForms.value.some(entry => entry.card.formId === formId && entry.message.seq > confirmation.message.seq)); }
function confirmationStatus(card: IntakeCard) { if (card.kind !== 'confirmation') return ''; if (confirmationHasNewerSubmissions(card)) return '表单已更新 · 需要重新发起确认'; const latest = new Map<string, 'confirmed' | 'changes'>(); for (const entry of decisionEntries(card.id)) latest.set(entry.message.senderId, entry.card.decision); const people = [session.value?.creatorId, session.value?.guestId].filter((value): value is string => Boolean(value)); const confirmed = people.filter(person => latest.get(person) === 'confirmed').length; return people.length === 2 && confirmed === 2 ? '双方已确认 · 需求内容可进入设计' : `待双方确认 · 已确认 ${confirmed}/${people.length || 2}`; }
function confirmRequirement(card: IntakeCard) { if (card.kind !== 'confirmation' || myDecision(card.id)) return; uni.showActionSheet({ itemList: ['确认无误', '需要补充'], success: result => { const decision = result.tapIndex === 0 ? 'confirmed' : 'changes'; if (decision === 'changes') { uni.showModal({ title: '说明需要补充的内容', editable: true, placeholderText: '请填写需要调整的内容', success: modal => { if (modal.confirm && modal.content?.trim()) void sendDecision(card.id, decision, modal.content.trim()); } }); } else void sendDecision(card.id, decision, ''); } }); }
async function sendDecision(confirmationId: string, decision: 'confirmed' | 'changes', note: string) { sending.value = true; try { await sendIntakeCard({ version: 1, id: uuid(), kind: 'decision', title: '需求确认记录', confirmationId, decision, note }); } catch (cause) { error.value = cause instanceof Error ? cause.message : '确认未能保存'; } finally { sending.value = false; } }
function cardDecision(message: IntakeMessage) { const card = parseIntakeCard(message.body); return card?.kind === 'decision' ? card : null; }
function decisionText(card: Extract<IntakeCard, { kind: 'decision' }>) { return `${card.decision === 'confirmed' ? '已确认需求内容' : '需要补充需求'}${card.note ? `：${card.note}` : ''}`; }
function back() { uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/index/index' }) }); }
</script>
<style scoped>
.chat-page { height:100vh; height:100dvh; display:flex; flex-direction:column; background:#f8fafc; padding-top:env(safe-area-inset-top); box-sizing:border-box; }.chat-header { min-height:98rpx; display:flex; align-items:center; gap:20rpx; padding:0 26rpx; background:#fff; border-bottom:1rpx solid #e2e8f0; }.back { width:44rpx; font-size:54rpx; line-height:1; color:#334155; }.header-copy { flex:1; min-width:0; }.header-title { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:29rpx; font-weight:700; color:#1e293b; }.header-subtitle { margin-top:6rpx; font-size:20rpx; color:#64748b; }.more { padding:12rpx; color:#2563eb; font-size:36rpx; }.share-strip,.participant-strip { display:flex; align-items:center; justify-content:space-between; gap:16rpx; padding:18rpx 24rpx; background:#eff6ff; border-bottom:1rpx solid #dbeafe; }.share-title,.participant-title { font-size:23rpx; font-weight:700; color:#1e40af; }.share-desc,.participant-subtitle { margin-top:5rpx; font-size:19rpx; color:#64748b; }.share-button { margin:0; padding:0 22rpx; height:62rpx; line-height:62rpx; border-radius:14rpx; color:#fff; background:linear-gradient(110deg,#2563eb,#4f46e5); font-size:21rpx; font-weight:650; white-space:nowrap; }.share-button::after { border:0; }.participant-strip { justify-content:flex-start; background:#fff; border-color:#e2e8f0; }.participant-avatar { width:58rpx; height:58rpx; display:flex; align-items:center; justify-content:center; border-radius:50%; background:#e0e7ff; color:#4f46e5; font-size:24rpx; font-weight:700; }.participant-title { color:#334155; }.info-panel { display:flex; flex-direction:column; gap:9rpx; padding:18rpx 26rpx; background:#fff; color:#64748b; font-size:21rpx; border-bottom:1rpx solid #e2e8f0; }.chat-error { margin:14rpx 20rpx 0; }.timeline { flex:1; min-height:0; height:0; padding:8rpx 28rpx; box-sizing:border-box; }.message { margin:28rpx 0; display:flex; flex-direction:column; align-items:flex-start; }.message.mine { align-items:flex-end; }.sender { color:#94a3b8; font-size:20rpx; margin-bottom:10rpx; }.bubble { max-width:84%; padding:20rpx 25rpx; background:#fff; border:1rpx solid #e2e8f0; border-radius:6rpx 20rpx 20rpx 20rpx; color:#334155; font-size:26rpx; line-height:1.7; word-break:break-word; }.mine .bubble { background:#eff6ff; border-color:#dbeafe; color:#1e40af; border-radius:20rpx 6rpx 20rpx 20rpx; }.saved { margin:7rpx 5rpx 0; color:#94a3b8; font-size:17rpx; }.empty-chat { min-height:420rpx; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18rpx; padding:40rpx; color:#94a3b8; text-align:center; font-size:23rpx; line-height:1.7; }.empty-icon { width:78rpx; height:78rpx; display:flex; align-items:center; justify-content:center; border-radius:26rpx; color:#2563eb; background:#eff6ff; font-size:29rpx; font-weight:700; }.chat-bottom { height:20rpx; }.composer { display:flex; align-items:flex-end; gap:14rpx; padding:16rpx 22rpx calc(18rpx + env(safe-area-inset-bottom)); background:#fff; border-top:1rpx solid #e2e8f0; }.message-input { flex:1; min-height:70rpx; max-height:190rpx; background:#f8fafc; border:1rpx solid #e2e8f0; border-radius:15rpx; padding:14rpx 18rpx; box-sizing:border-box; font-size:25rpx; }.send { min-width:90rpx; height:68rpx; line-height:68rpx; margin:0; padding:0 22rpx; border-radius:15rpx; color:#fff; background:linear-gradient(110deg,#2563eb,#4f46e5); font-size:23rpx; font-weight:650; }.send::after { border:0; }
.workflow-card { width:min(100%,680rpx); box-sizing:border-box; padding:24rpx; border:1rpx solid #c7d2fe; border-radius:20rpx; background:linear-gradient(145deg,#fff,#f5f7ff); box-shadow:0 8rpx 22rpx rgba(30,41,59,.06); }.card-kicker { color:#4f46e5; font-size:19rpx; font-weight:700; }.card-title { margin-top:9rpx; color:#1e293b; font-size:27rpx; font-weight:700; line-height:1.5; }.card-description,.card-meta { display:block; margin-top:10rpx; color:#64748b; font-size:20rpx; line-height:1.6; }.card-action { width:100%; margin:16rpx 0 0; padding:12rpx 16rpx; border-radius:12rpx; background:#eff6ff; color:#2563eb; text-align:left; font-size:22rpx; font-weight:650; }.card-action::after,.modal-close::after,.modal-actions button::after { border:0; }.answer-row { display:flex; flex-direction:column; gap:3rpx; margin-top:13rpx; padding-top:12rpx; border-top:1rpx solid #e2e8f0; }.answer-label { color:#64748b; font-size:19rpx; }.answer-value { color:#1e293b; font-size:22rpx; line-height:1.55; word-break:break-word; }.decision-done { margin-top:14rpx; color:#047857; font-size:21rpx; }.composer { flex-direction:column; gap:12rpx; padding:12rpx 20rpx calc(16rpx + env(safe-area-inset-bottom)); }.composer-tools { display:flex; gap:10rpx; overflow-x:auto; white-space:nowrap; }.tool-pill { flex:none; padding:10rpx 16rpx; border:1rpx solid #e2e8f0; border-radius:30rpx; background:#fff; color:#475569; font-size:19rpx; }.primary-tool { border-color:#dbeafe; background:#eff6ff; color:#2563eb; font-weight:650; }.composer-row { display:flex; align-items:flex-end; gap:14rpx; }.modal-mask { position:fixed; z-index:100; inset:0; display:flex; align-items:center; justify-content:center; padding:28rpx; background:rgba(15,23,42,.5); }.tool-modal { width:100%; max-height:88vh; display:flex; flex-direction:column; padding:28rpx; box-sizing:border-box; border-radius:24rpx; background:#fff; box-shadow:0 24rpx 70rpx rgba(15,23,42,.2); }.combo-modal,.fill-modal { max-height:92vh; }.modal-heading { display:flex; justify-content:space-between; align-items:flex-start; gap:14rpx; margin-bottom:18rpx; }.modal-title { display:block; font-size:29rpx; font-weight:750; color:#1e293b; }.modal-subtitle { display:block; margin-top:7rpx; color:#64748b; font-size:19rpx; line-height:1.5; }.modal-close { flex:none; color:#94a3b8; font-size:44rpx; line-height:1; }.tool-option { display:flex; align-items:center; gap:16rpx; padding:20rpx 8rpx; border-top:1rpx solid #f1f5f9; }.tool-option-icon { width:58rpx; height:58rpx; display:flex; align-items:center; justify-content:center; border-radius:18rpx; background:#eff6ff; color:#2563eb; font-size:22rpx; font-weight:700; }.tool-option-title { display:block; color:#1e293b; font-size:23rpx; font-weight:700; }.tool-option-hint { display:block; margin-top:5rpx; color:#64748b; font-size:18rpx; }.preset-picker { display:flex; justify-content:space-between; align-items:center; margin:4rpx 0 14rpx; padding:17rpx 18rpx; border:1rpx solid #e2e8f0; border-radius:12rpx; color:#334155; font-size:22rpx; }.field-list { flex:1; min-height:0; overflow-y:auto; padding:0 4rpx; }.field-section { margin:12rpx 0 18rpx; }.section-name { display:block; margin-bottom:9rpx; color:#64748b; font-size:19rpx; font-weight:700; }.field-choice { display:flex; align-items:center; gap:10rpx; min-height:56rpx; color:#334155; font-size:20rpx; }.selected-count { margin:12rpx 0; color:#64748b; font-size:19rpx; }.modal-actions { display:flex; gap:12rpx; padding-top:14rpx; border-top:1rpx solid #f1f5f9; }.modal-actions button { flex:1; margin:0; font-size:22rpx; }.error-text { color:#be123c; font-size:20rpx; }.fill-modal { overflow:auto; }
.category-actions { display:flex; justify-content:space-between; margin:0 4rpx 8rpx; color:#94a3b8; font-size:18rpx; }.category-actions view { display:flex; gap:22rpx; color:#2563eb; }
.field-choice { align-items:flex-start; padding:12rpx 8rpx; border-bottom:1rpx solid #f1f5f9; }.field-choice-content { flex:1; min-width:0; }.field-choice-title { display:block; padding-top:5rpx; line-height:1.5; }.repeat-preview { margin-top:10rpx; padding:12rpx 14rpx; border:1rpx solid #dbeafe; border-radius:12rpx; background:#f8faff; }.repeat-preview-heading { display:block; margin-bottom:8rpx; color:#4f46e5; font-size:18rpx; font-weight:650; }.repeat-preview-row { display:flex; align-items:flex-start; justify-content:space-between; gap:12rpx; padding:6rpx 0 6rpx 12rpx; border-left:3rpx solid #c7d2fe; }.repeat-preview-copy { flex:1; min-width:0; }.repeat-preview-label { display:block; color:#334155; font-size:19rpx; line-height:1.4; }.repeat-preview-detail { display:block; margin-top:3rpx; color:#94a3b8; font-size:17rpx; line-height:1.4; }.repeat-preview-kind { flex:none; color:#94a3b8; font-size:17rpx; }.repeat-preview-empty { color:#d97706; font-size:18rpx; }
.chat-page { padding-top:0; }
.status-bar { flex:none; width:100%; background:#fff; }
.chat-header { flex:none; }
.message { width:100%; box-sizing:border-box; margin:20rpx 0; }
.message.received { padding-right:44rpx; }
.message.mine { padding-left:44rpx; }
.sender { display:block; max-width:84%; margin-bottom:7rpx; font-size:18rpx; }
.message.mine .sender { text-align:right; }
.workflow-card { width:min(100%,560rpx); padding:18rpx 20rpx; border-radius:17rpx 7rpx 17rpx 17rpx; border-color:#dbe4f0; background:#fff; box-shadow:0 3rpx 12rpx rgba(30,41,59,.045); }
.message.mine .workflow-card { border-color:#c7d2fe; border-radius:7rpx 17rpx 17rpx 17rpx; background:linear-gradient(145deg,#f0f7ff,#f2f0ff); }
.message.received .card-kicker { color:#0f766e; }
.message.mine .card-kicker { color:#4f46e5; }
.card-title { margin-top:5rpx; font-size:24rpx; line-height:1.4; }
.card-description,.card-meta { margin-top:7rpx; font-size:18rpx; line-height:1.5; }
.card-action { margin-top:11rpx; padding:9rpx 13rpx; font-size:20rpx; }
.answer-row { gap:2rpx; margin-top:9rpx; padding-top:8rpx; }
.answer-label { font-size:18rpx; }
.answer-value { font-size:20rpx; line-height:1.45; }
.header-subtitle { display:flex; align-items:center; gap:12rpx; min-width:0; }
.header-contact { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.service-status { display:flex; flex:none; align-items:center; gap:7rpx; color:#64748b; font-size:18rpx; }
.service-status.online { color:#059669; }
.status-dot { width:12rpx; height:12rpx; border-radius:50%; background:#94a3b8; }
.service-status.online .status-dot { background:#10b981; box-shadow:0 0 0 4rpx rgba(16,185,129,.12); }
.image-send { flex:none; height:68rpx; line-height:68rpx; margin:0; padding:0 18rpx; border:1rpx solid #dbeafe; border-radius:15rpx; background:#eff6ff; color:#2563eb; font-size:21rpx; }
.image-send::after { border:0; }
.image-bubble { width:min(100%,520rpx); max-width:82%; overflow:hidden; border:1rpx solid #dbe4f0; border-radius:16rpx; background:#fff; }
.message.mine .image-bubble { border-color:#bfdbfe; }
.image-bubble :deep(.protected-image) { min-height:180rpx; border-radius:0; background:#f1f5f9; }
.image-bubble :deep(.image) { width:100%; height:360rpx; }
.image-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:4rpx; }
.image-grid.single { grid-template-columns:minmax(0,1fr); }
.image-grid :deep(.protected-image) { height:220rpx; min-height:220rpx; }
.image-grid.single :deep(.protected-image) { height:360rpx; min-height:180rpx; }
.image-grid :deep(.image) { height:100%; }
.image-caption { display:block; padding:12rpx 16rpx; color:#475569; font-size:21rpx; line-height:1.5; white-space:pre-wrap; word-break:break-word; }
.composer { flex:none; display:block; padding:16rpx 22rpx calc(18rpx + env(safe-area-inset-bottom)); border-top:1rpx solid #e9eef5; background:rgba(255,255,255,.98); box-shadow:0 -8rpx 24rpx rgba(15,23,42,.035); }
.composer { position:relative; z-index:31; }
.media-picker-backdrop { position:fixed; z-index:30; inset:0; background:rgba(15,23,42,.06); }
.media-picker { position:absolute; z-index:32; left:20rpx; bottom:calc(100% + 14rpx); width:350rpx; padding:22rpx; box-sizing:border-box; border:1rpx solid #e5ebf3; border-radius:22rpx; background:#fff; box-shadow:0 16rpx 42rpx rgba(15,23,42,.16); animation:media-picker-in .18s ease-out both; }
.media-picker::after { content:''; position:absolute; left:36rpx; bottom:-12rpx; width:22rpx; height:22rpx; transform:rotate(45deg); border-right:1rpx solid #e5ebf3; border-bottom:1rpx solid #e5ebf3; background:#fff; }
.media-picker-title { display:block; margin-bottom:16rpx; color:#334155; font-size:22rpx; font-weight:700; }
.media-picker-options { display:flex; gap:12rpx; }
.media-option { flex:1; display:flex; flex-direction:column; align-items:center; gap:7rpx; margin:0; padding:15rpx 6rpx 13rpx; border:1rpx solid #edf1f6; border-radius:16rpx; background:#f8fafc; }
.media-option::after { border:0; }
.media-option-icon { width:58rpx; height:58rpx; display:flex; align-items:center; justify-content:center; border-radius:18rpx; color:#fff; font-size:28rpx; }
.image-option { background:linear-gradient(135deg,#42a5f5,#4f71e8); }

.media-option-label { color:#1e293b; font-size:21rpx; font-weight:700; }
.media-option-hint { color:#94a3b8; font-size:16rpx; }
.media-option-hover { background:#eff6ff; }
.composer-row { display:flex; align-items:flex-end; gap:12rpx; }
.image-send { width:72rpx; height:76rpx; flex:none; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3rpx; margin:0; padding:0; border:0; border-radius:18rpx; background:transparent; color:#64748b; }
.image-send::after { border:0; }
.image-send-icon { width:48rpx; height:44rpx; display:flex; align-items:center; justify-content:center; border:1rpx solid #d9e4f3; border-radius:15rpx; background:#f1f6ff; color:#3972c6; font-size:31rpx; font-weight:400; line-height:1; }
.image-send-label { color:#64748b; font-size:16rpx; line-height:1.2; }
.image-send-hover .image-send-icon { background:#e4efff; }
.message-input { min-width:0; min-height:76rpx; max-height:190rpx; flex:1; box-sizing:border-box; margin:0; padding:17rpx 20rpx; border:1rpx solid #edf1f6; border-radius:21rpx; background:#f5f7fa; color:#1e293b; font-size:25rpx; line-height:1.5; }
.send { width:92rpx; min-width:92rpx; height:76rpx; flex:none; margin:0; padding:0 12rpx; border:0; border-radius:21rpx; background:linear-gradient(135deg,#4387f5,#5964e8); box-shadow:0 6rpx 14rpx rgba(65,112,228,.22); color:#fff; font-size:22rpx; font-weight:700; line-height:76rpx; }
.send::after { border:0; }
.send[disabled] { background:#d8dfeb; box-shadow:none; color:#fff; opacity:1; }
.send-hover { opacity:.88; transform:translateY(1rpx); }
@keyframes media-picker-in { from { opacity:0; transform:translateY(8rpx) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }
</style>
<style scoped>
.image-bubble :deep(.protected-image.message-image) { min-height:0; }
.image-grid.single :deep(.protected-image.message-image) { height:auto; min-height:0; }
.image-grid :deep(.image.image-fluid) { width:100%; height:auto; }
.workflow-card :deep(.protected-image.answer-image) { width:100%; max-width:420rpx; min-height:160rpx; }
.workflow-card :deep(.answer-image .image) { width:100%; max-height:300rpx; }
.chat-page { overflow:hidden; }
.timeline { scrollbar-width:none; -ms-overflow-style:none; }
.timeline::-webkit-scrollbar { display:none; width:0; height:0; }
.header-title { font-size:31rpx; }
.header-subtitle,.service-status { font-size:20rpx; }
.share-title,.participant-title { font-size:25rpx; }
.share-desc,.participant-subtitle { font-size:21rpx; }
.share-button { font-size:23rpx; }
.info-panel { font-size:23rpx; }
.sender { font-size:20rpx; }
.bubble { font-size:28rpx; }
.saved { font-size:19rpx; }
.empty-chat { font-size:25rpx; }
.card-kicker { font-size:21rpx; }
.workflow-card .card-title { font-size:26rpx; }
.workflow-card .card-description,.workflow-card .card-meta { font-size:20rpx; }
.card-action { font-size:22rpx; }
.answer-label { font-size:20rpx; }
.answer-value { font-size:22rpx; }
.decision-done { font-size:23rpx; }
.image-caption { font-size:23rpx; }
.message-input { font-size:27rpx; }
.send { font-size:24rpx; }
.modal-title { font-size:31rpx; }
.modal-subtitle,.tool-option-hint,.section-name,.selected-count { font-size:21rpx; }
.tool-option-title { font-size:25rpx; }
.preset-picker { font-size:24rpx; }
.field-choice { font-size:22rpx; }
.modal-actions button { font-size:24rpx; }
.category-actions { font-size:20rpx; }
.repeat-preview-heading,.repeat-preview-empty { font-size:20rpx; }
.repeat-preview-label { font-size:21rpx; }
.repeat-preview-detail,.repeat-preview-kind { font-size:19rpx; }
.media-picker-title { font-size:24rpx; }
.media-option-label { font-size:23rpx; }
.media-option-hint { font-size:18rpx; }
.field-list { height:0; overflow:hidden; }
.workflow-card.form-card-active { width:100%; max-width:100%; padding:18rpx 20rpx 20rpx; border-color:#c7d2fe; background:linear-gradient(155deg,#f7f8ff 0%,#fff 44%,#f6f8ff 100%); box-shadow:0 6rpx 20rpx rgba(74,91,194,.08); }
.form-card-active .card-kicker { color:#4f46e5 !important; }
.form-progress-row { margin-top:13rpx; padding:12rpx 14rpx; border:1rpx solid #e3e8ff; border-radius:14rpx; background:rgba(255,255,255,.78); }
.form-progress-copy { display:flex; align-items:center; justify-content:space-between; gap:12rpx; margin-bottom:9rpx; }
.form-progress-count { color:#334155; font-size:20rpx; font-weight:700; }
.form-progress-status { overflow:hidden; color:#64748b; font-size:18rpx; text-overflow:ellipsis; white-space:nowrap; }
.form-progress-track { width:100%; height:9rpx; overflow:hidden; border-radius:99rpx; background:#e7eafe; }
.form-progress-value { height:100%; border-radius:inherit; background:linear-gradient(90deg,#7485ff,#5268ed); transition:width .2s ease; }
.inline-form-hint { margin-top:12rpx; padding:10rpx 12rpx; border-radius:10rpx; background:#eff6ff; color:#2563eb; font-size:20rpx; }
.inline-form-fields { margin-top:17rpx; }
.inline-form-fields :deep(.control) { border-color:#d9e1ef; border-radius:12rpx; background:#fff; }
.inline-form-fields :deep(.field-invalid .label) { color:#be123c; }
.inline-form-fields :deep(.field-invalid .control) { border-color:#fda4af; background:#fff8f8; }
.inline-form-error { margin:12rpx 0 0; padding:12rpx 14rpx; border:1rpx solid #fecdd3; border-radius:12rpx; background:#fff1f2; color:#be123c; font-size:21rpx; line-height:1.5; }
.inline-form-actions { display:flex; gap:12rpx; margin-top:17rpx; padding-top:15rpx; border-top:1rpx solid #e6eaf3; }
.inline-form-actions button { flex:1; min-width:0; height:76rpx; margin:0; padding:0 12rpx; border-radius:13rpx; font-size:22rpx; font-weight:700; line-height:76rpx; }
.inline-form-actions button::after { border:0; }
.inline-secondary { border:1rpx solid #c8d2ff; background:#fff; color:#5268ed; }
.inline-primary { background:linear-gradient(110deg,#6278f6,#5263e9); box-shadow:0 5rpx 12rpx rgba(82,99,233,.18); color:#fff; }
.inline-primary[disabled],.inline-secondary[disabled] { opacity:.55; }
.revision-hint { margin-top:11rpx; color:#64748b; font-size:18rpx; line-height:1.5; }
</style>
