'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import * as Select from '@radix-ui/react-select';
import { ArrowLeft, Check, ChevronDown, Plus, Trash2 } from 'lucide-react';
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
    fetchWithAuth('/review-rules/mine').then((response) => response.json()).then((result) => {
      const available: ReviewRule[] = result.success ? result.data || [] : [];
      setRules(available);
      const preferred = available.find((rule) => rule.ownerId === user.id && rule.name === '自己审核') || available[0];
      if (preferred) setRuleId(preferred.id);
    }).catch(() => setRules([]));
    fetchWithAuth('/system-config/order-pricing').then((response) => response.json()).then((result) => {
      if (result.success && result.data) setPricing({ minOrderBudget: Number(result.data.minOrderBudget) || 0, psdSurchargeRate: Number(result.data.psdSurchargeRate) || 0.2, imageUnitPrice: Number(result.data.imageUnitPrice) || 0, imageUnitPrices: result.data.imageUnitPrices || {} });
    }).catch(() => undefined);
  }, [user?.id, router]);

  const toggleStyle = (style: string) => setSelectedStyles((current) => current.includes(style) ? current.filter((item) => item !== style) : current.length >= 3 ? (toast.error('最多选择 3 种设计风格'), current) : [...current, style]);
  const updateLink = (index: number, value: string) => setLinks((current) => current.map((link, i) => i === index ? value : link));
  const addLink = () => setLinks((current) => current.length >= 5 ? (toast.error('最多添加 5 个参考链接'), current) : [...current, '']);

  const submit = async () => {
    if (!title.trim()) return toast.error('请填写订单名称');
    if (!ruleId) return toast.error('请先配置并选择作品审核流');
    if (!Number.isFinite(Number(budget)) || Number(budget) < minBudget) return toast.error(`预算不能低于 ¥${minBudget.toFixed(2)}`);
    const validLinks = links.map((value) => value.trim()).filter(Boolean);
    if (validLinks.some((link) => { try { const url = new URL(link); return !['http:', 'https:'].includes(url.protocol); } catch { return true; } })) return toast.error('请检查参考链接格式，链接需以 http:// 或 https:// 开头');
    if (selectedStyles.includes('其他') && !customStyle.trim()) return toast.error('请填写其他设计风格');
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
      toast.success('订单已提交');
      router.push(mobile ? `/mobile/orders/${result.data.id}` : '/advertiser/orders');
    } catch (error) { toast.error(error instanceof Error ? error.message : '订单提交失败'); }
    finally { setSaving(false); }
  };

  return <main className={`min-h-dvh bg-slate-50 ${mobile ? 'pb-[calc(88px+env(safe-area-inset-bottom))]' : 'pb-10'}`}>
    <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-4 py-3 backdrop-blur"><div className="mx-auto flex max-w-4xl items-center gap-3"><button type="button" onClick={() => router.push(returnPath)} className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-50 text-slate-600" aria-label={mobile ? '返回选择发单方式' : '返回订单列表'}><ArrowLeft className="h-4 w-4" /></button><div><h1 className="text-sm font-bold text-slate-900">简易发单</h1><p className="mt-0.5 text-[11px] text-slate-500">填写核心需求和参考资料，快速创建订单</p></div><span className="ml-auto rounded-full role-primary-soft px-2.5 py-1 text-[10px] font-semibold role-primary-text">简易模式</span></div></header>
    <div className="mx-auto grid max-w-4xl gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-4">
        <section className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6"><div><h2 className="text-sm font-bold text-slate-900">需求信息</h2><p className="mt-1 text-xs text-slate-500">简要描述目标，设计师可通过参考资料理解视觉方向。</p></div>
          <Field label="订单名称" required><Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="例如：春季新品主图设计" className={fieldClass} /></Field>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="设计类型"><FormSelect value={category} onValueChange={setCategory} options={categories.map((item) => ({ value: item, label: item }))} /></Field><Field label="投放平台"><FormSelect value={platform} onValueChange={(value) => setPlatform(value as PlatformType)} options={platforms.map((item) => ({ value: item.id, label: item.label }))} /></Field></div>
          <Field label="交付规格"><div className="grid grid-cols-[minmax(0,1fr)_100px] gap-2"><FormSelect value={groupType} onValueChange={(value) => setGroupType(value as ImageGroupType)} options={types.map((item) => ({ value: item.type, label: `${item.name} · ${item.dimensions}` }))} /><Input type="number" min={1} max={50} value={quantity} onChange={(event) => setQuantity(event.target.value)} className={fieldClass} aria-label="交付数量" /></div><span className="text-[11px] text-slate-400">填写本次需要设计的图片数量</span></Field>
          <Field label="参考设计风格"><div className="flex flex-wrap gap-2">{styles.map((style) => { const active = selectedStyles.includes(style); return <button key={style} type="button" aria-pressed={active} onClick={() => toggleStyle(style)} className={`min-h-9 rounded-full border px-3 text-xs font-medium transition ${active ? 'border-[var(--role-primary-border)] role-primary-soft role-primary-text' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>{active && <Check className="mr-1 inline h-3 w-3" />}{style}</button>; })}</div><span className="text-[11px] text-slate-400">最多选择 3 项；不确定时可留空</span>{selectedStyles.includes('其他') && <Input value={customStyle} onChange={(event) => setCustomStyle(event.target.value)} placeholder="请描述你想要的风格" className={fieldClass} />}</Field>
          <Field label="需求简述"><Textarea value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={1000} rows={4} placeholder="例如：突出产品轻便和透气卖点，整体希望简洁清爽。可写产品特点、核心卖点或需要避免的元素。" className="min-h-24 resize-y rounded-xl border-slate-200 text-sm" /><span className="text-right text-[11px] text-slate-400">{brief.length}/1000</span></Field>
          <Field label="参考链接"><div className="space-y-2">{links.map((link, index) => <div key={index} className="flex gap-2"><Input type="url" value={link} onChange={(event) => updateLink(index, event.target.value)} placeholder="https:// 参考作品或商品链接（选填）" className={fieldClass} />{links.length > 1 && <button type="button" onClick={() => setLinks((current) => current.filter((_, i) => i !== index))} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600" aria-label="删除链接"><Trash2 className="h-4 w-4" /></button>}</div>)}</div><button type="button" onClick={addLink} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold role-primary-text"><Plus className="h-3.5 w-3.5" />添加链接</button></Field>
        </section>
        <section className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-6"><div><h2 className="text-sm font-bold text-slate-900">报价与交付</h2><p className="mt-1 text-xs text-slate-500">报价不得低于系统根据交付类型和数量计算的最低金额。</p></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="交付周期"><FormSelect value={days} onValueChange={setDays} options={[['1','24 小时'],['2','2 天'],['3','3 天'],['5','5 天'],['7','7 天']].map(([value, label]) => ({ value, label }))} /></Field><Field label="订单优先级"><FormSelect value={urgency} onValueChange={(value) => setUrgency(value as typeof urgency)} options={[{ value: 'normal', label: '标准' }, { value: 'urgent', label: '加急' }, { value: 'super_urgent', label: '特急' }]} /></Field></div>
          <Field label="预算（元）" required><Input type="number" min={minBudget} step="0.01" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder={`最低 ¥${minBudget.toFixed(2)}`} className={fieldClass} /><span className="text-[11px] text-slate-500">当前最低预算：¥{minBudget.toFixed(2)}{requiresPsd ? '（含 PSD 源文件要求）' : ''}</span></Field>
          <label className="flex min-h-12 items-center justify-between rounded-xl border border-slate-200 px-3"><span><span className="block text-xs font-semibold text-slate-700">需要 PSD 源文件</span><span className="mt-1 block text-[11px] text-slate-400">开启后最低报价将按规则上浮</span></span><input type="checkbox" checked={requiresPsd} onChange={(event) => setRequiresPsd(event.target.checked)} className="h-4 w-4 accent-[var(--role-primary)]" /></label>
          <Field label="作品审核流" required><FormSelect value={ruleId} onValueChange={setRuleId} placeholder="请选择审核流" options={rules.map((rule) => ({ value: rule.id, label: rule.name }))} />{!rules.length && <span className="text-[11px] text-rose-600">暂无可用审核流，请先前往配置后再发单。</span>}</Field>
        </section>
      </div>
      <aside className="h-fit space-y-3 lg:sticky lg:top-20"><section className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:rounded-3xl sm:p-5"><h2 className="text-sm font-bold text-slate-900">发单规则</h2><ul className="mt-3 space-y-2.5 text-xs leading-5 text-slate-600"><li>订单需绑定已启用的作品审核流。</li><li>预算需达到系统按类型、数量及 PSD 要求计算的最低报价。</li><li>提交后先支付定金，再由客服审核；通过后进入接单大厅。</li><li>交付周期从订单开始执行后计算，复杂需求建议使用专业发单。</li></ul></section><section className="rounded-2xl border border-[var(--role-primary-border)] role-primary-soft p-4 sm:rounded-3xl"><p className="text-xs font-semibold role-primary-text">本单摘要</p><p className="mt-2 break-words text-sm font-bold text-slate-800">{title || '订单名称待填写'}</p><p className="mt-1 text-xs text-slate-600">{selectedType.name} · {count} 张 · {days} 天交付</p><p className="mt-2 text-xs text-slate-600">{selectedStyles.length ? selectedStyles.join('、') : '未选择风格'}</p></section></aside>
    </div>
    <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur"><div className="mx-auto flex max-w-4xl items-center justify-between gap-3"><span className="hidden text-xs text-slate-500 sm:inline">最低预算 <b className="text-slate-800">¥{minBudget.toFixed(2)}</b></span><div className="ml-auto flex w-full gap-2 sm:w-auto"><Button type="button" variant="outline" onClick={() => router.push(returnPath)} className="h-11 flex-1 rounded-xl sm:flex-none">返回</Button><Button type="button" disabled={saving} onClick={() => void submit()} className="h-11 flex-[2] rounded-xl role-primary-bg text-sm font-bold text-white sm:min-w-40 sm:flex-none">{saving ? '提交中…' : '确认并发布'}</Button></div></div></footer>
  </main>;
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1.5"><span className="text-xs font-semibold text-slate-700">{label}{required && <i className="ml-1 not-italic text-rose-600">*</i>}</span>{children}</label>;
}

function FormSelect({ value, onValueChange, options, placeholder }: { value: string; onValueChange: (value: string) => void; options: Array<{ value: string; label: string }>; placeholder?: string }) {
  return <Select.Root value={value || undefined} onValueChange={onValueChange}>
    <Select.Trigger className={`flex ${fieldClass} w-full items-center justify-between border px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--role-primary-border)] data-[placeholder]:text-slate-400`}>
      <Select.Value placeholder={placeholder} />
      <Select.Icon><ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /></Select.Icon>
    </Select.Trigger>
    <Select.Portal>
      <Select.Content position="popper" className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
        <Select.Viewport>{options.map((option) => <Select.Item key={option.value} value={option.value} className="flex cursor-pointer items-center rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-slate-100 data-[state=checked]:bg-slate-50 data-[state=checked]:font-semibold">
          <Select.ItemText>{option.label}</Select.ItemText>
        </Select.Item>)}</Select.Viewport>
      </Select.Content>
    </Select.Portal>
  </Select.Root>;
}
