'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, CircleDollarSign, Copy, MessageCircle, Plus, Trash2, X } from 'lucide-react';
import type { DesignOrder, ImageGroupType, OrderImageRequirementImageItem, OrderImageRequirementItem, OrderReferenceLinkItem, PlatformType, ReviewRule } from '@design-review/shared';
import { calculateImageRequirementsMinimumPrice, calculateOrderMinimumBudget } from '@design-review/shared';
import { fetchWithAuth, getCurrentUser } from '@/lib/auth';
import { ImageUpload } from '@/components/image-upload';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { goBackOrReplace } from '@/components/mobile/mobile-navigation';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { toast } from 'sonner';

const ratios: Array<{ type: ImageGroupType; name: string; dimensions: string; ratio: string }> = [
  { type: 'main_1_1', name: '1:1 方形主图', dimensions: '800×800', ratio: '1:1' },
  { type: 'main_3_4', name: '3:4 竖版长图', dimensions: '750×1000', ratio: '3:4' },
  { type: 'main_4_3', name: '4:3 横版主图', dimensions: '1200×900', ratio: '4:3' },
  { type: 'main_16_9', name: '16:9 横幅主图', dimensions: '1600×900', ratio: '16:9' },
  { type: 'main_9_16', name: '9:16 竖版海报', dimensions: '900×1600', ratio: '9:16' },
  { type: 'detail', name: '详情页长图', dimensions: '750×1500', ratio: '详情' },
];
const categories = ['主图设计', '详情页设计', '活动海报', '3D建模与渲染', '精修合成'];
const platforms: Array<{ id: PlatformType; label: string }> = [{ id: 'tmall', label: '天猫' }, { id: 'taobao', label: '淘宝' }, { id: 'douyin', label: '抖音' }, { id: 'pinduoduo', label: '拼多多' }, { id: 'universal', label: '全平台' }];
const uid = () => `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const reference = (): OrderReferenceLinkItem => ({ id: uid(), image: '', link: '', description: '' });
const image = (): OrderImageRequirementImageItem => ({ id: uid(), materialImage: '', description: '', referenceImages: [], referenceLinks: [''], referenceLinkItems: [reference()] });
const group = (type: ImageGroupType, name?: string, count = 1): OrderImageRequirementItem => {
  const meta = ratios.find((item) => item.type === type)!;
  return { id: uid(), groupType: type, name: name || meta.name, dimensions: meta.dimensions, quantity: count, imageItems: Array.from({ length: Math.max(count, 1) }, image), materialImages: [], referenceImages: [], referenceLinks: [''] };
};
const defaults = () => [group('main_1_1'), group('main_3_4')];
function hydrateOrderGroups(order: DesignOrder): OrderImageRequirementItem[] {
  const saved = order.imageRequirementGroups || [];
  if (!saved.length) return defaults();
  return saved.map((savedGroup, groupIndex) => {
    const rawImages: OrderImageRequirementImageItem[] = savedGroup.imageItems?.length ? savedGroup.imageItems : (savedGroup.materialImages?.length ? savedGroup.materialImages : ['']).map((materialImage, imageIndex) => ({
      id: `${savedGroup.id}_image_${imageIndex}`, materialImage,
      description: imageIndex === 0 ? savedGroup.description || '' : '',
      referenceImages: imageIndex === 0 ? savedGroup.referenceImages || [] : [],
      referenceLinks: imageIndex === 0 ? savedGroup.referenceLinks || [] : [],
    }));
    const imageItems = rawImages.map((entry, imageIndex) => {
      const savedRefs = entry.referenceLinkItems?.length ? entry.referenceLinkItems : [];
      const legacyImages = entry.referenceImages?.length ? entry.referenceImages : (imageIndex === 0 ? savedGroup.referenceImages || [] : []);
      const legacyLinks = entry.referenceLinks?.length ? entry.referenceLinks : (imageIndex === 0 ? savedGroup.referenceLinks || [] : []);
      const count = Math.max(savedRefs.length, legacyImages.length, legacyLinks.length, 1);
      return {
        ...entry,
        id: entry.id || `${savedGroup.id}_image_${imageIndex}`,
        materialImage: entry.materialImage || '',
        description: entry.description || '',
        referenceLinkItems: savedRefs.length ? savedRefs.map((ref) => ({ ...ref, id: ref.id || uid() })) : Array.from({ length: count }, (_, refIndex) => ({ id: uid(), image: legacyImages[refIndex] || '', link: legacyLinks[refIndex] || '', description: refIndex === 0 ? entry.referenceLinkDescription || '' : '' })),
      };
    });
    return { ...savedGroup, id: savedGroup.id || uid(), name: savedGroup.name || `图片组 ${groupIndex + 1}`, imageItems, quantity: imageItems.length };
  });
}
type Pricing = { imageUnitPrice: number; imageUnitPrices: Partial<Record<ImageGroupType, number>>; minOrderBudget: number | null; psdSurchargeRate: number; customerService: { name: string; wechat: string; qrCodeUrl: string } | null };
const initialPricing: Pricing = { imageUnitPrice: 100, imageUnitPrices: {}, minOrderBudget: null, psdSurchargeRate: 0.2, customerService: null };

export function MobileCreateOrder() {
  const router = useRouter();
  const search = useSearchParams();
  const editId = search.get('edit');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(Boolean(editId));
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('主图设计');
  const [platform, setPlatform] = useState<PlatformType>('tmall');
  const [days, setDays] = useState('3');
  const [urgency, setUrgency] = useState<'normal' | 'urgent' | 'super_urgent'>('normal');
  const [requiresPsd, setRequiresPsd] = useState(false);
  const [requirements, setRequirements] = useState('');
  const [groups, setGroups] = useState<OrderImageRequirementItem[]>(defaults);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [expandedImageId, setExpandedImageId] = useState(() => groups[0]?.imageItems?.[0]?.id || '');
  const [expandedReferenceId, setExpandedReferenceId] = useState('');
  const [showImageErrors, setShowImageErrors] = useState(false);
  const [rules, setRules] = useState<ReviewRule[]>([]);
  const [ruleId, setRuleId] = useState('');
  const [bid, setBid] = useState('');
  const [pricing, setPricing] = useState<Pricing>(initialPricing);
  const [qrPreview, setQrPreview] = useState(false);
  const currentUser = getCurrentUser();

  useEffect(() => {
    if (!currentUser || currentUser.role !== 'advertiser') { router.replace(`/login/advertiser?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`); return; }
    Promise.all([
      fetchWithAuth('/review-rules/mine').then((r) => r.json()),
      fetchWithAuth('/system-config/order-pricing').then((r) => r.json()),
      editId ? fetchWithAuth(`/design-orders/${editId}`).then((r) => r.json()) : Promise.resolve(null),
    ]).then(([ruleResult, priceResult, orderResult]) => {
      const nextRules: ReviewRule[] = ruleResult.success ? ruleResult.data || [] : [];
      setRules(nextRules);
      const ownRule = nextRules.find((item) => item.ownerId === currentUser.id && item.name === '自己审核') || nextRules[0];
      setRuleId(orderResult?.data?.reviewRuleId || ownRule?.id || '');
      if (priceResult?.success && priceResult.data) setPricing({ ...initialPricing, ...priceResult.data, imageUnitPrice: Number(priceResult.data.imageUnitPrice) || 0, minOrderBudget: Number.isFinite(Number(priceResult.data.minOrderBudget)) ? Number(priceResult.data.minOrderBudget) : null });
      if (orderResult) {
        if (!orderResult.success) throw new Error(orderResult.message || '订单加载失败');
        const order: DesignOrder = orderResult.data;
        setTitle(order.title); setCategory(order.category || '主图设计'); setPlatform(order.platform || 'tmall'); setRequirements(order.requirements || ''); setRequiresPsd(Boolean(order.requiresPsd)); setUrgency(order.urgency || 'normal');
        setDays(String(Math.max(1, Math.ceil((new Date(order.deadline).getTime() - Date.now()) / 86400000)))); setBid(String(order.budget));
        const hydratedGroups = hydrateOrderGroups(order);
        setGroups(hydratedGroups);
        setActiveGroupIndex(0);
        setExpandedImageId(hydratedGroups[0]?.imageItems?.[0]?.id || '');
      }
    }).catch((error) => { toast.error(error instanceof Error ? error.message : '初始化表单失败'); if (editId) router.replace('/mobile/orders'); })
      .finally(() => setLoading(false));
  // Initial route and session are intentionally captured once per page entry.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const imageCount = groups.reduce((sum, item) => sum + (item.imageItems?.length || 0), 0);
  const recommended = calculateImageRequirementsMinimumPrice(groups, pricing.imageUnitPrices, pricing.imageUnitPrice);
  const minimum = pricing.minOrderBudget === null ? null : calculateOrderMinimumBudget(groups, pricing.imageUnitPrices, pricing.minOrderBudget, requiresPsd, pricing.psdSurchargeRate, pricing.imageUnitPrice);
  const selectedRule = rules.find((rule) => rule.id === ruleId);
  const updateGroup = (groupIndex: number, next: OrderImageRequirementItem) => setGroups((list) => list.map((item, index) => index === groupIndex ? next : item));
  const updateImage = (groupIndex: number, imageIndex: number, patch: Partial<OrderImageRequirementImageItem>) => {
    const target = groups[groupIndex]; const items = [...(target.imageItems || [])]; items[imageIndex] = { ...items[imageIndex], ...patch };
    updateGroup(groupIndex, { ...target, imageItems: items, quantity: items.length, materialImages: items.map((item) => item.materialImage || '').filter(Boolean) });
  };
  const removeGroup = (groupIndex: number) => {
    const nextGroups = groups.filter((_, index) => index !== groupIndex);
    const nextIndex = Math.min(activeGroupIndex >= groupIndex ? activeGroupIndex - 1 : activeGroupIndex, nextGroups.length - 1);
    setGroups(nextGroups);
    setActiveGroupIndex(Math.max(0, nextIndex));
    setExpandedImageId(nextGroups[Math.max(0, nextIndex)]?.imageItems?.[0]?.id || '');
    setExpandedReferenceId('');
  };
  const validate = () => {
    setShowImageErrors(true);
    if (!title.trim()) { toast.error('请填写订单标题'); return false; }
    if (!ruleId) { toast.error('请先选择作品审核流'); return false; }
    const incomplete = groups.flatMap((item, groupIndex) => (item.imageItems || []).flatMap((entry, imageIndex) => entry.description?.trim() ? [] : [{ groupIndex, imageIndex }]));
    if (incomplete.length) {
      const first = incomplete[0];
      const targetImage = groups[first.groupIndex]?.imageItems?.[first.imageIndex];
      setActiveGroupIndex(first.groupIndex);
      setExpandedImageId(targetImage?.id || '');
      setExpandedReferenceId('');
      toast.error(`请填写第 ${first.groupIndex + 1} 组第 ${first.imageIndex + 1} 张图片的设计要点`);
      window.setTimeout(() => document.getElementById(`mobile-image-${first.groupIndex}-${first.imageIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
      return false;
    }
    return true;
  };
  const nextStep = () => {
    if (step === 1) { if (!validate()) return; setBid((value) => value || String(minimum ?? recommended)); }
    if (step === 2 && (minimum === null || !Number.isFinite(Number(bid)) || Number(bid) < minimum)) { toast.error(minimum === null ? '正在加载定价规则' : `出价不能低于 ¥${minimum.toFixed(2)}`); return; }
    setStep((value) => Math.min(3, value + 1)); window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const submit = async () => {
    if (!validate() || minimum === null || Number(bid) < minimum) return;
    setSaving(true);
    try {
      const payload = {
        title: title.trim(), category, platform, budget: Number(bid), urgency,
        deadline: new Date(Date.now() + Number(days) * 86400000).toISOString(), requirements, requiresPsd,
        reviewRuleId: ruleId, reviewRuleName: selectedRule?.name,
        ...(!editId && { creatorId: currentUser?.id, creatorName: currentUser?.name }),
        imageRequirementGroups: groups.map((item) => {
          const imageItems = (item.imageItems || []).map((entry) => {
            const referenceLinkItems = (entry.referenceLinkItems || []).filter((ref) => ref.image || ref.link || ref.description).map((ref) => ({ ...ref, link: ref.link?.trim() || '', description: ref.description?.trim() || '', image: ref.image || '' }));
            return { ...entry, referenceLinkItems, referenceImages: referenceLinkItems.map((ref) => ref.image).filter(Boolean), referenceImageItems: [], referenceLinks: referenceLinkItems.map((ref) => ref.link).filter(Boolean) };
          });
          return { ...item, imageItems, quantity: imageItems.length, materialImages: imageItems.map((entry) => entry.materialImage || '').filter(Boolean), referenceImages: imageItems.flatMap((entry) => entry.referenceImages || []), referenceLinks: imageItems.flatMap((entry) => entry.referenceLinks || []) };
        }),
      };
      const response = await fetchWithAuth(editId ? `/design-orders/${editId}` : '/design-orders', { method: editId ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.message || '提交失败');
      toast.success(editId ? '订单已更新' : '订单已提交'); router.replace(`/mobile/orders/${result.data.id}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : '提交失败'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">正在准备订单表单…</div>;
  return <div className="w-full min-w-0 min-h-dvh overflow-x-clip bg-[#f4f6f8] pb-[calc(90px+env(safe-area-inset-bottom))]">
    <header className="sticky top-[env(safe-area-inset-top)] z-20 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur"><div className="mx-auto flex max-w-xl items-center gap-3"><button type="button" aria-label="返回" onClick={() => goBackOrReplace(router, editId ? `/mobile/orders/${editId}` : '/mobile/orders')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-50"><ArrowLeft className="h-4 w-4" /></button><div className="min-w-0 flex-1"><h1 className="truncate text-sm font-extrabold">{editId ? '编辑设计订单' : '发布设计订单'}</h1><p className="mt-0.5 text-[10px] text-slate-400">{step === 1 ? '先完善订单需求' : step === 2 ? '根据需求确认出价' : '发布前确认沟通方式'}</p></div><span className="shrink-0 rounded-full role-primary-soft px-2.5 py-1 text-[10px] font-bold role-primary-text">{step} / 3</span></div><div className="mx-auto mt-3 grid max-w-xl grid-cols-3" aria-label="订单创建步骤">{['填写需求', '确认出价', '联系沟通'].map((label, index) => { const itemStep = index + 1; const completed = itemStep < step; const active = itemStep === step; return <div key={label} className="relative flex flex-col items-center"><div className="flex w-full items-center"><button type="button" aria-label={`第 ${itemStep} 步：${label}`} aria-current={active ? 'step' : undefined} disabled={itemStep > step} onClick={() => { if (completed) { setStep(itemStep); window.scrollTo({ top: 0, behavior: 'smooth' }); } }} className={`relative z-10 mx-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${active || completed ? 'role-primary-bg text-white' : 'border border-slate-200 bg-white text-slate-400'} ${itemStep > step ? 'cursor-default' : 'cursor-pointer'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--role-primary)] focus-visible:ring-offset-2`}>{completed ? <Check className="h-3.5 w-3.5" /> : itemStep}</button></div><span className={`mt-1.5 px-1 text-center text-[10px] leading-4 ${active ? 'font-bold role-primary-text' : completed ? 'font-medium text-slate-600' : 'text-slate-400'}`}>{label}</span>{index < 2 && <span aria-hidden="true" className={`absolute left-1/2 top-[13px] h-0.5 w-full -translate-y-1/2 ${itemStep < step ? 'role-primary-bg' : 'bg-slate-200'}`} />}</div>; })}</div></header>
    <main className="mx-auto w-full min-w-0 max-w-xl space-y-4 px-4 py-4">
      {step === 1 && <>
        <Panel title="基础信息" className="!space-y-3 !p-3">
          <Field inline required label="订单名称"><Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="例如：春季新品主图设计" className="h-11 rounded-xl bg-white text-sm" /></Field>
          <Field inline label="设计类型"><MobileOptionPicker title="设计类型" options={categories.map((item) => ({ value: item, label: item }))} value={category} onChange={setCategory} /></Field>
          <Field inline label="投放平台"><MobileOptionPicker title="投放平台" options={platforms.map((item) => ({ value: item.id, label: item.label }))} value={platform} onChange={(value) => setPlatform(value as PlatformType)} /></Field>
          <Field inline required label="作品审核流">{rules.length ? <MobileOptionPicker title="作品审核流" placeholder="请选择作品审核流" options={rules.map((rule) => ({ value: rule.id, label: rule.name }))} value={ruleId} onChange={setRuleId} /> : <Link href="/mobile/review-flows" className="text-xs role-primary-text">尚无审核流，前往配置</Link>}</Field>
          <Field inline label="交付周期"><MobileOptionPicker title="交付周期" options={[['1','24 小时'],['2','2 天'],['3','3 天'],['5','5 天'],['7','7 天']].map(([value, label]) => ({ value, label }))} value={days} onChange={setDays} /></Field>
          <Field inline label="订单优先级"><MobileOptionPicker title="订单优先级" options={[['normal','标准'],['urgent','加急'],['super_urgent','特急']].map(([value, label]) => ({ value, label }))} value={urgency} onChange={(value) => setUrgency(value as typeof urgency)} /></Field>
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3"><div><p className="text-xs font-semibold">需要 PSD 源文件</p><p className="mt-1 text-[10px] text-slate-400">启用后最低价上浮 {Math.round(pricing.psdSurchargeRate * 100)}%</p></div><Switch checked={requiresPsd} onCheckedChange={setRequiresPsd} /></div>
        </Panel>
        <Panel title="图片需求" detail={`已添加 ${imageCount} 张 · 每张填写设计要点，原图和竞品参考选填。`} className="!space-y-3 !p-3 sm:!p-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div role="tablist" aria-label="图片比例分组" className="flex w-max items-start gap-2 pb-1">
                {groups.map((item, groupIndex) => {
                  const ratio = ratios.find((entry) => entry.type === item.groupType)?.ratio;
                  const selected = activeGroupIndex === groupIndex;
                  return <div key={item.id} className="relative shrink-0 pt-2 pl-2">
                    {groups.length > 1 && <ConfirmAction title="删除图片分组？" description={`删除“${item.name}”后，该分组中的图片和填写内容也会一并移除。`} confirmText="确认删除" onConfirm={() => removeGroup(groupIndex)}>
                      <button type="button" aria-label={`删除图片分组：${item.name}`} className="absolute left-0 top-0 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:border-rose-200 hover:text-rose-600"><X className="h-3.5 w-3.5" /></button>
                    </ConfirmAction>}
                    <button type="button" role="tab" aria-selected={selected} title={item.name} onClick={() => { setActiveGroupIndex(groupIndex); setExpandedImageId(item.imageItems?.[0]?.id || ''); setExpandedReferenceId(''); }} className={`flex min-h-10 max-w-[190px] items-center gap-2 rounded-xl border px-3 pl-6 text-left text-[11px] font-semibold ${selected ? 'border-[var(--role-primary)] role-primary-soft role-primary-text' : 'border-slate-200 bg-white text-slate-500'}`}>
                      <span className="truncate">{ratio} {item.name}</span><span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] ${selected ? 'bg-white/80' : 'bg-slate-100'}`}>{item.imageItems?.length || 0}</span>
                    </button>
                  </div>;
                })}
              </div>
            </div>
            <AddGroup compact onAdd={(type, name) => { const nextGroup = group(type, name); setGroups((list) => [...list, nextGroup]); setActiveGroupIndex(groups.length); setExpandedImageId(nextGroup.imageItems?.[0]?.id || ''); setExpandedReferenceId(''); }} />
          </div>
          {groups[activeGroupIndex] && (() => {
            const item = groups[activeGroupIndex];
            const groupIndex = activeGroupIndex;
            return <div className="space-y-2.5">
              {(item.imageItems || []).map((entry, imageIndex) => {
                const imageItems = item.imageItems || [];
                const isExpanded = expandedImageId === entry.id;
                const refs = entry.referenceLinkItems || [];
                const filledRefs = refs.filter((ref) => ref.image || ref.link || ref.description).length;
                const hasDescription = Boolean(entry.description?.trim());
                return <article id={`mobile-image-${groupIndex}-${imageIndex}`} key={entry.id} className={`overflow-hidden rounded-xl border bg-white ${isExpanded ? 'border-slate-200' : 'border-slate-100'}`}>
                  <div className="flex min-h-11 items-center gap-2 px-2.5">
                    {isExpanded ? <span className="h-5 w-1 shrink-0 rounded-full role-primary-bg" /> : null}
                    <button type="button" aria-expanded={isExpanded} onClick={() => { setExpandedImageId(isExpanded ? '' : entry.id); setExpandedReferenceId(''); }} className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left">
                      <span className="shrink-0 text-xs font-bold">第 {imageIndex + 1} 张</span>
                      <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{item.dimensions}</span>
                      {!isExpanded && <span className={`truncate text-[10px] ${hasDescription ? 'text-emerald-600' : 'text-slate-400'}`}>{hasDescription ? '设计要点已填写' : '设计要点待填写'}</span>}
                    </button>
                    {!isExpanded && filledRefs > 0 && <span className="shrink-0 text-[10px] text-slate-400">参考 {filledRefs}</span>}
                    {(imageItems.length > 1) && <button type="button" aria-label={`删除第 ${imageIndex + 1} 张图片`} onClick={() => { const nextImages = imageItems.filter((_, index) => index !== imageIndex); updateGroup(groupIndex, { ...item, imageItems: nextImages, quantity: nextImages.length }); if (entry.id === expandedImageId) setExpandedImageId(nextImages[Math.max(0, imageIndex - 1)]?.id || ''); }} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400"><Trash2 className="h-4 w-4" /></button>}
                    <button type="button" aria-label={isExpanded ? '收起图片详情' : '展开图片详情'} onClick={() => { setExpandedImageId(isExpanded ? '' : entry.id); setExpandedReferenceId(''); }} className="flex h-9 w-7 shrink-0 items-center justify-center text-slate-400"><ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} /></button>
                  </div>
                  {isExpanded && <div className="space-y-3 border-t border-slate-100 px-2.5 pb-3 pt-2.5">
                    <div>
                      <p className="mb-1.5 text-[11px] font-medium text-slate-600">素材原图 <span className="font-normal text-slate-400">（选填）</span></p>
                      <div className="flex items-center gap-3"><ImageUpload value={entry.materialImage ? [entry.materialImage] : []} onChange={(urls) => updateImage(groupIndex, imageIndex, { materialImage: urls[0] || '' })} folder="order-materials" multiple={false} variant="square" compact squareSize="sm" /><p className="text-[10px] leading-4 text-slate-400">可上传高清原图<br />支持 JPG、PNG</p></div>
                    </div>
                    <div>
                      <p className="mb-1.5 text-[11px] font-medium text-slate-600">设计要点 <span className="text-rose-500">*</span></p>
                      <Textarea aria-invalid={showImageErrors && !hasDescription} value={entry.description || ''} onChange={(event) => updateImage(groupIndex, imageIndex, { description: event.target.value })} placeholder="描述画面内容、卖点和设计要求" rows={4} className={`min-h-[104px] rounded-lg text-xs ${showImageErrors && !hasDescription ? 'border-rose-500 focus-visible:ring-rose-500' : ''}`} />
                      {showImageErrors && !hasDescription && <p className="mt-1 text-[10px] text-rose-600">请填写这张图片的设计要点</p>}
                    </div>
                    <div className="border-t border-slate-100 pt-2">
                      <button type="button" aria-expanded={expandedReferenceId === entry.id} onClick={() => setExpandedReferenceId(expandedReferenceId === entry.id ? '' : entry.id)} className="flex min-h-9 w-full items-center gap-2 text-left">
                        <span className="flex-1 text-[11px] font-semibold text-slate-600">竞品参考 <span className="font-normal text-slate-400">（选填）</span></span>
                        {filledRefs > 0 && <span className="text-[10px] text-slate-400">{filledRefs} 项</span>}
                        <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${expandedReferenceId === entry.id ? 'rotate-90' : ''}`} />
                      </button>
                      {expandedReferenceId === entry.id && <div className="space-y-3 pt-2">
                        {refs.map((ref, refIndex) => <div key={ref.id} className="space-y-2 border-t border-slate-100 pt-2.5">
                          <div className="flex items-center justify-between"><span className="text-[10px] font-medium text-slate-500">参考项 {refIndex + 1}</span><button type="button" aria-label={`删除参考项 ${refIndex + 1}`} onClick={() => updateImage(groupIndex, imageIndex, { referenceLinkItems: refs.filter((_, index) => index !== refIndex) })} className="flex h-8 w-8 items-center justify-center text-slate-400"><Trash2 className="h-3.5 w-3.5" /></button></div>
                          <ImageUpload value={ref.image ? [ref.image] : []} onChange={(urls) => { const nextRefs = [...refs]; nextRefs[refIndex] = { ...nextRefs[refIndex], image: urls[0] || '' }; updateImage(groupIndex, imageIndex, { referenceLinkItems: nextRefs }); }} folder="order-reference-images" multiple={false} variant="square" compact squareSize="sm" />
                          <Input value={ref.link || ''} onChange={(event) => { const nextRefs = [...refs]; nextRefs[refIndex] = { ...nextRefs[refIndex], link: event.target.value }; updateImage(groupIndex, imageIndex, { referenceLinkItems: nextRefs }); }} placeholder="输入参考链接或商品地址" className="h-10 rounded-lg text-xs" />
                          <Textarea value={ref.description || ''} onChange={(event) => { const nextRefs = [...refs]; nextRefs[refIndex] = { ...nextRefs[refIndex], description: event.target.value }; updateImage(groupIndex, imageIndex, { referenceLinkItems: nextRefs }); }} placeholder="说明该图片对应的参考链接" rows={2} className="rounded-lg text-xs" />
                        </div>)}
                        <Button type="button" variant="outline" onClick={() => updateImage(groupIndex, imageIndex, { referenceLinkItems: [...refs, reference()] })} className="h-9 rounded-lg border-[var(--role-primary-border)] px-3 text-xs role-primary-text"><Plus className="mr-1 h-3.5 w-3.5" />添加参考项</Button>
                      </div>}
                    </div>
                  </div>}
                </article>;
              })}
              <Button type="button" variant="outline" onClick={() => { const nextImage = image(); updateGroup(groupIndex, { ...item, imageItems: [...(item.imageItems || []), nextImage], quantity: (item.imageItems?.length || 0) + 1 }); setExpandedImageId(nextImage.id); setExpandedReferenceId(''); }} className="h-10 w-fit rounded-lg border-[var(--role-primary-border)] bg-white px-3 text-xs role-primary-text"><Plus className="mr-1.5 h-4 w-4" />给此分组添加图片</Button>
            </div>;
          })()}
          <Field label="整体需求说明"><Textarea value={requirements} onChange={(event) => setRequirements(event.target.value)} rows={3} placeholder="补充品牌调性、整体设计要求和交付说明" className="rounded-lg bg-white text-xs" /></Field>
        </Panel>
      </>}
      {step === 2 && <Panel title="确认本次出价" detail="仅提交出价，不会在此步骤发起支付。"><div className="rounded-2xl role-primary-soft p-4"><div className="flex items-center gap-2 text-sm font-bold role-primary-text"><CircleDollarSign className="h-5 w-5" />价格参考</div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl bg-white p-3"><p className="text-[10px] text-slate-400">图片数量</p><p className="mt-1 text-xl font-extrabold">{imageCount} 张</p></div><div className="rounded-xl bg-white p-3"><p className="text-[10px] text-slate-400">推荐单价合计</p><p className="mt-1 text-xl font-extrabold">¥{recommended.toFixed(2)}</p></div></div><div className="mt-2 rounded-xl bg-white p-3"><p className="text-[10px] text-slate-400">平台最低出价{requiresPsd ? '（含 PSD 加价）' : ''}</p><p className="mt-1 text-xl font-extrabold role-primary-text">{minimum === null ? '加载中…' : `¥${minimum.toFixed(2)}`}</p></div></div><Field required label="我的出价（元）"><Input type="number" min={minimum ?? undefined} step="0.01" value={bid} onChange={(e) => setBid(e.target.value)} placeholder={minimum === null ? '正在加载最低价格' : `最低 ¥${minimum.toFixed(2)}`} className="h-12 rounded-xl bg-white text-base font-bold" /></Field><p className="text-[11px] leading-5 text-slate-400">最低价格由图片类型对应的管理员配置、全局最低价格和 PSD 加价规则共同计算。</p></Panel>}
      {step === 3 && <Panel title="添加客服，确认需求" detail="提交后订单会进入平台流程；目前不会自动扣款。"><div className="rounded-2xl role-primary-soft p-4 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl role-primary-bg text-white"><MessageCircle className="h-6 w-6" /></span><h2 className="mt-3 text-base font-bold">联系客户服务</h2><p className="mt-1 text-xs leading-5 text-slate-500">确认需求细节、交期和出价后，再进行订单后续操作。</p>{pricing.customerService ? <div className="mt-4 rounded-2xl bg-white p-4">{pricing.customerService.qrCodeUrl && <button type="button" onClick={() => setQrPreview(true)} className="mx-auto block"><AuthenticatedImage src={pricing.customerService.qrCodeUrl} alt="客服二维码" className="mx-auto h-44 w-44 rounded-xl object-contain" /><span className="mt-2 block text-[10px] text-slate-400">点击查看大图</span></button>}<p className="mt-3 text-xs text-slate-500">客服：{pricing.customerService.name}</p><button type="button" onClick={() => navigator.clipboard.writeText(pricing.customerService!.wechat).then(() => toast.success('微信号已复制')).catch(() => toast.error('复制失败'))} className="mt-1 inline-flex min-h-10 items-center gap-2 font-bold role-primary-text">{pricing.customerService.wechat}<Copy className="h-3.5 w-3.5" /></button></div> : <p className="mt-4 rounded-xl bg-white p-4 text-xs text-slate-500">客服信息暂未配置</p>}</div><div className="rounded-xl bg-white p-4 text-xs"><div className="flex justify-between"><span className="text-slate-400">订单标题</span><b>{title || '—'}</b></div><div className="mt-3 flex justify-between"><span className="text-slate-400">图片数量</span><b>{imageCount} 张</b></div><div className="mt-3 flex justify-between"><span className="text-slate-400">订单出价</span><b className="role-primary-text">¥{Number(bid || 0).toFixed(2)}</b></div></div></Panel>}
    </main>
    <footer className="fixed inset-x-0 bottom-[env(safe-area-inset-bottom)] z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur"><div className="mx-auto flex max-w-xl items-center justify-between gap-2"><Button type="button" variant="outline" disabled={step === 1 || saving} onClick={() => setStep((value) => value - 1)} className="h-11 min-w-24 rounded-xl text-xs"><ChevronLeft className="mr-1 h-4 w-4" />上一步</Button>{step < 3 ? <Button type="button" onClick={nextStep} className="h-11 flex-1 rounded-xl role-primary-bg text-sm font-bold text-white">下一步<ChevronRight className="ml-1 h-4 w-4" /></Button> : <Button type="button" onClick={() => void submit()} disabled={saving} className="h-11 flex-1 rounded-xl role-primary-bg text-sm font-bold text-white">{saving ? '提交中…' : editId ? '保存修改' : '提交订单'}</Button>}</div></footer>
    {qrPreview && pricing.customerService?.qrCodeUrl && <div role="dialog" aria-modal="true" aria-label="客服二维码预览" onClick={() => setQrPreview(false)} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-5"><AuthenticatedImage src={pricing.customerService.qrCodeUrl} alt="客服二维码大图" className="max-h-[80dvh] max-w-full rounded-xl bg-white object-contain p-2" /></div>}
  </div>;
}

function Panel({ title, detail, children, className = '' }: { title: string; detail?: string; children: React.ReactNode; className?: string }) { return <section className={`space-y-4 rounded-[22px] bg-white p-4 shadow-sm ${className}`}><div><h2 className="text-sm font-extrabold">{title}</h2>{detail && <p className="mt-1 text-[11px] leading-5 text-slate-400">{detail}</p>}</div>{children}</section>; }
function Field({ label, children, inline = false, required = false }: { label: string; children: React.ReactNode; inline?: boolean; required?: boolean }) { return <div className={inline ? 'grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-2.5' : 'min-w-0 space-y-2'}><p className={`min-w-0 text-xs font-semibold text-slate-600 ${inline ? 'break-words leading-4' : ''}`}>{label}{required && <span aria-hidden="true" className="ml-1 text-rose-500">*</span>}</p><div className="min-w-0">{children}</div></div>; }
export type MobilePickerOption = { value: string; label: string; description?: string };
function OptionList({ options, value, onChange, className = 'space-y-2' }: { options: MobilePickerOption[]; value: string; onChange: (value: string) => void; className?: string }) {
  return <div className={className}>
    {options.map((option) => {
      const selected = option.value === value;
      return <button key={option.value} type="button" aria-pressed={selected} onClick={() => onChange(option.value)} className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left ${selected ? 'border-[var(--role-primary)] role-primary-soft role-primary-text' : 'border-slate-200 bg-white text-slate-700'}`}>
        <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{option.label}</span>{option.description && <span className="mt-0.5 block text-xs text-slate-500">{option.description}</span>}</span>
        {selected && <Check className="h-4 w-4 shrink-0" />}
      </button>;
    })}
  </div>;
}
export function MobileOptionPicker({ title, options, value, onChange, placeholder = '请选择' }: { title: string; options: MobilePickerOption[]; value: string; onChange: (value: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return <>
    <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="flex h-11 w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm outline-none focus-visible:border-[var(--role-primary)] focus-visible:ring-2 focus-visible:ring-[var(--role-primary-border)]">
      <span className={`min-w-0 flex-1 truncate ${selected ? 'text-slate-800' : 'text-slate-400'}`}>{selected?.label || placeholder}</span><ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
    </button>
    <Drawer direction="bottom" open={open} onOpenChange={setOpen}>
      <DrawerContent className="max-h-[78dvh] rounded-t-[24px] bg-white pb-[max(env(safe-area-inset-bottom),12px)]">
        <DrawerHeader className="text-left"><DrawerTitle className="text-base">选择{title}</DrawerTitle><DrawerDescription className="text-xs">请选择一个选项</DrawerDescription></DrawerHeader>
        <OptionList className="max-h-[55dvh] space-y-2 overflow-y-auto px-4 pb-4" options={options} value={value} onChange={(nextValue) => { onChange(nextValue); setOpen(false); }} />
      </DrawerContent>
    </Drawer>
  </>;
}
function AddGroup({ onAdd, compact = false }: { onAdd: (type: ImageGroupType, name: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false); const [type, setType] = useState<ImageGroupType>('main_1_1'); const [name, setName] = useState('');
  return <>
    <Button type="button" variant="outline" aria-label="新增图片分组" title="新增图片分组" onClick={() => setOpen(true)} className={compact ? 'h-10 w-10 shrink-0 rounded-xl border-[var(--role-primary-border)] bg-white p-0 role-primary-text' : 'h-11 w-full rounded-xl border-[var(--role-primary-border)] bg-white text-xs font-semibold role-primary-text'}>{compact ? <Plus className="h-4 w-4" /> : <><Plus className="mr-1.5 h-4 w-4" />新增图片分组</>}</Button>
    <Drawer direction="bottom" open={open} onOpenChange={setOpen}>
      <DrawerContent className="max-h-[82dvh] rounded-t-[24px] bg-white pb-[max(env(safe-area-inset-bottom),12px)]">
        <DrawerHeader className="text-left"><DrawerTitle className="text-base">新增图片分组</DrawerTitle><DrawerDescription className="text-xs">选择图片比例并设置分组名称</DrawerDescription></DrawerHeader>
        <div className="space-y-4 overflow-y-auto px-4 pb-4"><Field label="图片比例"><OptionList options={ratios.map((item) => ({ value: item.type, label: `${item.ratio} · ${item.name.split(' ')[1] || ''}`, description: item.dimensions }))} value={type} onChange={(value) => setType(value as ImageGroupType)} /></Field><Field label="分组名称"><Input value={name} onChange={(event) => setName(event.target.value)} placeholder={ratios.find((item) => item.type === type)?.name} className="h-11 rounded-xl bg-white" /></Field></div>
        <DrawerFooter className="flex-row border-t border-slate-100 px-4 pt-3"><Button type="button" variant="outline" onClick={() => setOpen(false)} className="h-11 flex-1 rounded-xl">取消</Button><Button type="button" onClick={() => { onAdd(type, name.trim() || ratios.find((item) => item.type === type)!.name); setName(''); setType('main_1_1'); setOpen(false); }} className="h-11 flex-1 rounded-xl role-primary-bg text-white">确认新增</Button></DrawerFooter>
      </DrawerContent>
    </Drawer>
  </>;
}
