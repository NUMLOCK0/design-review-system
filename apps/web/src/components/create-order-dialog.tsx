'use client';

import { useEffect, useState } from 'react';
import * as Select from '@radix-ui/react-select';
import { ArrowLeft, CheckCircle2, ChevronDown, CircleHelp, Layers, LayoutGrid, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { DesignOrder, ImageGroupType, ImageTemplate, OrderImageRequirementImageItem, OrderImageRequirementItem, PlatformType, ReviewRule } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { useCurrentUser } from '@/hooks/use-current-user';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImageUpload } from '@/components/image-upload';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

const categories = ['主图设计', '详情页设计', '活动海报', '3D建模与渲染', '精修合成'];
const platforms: Array<{ id: PlatformType; label: string }> = [
  { id: 'tmall', label: '天猫商城' },
  { id: 'taobao', label: '淘宝网' },
  { id: 'douyin', label: '抖音电商' },
  { id: 'pinduoduo', label: '拼多多' },
  { id: 'universal', label: '全网通用' },
];
const formSelectTriggerClass = 'flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs outline-none focus:role-primary-border focus:ring-[3px] focus:ring-[var(--role-primary-border)]';
const selectContentClass = 'z-50 max-h-72 min-w-[8rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-md';
const selectItemClass = 'flex cursor-pointer items-center rounded-lg px-2 py-1.5 text-xs outline-none hover:role-primary-soft data-[state=checked]:bg-[var(--role-primary-soft)] data-[state=checked]:text-[var(--role-primary)]';
const groupTypes: ImageGroupType[] = ['main_1_1', 'main_3_4', 'main_4_3', 'main_16_9', 'main_9_16', 'detail'];
const groupMeta: Record<ImageGroupType, { label: string; name: string; dimensions: string }> = {
  main_1_1: { label: '1:1 主图', name: '1:1 方形主图', dimensions: '800x800' },
  main_3_4: { label: '3:4 长图', name: '3:4 竖版长图', dimensions: '750x1000' },
  main_4_3: { label: '4:3 横版', name: '4:3 横版主图', dimensions: '1200x900' },
  main_16_9: { label: '16:9 横幅', name: '16:9 横幅主图', dimensions: '1600x900' },
  main_9_16: { label: '9:16 竖版', name: '9:16 竖版长图', dimensions: '900x1600' },
  detail: { label: '详情长图', name: '详情页长图', dimensions: '750x1500' },
};

function newImageItem(index: number): OrderImageRequirementImageItem {
  return {
    id: `create_image_${Date.now()}_${index}`,
    materialImage: '',
    description: '',
    referenceImages: [],
    referenceLinks: [''],
  };
}

function newGroup(index: number, groupType: ImageGroupType = 'main_1_1', name = groupMeta[groupType].name, quantity = 1): OrderImageRequirementItem {
  const meta = groupMeta[groupType];
  const imageItems = Array.from({ length: Math.max(1, quantity) }, (_, imageIndex) => newImageItem(index * 100 + imageIndex));
  return {
    id: 'create_group_' + Date.now() + '_' + index,
    name: name.trim() || meta.name,
    groupType,
    quantity: imageItems.length,
    dimensions: meta.dimensions,
    imageItems,
    materialImages: [],
    description: '',
    referenceImages: [],
    referenceLinks: [''],
  };
}

function defaultGroups() {
  return [newGroup(0), newGroup(1, 'main_3_4')];
}
type FormField = 'name' | 'materialImage' | 'description';

type OrderForm = {
  title: string;
  category: string;
  platform: PlatformType;
  budget: string;
  deadlineDays: string;
  urgency: 'normal' | 'urgent' | 'super_urgent';
  reviewRuleId: string;
  requirements: string;
  groups: OrderImageRequirementItem[];
};

function formFromOrder(order?: DesignOrder | null, reviewRuleId = ''): OrderForm {
  let groups = order?.imageRequirementGroups?.length
    ? order.imageRequirementGroups.map((group, index) => {
        const groupType = group.groupType || 'main_1_1';
        const meta = groupMeta[groupType];
        const legacyImages = group.materialImages?.length ? group.materialImages : [''];
        const imageItems = group.imageItems?.length
          ? group.imageItems.map((item, imageIndex) => ({
              ...item,
              id: item.id || `${group.id || `edit_group_${index}`}_image_${imageIndex}`,
              materialImage: item.materialImage || '',
              description: item.description || '',
              referenceImages: [],
              referenceLinks: item.referenceLinks?.length ? [...item.referenceLinks] : [''],
            }))
          : legacyImages.map((materialImage, imageIndex) => ({
              id: `${group.id || `edit_group_${index}`}_image_${imageIndex}`,
              materialImage,
              description: imageIndex === 0 ? group.description || '' : '',
              referenceImages: [],
              referenceLinks: imageIndex === 0 && group.referenceLinks?.length ? [...group.referenceLinks] : [''],
            }));
        return {
          ...group,
          id: group.id || `edit_group_${Date.now()}_${index}`,
          name: group.name || meta.name,
          groupType,
          quantity: group.quantity || 1,
          dimensions: group.dimensions || meta.dimensions,
          materialImages: imageItems.map((item) => item.materialImage).filter((url): url is string => Boolean(url)),
          description: group.description || '',
          imageItems,
          referenceImages: [],
          referenceLinks: group.referenceLinks?.length ? [...group.referenceLinks] : [''],
        };
      })
    : defaultGroups();
  const remainingDays = order ? Math.max(1, Math.ceil((new Date(order.deadline).getTime() - Date.now()) / 86400000)) : 3;
  return {
    title: order?.title || '',
    category: order?.category || '主图设计',
    platform: order?.platform || 'tmall',
    budget: order ? String(order.budget) : '',
    deadlineDays: String(remainingDays),
    urgency: order?.urgency || 'normal',
    reviewRuleId: order?.reviewRuleId || reviewRuleId,
    requirements: order?.requirements || '',
    groups,
  };
}

export function CreateOrderDialog({ open, onOpenChange, onCreated, onUpdated, editingOrder, fullscreen = false }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (order: DesignOrder) => void;
  onUpdated?: (order: DesignOrder) => void;
  editingOrder?: DesignOrder | null;
  fullscreen?: boolean;
}) {
  const initialGroups = defaultGroups();
  const user = useCurrentUser();
  const [rules, setRules] = useState<ReviewRule[]>([]);
  const [imageTemplates, setImageTemplates] = useState<ImageTemplate[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<OrderForm>(() => formFromOrder());
  const [activeGroupId, setActiveGroupId] = useState(initialGroups[0].id);
  const [groupCreatorOpen, setGroupCreatorOpen] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [groupDraft, setGroupDraft] = useState({ type: 'main_1_1' as ImageGroupType, name: groupMeta.main_1_1.name });
  const [groupErrors, setGroupErrors] = useState<Record<string, FormField[]>>({});

  useEffect(() => {
    if (!user || user.role !== 'advertiser') return;
    fetchWithAuth('/review-rules/mine')
      .then((response) => response.json())
      .then((result) => {
        const nextRules = result.success ? result.data || [] : [];
        setRules(nextRules);
        const defaultRule = nextRules.find((rule: ReviewRule) => rule.ownerId === user.id && rule.name === '自己审核') || nextRules[0];
        if (defaultRule) setForm((current) => ({ ...current, reviewRuleId: current.reviewRuleId || defaultRule.id }));
      })
      .catch(() => setRules([]));
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    fetchWithAuth('/system-config/image-templates')
      .then((response) => response.json())
      .then((result) => setImageTemplates(result.success && Array.isArray(result.data) ? result.data : []))
      .catch(() => setImageTemplates([]));
  }, [user?.id]);

  useEffect(() => {
    if (!open) return;
    const defaultRule = rules.find((rule) => rule.ownerId === user?.id && rule.name === '自己审核') || rules[0];
    const nextForm = formFromOrder(editingOrder, defaultRule?.id);
    setForm(nextForm);
    setActiveGroupId(nextForm.groups[0].id);
    setGroupErrors({});
  }, [open, editingOrder?.id]);

  const updateGroup = (index: number, patch: Partial<OrderImageRequirementItem>) => {
    setForm((current) => ({ ...current, groups: current.groups.map((group, groupIndex) => groupIndex === index ? { ...group, ...patch } : group) }));
    const groupId = form.groups[index]?.id;
    if (!groupId) return;
    setGroupErrors((current) => {
      const next = { ...current };
      const errors = [...(next[groupId] || [])];
      if (patch.name !== undefined && String(patch.name).trim()) next[groupId] = errors.filter((field) => field !== 'name');
      if (next[groupId]?.length === 0) delete next[groupId];
      return next;
    });
  };

  const updateImage = (groupIndex: number, imageIndex: number, patch: Partial<OrderImageRequirementImageItem>) => {
    const imageId = form.groups[groupIndex]?.imageItems?.[imageIndex]?.id;
    setForm((current) => ({ ...current, groups: current.groups.map((group, currentGroupIndex) => {
      if (currentGroupIndex !== groupIndex) return group;
      const imageItems = (group.imageItems || []).map((item, currentImageIndex) => currentImageIndex === imageIndex ? { ...item, ...patch } : item);
      return { ...group, imageItems, materialImages: imageItems.map((item) => item.materialImage).filter((url): url is string => Boolean(url)) };
    }) }));
    if (!imageId) return;
    setGroupErrors((current) => {
      const next = { ...current };
      const errors = [...(next[imageId] || [])];
      if (patch.materialImage !== undefined && String(patch.materialImage).trim()) next[imageId] = errors.filter((field) => field !== 'materialImage');
      if (patch.description !== undefined && String(patch.description).trim()) next[imageId] = (next[imageId] || errors).filter((field) => field !== 'description');
      if (next[imageId]?.length === 0) delete next[imageId];
      return next;
    });
  };

  const addImage = (groupIndex: number) => {
    setForm((current) => ({ ...current, groups: current.groups.map((group, index) => {
      if (index !== groupIndex) return group;
      const imageItems = [...(group.imageItems || []), newImageItem((group.imageItems || []).length)];
      return { ...group, imageItems, materialImages: imageItems.map((item) => item.materialImage).filter((url): url is string => Boolean(url)) };
    }) }));
  };

  const removeImage = (groupIndex: number, imageId: string) => {
    const imageItems = form.groups[groupIndex]?.imageItems || [];
    if (imageItems.length === 1) return;
    setForm((current) => ({ ...current, groups: current.groups.map((group, index) => {
      if (index !== groupIndex) return group;
      const nextItems = (group.imageItems || []).filter((item) => item.id !== imageId);
      return { ...group, imageItems: nextItems, materialImages: nextItems.map((item) => item.materialImage).filter((url): url is string => Boolean(url)) };
    }) }));
    setGroupErrors((current) => { const next = { ...current }; delete next[imageId]; return next; });
  };

  const addGroup = () => {
    const group = newGroup(form.groups.length, groupDraft.type, groupDraft.name);
    setForm({ ...form, groups: [...form.groups, group] });
    setActiveGroupId(group.id);
    setGroupCreatorOpen(false);
    setGroupDraft({ type: 'main_1_1', name: groupMeta.main_1_1.name });
  };

  const addTemplateGroups = () => {
    const template = imageTemplates.find((item) => item.id === selectedTemplateId);
    if (!template) return toast.error('请选择图片模板');
    const groups = template.groups.map((group, index) => newGroup(form.groups.length + index, group.groupType, group.name || groupMeta[group.groupType].name, group.quantity));
    if (!groups.length) return toast.error('该模板暂无可添加的图片分组');
    setForm({ ...form, groups: [...form.groups, ...groups] });
    setActiveGroupId(groups[0].id);
    setSelectedTemplateId('');
    setGroupCreatorOpen(false);
    toast.success(`已添加「${template.name}」的 ${groups.length} 个图片分组`);
  };

  const removeGroup = (groupId: string) => {
    if (form.groups.length === 1) return;
    const groups = form.groups.filter((group) => group.id !== groupId);
    setForm({ ...form, groups });
    setGroupErrors((current) => { const next = { ...current }; delete next[groupId]; return next; });
    if (activeGroupId === groupId) setActiveGroupId(groups[0].id);
  };

  const reset = () => {
    const nextForm = formFromOrder(null, rules[0]?.id);
    setForm(nextForm);
    setActiveGroupId(nextForm.groups[0].id);
    setGroupErrors({});
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.budget) return toast.error('请填写需求标题和预算金额');
    if (!form.reviewRuleId) return toast.error('请先配置并选择作品审核流');
    const errors = form.groups.reduce<Record<string, FormField[]>>((result, group) => {
      const missing: FormField[] = [];
      if (!group.name.trim()) missing.push('name');
      if (missing.length) result[group.id] = missing;
      (group.imageItems || []).forEach((image) => {
        const imageMissing: FormField[] = [];
        if (!image.materialImage?.trim()) imageMissing.push('materialImage');
        if (!image.description?.trim()) imageMissing.push('description');
        if (imageMissing.length) result[image.id] = imageMissing;
      });
      return result;
    }, {});
    setGroupErrors(errors);
    const firstInvalidGroup = form.groups.find((group) => errors[group.id] || group.imageItems?.some((image) => errors[image.id]));
    if (firstInvalidGroup) {
      setActiveGroupId(firstInvalidGroup.id);
      toast.error('请完善当前分组内每张图片的必填项');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        category: form.category,
        platform: form.platform,
        budget: Number(form.budget),
        urgency: form.urgency,
        deadline: new Date(Date.now() + Number(form.deadlineDays) * 86400000).toISOString(),
        requirements: form.requirements,
        reviewRuleId: form.reviewRuleId,
        reviewRuleName: rules.find((rule) => rule.id === form.reviewRuleId)?.name,
        imageRequirementGroups: form.groups.map((group) => {
          const imageItems = (group.imageItems || []).map((image, index) => ({
            ...image,
            referenceImages: [],
            referenceImageItems: [],
            referenceLinks: (image.referenceLinks || []).filter(Boolean),
          }));
          return {
            ...group,
            imageItems,
            quantity: imageItems.length,
            materialImages: imageItems.map((image) => image.materialImage).filter((url): url is string => Boolean(url)),
            description: imageItems.map((image, imageIndex) => image.description ? `第${imageIndex + 1}张：${image.description}` : '').filter(Boolean).join('\n'),
            referenceImages: [],
            referenceImageItems: [],
            referenceLinks: imageItems.flatMap((image) => image.referenceLinks || []),
          };
        }),
        referenceImages: [],
      };
      const editing = Boolean(editingOrder);
      const response = await fetchWithAuth(editing ? `/design-orders/${editingOrder!.id}` : '/design-orders', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...payload,
          ...(!editing ? { creatorId: user?.id, creatorName: user?.name } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || (editing ? '保存失败' : '创建失败'));
      toast.success(editing ? '订单已更新，图片需求已同步' : '订单已创建，请继续支付定金');
      onOpenChange(false);
      reset();
      if (editing) onUpdated?.(result.data);
      else onCreated(result.data);
    } catch (error: any) {
      toast.error(error.message || '创建失败');
    } finally {
      setSubmitting(false);
    }
  };

  const title = editingOrder ? '编辑设计订单' : '新增设计订单';
  const formBody = (
        <form onSubmit={submit} className="min-w-0 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="order-title" className="text-xs text-slate-600">订单标题</Label>
            <Input id="order-title" required placeholder="例如：春季新品主图设计" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="h-9 rounded-xl bg-slate-50/70 text-xs" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldLabel label="设计类型"><Select.Root value={form.category} onValueChange={(category) => setForm({ ...form, category })}><Select.Trigger className={formSelectTriggerClass}><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 role-primary-text" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className={selectContentClass}><Select.Viewport>{categories.map((category) => <Select.Item key={category} value={category} className={selectItemClass}><Select.ItemText>{category}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root></FieldLabel>
            <FieldLabel label="投放平台"><Select.Root value={form.platform} onValueChange={(platform) => setForm({ ...form, platform: platform as PlatformType })}><Select.Trigger className={formSelectTriggerClass}><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 role-primary-text" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className={selectContentClass}><Select.Viewport>{platforms.map((platform) => <Select.Item key={platform.id} value={platform.id} className={selectItemClass}><Select.ItemText>{platform.label}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root></FieldLabel>
            <FieldLabel label="订单预算（元）"><Input required type="number" min="0.01" step="0.01" placeholder="请输入预算金额" value={form.budget} onChange={(event) => setForm({ ...form, budget: event.target.value })} className="h-9 rounded-xl bg-slate-50/70 text-xs" /></FieldLabel>
            <FieldLabel label="期望交付"><Select.Root value={form.deadlineDays} onValueChange={(deadlineDays) => setForm({ ...form, deadlineDays })}><Select.Trigger className={formSelectTriggerClass}><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 role-primary-text" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className={selectContentClass}><Select.Viewport><Select.Item value="1" className={selectItemClass}><Select.ItemText>24 小时交付</Select.ItemText></Select.Item><Select.Item value="2" className={selectItemClass}><Select.ItemText>2 天交付</Select.ItemText></Select.Item><Select.Item value="3" className={selectItemClass}><Select.ItemText>3 天交付</Select.ItemText></Select.Item><Select.Item value="5" className={selectItemClass}><Select.ItemText>5 天交付</Select.ItemText></Select.Item></Select.Viewport></Select.Content></Select.Portal></Select.Root></FieldLabel>
            <FieldLabel label="订单优先级"><Select.Root value={form.urgency} onValueChange={(urgency) => setForm({ ...form, urgency: urgency as typeof form.urgency })}><Select.Trigger className={formSelectTriggerClass}><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 role-primary-text" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className={selectContentClass}><Select.Viewport><Select.Item value="normal" className={selectItemClass}><Select.ItemText>标准单</Select.ItemText></Select.Item><Select.Item value="urgent" className={selectItemClass}><Select.ItemText>加急单</Select.ItemText></Select.Item><Select.Item value="super_urgent" className={selectItemClass}><Select.ItemText>特急单</Select.ItemText></Select.Item></Select.Viewport></Select.Content></Select.Portal></Select.Root></FieldLabel>
            <FieldLabel label="作品审核流"><Select.Root value={form.reviewRuleId || undefined} onValueChange={(reviewRuleId) => setForm({ ...form, reviewRuleId })}><Select.Trigger className={formSelectTriggerClass}><Select.Value placeholder="选择作品审核流" /><Select.Icon><ChevronDown className="h-4 w-4 role-primary-text" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className={selectContentClass}><Select.Viewport>{rules.map((rule) => <Select.Item key={rule.id} value={rule.id} className={selectItemClass}><Select.ItemText>{rule.name}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root></FieldLabel>
          </div>

          <Tabs value={activeGroupId} onValueChange={setActiveGroupId} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/60 p-2">
            <div className="flex min-w-0 items-stretch justify-between gap-2 border-b border-slate-200">
              <TabsList className="inline-flex min-h-12 w-fit max-w-[calc(100%_-_188px)] flex-none items-stretch justify-start gap-0 overflow-x-auto rounded-none bg-transparent p-0">
                {form.groups.map((group, index) => {
                  const hasErrors = Boolean(groupErrors[group.id]?.length || group.imageItems?.some((image) => groupErrors[image.id]?.length));
                  return <div key={group.id} className="group/tab relative shrink-0">
                    <TabsTrigger value={group.id} className={`min-w-[148px] rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-1.5 pr-8 text-left text-xs text-slate-500 shadow-none data-[state=active]:bg-[var(--role-primary-soft)] data-[state=active]:text-[var(--role-primary)] ${hasErrors ? 'text-rose-600 data-[state=active]:border-rose-300' : 'data-[state=active]:border-[var(--role-primary)]'}`}>
                      <span className="flex items-center gap-2"><span className="order-form-accent flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-100 data-[state=active]:bg-white">{group.groupType === 'main_1_1' ? <LayoutGrid className="h-3.5 w-3.5" /> : group.groupType === 'main_3_4' ? <Layers className="h-3.5 w-3.5" /> : group.groupType === 'detail' ? <Sparkles className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}</span><span className="min-w-0"><span className="block truncate font-semibold">{index + 1}. {group.name}</span><span className="mt-0.5 block truncate text-[10px] opacity-70">({group.imageItems?.length || 0}张 · {group.dimensions})</span></span></span>
                    </TabsTrigger>
                    {form.groups.length > 1 && <ConfirmAction title="确认移除图片分组？" description={`将删除「${group.name}」及其全部图片需求，此操作不可撤销。`} confirmText="确认移除" onConfirm={() => removeGroup(group.id)}>
                      <Button type="button" variant="ghost" size="icon" aria-label={`移除${group.name}`} className="absolute right-1 top-1 h-6 w-6 text-slate-400 opacity-0 transition-opacity hover:text-rose-500 group-hover/tab:opacity-100 focus-visible:opacity-100"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </ConfirmAction>}
                  </div>;
                })}
              </TabsList>
              <Popover open={groupCreatorOpen} onOpenChange={setGroupCreatorOpen}>
                <PopoverTrigger asChild><Button type="button" className="order-form-add h-12 min-w-[180px] shrink-0 rounded-lg border px-4 text-xs font-semibold shadow-none" aria-label="新增图片需求组"><Plus className="h-4 w-4" />添加新款式 SKU</Button></PopoverTrigger>
                <PopoverContent align="end" className="w-72 rounded-xl border-slate-200 bg-white p-3">
                  <div className="space-y-3">
                    <div><p className="text-sm font-semibold text-slate-800">新增图片需求组</p><p className="mt-1 text-[11px] text-slate-500">可套用模板，或手动新增单个分组</p></div>
                    {imageTemplates.length > 0 && <>
                      <div className="space-y-1.5"><Label className="text-[11px] text-slate-600">图片模板</Label><Select.Root value={selectedTemplateId} onValueChange={setSelectedTemplateId}><Select.Trigger className={formSelectTriggerClass}><Select.Value placeholder="选择已配置的图片模板" /><Select.Icon><ChevronDown className="h-4 w-4 role-primary-text" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className={selectContentClass}><Select.Viewport>{imageTemplates.map((template) => <Select.Item key={template.id} value={template.id} className={selectItemClass}><Select.ItemText>{template.name}（{template.groups.length} 组）</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root></div>
                      <Button type="button" disabled={!selectedTemplateId} onClick={addTemplateGroups} className="order-form-primary h-9 w-full rounded-xl text-xs">一键添加模板分组</Button>
                      <div className="relative py-0.5 text-center text-[10px] text-slate-400 before:absolute before:left-0 before:right-0 before:top-1/2 before:border-t before:border-slate-100"><span className="relative bg-white px-2">或手动新增</span></div>
                    </>}
                    <div className="space-y-1.5"><Label className="text-[11px] text-slate-600">图片比例</Label><Select.Root value={groupDraft.type} onValueChange={(type) => { const nextType = type as ImageGroupType; setGroupDraft({ type: nextType, name: groupMeta[nextType].name }); }}><Select.Trigger className={formSelectTriggerClass}><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 role-primary-text" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className={selectContentClass}><Select.Viewport>{groupTypes.map((type) => <Select.Item key={type} value={type} className={selectItemClass}><Select.ItemText>{groupMeta[type].label}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root></div>
                    <div className="space-y-1.5"><Label htmlFor="new-group-name" className="text-[11px] text-slate-600">分组名称</Label><Input id="new-group-name" value={groupDraft.name} onChange={(event) => setGroupDraft({ ...groupDraft, name: event.target.value })} placeholder="例如：首页第一屏" className="h-9 rounded-xl text-xs" /></div>
                    <Button type="button" onClick={addGroup} className="order-form-primary h-9 w-full rounded-xl text-xs">新增分组</Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            {form.groups.map((group, groupIndex) => (
              <TabsContent key={group.id} value={group.id} className="mt-3 min-w-0 space-y-3">
                {(group.imageItems || []).map((image, imageIndex) => {
                  const imageErrors = groupErrors[image.id] || [];
                  return <div key={image.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                      <div className="flex items-center gap-2"><span className="h-4 w-1 rounded-full bg-[var(--role-primary)]" /><span className="text-sm font-semibold text-slate-800">第 {imageIndex + 1} 张</span><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{group.dimensions}</span></div>
                      <Button type="button" variant="ghost" size="icon" disabled={(group.imageItems || []).length === 1} onClick={() => removeImage(groupIndex, image.id)} className="h-7 w-7 text-slate-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                    <div className="space-y-4 p-4">
                      <div className="grid gap-3 sm:grid-cols-[92px_minmax(0,1fr)]">
                        <div className={`flex items-center gap-1 pt-2 text-xs font-medium ${imageErrors.includes('materialImage') ? 'text-rose-600' : 'text-slate-600'}`}><span>素材原图 <span className="text-rose-500">*</span></span><Tooltip><TooltipTrigger asChild><button type="button" aria-label="素材原图说明" className="text-slate-400 transition-colors hover:text-[var(--role-primary)]"><CircleHelp className="h-3.5 w-3.5" /></button></TooltipTrigger><TooltipContent side="top" sideOffset={6} className="max-w-64 bg-slate-800 text-xs leading-5 text-white"><p>背景干净整洁，尽量提供高分辨率白底/实拍。</p><p>建议尺寸：800×800，支持 JPG、PNG 格式。</p></TooltipContent></Tooltip></div>
                        <div className={`min-w-0 ${imageErrors.includes('materialImage') ? 'rounded-xl ring-1 ring-rose-400 ring-offset-2' : ''}`}>
                          <ImageUpload value={image.materialImage ? [image.materialImage] : []} onChange={(urls) => updateImage(groupIndex, imageIndex, { materialImage: urls[0] || '' })} folder="order-materials" multiple={false} variant="square" />
                          {imageErrors.includes('materialImage') && <p className="mt-1 text-[10px] text-rose-600">请上传素材原图</p>}
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[92px_minmax(0,1fr)]">
                        <Label className={`pt-2 text-xs ${imageErrors.includes('description') ? 'text-rose-600' : 'text-slate-600'}`}>设计要点 <span className="text-rose-500">*</span></Label>
                        <div className="space-y-1.5">
                          <Textarea value={image.description || ''} onChange={(event) => updateImage(groupIndex, imageIndex, { description: event.target.value })} placeholder="请描述画面重点、文案层级、构图和风格要求" rows={4} aria-invalid={imageErrors.includes('description')} className={`min-h-24 rounded-xl bg-slate-50/70 text-xs leading-5 ${imageErrors.includes('description') ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15' : ''}`} />
                          {imageErrors.includes('description') && <p className="text-[10px] text-rose-600">请填写设计要点</p>}
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-3 border-t border-slate-100 px-4 py-4 sm:grid-cols-[92px_minmax(0,1fr)]">
                      <div className="pt-1"><div className="flex items-center gap-1"><span className="text-xs font-medium text-slate-600">竞品参考</span><Tooltip><TooltipTrigger asChild><button type="button" aria-label="竞品参考说明" className="text-slate-400 transition-colors hover:text-[var(--role-primary)]"><CircleHelp className="h-3.5 w-3.5" /></button></TooltipTrigger><TooltipContent side="top" sideOffset={6} className="max-w-56 bg-slate-800 text-xs leading-5 text-white">可添加外部链接作为设计参考。</TooltipContent></Tooltip></div></div>
                      <div className="min-w-0"><div className="mb-2 flex justify-end"><Button type="button" variant="outline" onClick={() => updateImage(groupIndex, imageIndex, { referenceLinks: [...(image.referenceLinks || []), ''] })} className="h-8 rounded-lg border-[var(--role-primary-border)] text-[11px] text-[var(--role-primary)] hover:bg-[var(--role-primary-soft)]"><Plus className="mr-1 h-3.5 w-3.5" />添加参考链接</Button></div><div className="space-y-2">{(image.referenceLinks || []).map((link, linkIndex) => <div key={`${image.id}-link-${linkIndex}`} className="flex min-w-0 gap-2"><Input type="text" value={link} onChange={(event) => { const links = [...(image.referenceLinks || [])]; links[linkIndex] = event.target.value; updateImage(groupIndex, imageIndex, { referenceLinks: links }); }} placeholder="输入参考链接或商品地址" className="h-8 min-w-0 rounded-lg text-xs" /><Button type="button" variant="ghost" size="icon" onClick={() => updateImage(groupIndex, imageIndex, { referenceLinks: (image.referenceLinks || []).filter((_, currentIndex) => currentIndex !== linkIndex) })} className="h-8 w-8 shrink-0 text-slate-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div></div>
                    </div>
                  </div>;
                })}
                <Button type="button" variant="outline" onClick={() => addImage(groupIndex)} className="h-10 w-full rounded-xl border-dashed border-[var(--role-primary-border)] text-xs text-[var(--role-primary)] hover:bg-[var(--role-primary-soft)]"><Plus className="mr-1.5 h-4 w-4" />添加图片</Button>
              </TabsContent>
            ))}
          </Tabs>

          <div className="space-y-1.5">
            <Label htmlFor="order-requirements" className="text-xs text-slate-600">整体需求说明</Label>
            <Textarea id="order-requirements" rows={3} placeholder="补充整体设计要求、品牌调性和交付说明" value={form.requirements} onChange={(event) => setForm({ ...form, requirements: event.target.value })} className="rounded-xl bg-slate-50/70 text-xs" />
          </div>
          <DrawerFooter className="flex-row justify-end p-0 pt-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl text-xs">取消</Button>
            <Button type="submit" disabled={submitting} className="order-form-primary rounded-xl text-xs text-white">{submitting ? '保存中…' : editingOrder ? '保存修改' : '提交需求'}</Button>
          </DrawerFooter>
        </form>
  );

  if (fullscreen) {
    return <main className="order-form-theme min-h-screen bg-slate-50 px-4 py-5 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-center gap-3 border-b border-slate-200 pb-4">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-9 rounded-xl px-2 text-xs text-slate-500 hover:text-slate-800"><ArrowLeft className="mr-1.5 h-4 w-4" />返回订单管理</Button>
          <div className="h-5 w-px bg-slate-200" />
          <h1 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Layers className="h-5 w-5 order-form-accent" />{title}</h1>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:p-9">{formBody}</div>
      </div>
    </main>;
  }

  return <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
    <DrawerContent className="order-form-theme h-full max-h-full max-w-[calc(100vw-2rem)] overflow-x-hidden overflow-y-auto rounded-l-3xl bg-white p-5 [--drawer-width:52rem]">
      <DrawerHeader className="p-0 pb-4"><DrawerTitle className="flex items-center gap-2 text-base font-bold text-slate-800"><Layers className="h-5 w-5 order-form-accent" />{title}</DrawerTitle></DrawerHeader>
      {formBody}
    </DrawerContent>
  </Drawer>;
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs text-slate-600">{label}</Label>{children}</div>;
}
