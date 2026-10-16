<template>
  <view class="fields" :class="`mobile-style-${props.mobileStyle || 'comfortable'}`">
    <view v-for="node in nodes" :id="props.invalidLabel === node.field.label ? 'form-first-error' : undefined" :key="node.key" class="field" :class="{ nested: node.depth > 0, 'field-invalid': props.invalidLabel === node.field.label }">
      <view v-if="node.field.kind === 'divider'" class="divider" />
      <view v-else-if="node.field.kind === 'section'" class="section-line">
        <view><text class="section-title">{{ node.field.label }}</text><text v-if="node.field.help" class="help">{{ node.field.help }}</text></view>
        <button v-if="node.repeatPath && !readonly" size="mini" class="text-button danger" :disabled="repeatLength(node.repeatPath) <= repeatMinimum(node.repeatPath)" @tap="removeRow(node)">删除此项</button>
      </view>
      <view v-else-if="node.field.kind === 'paragraph'"><text class="help">{{ node.field.label }}</text><text v-if="node.field.help" class="help">{{ node.field.help }}</text></view>
      <template v-else>
        <view class="label-row"><text class="label">{{ node.field.label }}</text><text v-if="node.field.required" class="required">*</text></view>
        <view v-if="node.field.kind === 'repeat'" class="repeat-area">
          <view class="repeat-heading"><text class="help">已填 {{ repeatLength(node.path) }} 项 · 最少 {{ repeatMinimum(node.path) }} 项 · 最多 {{ repeatMaximum(node.field) }} 项</text><button v-if="!readonly" size="mini" class="text-button" :disabled="repeatLength(node.path) >= repeatMaximum(node.field)" @tap="addRow(node)">＋ 添加一项</button></view>
          <text v-if="!repeatLength(node.path) && node.field.children?.length" class="repeat-empty">子表单包含：{{ repeatChildLabels(node.field) }}。{{ readonly ? '尚未填写此子表单。' : '点击“添加一项”开始填写。' }}</text>
        </view>
        <template v-else-if="readonly">
          <template v-if="node.field.kind === 'image'"><protected-image v-for="(url, index) in fileValues(node)" :key="`${url}-${index}`" :src="url" /></template>
          <template v-else-if="node.field.kind === 'file'"><view v-for="(url, index) in fileValues(node)" :key="`${url}-${index}`" class="answer file-link" @tap="openFile(node, url)">查看文件 {{ index + 1 }} →</view></template>
          <text v-else class="answer">{{ display(node) }}</text>
        </template>
        <textarea v-else-if="node.field.kind === 'textarea'" class="control textarea" :value="String(value(node) ?? '')" :placeholder="node.field.placeholder || '请输入'" :maxlength="node.field.maxLength ?? -1" auto-height @input="change(node, $event.detail.value)" />
        <view v-else-if="node.field.kind === 'select'" class="picker-row">
          <picker :range="node.field.options || []" range-key="label" :value="optionIndex(node)" @change="choose(node, $event.detail.value)">
            <view class="control picker-value">{{ choiceLabel(node) || node.field.placeholder || '请选择' }}<text>⌄</text></view>
          </picker>
          <button v-if="value(node) !== undefined && value(node) !== ''" size="mini" class="clear-button" @tap="change(node, '')">清空</button>
          <text v-if="!node.field.options?.length" class="error">该题尚未配置选项</text>
        </view>
        <radio-group v-else-if="node.field.kind === 'radio'" class="choices" @change="change(node, $event.detail.value)">
          <label v-for="option in node.field.options" :key="option.value" class="choice"><radio :value="option.value" :checked="value(node) === option.value" color="#2563eb" /><text>{{ option.label }}</text></label>
          <text v-if="!node.field.options?.length" class="error">该题尚未配置选项</text>
        </radio-group>
        <checkbox-group v-else-if="node.field.kind === 'checkbox'" class="choices" @change="change(node, $event.detail.value)">
          <label v-for="option in node.field.options" :key="option.value" class="choice"><checkbox :value="option.value" :checked="Array.isArray(value(node)) && (value(node) as string[]).includes(option.value)" color="#2563eb" /><text>{{ option.label }}</text></label>
          <text v-if="!node.field.options?.length" class="error">该题尚未配置选项</text>
        </checkbox-group>
        <view v-else-if="node.field.kind === 'switch'" class="switch-row"><switch :checked="Boolean(value(node))" color="#2563eb" @change="change(node, $event.detail.value)" /><text>{{ value(node) ? '已开启' : '未开启' }}</text></view>
        <view v-else-if="node.field.kind === 'date' || node.field.kind === 'time'" class="picker-row">
          <picker :mode="node.field.kind === 'date' ? 'date' : 'time'" :value="String(value(node) || '')" @change="change(node, $event.detail.value)">
            <view class="control">{{ value(node) || node.field.placeholder || (node.field.kind === 'date' ? '选择日期' : '选择时间') }}</view>
          </picker>
          <button v-if="value(node)" size="mini" class="clear-button" @tap="change(node, '')">清空</button>
        </view>
        <view v-else-if="node.field.kind === 'datetime'" class="datetime">
          <picker mode="date" :value="datetimePart(node, 'date')" @change="setDatetime(node, 'date', $event.detail.value)"><view class="control">{{ datetimePart(node, 'date') || '选择日期' }}</view></picker>
          <picker mode="time" :value="datetimePart(node, 'time')" @change="setDatetime(node, 'time', $event.detail.value)"><view class="control">{{ datetimePart(node, 'time') || '选择时间' }}</view></picker>
          <button v-if="value(node)" size="mini" class="clear-button" @tap="change(node, '')">清空</button>
        </view>
        <view v-else-if="node.field.kind === 'image' || node.field.kind === 'file'" class="upload-area">
          <view v-for="(url, index) in fileValues(node)" :key="`${url}-${index}`" class="uploaded-item">
            <protected-image v-if="node.field.kind === 'image'" :src="url" />
            <text v-else class="help file-link" @tap="openFile(node, url)">查看文件 {{ index + 1 }} →</text>
            <button class="text-button danger" size="mini" @tap="removeFile(node, index)">移除</button>
          </view>
          <text class="help">已上传 {{ fileValues(node).length }} 个{{ fileLimit(node) === null ? ' · 不限制个数' : ` · 最多 ${fileLimit(node)} 个` }}</text>
          <button v-if="canUpload(node)" class="upload-button" :disabled="uploading" @tap="chooseFile(node)">{{ uploading ? '上传中…' : fileLimit(node) === 1 && fileValues(node).length ? '重新上传' : node.field.kind === 'image' ? '＋ 上传参考图片' : '＋ 从微信聊天选择文件' }}</button>
          <button v-if="node.field.kind === 'image' && props.conversationImages !== undefined && canUpload(node)" class="upload-button chat-image-button" :disabled="uploading" @tap="toggleConversationImages(node)">从当前对话选择图片</button>
          <view v-if="node.field.kind === 'image' && conversationPickerKey === node.key" class="conversation-image-picker">
            <view class="conversation-image-heading"><text>当前对话中的图片（{{ props.conversationImages?.length || 0 }}）</text><text class="conversation-image-close" @tap="conversationPickerKey = ''">收起</text></view>
            <text v-if="!props.conversationImages?.length" class="help">当前对话还没有图片，可先从相册上传或在聊天中发送图片。</text>
            <view v-else class="conversation-image-grid">
              <view v-for="image in props.conversationImages" :key="image.url" class="conversation-image-option" @tap="selectConversationImage(node, image.url)">
                <protected-image :src="image.url" :preview-on-tap="false" />
                <text class="conversation-image-name">{{ image.senderName || image.name }}</text>
                <text v-if="fileValues(node).includes(image.url)" class="conversation-image-selected">已选</text>
              </view>
            </view>
          </view>
        </view>
        <input v-else-if="['text', 'email', 'phone', 'url', 'number'].includes(node.field.kind)" class="control" :type="node.field.kind === 'number' ? 'digit' : node.field.kind === 'phone' ? 'number' : 'text'" :value="String(value(node) ?? '')" :placeholder="node.field.placeholder || inputPlaceholder(node.field)" :maxlength="node.field.maxLength ?? -1" @input="input(node, $event.detail.value)" />
        <text v-else class="error">暂不支持的字段类型：{{ node.field.kind }}</text>
        <text v-if="!readonly && node.field.kind === 'number' && (node.field.min !== undefined || node.field.max !== undefined)" class="help">{{ numberRange(node.field) }}</text>
        <text v-if="!readonly && ['text', 'textarea', 'email', 'phone', 'url'].includes(node.field.kind) && (node.field.minLength !== undefined || node.field.maxLength !== undefined)" class="help">{{ lengthRange(node.field) }}</text>
        <view v-if="!readonly && node.field.presets?.length" class="presets"><text v-for="preset in node.field.presets" :key="preset" class="preset" @tap="applyPreset(node, preset)">{{ preset }}</text></view>
        <text v-if="node.field.help" class="help">{{ node.field.help }}</text>
      </template>
    </view>
    <text v-if="error" class="error">{{ error }}</text>
  </view>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatAnswer, type FormAnswers, type FormField, type FormMobileStyle } from '@design-review/shared';
import { defaultAnswers, flattenFields, getValue, setValue, type FieldNode, type FieldPath } from '../lib/forms';
import { downloadAsset, uploadAsset } from '../lib/api';
import ProtectedImage from './protected-image.vue';
const props = defineProps<{ fields: FormField[]; modelValue: FormAnswers; readonly?: boolean; orderId?: string; invalidLabel?: string; mobileStyle?: FormMobileStyle; conversationImages?: Array<{ url: string; name: string; senderName?: string }> }>();
const emit = defineEmits<{ (event: 'update:modelValue', data: FormAnswers): void; (event: 'busy', value: boolean): void }>();
const nodes = computed(() => flattenFields(props.fields, props.modelValue));
const uploading = ref(false); const error = ref(''); const conversationPickerKey = ref('');
const value = (node: FieldNode) => getValue(props.modelValue, node.path);
const change = (node: FieldNode, next: unknown) => emit('update:modelValue', setValue(props.modelValue, node.path, next));
const fileValues = (node: FieldNode): string[] => { const current = value(node); return Array.isArray(current) ? current.filter((item): item is string => typeof item === 'string') : typeof current === 'string' && current ? [current] : []; };
const fileLimit = (node: FieldNode) => node.field.maxFiles === null ? null : node.field.maxFiles ?? 1;
const canUpload = (node: FieldNode) => { const limit = fileLimit(node); return limit === null || limit === 1 || fileValues(node).length < limit; };
function removeFile(node: FieldNode, index: number) { const next = fileValues(node).filter((_, fileIndex) => fileIndex !== index); change(node, fileLimit(node) === 1 ? next[0] || '' : next); }
const repeatLength = (path: FieldPath) => { const current = getValue(props.modelValue, path); return Array.isArray(current) ? current.length : 0; };
const repeatMinimum = (path: FieldPath) => { const field = nodes.value.find(node => node.key === path.join('.'))?.field; return Math.max(field?.minItems ?? 0, field?.required ? 1 : 0); };
const repeatMaximum = (field: FormField) => field.maxItems ?? 10;
const repeatChildLabels = (field: FormField) => (field.children || []).filter(child => !['section', 'divider', 'paragraph'].includes(child.kind)).map(child => child.label).join('、');
const numberRange = (field: FormField) => field.min !== undefined && field.max !== undefined ? `请输入 ${field.min} 至 ${field.max} 之间的数字` : field.min !== undefined ? `不能小于 ${field.min}` : `不能大于 ${field.max}`;
const lengthRange = (field: FormField) => field.minLength !== undefined && field.maxLength !== undefined ? `请填写 ${field.minLength}–${field.maxLength} 个字符` : field.minLength !== undefined ? `至少填写 ${field.minLength} 个字符` : `最多填写 ${field.maxLength} 个字符`;
const inputPlaceholder = (field: FormField) => ({ email: '请输入邮箱地址', phone: '请输入手机号', url: '请输入网址', number: '请输入数字' } as Record<string, string>)[field.kind] || '请输入';
function addRow(node: FieldNode) { const rows = value(node); change(node, [...(Array.isArray(rows) ? rows : []), defaultAnswers(node.field.children || [])]); }
function removeRow(node: FieldNode) { const rows = getValue(props.modelValue, node.repeatPath!); emit('update:modelValue', setValue(props.modelValue, node.repeatPath!, (rows as unknown[]).filter((_, index) => index !== node.rowIndex))); }
function input(node: FieldNode, text: string) { change(node, node.field.kind === 'number' && text !== '' && Number.isFinite(Number(text)) ? Number(text) : text); }
const optionIndex = (node: FieldNode) => Math.max(0, (node.field.options || []).findIndex(option => option.value === value(node)));
const choiceLabel = (node: FieldNode) => (node.field.options || []).find(option => option.value === value(node))?.label;
function choose(node: FieldNode, index: string | number) { change(node, node.field.options?.[Number(index)]?.value || ''); }
function display(node: FieldNode) {
  const current = value(node);
  if (node.field.options?.length) return Array.isArray(current) ? current.map(item => node.field.options?.find(option => option.value === item)?.label || item).join('、') : choiceLabel(node) || formatAnswer(current);
  return formatAnswer(current);
}
function applyPreset(node: FieldNode, text: string) {
  const choice = node.field.options?.find(option => option.label === text || option.label.startsWith(text));
  if (node.field.kind === 'select' && !choice) { error.value = `「${node.field.label}」快捷选项不在当前选项中`; return; }
  change(node, node.field.kind === 'select' ? choice!.value : text);
}
function datetimePart(node: FieldNode, part: 'date' | 'time') {
  if (!value(node)) return '';
  const date = new Date(String(value(node))); if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return part === 'date' ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function setDatetime(node: FieldNode, part: 'date' | 'time', next: string) {
  const day = part === 'date' ? next : datetimePart(node, 'date') || new Date().toISOString().slice(0, 10);
  const time = part === 'time' ? next : datetimePart(node, 'time') || '00:00';
  change(node, new Date(`${day}T${time}:00`).toISOString());
}
async function openFile(node: FieldNode, url: string) {
  error.value = '';
  try {
    const path = await downloadAsset(url, props.orderId);
    uni.openDocument({ filePath: path, showMenu: true, fail: () => { error.value = '此文件类型无法直接预览，请在 Web 工作台下载查看'; } });
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '文件读取失败'; }
}
async function upload(node: FieldNode, path: string, size: number) {
  if (size > 100 * 1024 * 1024) { error.value = '文件不能超过 100 MB'; return; }
  uploading.value = true; emit('busy', true); error.value = '';
  try { const url = await uploadAsset(path, node.field.kind === 'image'); change(node, fileLimit(node) === 1 ? url : [...fileValues(node), url]); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '上传失败'; }
  finally { uploading.value = false; emit('busy', false); }
}
function chooseFile(node: FieldNode) {
  if (!canUpload(node) || uploading.value) return;
  if (node.field.kind === 'image') {
    uni.chooseImage({ count: 1, success: result => { const files = result.tempFiles as UniApp.ChooseImageSuccessCallbackResultFile[]; void upload(node, result.tempFilePaths[0], files[0]?.size || 0); } });
    return;
  }
  // #ifdef MP-WEIXIN
  uni.chooseMessageFile({ count: 1, type: 'file', success: result => { const file = result.tempFiles[0]; void upload(node, file.path, file.size); } });
  // #endif
  // #ifndef MP-WEIXIN
  error.value = '文件上传请在微信小程序中操作，图片可直接上传。';
  // #endif
}
function toggleConversationImages(node: FieldNode) {
  if (!canUpload(node) || uploading.value) return;
  conversationPickerKey.value = conversationPickerKey.value === node.key ? '' : node.key;
  error.value = '';
}
function selectConversationImage(node: FieldNode, url: string) {
  if (!canUpload(node) || uploading.value || !props.conversationImages?.some(image => image.url === url)) return;
  const current = fileValues(node);
  if (current.includes(url)) { error.value = '这张图片已经添加到当前表单项'; return; }
  change(node, fileLimit(node) === 1 ? url : [...current, url]);
  conversationPickerKey.value = '';
  error.value = '';
}
</script>
<style scoped>
.field { margin-bottom:36rpx; }.nested { padding-left:24rpx; border-left:4rpx solid #e2e8f0; }.label-row { display:flex; gap:8rpx; margin-bottom:16rpx; }.label { font-size:28rpx; font-weight:600; color:#1e293b; }.required,.danger { color:#be4545 !important; }.control { box-sizing:border-box; width:100%; min-height:88rpx; padding:22rpx; border:1rpx solid #e2e8f0; border-radius:14rpx; background:#ffffff; font-size:28rpx; color:#334155; }.textarea { min-height:160rpx; }.help { display:block; color:#64748b; font-size:24rpx; line-height:1.7; margin-top:10rpx; }.answer { white-space:pre-wrap; word-break:break-all; display:block; color:#334155; font-size:28rpx; line-height:1.8; }.section-line,.repeat-heading { display:flex; justify-content:space-between; align-items:center; }.section-title { font-size:30rpx; font-weight:600; }.divider { height:1rpx; background:#e2e8f0; }.choices { display:flex; flex-direction:column; gap:20rpx; }.choice { display:flex; align-items:center; font-size:28rpx; min-height:68rpx; }.choice text { margin-left:12rpx; }.picker-value { display:flex; justify-content:space-between; }.datetime { display:flex; gap:16rpx; }.datetime picker { flex:1; }.text-button { background:transparent; color:#2563eb; padding:8rpx; margin:0; }.text-button::after { border:0; }.upload-button { background:#eff6ff; color:#2563eb; font-size:26rpx; border:1rpx dashed #bfdbfe; }.presets { display:flex; gap:12rpx; flex-wrap:wrap; margin-top:14rpx; }.preset { background:#eff6ff; color:#475569; padding:10rpx 16rpx; border-radius:10rpx; font-size:22rpx; }.file-link { color:#2563eb; }.error { display:block; color:#b94141; font-size:26rpx; margin:20rpx 0; }
.picker-row { display:flex; align-items:center; flex-wrap:wrap; gap:10rpx; }.picker-row picker { flex:1; min-width:0; }.picker-row .error { width:100%; }.clear-button { flex:none; height:72rpx; line-height:72rpx; padding:0 14rpx; margin:0; color:#64748b; background:#f1f5f9; font-size:22rpx; }.clear-button::after { border:0; }.switch-row { display:flex; align-items:center; gap:16rpx; color:#64748b; font-size:24rpx; }.repeat-heading { gap:12rpx; }.repeat-heading .help { flex:1; min-width:0; }.repeat-empty { display:block; margin-top:14rpx; padding:16rpx; border-radius:12rpx; background:#f8fafc; color:#64748b; font-size:23rpx; line-height:1.6; }.chat-image-button { margin-top:12rpx; background:#f8fafc; color:#475569; }
.conversation-image-picker { margin-top:16rpx; padding:20rpx; border:1rpx solid #dbeafe; border-radius:18rpx; background:#f8fbff; }.conversation-image-heading { display:flex; align-items:center; justify-content:space-between; color:#334155; font-size:25rpx; font-weight:600; }.conversation-image-close { color:#2563eb; font-weight:400; }.conversation-image-grid { display:flex; flex-wrap:wrap; gap:12rpx; margin-top:16rpx; }.conversation-image-option { position:relative; box-sizing:border-box; width:calc((100% - 24rpx) / 3); overflow:hidden; border:1rpx solid #dbeafe; border-radius:12rpx; background:#fff; }.conversation-image-option :deep(.protected-image) { min-height:140rpx; border-radius:0; }.conversation-image-option :deep(.image) { height:140rpx; }.conversation-image-name { display:block; overflow:hidden; padding:6rpx 8rpx; color:#64748b; font-size:20rpx; text-overflow:ellipsis; white-space:nowrap; }.conversation-image-selected { position:absolute; top:6rpx; right:6rpx; padding:2rpx 8rpx; border-radius:8rpx; background:#2563eb; color:#fff; font-size:19rpx; }
.mobile-style-compact .field { margin-bottom:20rpx; }
.mobile-style-compact .label-row { margin-bottom:8rpx; }
.mobile-style-compact .label,.mobile-style-compact .control,.mobile-style-compact .answer,.mobile-style-compact .choice { font-size:26rpx; }
.mobile-style-compact .control { min-height:72rpx; padding:15rpx 17rpx; }
.mobile-style-compact .textarea { min-height:120rpx; }
.mobile-style-compact .help { margin-top:7rpx; font-size:21rpx; }
.mobile-style-compact .choice { min-height:56rpx; }
.mobile-style-compact .section-title { font-size:28rpx; }
.mobile-style-compact .preset { padding:8rpx 12rpx; font-size:20rpx; }
.mobile-style-large .field { margin-bottom:42rpx; }
.mobile-style-large .label-row { margin-bottom:16rpx; }
.mobile-style-large .label,.mobile-style-large .control,.mobile-style-large .answer,.mobile-style-large .choice { font-size:31rpx; }
.mobile-style-large .control { min-height:100rpx; padding:24rpx; }
.mobile-style-large .textarea { min-height:200rpx; }
.mobile-style-large .help { margin-top:12rpx; font-size:26rpx; }
.mobile-style-large .choice { min-height:82rpx; }
.mobile-style-large .section-title { font-size:33rpx; }
.mobile-style-large .preset { padding:13rpx 18rpx; font-size:24rpx; }
</style>
