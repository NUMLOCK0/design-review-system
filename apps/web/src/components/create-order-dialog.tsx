'use client';

import { useEffect, useState } from 'react';
import * as Select from '@radix-ui/react-select';
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, CircleHelp, Layers, LayoutGrid, MessageCircle, Plus, Sparkles, Trash2 } from 'lucide-react';
import { calculateImageRequirementsMinimumPrice, calculateOrderMinimumBudget } from '@design-review/shared';
import type { DesignOrder, ImageGroupType, ImageTemplate, OrderImageRequirementImageItem, OrderImageRequirementItem, OrderReferenceLinkItem, PlatformType, ReviewRule } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { useCurrentUser } from '@/hooks/use-current-user';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImageUpload } from '@/components/image-upload';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Modal, ModalContent, ModalHeader, ModalFooter } from '@/components/ui/modal';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
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
    referenceLinkItems: [newReferenceLinkItem(0)],
  };
}

function newReferenceLinkItem(index: number): OrderReferenceLinkItem {
  return { id: `create_reference_${Date.now()}_${index}`, image: '', link: '', description: '' };
}

function referenceLinkItemsFromLegacy(item: Pick<OrderImageRequirementImageItem, 'referenceLinkItems' | 'referenceImages' | 'referenceLinks' | 'referenceLinkDescription'>, prefix: string) {
  if (item.referenceLinkItems?.some((reference) => reference.image || reference.link || reference.description)) return item.referenceLinkItems.map((reference, index) => ({ ...reference, id: reference.id || `${prefix}_reference_${index}` }));
  const images = item.referenceImages || [];
  const links = item.referenceLinks || [];
  const count = Math.max(images.length, links.length, 1);
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}_reference_${index}`,
    image: images[index] || '',
    link: links[index] || '',
    description: index === 0 ? item.referenceLinkDescription || '' : '',
  }));
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
type FormField = 'name' | 'description';

type OrderForm = {
  title: string;
  category: string;
  platform: PlatformType;
  budget: string;
  deadlineDays: string;
  urgency: 'normal' | 'urgent' | 'super_urgent';
  reviewRuleId: string;
  requirements: string;
  requiresPsd: boolean;
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
              referenceImages: item.referenceImages?.length ? [...item.referenceImages] : (imageIndex === 0 ? [...(group.referenceImages || [])] : []),
              referenceLinks: item.referenceLinks?.length ? [...item.referenceLinks] : [''],
              referenceLinkItems: referenceLinkItemsFromLegacy(item, `${group.id || `edit_group_${index}`}_image_${imageIndex}`),
            }))
          : legacyImages.map((materialImage, imageIndex) => ({
              id: `${group.id || `edit_group_${index}`}_image_${imageIndex}`,
              materialImage,
              description: imageIndex === 0 ? group.description || '' : '',
              referenceImages: imageIndex === 0 ? [...(group.referenceImages || [])] : [],
              referenceLinks: imageIndex === 0 && group.referenceLinks?.length ? [...group.referenceLinks] : [''],
              referenceLinkItems: referenceLinkItemsFromLegacy({
                referenceImages: imageIndex === 0 ? group.referenceImages : [],
                referenceLinks: imageIndex === 0 ? group.referenceLinks : [],
              }, `${group.id || `edit_group_${index}`}_image_${imageIndex}`),
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
          referenceImages: imageItems.flatMap((item) => item.referenceImages || []),
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
    requiresPsd: Boolean(order?.requiresPsd),
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
  const [step, setStep] = useState(1);
  const [pricing, setPricing] = useState({ imageUnitPrice: 100, imageUnitPrices: {} as Partial<Record<ImageGroupType, number>>, minOrderBudget: null as number | null, psdSurchargeRate: 0.2, customerService: null as { name: string; wechat: string; qrCodeUrl: string } | null });
  const [qrPreviewOpen, setQrPreviewOpen] = useState(false);

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
    if (!user || user.role !== 'advertiser') return;
    fetchWithAuth('/system-config/order-pricing')
      .then((response) => response.json())
      .then((result) => {
        if (result.success && result.data) {
          setPricing({ imageUnitPrice: Number(result.data.imageUnitPrice) || 0, imageUnitPrices: result.data.imageUnitPrices || {}, minOrderBudget: Number.isFinite(Number(result.data.minOrderBudget)) ? Number(result.data.minOrderBudget) : null, psdSurchargeRate: Number.isFinite(Number(result.data.psdSurchargeRate)) ? Number(result.data.psdSurchargeRate) : 0.2, customerService: result.data.customerService || null });
        }
      })
      .catch(() => undefined);
  }, [user?.id]);

  useEffect(() => {
    if (!open) return;
    const defaultRule = rules.find((rule) => rule.ownerId === user?.id && rule.name === '自己审核') || rules[0];
    const nextForm = formFromOrder(editingOrder, defaultRule?.id);
    setForm(nextForm);
    setActiveGroupId(nextForm.groups[0].id);
    setGroupErrors({});
    setStep(1);
  }, [open, editingOrder?.id]);

  const imageCount = form.groups.reduce((total, group) => total + (group.imageItems?.length || 0), 0);
  const recommendedPrice = calculateImageRequirementsMinimumPrice(form.groups, pricing.imageUnitPrices, pricing.imageUnitPrice);
  const minimumBudget = pricing.minOrderBudget;
  const minimumBid = minimumBudget === null ? null : calculateOrderMinimumBudget(form.groups, pricing.imageUnitPrices, minimumBudget, form.requiresPsd, pricing.psdSurchargeRate, pricing.imageUnitPrice);

  const updatePsdRequirement = (requiresPsd: boolean) => {
    setForm((current) => {
      const nextMinimum = minimumBudget === null ? null : calculateOrderMinimumBudget(current.groups, pricing.imageUnitPrices, minimumBudget, requiresPsd, pricing.psdSurchargeRate, pricing.imageUnitPrice);
      const nextBudget = current.budget.trim() && nextMinimum !== null && Number(current.budget) < nextMinimum ? String(nextMinimum) : current.budget;
      return { ...current, requiresPsd, budget: nextBudget };
    });
  };

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
      if (patch.description !== undefined && String(patch.description).trim()) next[imageId] = (next[imageId] || errors).filter((field) => field !== 'description');
      if (next[imageId]?.length === 0) delete next[imageId];
      return next;
    });
  };

  const updateReferenceLinkItem = (groupIndex: number, imageIndex: number, referenceIndex: number, patch: Partial<OrderReferenceLinkItem>) => {
    const image = form.groups[groupIndex]?.imageItems?.[imageIndex];
    const referenceLinkItems = [...(image?.referenceLinkItems || [])];
    referenceLinkItems[referenceIndex] = { ...referenceLinkItems[referenceIndex], ...patch };
    updateImage(groupIndex, imageIndex, { referenceLinkItems });
  };

  const addReferenceLinkItem = (groupIndex: number, imageIndex: number) => {
    const image = form.groups[groupIndex]?.imageItems?.[imageIndex];
    updateImage(groupIndex, imageIndex, { referenceLinkItems: [...(image?.referenceLinkItems || []), newReferenceLinkItem(image?.referenceLinkItems?.length || 0)] });
  };

  const removeReferenceLinkItem = (groupIndex: number, imageIndex: number, referenceIndex: number) => {
    const image = form.groups[groupIndex]?.imageItems?.[imageIndex];
    const referenceLinkItems = (image?.referenceLinkItems || []).filter((_, index) => index !== referenceIndex);
    updateImage(groupIndex, imageIndex, { referenceLinkItems: referenceLinkItems.length ? referenceLinkItems : [newReferenceLinkItem(0)] });
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
    setStep(1);
  };

  const validateRequirements = () => {
    if (!form.title.trim()) {
      toast.error('请填写需求标题');
      return false;
    }
    if (!form.reviewRuleId) {
      toast.error('请先配置并选择作品审核流');
      return false;
    }
    const errors = form.groups.reduce<Record<string, FormField[]>>((result, group) => {
      const missing: FormField[] = [];
      if (!group.name.trim()) missing.push('name');
      if (missing.length) result[group.id] = missing;
      (group.imageItems || []).forEach((image) => {
        const imageMissing: FormField[] = [];
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
      return false;
    }
    return true;
  };

  const goToBid = () => {
    if (!validateRequirements()) return;
    if (!form.budget && minimumBid !== null) setForm((current) => ({ ...current, budget: String(minimumBid) }));
    setStep(2);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToContact = () => {
    if (minimumBid === null) return toast.error('正在加载订单规则，请稍后再试');
    if (!Number.isFinite(Number(form.budget)) || Number(form.budget) < minimumBid) return toast.error(`订单最低出价为 ${minimumBid} 元`);
    setStep(3);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const submit = async () => {
    if (!validateRequirements()) return;
    if (minimumBid === null) return toast.error('正在加载订单规则，请稍后再试');
    if (!Number.isFinite(Number(form.budget)) || Number(form.budget) < minimumBid) return toast.error(`订单最低出价为 ${minimumBid} 元`);
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
        requiresPsd: form.requiresPsd,
        reviewRuleId: form.reviewRuleId,
        reviewRuleName: rules.find((rule) => rule.id === form.reviewRuleId)?.name,
        imageRequirementGroups: form.groups.map((group) => {
          const imageItems = (group.imageItems || []).map((image, index) => ({
            ...image,
            referenceLinkItems: (image.referenceLinkItems || []).map((reference, referenceIndex) => ({
              ...reference,
              id: reference.id || `${image.id}-reference-${referenceIndex}`,
              image: reference.image?.trim() || '',
              link: reference.link?.trim() || '',
              description: reference.description?.trim() || '',
            })).filter((reference) => reference.image || reference.link || reference.description),
            referenceImages: (image.referenceLinkItems || []).map((reference) => reference.image?.trim() || '').filter(Boolean),
            referenceImageItems: [],
            referenceLinks: (image.referenceLinkItems || []).map((reference) => reference.link?.trim() || '').filter(Boolean),
          }));
          return {
            ...group,
            imageItems,
            quantity: imageItems.length,
            materialImages: imageItems.map((image) => image.materialImage).filter((url): url is string => Boolean(url)),
            description: imageItems.map((image, imageIndex) => image.description ? `第${imageIndex + 1}张：${image.description}` : '').filter(Boolean).join('\n'),
            referenceImages: imageItems.flatMap((image) => image.referenceImages || []),
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
      toast.success(editing ? '订单已更新，图片需求已同步' : '订单已创建，可先联系客户服务确认需求');
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
        <form onSubmit={(event) => { event.preventDefault(); if (step === 1) goToBid(); else if (step === 2) goToContact(); else void submit(); }} className="min-w-0 space-y-4">
          {step === 1 && <>
          <div className="space-y-1.5">
            <Label required htmlFor="order-title" className="text-xs text-slate-600">订单标题</Label>
            <Input id="order-title" required placeholder="例如：春季新品主图设计" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="h-9 rounded-xl bg-slate-50/70 text-xs" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldLabel label="设计类型"><Select.Root value={form.category} onValueChange={(category) => setForm({ ...form, category })}><Select.Trigger className={formSelectTriggerClass}><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 role-primary-text" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className={selectContentClass}><Select.Viewport>{categories.map((category) => <Select.Item key={category} value={category} className={selectItemClass}><Select.ItemText>{category}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root></FieldLabel>
            <FieldLabel label="投放平台"><Select.Root value={form.platform} onValueChange={(platform) => setForm({ ...form, platform: platform as PlatformType })}><Select.Trigger className={formSelectTriggerClass}><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 role-primary-text" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className={selectContentClass}><Select.Viewport>{platforms.map((platform) => <Select.Item key={platform.id} value={platform.id} className={selectItemClass}><Select.ItemText>{platform.label}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root></FieldLabel>
            <FieldLabel label="期望交付"><Select.Root value={form.deadlineDays} onValueChange={(deadlineDays) => setForm({ ...form, deadlineDays })}><Select.Trigger className={formSelectTriggerClass}><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 role-primary-text" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className={selectContentClass}><Select.Viewport><Select.Item value="1" className={selectItemClass}><Select.ItemText>24 小时交付</Select.ItemText></Select.Item><Select.Item value="2" className={selectItemClass}><Select.ItemText>2 天交付</Select.ItemText></Select.Item><Select.Item value="3" className={selectItemClass}><Select.ItemText>3 天交付</Select.ItemText></Select.Item><Select.Item value="5" className={selectItemClass}><Select.ItemText>5 天交付</Select.ItemText></Select.Item></Select.Viewport></Select.Content></Select.Portal></Select.Root></FieldLabel>
            <FieldLabel label="订单优先级"><Select.Root value={form.urgency} onValueChange={(urgency) => setForm({ ...form, urgency: urgency as typeof form.urgency })}><Select.Trigger className={formSelectTriggerClass}><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 role-primary-text" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className={selectContentClass}><Select.Viewport><Select.Item value="normal" className={selectItemClass}><Select.ItemText>标准单</Select.ItemText></Select.Item><Select.Item value="urgent" className={selectItemClass}><Select.ItemText>加急单</Select.ItemText></Select.Item><Select.Item value="super_urgent" className={selectItemClass}><Select.ItemText>特急单</Select.ItemText></Select.Item></Select.Viewport></Select.Content></Select.Portal></Select.Root></FieldLabel>
            <FieldLabel label="作品审核流"><Select.Root value={form.reviewRuleId || undefined} onValueChange={(reviewRuleId) => setForm({ ...form, reviewRuleId })}><Select.Trigger className={formSelectTriggerClass}><Select.Value placeholder="选择作品审核流" /><Select.Icon><ChevronDown className="h-4 w-4 role-primary-text" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className={selectContentClass}><Select.Viewport>{rules.map((rule) => <Select.Item key={rule.id} value={rule.id} className={selectItemClass}><Select.ItemText>{rule.name}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root></FieldLabel>
          </div>

          <div className={`flex items-center justify-between gap-4 rounded-2xl border p-4 transition-colors ${form.requiresPsd ? 'border-[var(--role-primary-border)] bg-[var(--role-primary-soft)]' : 'border-slate-200 bg-slate-50/70'}`}>
            <div className="min-w-0"><Label htmlFor="order-requires-psd" className={`cursor-pointer text-xs font-semibold ${form.requiresPsd ? 'text-[var(--role-primary)]' : 'text-slate-700'}`}>需要 PSD 源文件</Label><p className="mt-1 text-[11px] leading-5 text-slate-500">开启后，设计师需随最终交付上传源文件；最低出价上浮 {Math.round(pricing.psdSurchargeRate * 100)}%。</p></div>
            <div className="flex shrink-0 items-center gap-2.5">
              <span className={`text-[11px] font-medium ${form.requiresPsd ? 'text-[var(--role-primary)]' : 'text-slate-400'}`}>{form.requiresPsd ? '已开启' : '未开启'}</span>
              <Switch id="order-requires-psd" aria-label="需要 PSD 源文件" checked={form.requiresPsd} onCheckedChange={updatePsdRequirement} />
            </div>
          </div>

          <Tabs value={activeGroupId} onValueChange={setActiveGroupId} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/60 p-2">
            <div className="flex min-w-0 items-stretch justify-between gap-2 border-b border-slate-200">
              <TabsList className="inline-flex min-h-12 w-fit max-w-[calc(100%_-_188px)] flex-none items-stretch justify-start gap-0 overflow-x-auto rounded-none bg-transparent p-0">
                {form.groups.map((group, index) => {
                  const hasErrors = Boolean(groupErrors[group.id]?.length || group.imageItems?.some((image) => groupErrors[image.id]?.length));
                  return <div key={group.id} className="group/tab relative shrink-0">
                    <TabsTrigger value={group.id} className={`order-group-tab min-w-[148px] rounded-none border-0 border-b-2 border-transparent bg-transparent px-3 py-1.5 pr-8 text-left text-xs text-slate-500 shadow-none data-[state=active]:bg-[var(--role-primary-soft)] ${hasErrors ? 'order-group-tab-error' : ''}`}>
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
                      <div className="grid min-w-0 grid-cols-[92px_minmax(0,1fr)] gap-3">
                        <div className="flex items-start gap-1 pt-2 text-xs font-medium text-slate-600"><span>素材原图 <span className="font-normal text-slate-400">（选填）</span></span><Tooltip><TooltipTrigger asChild><button type="button" aria-label="素材原图说明" className="text-slate-400 transition-colors hover:text-[var(--role-primary)]"><CircleHelp className="h-3.5 w-3.5" /></button></TooltipTrigger><TooltipContent side="top" sideOffset={6} className="max-w-64 bg-slate-800 text-xs leading-5 text-white"><p>建议提供背景干净整洁的高分辨率白底/实拍图片。</p><p>建议尺寸：800×800，支持 JPG、PNG 格式。</p></TooltipContent></Tooltip></div>
                        <div className="min-w-0"><ImageUpload value={image.materialImage ? [image.materialImage] : []} onChange={(urls) => updateImage(groupIndex, imageIndex, { materialImage: urls[0] || '' })} folder="order-materials" multiple={false} variant="square" /></div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[92px_minmax(0,1fr)]">
                        <Label className={`self-start text-xs leading-5 ${imageErrors.includes('description') ? 'text-rose-600' : 'text-slate-600'}`}>设计要点 <span className="text-rose-500">*</span></Label>
                        <div className="space-y-1.5">
                          <Textarea value={image.description || ''} onChange={(event) => updateImage(groupIndex, imageIndex, { description: event.target.value })} placeholder="请描述画面重点、文案层级、构图和风格要求" rows={4} aria-invalid={imageErrors.includes('description')} className={`min-h-24 rounded-xl bg-slate-50/70 text-xs leading-5 ${imageErrors.includes('description') ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15' : ''}`} />
                          {imageErrors.includes('description') && <p className="text-[10px] text-rose-600">请填写设计要点</p>}
                        </div>
                      </div>
                    </div>
                    <div className="grid gap-2 border-t border-slate-100 px-4 py-3 sm:grid-cols-[92px_minmax(0,1fr)]">
                      <div className="pt-1"><div className="flex items-center gap-1"><span className="text-xs font-medium text-slate-600">竞品参考</span><Tooltip><TooltipTrigger asChild><button type="button" aria-label="竞品参考说明" className="text-slate-400 transition-colors hover:text-[var(--role-primary)]"><CircleHelp className="h-3.5 w-3.5" /></button></TooltipTrigger><TooltipContent side="top" sideOffset={6} className="max-w-56 bg-slate-800 text-xs leading-5 text-white">每个参考项包含一张参考图、一个链接和对应说明。</TooltipContent></Tooltip></div></div>
                      <div className="min-w-0 space-y-2">
                        {(image.referenceLinkItems || []).map((reference, referenceIndex) => <div key={reference.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
                          <div className="mb-2 flex items-center justify-between"><span className="text-[11px] font-semibold text-slate-600">参考项 {referenceIndex + 1}</span><Button type="button" variant="ghost" size="icon" onClick={() => removeReferenceLinkItem(groupIndex, imageIndex, referenceIndex)} className="h-6 w-6 text-slate-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></Button></div>
                          <div className="grid min-w-0 gap-3 sm:grid-cols-[144px_minmax(0,1fr)]">
                            <ImageUpload value={reference.image ? [reference.image] : []} onChange={(urls) => updateReferenceLinkItem(groupIndex, imageIndex, referenceIndex, { image: urls[0] || '' })} folder="order-reference-images" multiple={false} variant="square" compact />
                            <div className="min-w-0 space-y-2"><Input type="text" value={reference.link || ''} onChange={(event) => updateReferenceLinkItem(groupIndex, imageIndex, referenceIndex, { link: event.target.value })} placeholder="输入参考链接或商品地址" className="h-8 min-w-0 rounded-lg text-xs" /><Textarea value={reference.description || ''} onChange={(event) => updateReferenceLinkItem(groupIndex, imageIndex, referenceIndex, { description: event.target.value })} placeholder="输入该参考链接的说明" rows={2} className="min-h-14 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 !text-xs leading-4 text-slate-800 shadow-[inset_0_2px_4px_rgba(180,200,225,0.2)] placeholder:!text-xs placeholder:text-slate-400 placeholder:opacity-100 backdrop-blur-md transition-all duration-200 focus:bg-white focus:border-blue-300 focus:shadow-[0_0_0_3px_rgba(59,130,246,0.15),inset_0_1px_2px_rgba(255,255,255,0.9)] md:!text-xs" /></div>
                          </div>
                        </div>)}
                        <Button type="button" onClick={() => addReferenceLinkItem(groupIndex, imageIndex)} className="order-form-primary h-8 w-fit rounded-lg px-3 text-[11px] text-white"><Plus className="mr-1 h-3.5 w-3.5" />添加参考项</Button>
                      </div>
                    </div>
                  </div>;
                })}
                <Button type="button" onClick={() => addImage(groupIndex)} className="order-form-primary h-9 w-fit rounded-xl px-4 text-xs text-white"><Plus className="mr-1.5 h-4 w-4" />添加图片</Button>
              </TabsContent>
            ))}
          </Tabs>

          <div className="space-y-1.5">
            <Label htmlFor="order-requirements" className="text-xs text-slate-600">整体需求说明</Label>
            <Textarea id="order-requirements" rows={3} placeholder="补充整体设计要求、品牌调性和交付说明" value={form.requirements} onChange={(event) => setForm({ ...form, requirements: event.target.value })} className="rounded-xl bg-slate-50/70 text-xs" />
          </div>
          </>}

          {step === 2 && <div className="mx-auto max-w-2xl space-y-5 py-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
              <div className="flex items-start gap-3"><span className="order-form-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"><CircleDollarSign className="h-5 w-5" /></span><div><h2 className="text-base font-bold text-slate-800">填写本次出价</h2><p className="mt-1 text-xs leading-5 text-slate-500">已根据图片数量和管理员配置的推荐单价计算参考金额；此步骤仅填写出价，不会发起支付。</p></div></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-white p-4"><p className="text-xs text-slate-500">需求图片数量</p><p className="mt-2 text-2xl font-bold text-slate-800">{imageCount}<span className="ml-1 text-sm font-medium text-slate-400">张</span></p></div><div className="rounded-xl bg-white p-4"><p className="text-xs text-slate-500">当前最低出价{form.requiresPsd ? '（含 PSD）' : ''}</p><p className="mt-2 text-2xl font-bold role-primary-text">¥{(minimumBid ?? Math.max(minimumBudget || 0, recommendedPrice)).toFixed(2)}</p><p className="mt-1 text-[11px] text-slate-400">基础最低价 ¥{Math.max(minimumBudget || 0, recommendedPrice).toFixed(2)}{form.requiresPsd ? ` × (1 + ${Math.round(pricing.psdSurchargeRate * 100)}%)` : '，按图片类型及全局最低价计算'}</p></div></div>
            </div>
            <div className="space-y-2"><Label required htmlFor="order-bid" className="text-sm font-semibold text-slate-700">我的出价（元）</Label><Input id="order-bid" required type="number" min={minimumBid ?? undefined} step="0.01" placeholder={minimumBid === null ? '正在加载最低出价' : `请输入不低于 ${minimumBid} 元的出价`} value={form.budget} onChange={(event) => setForm({ ...form, budget: event.target.value })} className="h-11 rounded-xl bg-slate-50/70 text-sm" /><p className="text-[11px] text-slate-400">最低价取图片类型最低价合计与平台全局底价中的较高值{form.requiresPsd ? `，需要 PSD 时再上浮 ${Math.round(pricing.psdSurchargeRate * 100)}%` : ''}。</p></div>
          </div>}

          {step === 3 && <div className="mx-auto max-w-2xl space-y-5 py-4">
            <div className="rounded-2xl border border-[var(--role-primary-border)] bg-[var(--role-primary-soft)] p-6 text-center"><span className="order-form-primary mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-white"><MessageCircle className="h-6 w-6" /></span><h2 className="mt-4 text-lg font-bold text-slate-800">联系客户服务确认需求</h2><p className="mt-2 text-sm leading-6 text-slate-500">订单提交后不会自动付款。添加客服微信，确认需求细节后再进行后续操作。</p>{pricing.customerService ? <div className="mt-5 flex flex-col items-center gap-4 rounded-xl bg-white px-4 py-5 sm:flex-row sm:justify-center sm:text-left">{pricing.customerService.qrCodeUrl && <><button type="button" onClick={() => setQrPreviewOpen(true)} aria-label="全屏预览客服二维码" className="group relative shrink-0 rounded-2xl p-1 transition hover:bg-[var(--role-primary-soft)]"><AuthenticatedImage src={pricing.customerService.qrCodeUrl} alt={`${pricing.customerService.name}客服二维码`} className="h-48 w-48 rounded-xl object-contain shadow-sm transition group-hover:scale-[1.02]" /><span className="absolute inset-x-2 bottom-2 rounded-lg bg-slate-900/65 py-1 text-center text-[11px] text-white opacity-0 transition group-hover:opacity-100">点击全屏预览</span></button><Modal open={qrPreviewOpen} onOpenChange={setQrPreviewOpen}><ModalContent className="w-[calc(100%-2rem)] max-w-2xl rounded-3xl bg-white p-5"><ModalHeader><DialogTitle className="text-center text-base">{pricing.customerService.name}客服二维码</DialogTitle></ModalHeader><div className="flex max-h-[78vh] items-center justify-center rounded-2xl bg-slate-50 p-4"><AuthenticatedImage src={pricing.customerService.qrCodeUrl} alt={`${pricing.customerService.name}客服二维码大图`} className="max-h-[70vh] max-w-full object-contain" /></div></ModalContent></Modal></>}<div><p className="text-xs text-slate-500">客服：{pricing.customerService.name}</p><p className="mt-1 text-base font-bold role-primary-text">{pricing.customerService.wechat}</p><p className="mt-1 text-[11px] text-slate-400">可添加微信沟通订单需求</p></div></div> : <div className="mt-5 rounded-xl bg-white px-4 py-3 text-sm text-slate-500">暂未配置客服，请联系平台管理员</div>}</div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500"><div className="flex items-center justify-between"><span>需求图片</span><b className="text-slate-800">{imageCount} 张</b></div><div className="mt-3 flex items-center justify-between"><span>订单出价</span><b className="role-primary-text">¥{Number(form.budget || 0).toFixed(2)}</b></div></div>
          </div>}

          <DrawerFooter className="flex-row justify-between gap-2 border-t border-slate-100 p-0 pt-4">
            <div>{step > 1 && <Button type="button" variant="outline" onClick={() => setStep(step - 1)} className="rounded-xl text-xs"><ChevronLeft className="mr-1 h-3.5 w-3.5" />上一步</Button>}</div>
            <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl text-xs">取消</Button><Button type="submit" disabled={submitting} className="order-form-primary rounded-xl text-xs text-white">{submitting ? '保存中…' : step === 3 ? (editingOrder ? '保存修改' : '提交订单') : <>下一步<ChevronRight className="ml-1 h-3.5 w-3.5" /></>}</Button></div>
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
        <OrderCreationSteps step={step} />
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

function OrderCreationSteps({ step }: { step: number }) {
  const steps = ['填写需求', '填写出价', '联系客服'];
  return <div className="mb-5 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-6">
    <div className="relative"><Progress value={(step - 1) * 50} className="absolute left-[16.67%] right-[16.67%] top-4 h-1 w-[66.66%] bg-[var(--role-primary-border)] [&_[data-slot=progress-indicator]]:bg-[var(--role-primary)]" /><ol className="relative flex">{steps.map((label, index) => { const current = index + 1 === step; const completed = index + 1 < step; return <li key={label} className="flex min-w-0 flex-1 flex-col items-center"><span className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${current || completed ? 'border-[var(--role-primary)] bg-[var(--role-primary)] text-white' : 'border-slate-200 bg-white text-slate-400'}`}>{completed ? <CheckCircle2 className="h-4 w-4" /> : index + 1}</span><span className={`mt-2 text-xs font-semibold ${current ? 'role-primary-text' : completed ? 'text-slate-600' : 'text-slate-400'}`}>{label}</span></li>; })}</ol></div>
  </div>;
}
