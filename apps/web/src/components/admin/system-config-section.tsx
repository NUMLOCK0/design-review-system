'use client';

import { useEffect, useRef, useState } from 'react';
import * as Select from '@radix-ui/react-select';
import { BellRing, Bold, ChevronDown, FileText, Heading2, ImageIcon, Italic, List, ListOrdered, Plus, RefreshCw, Save, Settings2, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { ImageGroupType, ImageTemplate, ImageTemplateGroup, SystemConfig } from '@design-review/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { fetchWithAuth } from '@/lib/auth';
import { toast } from 'sonner';

export type ConfigSection = 'commission' | 'operations' | 'publication' | 'announcement' | 'templates' | 'agreements';
const sections: Record<ConfigSection, { title: string; description: string; icon: typeof Settings2 }> = {
  commission: { title: '商业抽成配置', description: '按设计类目维护尾款服务费率，定金不参与抽成。', icon: SlidersHorizontal },
  operations: { title: '运营规则', description: '维护预算门槛、定金比例、抢单时效等全局规则。', icon: Settings2 },
  publication: { title: '发布与质检规则', description: '配置订单发布审核与作品审核的处理标准。', icon: SlidersHorizontal },
  announcement: { title: '前台公告', description: '发布展示在设计师接单大厅顶部的运营公告。', icon: BellRing },
  templates: { title: '图片模板配置', description: '配置分组、图片比例与张数，供品牌方一键套用。', icon: ImageIcon },
  agreements: { title: '用户协议与隐私协议', description: '维护登录页与协议详情页展示的正文。', icon: FileText },
};
const imageTypes: Array<{ value: ImageGroupType; label: string }> = [
  { value: 'main_1_1', label: '1:1 方形主图（800×800）' }, { value: 'main_3_4', label: '3:4 竖版长图（750×1000）' }, { value: 'main_4_3', label: '4:3 横版主图（1200×900）' }, { value: 'main_16_9', label: '16:9 横幅主图（1600×900）' }, { value: 'main_9_16', label: '9:16 竖版长图（900×1600）' }, { value: 'detail', label: '详情页长图（750×1500）' },
];
const newGroup = (index = 0): ImageTemplateGroup => ({ id: `image_template_group_${Date.now()}_${index}`, name: '1:1 方形主图', groupType: 'main_1_1', quantity: 1 });

export function SystemConfigSection({ section }: { section: ConfigSection }) {
  const meta = sections[section];
  const Icon = meta.icon;
  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 6;
  const load = async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth('/system-config'); const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '加载配置失败');
      setConfig(result.data);
    } catch (error: any) { toast.error(error.message || '加载配置失败'); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const { id: _id, updatedAt: _updatedAt, ...updates } = config;
      const response = await fetchWithAuth('/system-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) }); const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '保存失败');
      setConfig(result.data); toast.success('配置已保存并生效');
    } catch (error: any) { toast.error(error.message || '保存失败'); } finally { setSaving(false); }
  };
  const templates = config?.imageTemplates || [];
  const updateTemplates = (imageTemplates: ImageTemplate[]) => setConfig((current) => current ? { ...current, imageTemplates } : current);
  const updateTemplate = (id: string, patch: Partial<ImageTemplate>) => updateTemplates(templates.map((item) => item.id === id ? { ...item, ...patch } : item));
  const updateGroup = (templateId: string, groupId: string, patch: Partial<ImageTemplateGroup>) => updateTemplates(templates.map((template) => template.id !== templateId ? template : { ...template, groups: template.groups.map((group) => group.id === groupId ? { ...group, ...patch } : group) }));
  if (loading || !config) return <div className="p-12 text-center text-xs text-slate-400">正在载入配置…</div>;
  const visibleTemplates = templates.slice((page - 1) * pageSize, page * pageSize);
  const visibleTiers = config.commissionTiers.slice((page - 1) * pageSize, page * pageSize);
  const addTemplate = () => { updateTemplates([...templates, { id: `image_template_${Date.now()}`, name: '未命名图片模板', groups: [newGroup()] }]); setPage(Math.ceil((templates.length + 1) / pageSize)); };

  return <div className="mx-auto max-w-5xl space-y-4 p-3 sm:space-y-5 sm:p-6 lg:p-8">
    <div className="flex flex-col gap-4 rounded-3xl border border-white/80 bg-white/75 p-6 shadow-sm backdrop-blur-md md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-3"><div className="role-primary-gradient flex h-10 w-10 items-center justify-center rounded-2xl text-white shadow-md"><Icon className="h-5 w-5" /></div><div><h1 className="text-xl font-bold tracking-tight text-slate-800">{meta.title}</h1><p className="mt-1 text-xs text-slate-500">{meta.description}</p></div></div><div className="flex gap-2"><Button variant="outline" onClick={() => void load()} disabled={loading} className="h-9 rounded-xl text-xs"><RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />重置更改</Button><Button onClick={() => void save()} disabled={saving} className="role-primary-gradient h-9 rounded-xl text-xs text-white"><Save className="mr-1.5 h-3.5 w-3.5" />{saving ? '保存中…' : '保存生效'}</Button></div></div>

    {section === 'commission' && <Card className="rounded-3xl"><CardHeader><CardTitle className="text-base">各设计类目尾款服务费率</CardTitle><CardDescription>服务费仅在验收时支付的尾款内扣除。</CardDescription></CardHeader><CardContent className="p-0"><div className="divide-y divide-slate-100">{visibleTiers.map((tier) => { const index = config.commissionTiers.findIndex((item) => item.id === tier.id); return <div key={tier.id} className="flex flex-col gap-3 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-semibold text-slate-800">{tier.category}</p><p className="mt-1 text-xs text-slate-400">{tier.description || '未填写说明'} · 区间 {(tier.minRate * 100).toFixed(0)}% - {(tier.maxRate * 100).toFixed(0)}%</p></div><div className="flex items-center gap-2"><Input type="number" min={tier.minRate * 100} max={tier.maxRate * 100} value={Math.round(tier.defaultRate * 100)} onChange={(event) => { const commissionTiers = [...config.commissionTiers]; commissionTiers[index] = { ...tier, defaultRate: Number(event.target.value) / 100 }; setConfig({ ...config, commissionTiers }); }} className="h-9 w-20 rounded-xl text-center text-xs" /><span className="text-xs text-slate-500">%</span></div></div>; })}</div><AdminPagination page={page} pageSize={pageSize} total={config.commissionTiers.length} onPageChange={setPage} /></CardContent></Card>}

    {section === 'operations' && <Card className="rounded-3xl"><CardContent className="grid gap-5 p-6 sm:grid-cols-2"><Field label="单笔订单最低预算（元）"><Input type="number" min={0} value={config.minOrderBudget} onChange={(event) => setConfig({ ...config, minOrderBudget: Number(event.target.value) })} /></Field><Field label="发布订单定金比例"><div className="flex items-center gap-2"><Input type="number" min={1} max={100} value={Math.round(config.depositRate * 100)} onChange={(event) => setConfig({ ...config, depositRate: Number(event.target.value) / 100 })} /><span className="text-xs text-slate-500">%</span></div></Field><div className="space-y-2 sm:col-span-2"><div><p className="text-xs font-semibold text-slate-700">图片类型最低单价（元/张）</p><p className="mt-1 text-[11px] text-slate-400">订单最低出价按每类图片单价乘以数量汇总，并且不低于单笔订单最低预算。</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{imageTypes.map((type) => <Field key={type.value} label={type.label}><Input type="number" min={0} step="0.01" value={config.imageUnitPrices[type.value]} onChange={(event) => setConfig({ ...config, imageUnitPrices: { ...config.imageUnitPrices, [type.value]: Number(event.target.value) } })} /></Field>)}</div></div><Field label="PSD 源文件最低价上浮比例"><div className="flex items-center gap-2"><Input type="number" min={0} max={100} step="1" value={Math.round(config.psdSurchargeRate * 100)} onChange={(event) => setConfig({ ...config, psdSurchargeRate: Number(event.target.value) / 100 })} /><span className="text-xs text-slate-500">%</span></div><p className="text-[11px] text-slate-400">品牌方选择需要 PSD 源文件时，最低出价按该比例上浮。</p></Field><Field label="抢单无响应释放（分钟）"><Input type="number" min={1} value={config.autoClaimTimeoutMinutes} onChange={(event) => setConfig({ ...config, autoClaimTimeoutMinutes: Number(event.target.value) })} /></Field><Field label="最大免费返修次数"><Input type="number" min={0} value={config.maxRevisionLimit} onChange={(event) => setConfig({ ...config, maxRevisionLimit: Number(event.target.value) })} /></Field><div className="flex items-center justify-between rounded-2xl border border-slate-100 p-4 sm:col-span-2"><div><p className="text-sm font-semibold text-slate-800">允许设计师自由竞价</p><p className="mt-1 text-xs text-slate-400">开启后设计师可以就订单提交议价方案。</p></div><Switch checked={config.allowDesignerBidding} onCheckedChange={(allowDesignerBidding) => setConfig({ ...config, allowDesignerBidding })} /></div></CardContent></Card>}

    {section === 'publication' && <Card className="rounded-3xl"><CardContent className="space-y-4 p-6"><div className="flex items-center justify-between rounded-2xl border border-slate-100 p-4"><div><p className="text-sm font-semibold text-slate-800">订单发布审核</p><p className="mt-1 text-xs text-slate-400">开启后，品牌方支付定金的订单须由客服审核后上架。</p></div><Switch checked={config.requireOrderPublicationReview} onCheckedChange={(requireOrderPublicationReview) => setConfig({ ...config, requireOrderPublicationReview })} /></div><Field label="作品审核严格度"><div className="grid gap-2 sm:grid-cols-3">{[{ value: 'strict', label: '严谨模式', desc: '逐级审核' }, { value: 'standard', label: '标准模式', desc: '双级审核' }, { value: 'relaxed', label: '敏捷模式', desc: '快速交付' }].map((item) => <button key={item.value} type="button" onClick={() => setConfig({ ...config, reviewStrictLevel: item.value as SystemConfig['reviewStrictLevel'] })} className={`rounded-2xl border p-3 text-left ${config.reviewStrictLevel === item.value ? 'role-primary-border role-primary-soft' : 'border-slate-200 hover:bg-slate-50'}`}><p className="text-xs font-semibold text-slate-800">{item.label}</p><p className="mt-1 text-[10px] text-slate-400">{item.desc}</p></button>)}</div></Field></CardContent></Card>}

    {section === 'announcement' && <Card className="rounded-3xl"><CardContent className="p-6"><Field label="接单大厅公告"><Textarea rows={6} value={config.announcement || ''} onChange={(event) => setConfig({ ...config, announcement: event.target.value })} placeholder="输入展示给设计师的运营公告" /></Field></CardContent></Card>}

    {section === 'agreements' && <Card className="rounded-3xl"><CardContent className="space-y-6 p-6"><Field label="用户协议正文"><RichTextEditor value={config.userAgreementContent} onChange={(userAgreementContent) => setConfig({ ...config, userAgreementContent })} /></Field><Field label="隐私协议正文"><RichTextEditor value={config.privacyPolicyContent} onChange={(privacyPolicyContent) => setConfig({ ...config, privacyPolicyContent })} /></Field></CardContent></Card>}

    {section === 'templates' && <Card className="rounded-3xl"><CardHeader className="flex-row items-center justify-between"><div><CardTitle className="text-base">可用图片模板</CardTitle><CardDescription>每组可设置图片比例与图片数量。</CardDescription></div><Button type="button" variant="outline" onClick={addTemplate} className="h-9 rounded-xl text-xs role-primary-text role-primary-border"><Plus className="mr-1.5 h-3.5 w-3.5" />新增模板</Button></CardHeader><CardContent className="space-y-3 p-6 pt-0">{!templates.length && <div className="rounded-2xl border border-dashed border-slate-200 py-8 text-center text-xs text-slate-400">暂无图片模板</div>}{visibleTemplates.map((template) => <div key={template.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex gap-2"><Input value={template.name} maxLength={60} onChange={(event) => updateTemplate(template.id, { name: event.target.value })} className="h-9 text-xs font-semibold" /><ConfirmAction title="确认删除图片模板？" description={`将删除「${template.name || '未命名图片模板'}」。`} confirmText="确认删除" onConfirm={() => updateTemplates(templates.filter((item) => item.id !== template.id))}><Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-slate-400 hover:text-rose-500"><Trash2 className="h-4 w-4" /></Button></ConfirmAction></div><div className="mt-3 space-y-2">{template.groups.map((group) => <div key={group.id} className="grid gap-2 rounded-xl bg-slate-50 p-2 sm:grid-cols-[1fr_190px_72px_32px]"><Input value={group.name} onChange={(event) => updateGroup(template.id, group.id, { name: event.target.value })} className="h-8 bg-white text-xs" /><Select.Root value={group.groupType} onValueChange={(groupType) => updateGroup(template.id, group.id, { groupType: groupType as ImageGroupType })}><Select.Trigger className="flex h-8 items-center justify-between rounded-lg border border-slate-200 bg-white px-2 text-xs"><Select.Value /><Select.Icon><ChevronDown className="h-3.5 w-3.5" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className="z-50 rounded-xl border bg-white p-1 shadow-md"><Select.Viewport>{imageTypes.map((item) => <Select.Item key={item.value} value={item.value} className="cursor-pointer rounded-lg px-2 py-1.5 text-xs hover:bg-slate-50"><Select.ItemText>{item.label}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root><Input type="number" min={1} max={99} value={group.quantity} onChange={(event) => updateGroup(template.id, group.id, { quantity: Math.max(1, Math.min(99, Number(event.target.value) || 1)) })} className="h-8 bg-white px-2 text-center text-xs" /><Button type="button" variant="ghost" size="icon" disabled={template.groups.length === 1} onClick={() => updateTemplates(templates.map((item) => item.id !== template.id ? item : { ...item, groups: item.groups.filter((current) => current.id !== group.id) }))} className="h-8 w-8 text-slate-400 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></Button></div>)}</div><Button type="button" variant="ghost" onClick={() => updateTemplates(templates.map((item) => item.id !== template.id ? item : { ...item, groups: [...item.groups, newGroup(item.groups.length)] }))} className="mt-2 h-8 px-2 text-xs role-primary-text"><Plus className="mr-1 h-3.5 w-3.5" />添加分组</Button></div>)}<AdminPagination page={page} pageSize={pageSize} total={templates.length} onPageChange={setPage} /></CardContent></Card>}
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-2"><Label className="text-xs font-semibold text-slate-700">{label}</Label>{children}</div>; }

function RichTextEditor({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const toHtml = (content: string) => /<\/?[a-z][^>]*>/i.test(content) ? content : content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  useEffect(() => { if (editorRef.current && editorRef.current.innerHTML !== toHtml(value)) editorRef.current.innerHTML = toHtml(value); }, [value]);
  const command = (name: string, argument?: string) => { editorRef.current?.focus(); document.execCommand(name, false, argument); onChange(editorRef.current?.innerHTML || ''); };
  const buttons = [{ label: '加粗', icon: Bold, command: 'bold' }, { label: '斜体', icon: Italic, command: 'italic' }, { label: '二级标题', icon: Heading2, command: 'formatBlock', argument: 'h2' }, { label: '无序列表', icon: List, command: 'insertUnorderedList' }, { label: '有序列表', icon: ListOrdered, command: 'insertOrderedList' }];
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white focus-within:role-primary-border focus-within:ring-2 focus-within:ring-[var(--role-primary-border)]"><div className="flex flex-wrap gap-1 border-b border-slate-100 bg-slate-50 px-2 py-1.5">{buttons.map((item) => { const Icon = item.icon; return <Button key={item.label} type="button" variant="ghost" size="icon" title={item.label} aria-label={item.label} onMouseDown={(event) => event.preventDefault()} onClick={() => command(item.command, item.argument)} className="h-7 w-7 rounded-lg text-slate-500 hover:role-primary-soft hover:role-primary-text"><Icon className="h-3.5 w-3.5" /></Button>; })}</div><div ref={editorRef} contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" onInput={(event) => onChange((event.currentTarget as HTMLDivElement).innerHTML)} onPaste={(event) => { event.preventDefault(); document.execCommand('insertText', false, event.clipboardData.getData('text/plain')); }} className="min-h-64 px-4 py-3 text-sm leading-7 text-slate-700 outline-none [&_h2]:my-3 [&_h2]:text-lg [&_h2]:font-bold [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6" /></div>;
}
