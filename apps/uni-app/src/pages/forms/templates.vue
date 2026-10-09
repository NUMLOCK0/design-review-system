<template>
  <view class="page"><text class="eyebrow">选择已发布的需求模板</text><view class="title">从一份清晰的表单开始</view><input v-model="search" class="input space-top" placeholder="搜索模板或类目" /><view v-if="error" class="error-box space-top">{{ error }}</view><view v-for="template in filtered" :key="template.id" class="panel space-top"><text class="badge">{{ template.category || '通用需求' }}</text><view class="subtitle space-top">{{ template.name }}</view><view class="muted space-top">{{ template.description }}</view><button class="secondary space-top" :loading="busy === template.id" :disabled="Boolean(busy)" @tap="select(template)">使用此模板 · v{{ template.publishedVersion || template.version }}</button></view><view v-if="!filtered.length && !error" class="empty">{{ loading ? '加载模板…' : '暂无匹配模板，请联系管理员发布。' }}</view></view>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import type { FormTemplate } from '@design-review/shared';
import { api, requireSession, uuid } from '../../lib/api';
const orderId = ref(''); const templates = ref<FormTemplate[]>([]); const search = ref(''); const error = ref(''); const loading = ref(true); const busy = ref('');
const filtered = computed(() => templates.value.filter(template => `${template.name} ${template.category || ''}`.includes(search.value)));
onLoad(async options => { orderId.value = String(options?.orderId || ''); if (!requireSession()) return; try { templates.value = await api.templates(); } catch (cause) { error.value = cause instanceof Error ? cause.message : '加载失败'; } finally { loading.value = false; } });
async function select(template: FormTemplate) { if (busy.value) return; busy.value = template.id; try { const form = await api.createForm(orderId.value, template, uuid()); uni.redirectTo({ url: `/pages/forms/detail?orderId=${encodeURIComponent(orderId.value)}&formId=${form.id}` }); } catch (cause) { error.value = cause instanceof Error ? cause.message : '发起表单失败'; } finally { busy.value = ''; } }
</script>
