'use client';

import { useEffect, useState } from 'react';
import * as Select from '@radix-ui/react-select';
import { ChevronDown, Layers, Plus, Trash2 } from 'lucide-react';
import type { DesignOrder, ImageGroupType, OrderImageRequirementItem, PlatformType, ReviewRule } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { useCurrentUser } from '@/hooks/use-current-user';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImageUpload } from '@/components/image-upload';
import { Textarea } from '@/components/ui/textarea';
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
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
const formSelectTriggerClass = 'flex h-9 w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-xs outline-none focus:border-blue-300 focus:ring-[3px] focus:ring-blue-500/15';
const selectContentClass = 'z-50 max-h-72 min-w-[8rem] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-md';
const selectItemClass = 'flex cursor-pointer items-center rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100 data-[state=checked]:bg-blue-50 data-[state=checked]:text-blue-700';
const groupTypes: ImageGroupType[] = ['main_1_1', 'main_3_4', 'detail'];
const groupMeta: Record<ImageGroupType, { label: string; name: string; dimensions: string }> = {
  main_1_1: { label: '1:1 主图', name: '1:1 方形主图', dimensions: '800x800' },
  main_3_4: { label: '3:4 长图', name: '3:4 竖版长图', dimensions: '750x1000' },
  detail: { label: '详情长图', name: '详情页长图', dimensions: '750x1500' },
};

function newGroup(index: number, groupType: ImageGroupType = 'main_1_1', name = groupMeta[groupType].name): OrderImageRequirementItem {
  const meta = groupMeta[groupType];
  return {
    id: 'create_group_' + Date.now() + '_' + index,
    name: name.trim() || meta.name,
    groupType,
    quantity: 1,
    dimensions: meta.dimensions,
    description: '',
    referenceImages: [],
    referenceLinks: [''],
  };
}

function defaultGroups() {
  return [newGroup(0), newGroup(1, 'main_3_4')];
}
type GroupField = 'name' | 'description';

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
        return {
          ...group,
          id: group.id || `edit_group_${Date.now()}_${index}`,
          name: group.name || meta.name,
          groupType,
          quantity: group.quantity || 1,
          dimensions: group.dimensions || meta.dimensions,
          description: group.description || '',
          referenceImages: [...(group.referenceImages || [])],
          referenceLinks: group.referenceLinks?.length ? [...group.referenceLinks] : [''],
        };
      })
    : defaultGroups();
  if (order && !order.imageRequirementGroups?.length && order.referenceImages?.length) {
    groups = [{ ...groups[0], referenceImages: [...order.referenceImages] }, ...groups.slice(1)];
  }
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

export function CreateOrderDialog({ open, onOpenChange, onCreated, onUpdated, editingOrder }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (order: DesignOrder) => void;
  onUpdated?: (order: DesignOrder) => void;
  editingOrder?: DesignOrder | null;
}) {
  const initialGroups = defaultGroups();
  const user = useCurrentUser();
  const [rules, setRules] = useState<ReviewRule[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<OrderForm>(() => formFromOrder());
  const [activeGroupId, setActiveGroupId] = useState(initialGroups[0].id);
  const [groupCreatorOpen, setGroupCreatorOpen] = useState(false);
  const [groupDraft, setGroupDraft] = useState({ type: 'main_1_1' as ImageGroupType, name: groupMeta.main_1_1.name });
  const [groupErrors, setGroupErrors] = useState<Record<string, GroupField[]>>({});

  useEffect(() => {
    if (!user || user.role !== 'advertiser') return;
    fetchWithAuth('/review-rules/mine')
      .then((response) => response.json())
      .then((result) => {
        const nextRules = result.success ? result.data || [] : [];
        setRules(nextRules);
        if (nextRules[0]) setForm((current) => ({ ...current, reviewRuleId: current.reviewRuleId || nextRules[0].id }));
      })
      .catch(() => setRules([]));
  }, [user?.id]);

  useEffect(() => {
    if (!open) return;
    const nextForm = formFromOrder(editingOrder, rules[0]?.id);
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
      if (patch.description !== undefined && String(patch.description).trim()) next[groupId] = (next[groupId] || errors).filter((field) => field !== 'description');
      if (next[groupId]?.length === 0) delete next[groupId];
      return next;
    });
  };

  const addGroup = () => {
    const group = newGroup(form.groups.length, groupDraft.type, groupDraft.name);
    setForm({ ...form, groups: [...form.groups, group] });
    setActiveGroupId(group.id);
    setGroupCreatorOpen(false);
    setGroupDraft({ type: 'main_1_1', name: groupMeta.main_1_1.name });
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
    const errors = form.groups.reduce<Record<string, GroupField[]>>((result, group) => {
      const missing: GroupField[] = [];
      if (!group.name.trim()) missing.push('name');
      if (!group.description?.trim()) missing.push('description');
      if (missing.length) result[group.id] = missing;
      return result;
    }, {});
    setGroupErrors(errors);
    const firstInvalidGroup = form.groups.find((group) => errors[group.id]);
    if (firstInvalidGroup) {
      setActiveGroupId(firstInvalidGroup.id);
      toast.error('请完善当前图片分组的必填项');
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
        imageRequirementGroups: form.groups.map((group) => ({
          ...group,
          referenceImages: (group.referenceImages || []).filter(Boolean),
          referenceImageItems: (group.referenceImages || []).filter(Boolean).map((url, index) => ({ id: group.id + '_ref_' + index, url, description: '' })),
          referenceLinks: (group.referenceLinks || []).filter(Boolean),
        })),
        referenceImages: form.groups.flatMap((group) => (group.referenceImages || []).filter(Boolean)),
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

  return (
    <Drawer direction="right" open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="h-full max-h-full max-w-[calc(100vw-2rem)] overflow-x-hidden overflow-y-auto rounded-l-3xl bg-white p-5 [--drawer-width:52rem]">
        <DrawerHeader className="p-0 pb-4">
          <DrawerTitle className="flex items-center gap-2 text-base font-bold text-slate-800"><Layers className="h-5 w-5 text-blue-600" />{editingOrder ? '编辑设计订单' : '新增设计订单'}</DrawerTitle>
        </DrawerHeader>
        <form onSubmit={submit} className="min-w-0 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="order-title" className="text-xs text-slate-600">订单标题</Label>
            <Input id="order-title" required placeholder="例如：春季新品主图设计" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="h-9 rounded-xl bg-slate-50/70 text-xs" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldLabel label="设计类型"><Select.Root value={form.category} onValueChange={(category) => setForm({ ...form, category })}><Select.Trigger className={formSelectTriggerClass}><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className={selectContentClass}><Select.Viewport>{categories.map((category) => <Select.Item key={category} value={category} className={selectItemClass}><Select.ItemText>{category}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root></FieldLabel>
            <FieldLabel label="投放平台"><Select.Root value={form.platform} onValueChange={(platform) => setForm({ ...form, platform: platform as PlatformType })}><Select.Trigger className={formSelectTriggerClass}><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className={selectContentClass}><Select.Viewport>{platforms.map((platform) => <Select.Item key={platform.id} value={platform.id} className={selectItemClass}><Select.ItemText>{platform.label}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root></FieldLabel>
            <FieldLabel label="订单预算（元）"><Input required type="number" min="0.01" step="0.01" placeholder="请输入预算金额" value={form.budget} onChange={(event) => setForm({ ...form, budget: event.target.value })} className="h-9 rounded-xl bg-slate-50/70 text-xs" /></FieldLabel>
            <FieldLabel label="期望交付"><Select.Root value={form.deadlineDays} onValueChange={(deadlineDays) => setForm({ ...form, deadlineDays })}><Select.Trigger className={formSelectTriggerClass}><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className={selectContentClass}><Select.Viewport><Select.Item value="1" className={selectItemClass}><Select.ItemText>24 小时交付</Select.ItemText></Select.Item><Select.Item value="2" className={selectItemClass}><Select.ItemText>2 天交付</Select.ItemText></Select.Item><Select.Item value="3" className={selectItemClass}><Select.ItemText>3 天交付</Select.ItemText></Select.Item><Select.Item value="5" className={selectItemClass}><Select.ItemText>5 天交付</Select.ItemText></Select.Item></Select.Viewport></Select.Content></Select.Portal></Select.Root></FieldLabel>
            <FieldLabel label="订单优先级"><Select.Root value={form.urgency} onValueChange={(urgency) => setForm({ ...form, urgency: urgency as typeof form.urgency })}><Select.Trigger className={formSelectTriggerClass}><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className={selectContentClass}><Select.Viewport><Select.Item value="normal" className={selectItemClass}><Select.ItemText>标准单</Select.ItemText></Select.Item><Select.Item value="urgent" className={selectItemClass}><Select.ItemText>加急单</Select.ItemText></Select.Item><Select.Item value="super_urgent" className={selectItemClass}><Select.ItemText>特急单</Select.ItemText></Select.Item></Select.Viewport></Select.Content></Select.Portal></Select.Root></FieldLabel>
            <FieldLabel label="作品审核流"><Select.Root value={form.reviewRuleId || undefined} onValueChange={(reviewRuleId) => setForm({ ...form, reviewRuleId })}><Select.Trigger className={formSelectTriggerClass}><Select.Value placeholder="选择作品审核流" /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className={selectContentClass}><Select.Viewport>{rules.map((rule) => <Select.Item key={rule.id} value={rule.id} className={selectItemClass}><Select.ItemText>{rule.name}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root></FieldLabel>
          </div>

          <Tabs value={activeGroupId} onValueChange={setActiveGroupId} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex min-w-0 items-start gap-2"><TabsList className="flex h-auto min-w-0 flex-1 flex-wrap justify-start gap-2 bg-transparent p-0">{form.groups.map((group) => <TabsTrigger key={group.id} value={group.id} className={`h-auto max-w-full flex-none rounded-xl border bg-white px-3 py-2 text-xs text-slate-500 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700 ${groupErrors[group.id]?.length ? 'border-rose-300 text-rose-600 data-[state=active]:border-rose-300' : 'border-slate-200 data-[state=active]:border-blue-200'}`}><span className="font-semibold">{groupMeta[group.groupType].label}</span><span className="max-w-24 truncate text-[10px] opacity-70">{group.name}</span></TabsTrigger>)}</TabsList><Popover open={groupCreatorOpen} onOpenChange={setGroupCreatorOpen}><PopoverTrigger asChild><Button type="button" variant="outline" size="icon" className="h-8 w-8 shrink-0 rounded-xl" aria-label="新增图片需求组"><Plus className="h-4 w-4" /></Button></PopoverTrigger><PopoverContent align="end" className="w-72 rounded-xl border-slate-200 bg-white p-3"><div className="space-y-3"><div><p className="text-sm font-semibold text-slate-800">新增图片需求组</p><p className="mt-1 text-[11px] text-slate-500">选择比例并自定义分组名称</p></div><div className="space-y-1.5"><Label className="text-[11px] text-slate-600">图片比例</Label><Select.Root value={groupDraft.type} onValueChange={(type) => { const nextType = type as ImageGroupType; setGroupDraft({ type: nextType, name: groupMeta[nextType].name }); }}><Select.Trigger className={formSelectTriggerClass}><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className={selectContentClass}><Select.Viewport>{groupTypes.map((type) => <Select.Item key={type} value={type} className={selectItemClass}><Select.ItemText>{groupMeta[type].label}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root></div><div className="space-y-1.5"><Label htmlFor="new-group-name" className="text-[11px] text-slate-600">分组名称</Label><Input id="new-group-name" value={groupDraft.name} onChange={(event) => setGroupDraft({ ...groupDraft, name: event.target.value })} placeholder="例如：首页第一屏" className="h-9 rounded-xl text-xs" /></div><Button type="button" onClick={addGroup} className="h-9 w-full rounded-xl text-xs">新增分组</Button></div></PopoverContent></Popover></div>
            {form.groups.map((group, index) => <TabsContent key={group.id} value={group.id} className="mt-1 min-w-0"><div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3"><div className="flex min-w-0 items-end gap-2"><div className="min-w-0 flex-1 space-y-1"><Label className={`text-[11px] ${groupErrors[group.id]?.includes('name') ? 'text-rose-600' : 'text-slate-600'}`}>分组名称 <span className="text-rose-500">*</span></Label><Input value={group.name} onChange={(event) => updateGroup(index, { name: event.target.value })} placeholder="需求组名称" aria-invalid={groupErrors[group.id]?.includes('name')} className={`h-8 min-w-0 rounded-lg text-xs ${groupErrors[group.id]?.includes('name') ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15' : ''}`} />{groupErrors[group.id]?.includes('name') && <p className="text-[10px] text-rose-600">请填写分组名称</p>}</div><span className="shrink-0 rounded-lg bg-slate-100 px-2 py-1 text-[10px] text-slate-500">{groupMeta[group.groupType].label}</span><Button type="button" variant="ghost" size="icon" disabled={form.groups.length === 1} onClick={() => removeGroup(group.id)} className="h-8 w-8 shrink-0 text-slate-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></Button></div><div className="space-y-1"><Label className={`text-[11px] ${groupErrors[group.id]?.includes('description') ? 'text-rose-600' : 'text-slate-600'}`}>本组设计要求 <span className="text-rose-500">*</span></Label><Textarea value={group.description || ''} onChange={(event) => updateGroup(index, { description: event.target.value })} placeholder="请填写本组设计要求" rows={2} aria-invalid={groupErrors[group.id]?.includes('description')} className={`min-h-14 rounded-lg bg-slate-50/70 text-xs ${groupErrors[group.id]?.includes('description') ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15' : ''}`} />{groupErrors[group.id]?.includes('description') && <p className="text-[10px] text-rose-600">请填写本组设计要求</p>}</div><ImageUpload value={group.referenceImages || []} onChange={(referenceImages) => updateGroup(index, { referenceImages })} /><div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3"><div className="flex items-center justify-between"><Label className="text-[11px] text-slate-600">参考链接（选填）</Label><Button type="button" variant="outline" onClick={() => updateGroup(index, { referenceLinks: [...(group.referenceLinks || []), ''] })} className="h-7 rounded-lg text-[11px]"><Plus className="mr-1 h-3.5 w-3.5" />添加链接</Button></div>{(group.referenceLinks || []).map((link, linkIndex) => <div key={`${group.id}-link-${linkIndex}`} className="flex min-w-0 gap-2"><Input type="url" value={link} onChange={(event) => { const links = [...(group.referenceLinks || [])]; links[linkIndex] = event.target.value; updateGroup(index, { referenceLinks: links }); }} placeholder="https://example.com/reference" className="h-8 min-w-0 rounded-lg text-xs" /><Button type="button" variant="ghost" size="icon" onClick={() => updateGroup(index, { referenceLinks: (group.referenceLinks || []).filter((_, currentIndex) => currentIndex !== linkIndex) })} className="h-8 w-8 shrink-0 text-slate-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div></div></TabsContent>)}
          </Tabs>

          <div className="space-y-1.5">
            <Label htmlFor="order-requirements" className="text-xs text-slate-600">整体需求说明</Label>
            <Textarea id="order-requirements" rows={3} placeholder="补充整体设计要求、品牌调性和交付说明" value={form.requirements} onChange={(event) => setForm({ ...form, requirements: event.target.value })} className="rounded-xl bg-slate-50/70 text-xs" />
          </div>
          <DrawerFooter className="flex-row justify-end p-0 pt-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl text-xs">取消</Button>
            <Button type="submit" disabled={submitting} className="rounded-xl bg-blue-600 text-xs text-white hover:bg-blue-700">{submitting ? '保存中…' : editingOrder ? '保存修改' : '提交需求'}</Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}

function FieldLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs text-slate-600">{label}</Label>{children}</div>;
}
