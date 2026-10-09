'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import * as Select from '@radix-ui/react-select';
import { ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import type { ImageGroupType, PlatformType, ReviewRule } from '@design-review/shared';
import { calculateOrderMinimumBudget } from '@design-review/shared';
import { fetchWithAuth, getCurrentUser } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

const styles = ['极简留白', '清新自然', '轻奢高级', '国潮东方', '科技未来', '活力促销', '复古怀旧', '可爱治愈', '专业可信', '手绘插画', '暗黑酷炫', '其他'];
const types: Array<{ type: ImageGroupType; name: string; dimensions: string }> = [
  { type: 'main_1_1', name: '1:1 方形主图', dimensions: '800×800' },
  { type: 'main_3_4', name: '3:4 竖版长图', dimensions: '750×1000' },
  { type: 'main_4_3', name: '4:3 横版主图', dimensions: '1200×900' },
  { type: 'main_16_9', name: '16:9 横幅主图', dimensions: '1600×900' },
  { type: 'main_9_16', name: '9:16 竖版海报', dimensions: '900×1600' },
  { type: 'detail', name: '详情页长图', dimensions: '750×1500' },
];
const categories = ['主图设计', '详情页设计', '活动海报', '3D建模与渲染', '精修合成'];
const platforms: Array<{ id: PlatformType; label: string }> = [{ id: 'tmall', label: '天猫商城' }, { id: 'taobao', label: '淘宝网' }, { id: 'douyin', label: '抖音电商' }, { id: 'pinduoduo', label: '拼多多' }, { id: 'universal', label: '全网通用' }];
const fieldClass = 'h-11 rounded-xl border-slate-200 bg-white text-sm';
const steps = [
  { title: '项目基本信息', hint: '先告诉设计师要做什么、投放到哪里。' },
  { title: '交付范围', hint: '选择图片规格和数量，暂时按大致范围填写即可。' },
  { title: '设计方向', hint: '补充风格、卖点和参考资料；不确定的内容可以跳过。' },
  { title: '预算与交付', hint: '设置预算、交付周期，并选择作品审核流程。' },
  { title: '核对并发布', hint: '检查订单信息，确认无误后发布。' },
];

type DraftPayload = {
  step: number; title: string; category: string; platform: PlatformType; groupType: ImageGroupType;
  quantity: string; selectedStyles: string[]; customStyle: string; brief: string; links: string[];
  days: string; urgency: 'normal' | 'urgent' | 'super_urgent'; requiresPsd: boolean; budget: string; ruleId: string;
};

export function SimpleCreateOrder({ mobile = false }: { mobile?: boolean }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [platform, setPlatform] = useState<PlatformType>('tmall');
  const [groupType, setGroupType] = useState<ImageGroupType>('main_1_1');
  const [quantity, setQuantity] = useState('1');
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [customStyle, setCustomStyle] = useState('');
  const [brief, setBrief] = useState('');
  const [links, setLinks] = useState(['']);
  const [days, setDays] = useState('3');
  const [urgency, setUrgency] = useState<'normal' | 'urgent' | 'super_urgent'>('normal');
  const [requiresPsd, setRequiresPsd] = useState(false);
  const [budget, setBudget] = useState('');
  const [rules, setRules] = useState<ReviewRule[]>([]);
  const [ruleId, setRuleId] = useState('');
  const [pricing, setPricing] = useState({ minOrderBudget: 0, psdSurchargeRate: 0.2, imageUnitPrice: 100, imageUnitPrices: {} as Partial<Record<ImageGroupType, number>> });
  const [step, setStep] = useState(0);
  const [draftVersion, setDraftVersion] = useState(0);
  const [draftReady, setDraftReady] = useState(false);
  const [draftSaving, setDraftSaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const user = getCurrentUser();
  const returnPath = mobile ? '/mobile/orders/new' : '/advertiser/orders';
  const selectedType = types.find((item) => item.type === groupType) || types[0];
  const count = Math.max(1, Math.min(50, Number(quantity) || 1));
  const minBudget = useMemo(() => calculateOrderMinimumBudget([{ id: 'simple_group', name: selectedType.name, groupType, quantity: count, dimensions: selectedType.dimensions, referenceImages: [], referenceLinks: [] }], pricing.imageUnitPrices, pricing.minOrderBudget, requiresPsd, pricing.psdSurchargeRate, pricing.imageUnitPrice), [groupType, count, selectedType, pricing, requiresPsd]);

  useEffect(() => {
    if (!user || user.role !== 'advertiser') {
      router.replace(`/login/advertiser?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    let active = true;
    Promise.allSettled([
      fetchWithAuth('/review-rules/mine').then((response) => response.json()),
      fetchWithAuth('/system-config/order-pricing').then((response) => response.json()),
      fetchWithAuth('/order-drafts/current').then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || '读取发单草稿失败');
        return result.data;
      }),
    ]).then(([ruleResponse, priceResponse, draftResponse]) => {
      if (!active) return;
      const ruleResult = ruleResponse.status === 'fulfilled' ? ruleResponse.value : null;
      const priceResult = priceResponse.status === 'fulfilled' ? priceResponse.value : null;
      const draft = draftResponse.status === 'fulfilled' ? draftResponse.value : null;
      if (draftResponse.status === 'rejected') toast.error(draftResponse.reason instanceof Error ? draftResponse.reason.message : '读取发单草稿失败');
      const available: ReviewRule[] = ruleResult?.success ? ruleResult.data || [] : [];
      setRules(available);
      const preferred = available.find((rule) => rule.ownerId === user.id && rule.name === '自己审核') || available[0];
      if (draft) {
        const data = draft.payload as Partial<DraftPayload>;
        setTitle(data.title || ''); setCategory(data.category || categories[0]); setPlatform(data.platform || 'tmall');
        setGroupType(data.groupType || 'main_1_1'); setQuantity(data.quantity || '1'); setSelectedStyles(data.selectedStyles || []);
        setCustomStyle(data.customStyle || ''); setBrief(data.brief || ''); setLinks(data.links?.length ? data.links : ['']);
        setDays(data.days || '3'); setUrgency(data.urgency || 'normal'); setRequiresPsd(Boolean(data.requiresPsd));
        setBudget(data.budget || ''); setRuleId(data.ruleId || preferred?.id || '');
        setStep(Math.max(0, Math.min(4, data.step || 0))); setDraftVersion(draft.version);
        toast.info('已载入上次保存的发单草稿');
      } else if (preferred) setRuleId(preferred.id);
      if (priceResult?.success && priceResult.data) setPricing({ minOrderBudget: Number(priceResult.data.minOrderBudget) || 0, psdSurchargeRate: Number(priceResult.data.psdSurchargeRate) || 0.2, imageUnitPrice: Number(priceResult.data.imageUnitPrice) || 0, imageUnitPrices: priceResult.data.imageUnitPrices || {} });
    }).catch((error) => { if (active) toast.error(error instanceof Error ? error.message : '发单数据加载失败'); })
      .finally(() => { if (active) setDraftReady(true); });
    return () => { active = false; };
  }, [user?.id, router]);

  const getDraftPayload = (targetStep = step): DraftPayload => ({ step: targetStep, title, category, platform, groupType, quantity, selectedStyles, customStyle, brief, links, days, urgency, requiresPsd, budget, ruleId });
  const saveDraft = async (targetStep = step) => {
    setDraftSaving(true);
    try {
      const response = await fetchWithAuth('/order-drafts/current', { method: 'PUT', body: JSON.stringify({ version: draftVersion, payload: getDraftPayload(targetStep) }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '草稿保存失败');
      setDraftVersion(result.data.version);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '草稿保存失败');
      return false;
    } finally { setDraftSaving(false); }
  };

  const goNext = async (skipOptional = false) => {
    if (step === 0 && !title.trim()) return toast.error('请先填写订单名称');
    if (step === 2 && !skipOptional && selectedStyles.includes('其他') && !customStyle.trim()) return toast.error('请填写其他设计风格，或跳过这一步');
    if (step === 3) {
      if (!ruleId) return toast.error('请先配置并选择作品审核流');
      if (!Number.isFinite(Number(budget)) || Number(budget) < minBudget) return toast.error(`预算不能低于 ¥${minBudget.toFixed(2)}`);
    }
    const nextStep = Math.min(4, step + 1);
    if (await saveDraft(nextStep)) setStep(nextStep);
  };
  const goBack = async () => {
    const previousStep = Math.max(0, step - 1);
    if (await saveDraft(previousStep)) setStep(previousStep);
  };

  const toggleStyle = (style: string) => setSelectedStyles((current) => current.includes(style) ? current.filter((item) => item !== style) : current.length >= 3 ? (toast.error('最多选择 3 种设计风格'), current) : [...current, style]);
  const updateLink = (index: number, value: string) => setLinks((current) => current.map((link, i) => i === index ? value : link));
  const addLink = () => setLinks((current) => current.length >= 5 ? (toast.error('最多添加 5 个参考链接'), current) : [...current, '']);

  const submit = async () => {
    if (!title.trim()) { setStep(0); return toast.error('请填写订单名称'); }
    if (!ruleId) { setStep(3); return toast.error('请先配置并选择作品审核流'); }
    if (!Number.isFinite(Number(budget)) || Number(budget) < minBudget) { setStep(3); return toast.error(`预算不能低于 ¥${minBudget.toFixed(2)}`); }
    const validLinks = links.map((value) => value.trim()).filter(Boolean);
    if (validLinks.some((link) => { try { const url = new URL(link); return !['http:', 'https:'].includes(url.protocol); } catch { return true; } })) { setStep(2); return toast.error('请检查参考链接格式，链接需以 http:// 或 https:// 开头'); }
    if (selectedStyles.includes('其他') && !customStyle.trim()) { setStep(2); return toast.error('请填写其他设计风格'); }
    const styleText = [...selectedStyles.filter((item) => item !== '其他'), ...(customStyle.trim() ? [customStyle.trim()] : [])];
    const imageItems = [{ id: `simple_${Date.now()}`, description: brief.trim() || '由品牌方提供简要需求，沟通后确认设计细节。', materialImage: '', referenceImages: [], referenceLinks: validLinks, referenceLinkItems: validLinks.map((link, index) => ({ id: `simple_ref_${index}`, image: '', link, description: '' })) }];
    const payload = {
      title: title.trim(), category, platform, budget: Number(budget), urgency,
      deadline: new Date(Date.now() + Number(days) * 86400000).toISOString(),
      requirements: [brief.trim(), styleText.length ? `参考设计风格：${styleText.join('、')}` : ''].filter(Boolean).join('\n\n'),
      requiresPsd, reviewRuleId: ruleId, reviewRuleName: rules.find((rule) => rule.id === ruleId)?.name,
      imageRequirementGroups: [{ id: `simple_group_${Date.now()}`, name: selectedType.name, groupType, quantity: count, dimensions: selectedType.dimensions, imageItems: Array.from({ length: count }, (_, index) => ({ ...imageItems[0], id: `simple_${Date.now()}_${index}` })), materialImages: [], description: brief.trim(), referenceImages: [], referenceLinks: validLinks }],
    };
    setSaving(true);
    try {
      const response = await fetchWithAuth('/design-orders', { method: 'POST', body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '订单提交失败');
      if (draftVersion > 0) await fetchWithAuth('/order-drafts/current', { method: 'DELETE', body: JSON.stringify({ version: draftVersion }) }).catch(() => undefined);
      toast.success('订单已提交');
      router.push(mobile ? `/mobile/orders/${result.data.id}` : '/advertiser/orders');
    } catch (error) { toast.error(error instanceof Error ? error.message : '订单提交失败'); }
    finally { setSaving(false); }
  };

  const progress = (step + 1) / steps.length * 100;
  return <main className="min-h-dvh bg-slate-50 pb-[calc(88px+env(safe-area-inset-bottom))]">
    <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur"><div className="mx-auto max-w-3xl"><div className="flex items-center gap-3"><button type="button" onClick={() => router.push(returnPath)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-600" aria-label="返回"><ArrowLeft className="h-4 w-4" /></button><div><h1 className="text-sm font-bold text-slate-900">引导式发单</h1><p className="mt-0.5 text-[11px] text-slate-500">按步骤补充信息，随时可以返回修改</p></div><span className="ml-auto text-xs font-semibold text-slate-500">{step + 1} / {steps.length}</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full role-primary-bg transition-all" style={{ width: `${progress}%` }} /></div></div></header>
    <div className="mx-auto max-w-3xl px-4 py-5 sm:px-6 sm:py-8">
      <div className="mb-4"><p className="text-xs font-semibold role-primary-text">第 {step + 1} 步</p><h2 className="mt-1 text-xl font-bold text-slate-900">{steps[step].title}</h2><p className="mt-1 text-sm text-slate-500">{steps[step].hint}</p></div>
      <section className="space-y-5 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6">
        {!draftReady ? <p className="py-8 text-center text-sm text-slate-500">正在载入草稿…</p> : <>
          {step === 0 && <>
            <Field label="订单名称" required><Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="例如：春季新品主图设计" className={fieldClass} autoFocus /></Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="设计类型"><FormSelect value={category} onValueChange={setCategory} options={categories.map((item) => ({ value: item, label: item }))} /></Field><Field label="投放平台"><FormSelect value={platform} onValueChange={(value) => setPlatform(value as PlatformType)} options={platforms.map((item) => ({ value: item.id, label: item.label }))} /></Field></div>
          </>}
          {step === 1 && <>
            <Field label="交付规格"><FormSelect value={groupType} onValueChange={(value) => setGroupType(value as ImageGroupType)} options={types.map((item) => ({ value: item.type, label: `${item.name} · ${item.dimensions}` }))} /></Field>
            <Field label="大致数量"><div className="flex items-center gap-3"><Input type="number" min={1} max={50} value={quantity} onChange={(event) => setQuantity(event.target.value)} className={`${fieldClass} max-w-36`} /><span className="text-sm text-slate-500">张</span></div><span className="text-[11px] text-slate-400">可以先填估算值，后续仍可和设计师确认</span></Field>
          </>}
          {step === 2 && <>
            <Field label="参考设计风格"><div className="flex flex-wrap gap-2">{styles.map((style) => { const active = selectedStyles.includes(style); return <button key={style} type="button" aria-pressed={active} onClick={() => toggleStyle(style)} className={`min-h-9 rounded-full border px-3 text-xs font-medium transition ${active ? 'border-[var(--role-primary-border)] role-primary-soft role-primary-text' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>{active && <Check className="mr-1 inline h-3 w-3" />}{style}</button>; })}</div><span className="text-[11px] text-slate-400">最多选择 3 项；不确定时可以留空</span>{selectedStyles.includes('其他') && <Input value={customStyle} onChange={(event) => setCustomStyle(event.target.value)} placeholder="请描述你想要的风格" className={fieldClass} />}</Field>
            <Field label="产品特点或核心卖点"><Textarea value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={1000} rows={4} placeholder="例如：突出产品轻便和透气卖点，整体希望简洁清爽。" className="min-h-24 resize-y rounded-xl border-slate-200 text-sm" /><span className="text-right text-[11px] text-slate-400">{brief.length}/1000</span></Field>
            <Field label="参考链接（选填）"><div className="space-y-2">{links.map((link, index) => <div key={index} className="flex gap-2"><Input type="url" value={link} onChange={(event) => updateLink(index, event.target.value)} placeholder="https:// 商品或参考作品" className={fieldClass} />{links.length > 1 && <button type="button" onClick={() => setLinks((current) => current.filter((_, i) => i !== index))} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600" aria-label="删除链接"><Trash2 className="h-4 w-4" /></button>}</div>)}</div><button type="button" onClick={addLink} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold role-primary-text"><Plus className="h-3.5 w-3.5" />添加链接</button></Field>
          </>}
          {step === 3 && <>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="交付周期"><FormSelect value={days} onValueChange={setDays} options={[['1','24 小时'],['2','2 天'],['3','3 天'],['5','5 天'],['7','7 天']].map(([value, label]) => ({ value, label }))} /></Field><Field label="订单优先级"><FormSelect value={urgency} onValueChange={(value) => setUrgency(value as typeof urgency)} options={[{ value: 'normal', label: '标准' }, { value: 'urgent', label: '加急' }, { value: 'super_urgent', label: '特急' }]} /></Field></div>
            <Field label="预算（元）" required><Input type="number" min={minBudget} step="0.01" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder={`最低 ¥${minBudget.toFixed(2)}`} className={fieldClass} /><span className="text-[11px] text-slate-500">当前最低预算：¥{minBudget.toFixed(2)}{requiresPsd ? '（含 PSD 源文件要求）' : ''}</span></Field>
            <label className="flex min-h-12 items-center justify-between rounded-xl border border-slate-200 px-3"><span><span className="block text-xs font-semibold text-slate-700">需要 PSD 源文件</span><span className="mt-1 block text-[11px] text-slate-400">开启后最低报价将按规则上浮</span></span><input type="checkbox" checked={requiresPsd} onChange={(event) => setRequiresPsd(event.target.checked)} className="h-4 w-4 accent-[var(--role-primary)]" /></label>
            <Field label="作品审核流" required><FormSelect value={ruleId} onValueChange={setRuleId} placeholder="请选择审核流" options={rules.map((rule) => ({ value: rule.id, label: rule.name }))} />{!rules.length && <span className="text-[11px] text-rose-600">暂无可用审核流，请先前往配置后再发单。</span>}</Field>
          </>}
          {step === 4 && <>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">{[
              ['项目', title || '未填写', '修改', 0], ['类型与平台', `${category} · ${platforms.find((item) => item.id === platform)?.label}`, '修改', 0],
              ['交付范围', `${selectedType.name} · ${count} 张`, '修改', 1], ['设计方向', selectedStyles.length ? selectedStyles.join('、') : '暂未指定', '修改', 2],
              ['需求描述', brief || '未填写，可提交后继续沟通', '修改', 2], ['预算与周期', `¥${Number(budget || 0).toFixed(2)} · ${days} 天 · ${urgency === 'normal' ? '标准' : urgency === 'urgent' ? '加急' : '特急'}`, '修改', 3],
              ['审核流程', rules.find((rule) => rule.id === ruleId)?.name || '未选择', '修改', 3],
            ].map(([label, value, action, target]) => <div key={String(label)} className="flex items-start gap-3 px-3 py-3"><span className="w-20 shrink-0 text-xs text-slate-500">{label}</span><span className="min-w-0 flex-1 break-words text-sm font-medium text-slate-800">{value}</span><button type="button" onClick={() => setStep(Number(target))} className="text-xs font-semibold role-primary-text">{action}</button></div>)}</div>
            <div className="rounded-xl role-primary-soft p-4"><p className="text-sm font-semibold role-primary-text">最低预算 ¥{minBudget.toFixed(2)}</p><p className="mt-1 text-xs leading-5 text-slate-600">发布后先支付定金，再由客服审核；通过后进入接单大厅。你仍可在订单协作中和设计师进一步确认需求。</p></div>
          </>}
        </>}
      </section>
      <p className="mt-3 text-center text-[11px] text-slate-400">{draftSaving ? '正在保存…' : draftVersion ? '已保存到账号，可在其他设备继续' : '每次进入下一步都会自动保存'}</p>
    </div>
    <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur"><div className="mx-auto flex max-w-3xl items-center justify-between gap-3"><span className="hidden text-xs text-slate-500 sm:inline">最低预算 <b className="text-slate-800">¥{minBudget.toFixed(2)}</b></span><div className="ml-auto flex w-full gap-2 sm:w-auto">{step > 0 ? <Button type="button" variant="outline" disabled={draftSaving || saving} onClick={() => void goBack()} className="h-11 flex-1 rounded-xl sm:flex-none"><ChevronLeft className="mr-1 h-4 w-4" />上一步</Button> : <Button type="button" variant="outline" onClick={() => router.push(returnPath)} className="h-11 flex-1 rounded-xl sm:flex-none">退出</Button>}{step < 4 ? <><Button type="button" disabled={!draftReady || draftSaving || saving} onClick={() => void goNext(step === 2)} className="h-11 flex-[2] rounded-xl role-primary-bg text-sm font-bold text-white sm:min-w-40 sm:flex-none">{step === 2 ? '跳过 / 下一步' : '保存并继续'}<ChevronRight className="ml-1 h-4 w-4" /></Button></> : <Button type="button" disabled={saving || draftSaving} onClick={() => void submit()} className="h-11 flex-[2] rounded-xl role-primary-bg text-sm font-bold text-white sm:min-w-40 sm:flex-none">{saving ? '提交中…' : '确认并发布'}</Button>}</div></div></footer>
  </main>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1.5"><span className="text-xs font-semibold text-slate-700">{label}{required && <i className="ml-1 not-italic text-rose-600">*</i>}</span>{children}</label>;
}

function FormSelect({ value, onValueChange, options, placeholder }: { value: string; onValueChange: (value: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string }) {
  return <Select.Root value={value || undefined} onValueChange={onValueChange}>
    <Select.Trigger className={`flex ${fieldClass} w-full items-center justify-between border px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--role-primary-border)] data-[placeholder]:text-slate-400`}><Select.Value placeholder={placeholder} /><Select.Icon><ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /></Select.Icon></Select.Trigger>
    <Select.Portal><Select.Content position="popper" className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg"><Select.Viewport>{options.map((option) => <Select.Item key={option.value} value={option.value} className="flex cursor-pointer items-center rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-slate-100 data-[state=checked]:bg-slate-50 data-[state=checked]:font-semibold"><Select.ItemText>{option.label}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal>
  </Select.Root>;
}
