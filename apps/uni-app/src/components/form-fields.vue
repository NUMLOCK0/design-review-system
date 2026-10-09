<template>
  <view class="fields">
    <view v-for="node in nodes" :key="node.key" class="field" :class="{ nested: node.depth > 0 }">
      <view v-if="node.field.kind === 'divider'" class="divider" />
      <view v-else-if="node.field.kind === 'section'" class="section-line">
        <text class="section-title">{{ node.field.label }}</text>
        <button v-if="node.repeatPath && !readonly" size="mini" class="text-button danger" :disabled="repeatLength(node.repeatPath) <= repeatMinimum(node.repeatPath)" @tap="removeRow(node)">删除此项</button>
      </view>
      <text v-else-if="node.field.kind === 'paragraph'" class="help">{{ node.field.label }}</text>
      <template v-else>
        <view class="label-row"><text class="label">{{ node.field.label }}</text><text v-if="node.field.required" class="required">*</text></view>
        <view v-if="node.field.kind === 'repeat'" class="repeat-heading">
          <text class="help">{{ repeatLength(node.path) }} 项</text>
          <button v-if="!readonly" size="mini" class="text-button" :disabled="repeatLength(node.path) >= (node.field.maxItems || 10)" @tap="addRow(node)">＋ 添加一项</button>
        </view>
        <template v-else-if="readonly">
          <protected-image v-if="node.field.kind === 'image' && value(node)" :src="String(value(node))" />
          <view v-else-if="node.field.kind === 'file' && value(node)" class="answer file-link" @tap="openFile(node)">查看已上传文件 →</view>
          <text v-else class="answer">{{ display(node) }}</text>
        </template>
        <textarea v-else-if="node.field.kind === 'textarea'" class="control textarea" :value="String(value(node) || '')" :placeholder="node.field.placeholder || '请输入'" :maxlength="node.field.maxLength || 10000" auto-height @input="change(node, $event.detail.value)" />
        <picker v-else-if="node.field.kind === 'select'" :range="node.field.options || []" range-key="label" :value="optionIndex(node)" @change="choose(node, $event.detail.value)">
          <view class="control picker-value">{{ choiceLabel(node) || '请选择' }}<text>⌄</text></view>
        </picker>
        <radio-group v-else-if="node.field.kind === 'radio'" class="choices" @change="change(node, $event.detail.value)">
          <label v-for="option in node.field.options" :key="option.value" class="choice"><radio :value="option.value" :checked="value(node) === option.value" color="#2563eb" /><text>{{ option.label }}</text></label>
        </radio-group>
        <checkbox-group v-else-if="node.field.kind === 'checkbox'" class="choices" @change="change(node, $event.detail.value)">
          <label v-for="option in node.field.options" :key="option.value" class="choice"><checkbox :value="option.value" :checked="Array.isArray(value(node)) && (value(node) as string[]).includes(option.value)" color="#2563eb" /><text>{{ option.label }}</text></label>
        </checkbox-group>
        <switch v-else-if="node.field.kind === 'switch'" :checked="Boolean(value(node))" color="#2563eb" @change="change(node, $event.detail.value)" />
        <picker v-else-if="node.field.kind === 'date' || node.field.kind === 'time'" :mode="node.field.kind === 'date' ? 'date' : 'time'" :value="String(value(node) || '')" @change="change(node, $event.detail.value)">
          <view class="control">{{ value(node) || (node.field.kind === 'date' ? '选择日期' : '选择时间') }}</view>
        </picker>
        <view v-else-if="node.field.kind === 'datetime'" class="datetime">
          <picker mode="date" :value="datetimePart(node, 'date')" @change="setDatetime(node, 'date', $event.detail.value)"><view class="control">{{ datetimePart(node, 'date') || '选择日期' }}</view></picker>
          <picker mode="time" :value="datetimePart(node, 'time')" @change="setDatetime(node, 'time', $event.detail.value)"><view class="control">{{ datetimePart(node, 'time') || '选择时间' }}</view></picker>
        </view>
        <view v-else-if="node.field.kind === 'image' || node.field.kind === 'file'" class="upload-area">
          <protected-image v-if="node.field.kind === 'image' && value(node)" :src="String(value(node))" />
          <text v-else-if="value(node)" class="help file-link" @tap="openFile(node)">查看已上传文件 →</text>
          <button class="upload-button" :disabled="uploading" @tap="chooseFile(node)">{{ uploading ? '上传中…' : value(node) ? '重新上传' : node.field.kind === 'image' ? '＋ 上传参考图片' : '＋ 从微信聊天选择文件' }}</button>
          <button v-if="value(node)" class="text-button danger" size="mini" @tap="change(node, '')">移除</button>
        </view>
        <input v-else class="control" :type="node.field.kind === 'number' ? 'digit' : node.field.kind === 'phone' ? 'number' : 'text'" :value="String(value(node) ?? '')" :placeholder="node.field.placeholder || '请输入'" :maxlength="node.field.maxLength || 10000" @input="input(node, $event.detail.value)" />
        <view v-if="!readonly && node.field.presets?.length" class="presets"><text v-for="preset in node.field.presets" :key="preset" class="preset" @tap="applyPreset(node, preset)">{{ preset }}</text></view>
        <text v-if="node.field.help" class="help">{{ node.field.help }}</text>
      </template>
    </view>
    <text v-if="error" class="error">{{ error }}</text>
  </view>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { formatAnswer, type FormAnswers, type FormField } from '@design-review/shared';
import { defaultAnswers, flattenFields, getValue, setValue, type FieldNode, type FieldPath } from '../lib/forms';
import { downloadAsset, uploadAsset } from '../lib/api';
import ProtectedImage from './protected-image.vue';
const props = defineProps<{ fields: FormField[]; modelValue: FormAnswers; readonly?: boolean; orderId?: string }>();
const emit = defineEmits<{ (event: 'update:modelValue', data: FormAnswers): void; (event: 'busy', value: boolean): void }>();
const nodes = computed(() => flattenFields(props.fields, props.modelValue));
const uploading = ref(false); const error = ref('');
const value = (node: FieldNode) => getValue(props.modelValue, node.path);
const change = (node: FieldNode, next: unknown) => emit('update:modelValue', setValue(props.modelValue, node.path, next));
const repeatLength = (path: FieldPath) => { const current = getValue(props.modelValue, path); return Array.isArray(current) ? current.length : 0; };
const repeatMinimum = (path: FieldPath) => nodes.value.find(node => node.key === path.join('.'))?.field.minItems || 0;
function addRow(node: FieldNode) { const rows = value(node); change(node, [...(Array.isArray(rows) ? rows : []), defaultAnswers(node.field.children || [])]); }
function removeRow(node: FieldNode) { const rows = getValue(props.modelValue, node.repeatPath!); emit('update:modelValue', setValue(props.modelValue, node.repeatPath!, (rows as unknown[]).filter((_, index) => index !== node.rowIndex))); }
function input(node: FieldNode, text: string) { change(node, node.field.kind === 'number' && text !== '' ? Number(text) : text); }
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
  change(node, node.field.kind === 'select' ? choice?.value || '' : text);
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
async function openFile(node: FieldNode) {
  error.value = '';
  try {
    const path = await downloadAsset(String(value(node)), props.orderId);
    uni.openDocument({ filePath: path, showMenu: true, fail: () => { error.value = '此文件类型无法直接预览，请在 Web 工作台下载查看'; } });
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '文件读取失败'; }
}
async function upload(node: FieldNode, path: string, size: number) {
  if (size > 100 * 1024 * 1024) { error.value = '文件不能超过 100 MB'; return; }
  uploading.value = true; emit('busy', true); error.value = '';
  try { change(node, await uploadAsset(path, node.field.kind === 'image')); }
  catch (cause) { error.value = cause instanceof Error ? cause.message : '上传失败'; }
  finally { uploading.value = false; emit('busy', false); }
}
function chooseFile(node: FieldNode) {
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
</script>
<style scoped>
.field { margin-bottom:36rpx; }.nested { padding-left:24rpx; border-left:4rpx solid #e2e8f0; }.label-row { display:flex; gap:8rpx; margin-bottom:16rpx; }.label { font-size:28rpx; font-weight:600; color:#1e293b; }.required,.danger { color:#be4545 !important; }.control { box-sizing:border-box; width:100%; min-height:88rpx; padding:22rpx; border:1rpx solid #e2e8f0; border-radius:14rpx; background:#ffffff; font-size:28rpx; color:#334155; }.textarea { min-height:160rpx; }.help { display:block; color:#64748b; font-size:24rpx; line-height:1.7; margin-top:10rpx; }.answer { white-space:pre-wrap; word-break:break-all; display:block; color:#334155; font-size:28rpx; line-height:1.8; }.section-line,.repeat-heading { display:flex; justify-content:space-between; align-items:center; }.section-title { font-size:30rpx; font-weight:600; }.divider { height:1rpx; background:#e2e8f0; }.choices { display:flex; flex-direction:column; gap:20rpx; }.choice { display:flex; align-items:center; font-size:28rpx; min-height:68rpx; }.choice text { margin-left:12rpx; }.picker-value { display:flex; justify-content:space-between; }.datetime { display:flex; gap:16rpx; }.datetime picker { flex:1; }.text-button { background:transparent; color:#2563eb; padding:8rpx; margin:0; }.text-button::after { border:0; }.upload-button { background:#eff6ff; color:#2563eb; font-size:26rpx; border:1rpx dashed #bfdbfe; }.presets { display:flex; gap:12rpx; flex-wrap:wrap; margin-top:14rpx; }.preset { background:#eff6ff; color:#475569; padding:10rpx 16rpx; border-radius:10rpx; font-size:22rpx; }.file-link { color:#2563eb; }.error { display:block; color:#b94141; font-size:26rpx; margin:20rpx 0; }
</style>
