<template>
  <view class="page edit-page">
    <view class="heading"><text class="eyebrow">{{ editId ? '修改订单' : '发布新订单' }}</text><view class="title">{{ editId ? '完善设计需求' : '告诉我们要做什么' }}</view><view class="muted space-top">需求可以先简要填写，后续在会话中继续与设计师确认。</view></view>
    <view v-if="error" class="error-box" @tap="initialize">{{ error }} · 点击重试</view>
    <view v-if="loading" class="empty">正在准备订单信息…</view>
    <template v-else>
      <view class="section"><view class="section-title">基本信息</view><text class="label">订单名称 <text class="required">*</text></text><input v-model="form.title" class="field" maxlength="120" placeholder="例如：春季新品主图设计" />
        <text class="label">设计类型</text><picker :range="categories" :value="categoryIndex" @change="changeCategory"><view class="picker-field">{{ form.category }} <text>›</text></view></picker>
        <text class="label">投放平台</text><picker :range="platforms.map(item => item.label)" :value="platformIndex" @change="changePlatform"><view class="picker-field">{{ platforms[platformIndex]?.label }} <text>›</text></view></picker>
      </view>
      <view class="section"><view class="section-title">交付范围</view>
        <template v-if="!editId"><text class="label">图片规格</text><picker :range="ratios.map(item => item.label)" :value="ratioIndex" @change="changeRatio"><view class="picker-field">{{ ratios[ratioIndex]?.label }} <text>›</text></view></picker><text class="label">图片数量</text><input v-model="form.quantity" class="field" type="number" placeholder="1–50 张" /><view class="field-hint">每张图片的详细内容可在项目会话中继续确认。</view></template>
        <template v-else><view v-for="group in existingGroups" :key="group.id" class="existing-group"><text>{{ group.name }}</text><text>{{ group.imageItems?.length || group.quantity }} 张</text></view><view class="field-hint">此处保留订单原有图片清单；需要逐张修改图片要求时可在 Web 端编辑。</view></template>
        <text class="label">设计要求与卖点</text><textarea v-model="form.requirements" class="multiline" maxlength="2000" placeholder="产品特点、文案、风格和需要强调的卖点" />
        <template v-if="!editId"><text class="label">参考链接（选填）</text><view v-for="(link, index) in form.links" :key="index" class="reference-row"><input class="field" :value="link" placeholder="https:// 商品或参考作品" @input="setLink(index, $event)" /><text v-if="form.links.length > 1" class="remove-link" @tap="removeLink(index)">删除</text></view><text v-if="form.links.length < 5" class="add-link" @tap="addLink">＋ 添加参考链接</text></template>
        <view class="switch-row"><view><text class="switch-label">需要 PSD 源文件</text><text class="field-hint">开启后按平台价格规则计算最低预算</text></view><switch :checked="form.requiresPsd" color="#2563eb" @change="changePsd" /></view>
      </view>
      <view class="section"><view class="section-title">预算与审核</view>
        <text class="label">交付周期</text><picker :range="daysOptions.map(item => item.label)" :value="daysIndex" @change="changeDays"><view class="picker-field">{{ daysLabel }} <text>›</text></view></picker>
        <text class="label">优先级</text><picker :range="urgencies.map(item => item.label)" :value="urgencyIndex" @change="changeUrgency"><view class="picker-field">{{ urgencies[urgencyIndex]?.label }} <text>›</text></view></picker>
        <text class="label">作品审核流 <text class="required">*</text></text><picker v-if="rules.length" :range="rules.map(item => item.name)" :value="ruleIndex" @change="changeRule"><view class="picker-field">{{ ruleLabel }} <text>›</text></view></picker><view v-else class="field-hint">当前账号没有可用的审核流，请先在 Web 端配置。</view>
        <text class="label">订单预算（元） <text class="required">*</text></text><input v-model="form.budget" class="field" type="digit" :placeholder="`最低 ¥${minimum.toFixed(2)}`" /><view class="minimum">最低报价 ¥{{ minimum.toFixed(2) }} <text v-if="form.requiresPsd">· 已计入 PSD 源文件</text></view>
      </view>
      <view class="submit-summary"><text>提交后{{ editId ? '更新订单资料' : '生成待付定金订单' }}</text><text>¥{{ Number(form.budget || 0).toFixed(2) }}</text></view>
      <button class="submit" :loading="saving" :disabled="saving || !rules.length || !!error" @tap="submit">{{ saving ? '正在保存…' : editId ? '保存修改' : '确认发布订单' }}</button>
      <view v-if="!editId" class="draft-hint">填写内容会暂存在当前设备。</view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { onLoad } from '@dcloudio/uni-app';
import { calculateOrderMinimumBudget, type DesignOrder, type ImageGroupType, type OrderImageRequirementItem, type PlatformType, type ReviewRule } from '@design-review/shared';
import { api, getSession, requireSession, uuid, type OrderPricing } from '../../lib/api';

const categories = ['主图设计', '详情页设计', '活动海报', '3D建模与渲染', '精修合成'];
const platforms: Array<{ value: PlatformType; label: string }> = [{ value: 'tmall', label: '天猫' }, { value: 'taobao', label: '淘宝' }, { value: 'douyin', label: '抖音电商' }, { value: 'pinduoduo', label: '拼多多' }, { value: 'universal', label: '全平台' }];
const ratios: Array<{ value: ImageGroupType; label: string; dimensions: string }> = [{ value: 'main_1_1', label: '1:1 方形主图', dimensions: '800×800' }, { value: 'main_3_4', label: '3:4 竖版长图', dimensions: '750×1000' }, { value: 'main_4_3', label: '4:3 横版主图', dimensions: '1200×900' }, { value: 'main_16_9', label: '16:9 横幅主图', dimensions: '1600×900' }, { value: 'main_9_16', label: '9:16 竖版海报', dimensions: '900×1600' }, { value: 'detail', label: '详情页长图', dimensions: '750×1500' }];
const daysOptions = [{ value: 1, label: '24 小时' }, { value: 2, label: '2 天' }, { value: 3, label: '3 天' }, { value: 5, label: '5 天' }, { value: 7, label: '7 天' }];
const urgencies = [{ value: 'normal' as const, label: '标准' }, { value: 'urgent' as const, label: '加急' }, { value: 'super_urgent' as const, label: '特急' }];
type Draft = { title: string; category: string; platform: PlatformType; groupType: ImageGroupType; quantity: string; requirements: string; links: string[]; requiresPsd: boolean; days: number; urgency: DesignOrder['urgency']; budget: string; ruleId: string };
const initial = (): Draft => ({ title: '', category: categories[0], platform: 'tmall', groupType: 'main_1_1', quantity: '1', requirements: '', links: [''], requiresPsd: false, days: 3, urgency: 'normal', budget: '', ruleId: '' });
const form = ref<Draft>(initial()); const editId = ref(''); const existingOrder = ref<DesignOrder | null>(null); const existingGroups = ref<OrderImageRequirementItem[]>([]); const rules = ref<ReviewRule[]>([]); const pricing = ref<OrderPricing | null>(null); const loading = ref(true); const saving = ref(false); const error = ref(''); const daysChanged = ref(false);
const categoryIndex = computed(() => Math.max(0, categories.indexOf(form.value.category)));
const platformIndex = computed(() => Math.max(0, platforms.findIndex(item => item.value === form.value.platform)));
const ratioIndex = computed(() => Math.max(0, ratios.findIndex(item => item.value === form.value.groupType)));
const daysIndex = computed(() => Math.max(0, daysOptions.findIndex(item => item.value === form.value.days)));
const daysLabel = computed(() => daysOptions.find(item => item.value === form.value.days)?.label || `${form.value.days} 天`);
const urgencyIndex = computed(() => Math.max(0, urgencies.findIndex(item => item.value === form.value.urgency)));
const ruleIndex = computed(() => Math.max(0, rules.value.findIndex(item => item.id === form.value.ruleId)));
const ruleLabel = computed(() => rules.value.find(item => item.id === form.value.ruleId)?.name || '请选择审核流');
const draftKey = computed(() => `cozi-order-draft:${getSession()?.user.id || 'anonymous'}`);
const quantity = computed(() => Math.max(1, Math.min(50, Number(form.value.quantity) || 1)));
const draftGroups = computed<OrderImageRequirementItem[]>(() => { const ratio = ratios[ratioIndex.value]; return [{ id: 'preview', name: ratio.label, groupType: ratio.value, dimensions: ratio.dimensions, quantity: quantity.value, referenceImages: [], referenceLinks: [] }]; });
const minimum = computed(() => pricing.value ? calculateOrderMinimumBudget(editId.value ? existingGroups.value : draftGroups.value, pricing.value.imageUnitPrices || {}, Number(pricing.value.minOrderBudget) || 0, form.value.requiresPsd, Number(pricing.value.psdSurchargeRate) || 0, Number(pricing.value.imageUnitPrice) || 0) : 0);
onLoad(options => { editId.value = String(options?.id || ''); void initialize(); });
watch(form, value => { if (!editId.value && !loading.value) { try { uni.setStorageSync(draftKey.value, { ...value, links: [...value.links] }); } catch { /* Draft persistence is best effort. */ } } }, { deep: true });
async function initialize() {
  if (!requireSession()) return; loading.value = true; error.value = '';
  try {
    const [available, price, order] = await Promise.all([api.reviewRules(), api.orderPricing(), editId.value ? api.designOrder(editId.value) : Promise.resolve(null)]);
    rules.value = available.filter(rule => rule.isActive); pricing.value = price;
    if (order) {
      existingOrder.value = order; existingGroups.value = order.imageRequirementGroups || [];
      daysChanged.value = false;
      form.value = { title: order.title, category: order.category, platform: order.platform, groupType: 'main_1_1', quantity: String((order.imageRequirementGroups || []).reduce((sum, group) => sum + (group.imageItems?.length || group.quantity || 0), 0) || 1), requirements: order.requirements || '', links: [''], requiresPsd: Boolean(order.requiresPsd), days: Math.max(1, Math.ceil((new Date(order.deadline).getTime() - Date.now()) / 86400000)), urgency: order.urgency, budget: String(order.budget), ruleId: order.reviewRuleId || '' };
    } else {
      const saved = uni.getStorageSync(draftKey.value) as Partial<Draft> | undefined;
      form.value = { ...initial(), ...(saved && typeof saved === 'object' ? saved : {}) };
      if (!Array.isArray(form.value.links)) form.value.links = [''];
      if (!rules.value.some(rule => rule.id === form.value.ruleId)) form.value.ruleId = rules.value.find(rule => rule.name === '自己审核')?.id || rules.value[0]?.id || '';
    }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : '订单资料加载失败'; }
  finally { loading.value = false; }
}
function changeCategory(event: { detail: { value: string } }) { form.value.category = categories[Number(event.detail.value)]; }
function changePlatform(event: { detail: { value: string } }) { form.value.platform = platforms[Number(event.detail.value)].value; }
function changeRatio(event: { detail: { value: string } }) { form.value.groupType = ratios[Number(event.detail.value)].value; }
function changeDays(event: { detail: { value: string } }) { form.value.days = daysOptions[Number(event.detail.value)].value; daysChanged.value = true; }
function changeUrgency(event: { detail: { value: string } }) { form.value.urgency = urgencies[Number(event.detail.value)].value; }
function changeRule(event: { detail: { value: string } }) { form.value.ruleId = rules.value[Number(event.detail.value)].id; }
function changePsd(event: { detail: { value: boolean } }) { form.value.requiresPsd = event.detail.value; }
function setLink(index: number, event: { detail: { value: string } }) { form.value.links[index] = event.detail.value; }
function addLink() { if (form.value.links.length < 5) form.value.links.push(''); }
function removeLink(index: number) { form.value.links.splice(index, 1); }
async function submit() {
  if (saving.value || !pricing.value) return;
  const value = form.value; const budget = Number(value.budget); const selectedRule = rules.value.find(rule => rule.id === value.ruleId);
  if (!value.title.trim()) return showError('请填写订单名称');
  if (!editId.value && (!Number.isInteger(Number(value.quantity)) || Number(value.quantity) < 1 || Number(value.quantity) > 50)) return showError('图片数量需为 1–50 张');
  if (!selectedRule) return showError('请选择可用的作品审核流');
  if (!Number.isFinite(budget) || budget <= 0 || budget < minimum.value) return showError(`预算不能低于 ¥${minimum.value.toFixed(2)}`);
  const links = value.links.map(link => link.trim()).filter(Boolean);
  if (links.some(link => !/^https?:\/\/[^\s]+$/i.test(link))) return showError('参考链接需以 http:// 或 https:// 开头');
  const deadline = editId.value && !daysChanged.value && existingOrder.value ? existingOrder.value.deadline : new Date(Date.now() + value.days * 86400000).toISOString();
  const payload: Record<string, unknown> = { title: value.title.trim(), category: value.category, platform: value.platform, budget, urgency: value.urgency, deadline, requirements: value.requirements.trim(), requiresPsd: value.requiresPsd, reviewRuleId: selectedRule.id, reviewRuleName: selectedRule.name };
  if (!editId.value) { const ratio = ratios[ratioIndex.value]; const description = value.requirements.trim() || '由品牌方提供简要需求，沟通后确认设计细节。'; const imageItems = Array.from({ length: quantity.value }, () => ({ id: uuid(), materialImage: '', description, referenceImages: [], referenceLinks: links, referenceLinkItems: links.map(link => ({ id: uuid(), image: '', link, description: '' })) })); payload.imageRequirementGroups = [{ id: uuid(), name: ratio.label, groupType: ratio.value, dimensions: ratio.dimensions, quantity: imageItems.length, imageItems, materialImages: [], description: value.requirements.trim(), referenceImages: [], referenceLinks: links }]; }
  saving.value = true;
  try {
    const result = editId.value ? await api.updateDesignOrder(editId.value, payload) : await api.createDesignOrder(payload);
    if (!editId.value) uni.removeStorageSync(draftKey.value);
    uni.showToast({ title: editId.value ? '修改已保存' : '订单已创建', icon: 'success' });
    uni.redirectTo({ url: `/pages/orders/detail?id=${encodeURIComponent(result.id)}` });
  } catch (cause) { showError(cause instanceof Error ? cause.message : '保存失败'); }
  finally { saving.value = false; }
}
function showError(message: string) { uni.showToast({ title: message, icon: 'none' }); }
</script>

<style scoped>
.edit-page { min-height:100vh; background:#f4f7fb; }.heading { margin:8rpx 4rpx 25rpx; }.heading .muted { font-size:22rpx; }.section { margin-bottom:20rpx; padding:27rpx; border-radius:22rpx; background:#fff; }.section-title { margin-bottom:22rpx; color:#0f172a; font-size:28rpx; font-weight:750; }.label { display:block; margin:22rpx 0 10rpx; color:#334155; font-size:23rpx; font-weight:650; }.label:first-of-type { margin-top:0; }.required { color:#ef4444; }.field,.picker-field,.multiline { width:100%; min-height:78rpx; padding:18rpx 20rpx; border:1rpx solid #e2e8f0; border-radius:14rpx; background:#fff; color:#1e293b; font-size:24rpx; }.picker-field { display:flex; align-items:center; justify-content:space-between; }.picker-field text { color:#94a3b8; font-size:35rpx; }.multiline { min-height:178rpx; line-height:1.55; }.field-hint { display:block; margin-top:9rpx; color:#94a3b8; font-size:19rpx; line-height:1.5; }.reference-row { display:flex; align-items:center; gap:10rpx; margin-bottom:9rpx; }.reference-row .field { flex:1; min-width:0; }.remove-link,.add-link { flex:none; color:#2563eb; font-size:21rpx; }.add-link { display:block; margin-top:14rpx; }.switch-row { display:flex; align-items:center; justify-content:space-between; gap:12rpx; margin-top:23rpx; padding-top:18rpx; border-top:1rpx solid #f1f5f9; }.switch-label { display:block; color:#334155; font-size:23rpx; font-weight:650; }.minimum { margin-top:10rpx; color:#2563eb; font-size:21rpx; }.existing-group { display:flex; justify-content:space-between; padding:15rpx 0; border-bottom:1rpx solid #f1f5f9; color:#475569; font-size:22rpx; }.submit-summary { display:flex; justify-content:space-between; align-items:center; padding:20rpx 25rpx; margin-bottom:14rpx; border-radius:16rpx; background:#eff6ff; color:#1d4ed8; font-size:22rpx; }.submit-summary text:last-child { font-size:29rpx; font-weight:750; }.submit { margin:0; border-radius:17rpx; background:#2563eb; color:#fff; font-size:27rpx; font-weight:700; }.submit::after { border:0; }.draft-hint { margin-top:12rpx; color:#94a3b8; text-align:center; font-size:20rpx; }
</style>
