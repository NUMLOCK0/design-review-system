'use client';

import { useEffect, useState } from 'react';
import * as Select from '@radix-ui/react-select';
import { Check, ChevronDown, Edit3, Eye, ImagePlus, Plus, Save, Trash2, UserRound } from 'lucide-react';
import type { DesignerPortfolio, DesignerProfile, PlatformType } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { ImageUpload } from '@/components/image-upload';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

const categories = ['主图设计', '详情页设计', '活动海报', '3D建模与渲染', '精修合成'];
const industries = ['服饰', '美妆', '食品', '家居', '数码', '母婴', '珠宝', '其他'];
const platforms: Array<{ id: PlatformType; label: string }> = [{ id: 'tmall', label: '天猫' }, { id: 'taobao', label: '淘宝' }, { id: 'douyin', label: '抖音电商' }, { id: 'pinduoduo', label: '拼多多' }, { id: 'universal', label: '全网通用' }];
const emptyProfile: DesignerProfile = { userId: '', name: '', headline: '', bio: '', industries: [], yearsExperience: 0, publicStatus: 'draft', profileCompleted: false, categories: [], platforms: [], styles: [], minBudget: 0, maxActiveOrders: 3, availabilityStatus: 'available', portfolioUrls: [], activeOrderCount: 0, qualityScore: 85, onTimeRate: 92 };
const emptyPortfolio = { title: '', coverUrl: '', imageUrls: [] as string[], category: '', industry: '', platform: '' as PlatformType | '', description: '', designerRole: '', tags: '', status: 'draft' as DesignerPortfolio['status'], isFeatured: false };

function TokenInput({ label, value, onChange, placeholder }: { label: string; value: string[]; onChange: (value: string[]) => void; placeholder: string }) {
  const text = value.join('、');
  return <div className="space-y-1.5"><Label className="text-xs text-slate-600">{label}</Label><Input value={text} onChange={(event) => onChange(event.target.value.split(/[、,，]/).map((item) => item.trim()).filter(Boolean))} placeholder={placeholder} className="h-9 rounded-xl text-xs" /></div>;
}

function SelectField({ value, onChange, children, placeholder = '请选择' }: { value: string; onChange: (value: string) => void; children: React.ReactNode; placeholder?: string }) {
  return <Select.Root value={value || undefined} onValueChange={onChange}><Select.Trigger className="flex h-9 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-700 outline-none focus:border-rose-300 focus:ring-2 focus:ring-rose-500/10"><Select.Value placeholder={placeholder} /><Select.Icon><ChevronDown className="h-3.5 w-3.5 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className="z-50 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-xl"><Select.Viewport>{children}</Select.Viewport></Select.Content></Select.Portal></Select.Root>;
}

function SelectItem({ value, children }: { value: string; children: React.ReactNode }) {
  return <Select.Item value={value} className="flex cursor-pointer items-center rounded-lg px-2.5 py-2 text-xs text-slate-700 outline-none data-[highlighted]:bg-rose-50 data-[highlighted]:text-rose-700"><Select.ItemText>{children}</Select.ItemText><Select.ItemIndicator className="ml-auto"><Check className="h-3.5 w-3.5" /></Select.ItemIndicator></Select.Item>;
}

export default function DesignerProfilePage() {
  const [profile, setProfile] = useState<DesignerProfile>(emptyProfile);
  const [portfolios, setPortfolios] = useState<DesignerPortfolio[]>([]);
  const [draft, setDraft] = useState({ ...emptyPortfolio });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [profileResponse, portfolioResponse] = await Promise.all([fetchWithAuth('/designer-profile/me'), fetchWithAuth('/designer-portfolios/mine')]);
      const profileResult = await profileResponse.json();
      const portfolioResult = await portfolioResponse.json();
      if (!profileResponse.ok || !profileResult.success) throw new Error(profileResult.message || '资料加载失败');
      if (!portfolioResponse.ok || !portfolioResult.success) throw new Error(portfolioResult.message || '作品加载失败');
      setProfile({ ...emptyProfile, ...profileResult.data });
      setPortfolios(portfolioResult.data || []);
    } catch (error: any) { toast.error(error.message || '加载设计师资料失败'); } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await fetchWithAuth('/designer-profile/me', { method: 'PUT', body: JSON.stringify(profile) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '资料保存失败');
      setProfile({ ...emptyProfile, ...result.data });
      toast.success(result.message || '个人主页已保存');
    } catch (error: any) { toast.error(error.message || '保存失败'); } finally { setSaving(false); }
  };

  const savePortfolio = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim() || !draft.imageUrls.length) return toast.error('请填写项目名称并上传作品图');
    setSaving(true);
    try {
      const payload = { ...draft, coverUrl: draft.coverUrl || draft.imageUrls[0], tags: draft.tags.split(/[、,，]/).map((item) => item.trim()).filter(Boolean) };
      const response = await fetchWithAuth(editingId ? `/designer-portfolios/${editingId}` : '/designer-portfolios', { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '作品保存失败');
      setPortfolios((current) => editingId ? current.map((item) => item.id === editingId ? result.data : item) : [result.data, ...current]);
      setDraft({ ...emptyPortfolio });
      setEditingId(null);
      toast.success(result.message || '作品已保存');
    } catch (error: any) { toast.error(error.message || '作品保存失败'); } finally { setSaving(false); }
  };

  const editPortfolio = (item: DesignerPortfolio) => setDraft({ title: item.title, coverUrl: item.coverUrl, imageUrls: item.imageUrls, category: item.category || '', industry: item.industry || '', platform: item.platform || '', description: item.description || '', designerRole: item.designerRole || '', tags: item.tags.join('、'), status: item.status, isFeatured: item.isFeatured });
  const removePortfolio = async (id: string) => {
    if (!window.confirm('确认删除这个作品项目吗？')) return;
    const response = await fetchWithAuth(`/designer-portfolios/${id}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok || !result.success) return toast.error(result.message || '删除失败');
    setPortfolios((current) => current.filter((item) => item.id !== id));
    toast.success('作品已删除');
  };

  if (loading) return <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-400">正在加载个人主页…</div>;
  return <section className="space-y-5">
    <div className="flex flex-col gap-3 rounded-3xl border border-rose-100 bg-gradient-to-r from-white to-rose-50/70 p-6 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-semibold text-rose-600">设计师空间</p><h1 className="mt-1 text-2xl font-bold text-slate-900">个人主页与作品集</h1><p className="mt-2 text-xs text-slate-500">完善资料，让品牌方更快了解你的专业方向。</p></div><div className="flex items-center gap-2"><Badge className={profile.publicStatus === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}>{profile.publicStatus === 'published' ? '主页已公开' : '主页未公开'}</Badge>{profile.publicStatus === 'published' && <Button variant="outline" className="h-8 rounded-xl text-xs" onClick={() => window.location.href = `/designers/${profile.userId}`}><Eye className="mr-1 h-3.5 w-3.5" />预览主页</Button>}</div></div>
    <form onSubmit={saveProfile}><Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserRound className="h-4 w-4 text-rose-600" />基础资料</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label className="text-xs text-slate-600">展示名称</Label><Input value={profile.name} disabled className="h-9 rounded-xl bg-slate-50 text-xs" /></div><div className="space-y-1.5"><Label className="text-xs text-slate-600">一句话简介</Label><Input value={profile.headline || ''} onChange={(event) => setProfile({ ...profile, headline: event.target.value })} placeholder="例如：专注电商视觉设计 6 年" className="h-9 rounded-xl text-xs" /></div></div><div className="space-y-1.5"><Label className="text-xs text-slate-600">个人简介</Label><Textarea value={profile.bio || ''} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} rows={4} maxLength={2000} placeholder="介绍你的经验、风格和擅长解决的问题" className="rounded-xl text-xs" /></div><div className="grid gap-4 sm:grid-cols-2"><TokenInput label="擅长行业" value={profile.industries || []} onChange={(industries) => setProfile({ ...profile, industries })} placeholder="美妆、食品、家居" /><TokenInput label="设计风格" value={profile.styles} onChange={(styles) => setProfile({ ...profile, styles })} placeholder="简约、质感、年轻化" /></div><div className="grid gap-4 sm:grid-cols-2"><TokenInput label="擅长设计类型" value={profile.categories} onChange={(categories) => setProfile({ ...profile, categories })} placeholder="主图设计、详情页设计" /><TokenInput label="擅长平台" value={profile.platforms} onChange={(platforms) => setProfile({ ...profile, platforms: platforms as PlatformType[] })} placeholder="天猫、抖音电商" /></div><div className="grid gap-4 sm:grid-cols-3"><div className="space-y-1.5"><Label className="text-xs text-slate-600">从业年限</Label><Input type="number" min="0" max="80" value={profile.yearsExperience || 0} onChange={(event) => setProfile({ ...profile, yearsExperience: Number(event.target.value) })} className="h-9 rounded-xl text-xs" /></div><div className="space-y-1.5"><Label className="text-xs text-slate-600">最低预算（元）</Label><Input type="number" min="0" value={profile.minBudget || ''} onChange={(event) => setProfile({ ...profile, minBudget: Number(event.target.value) })} className="h-9 rounded-xl text-xs" /></div><div className="space-y-1.5"><Label className="text-xs text-slate-600">最大进行中订单</Label><Input type="number" min="1" max="20" value={profile.maxActiveOrders} onChange={(event) => setProfile({ ...profile, maxActiveOrders: Number(event.target.value) })} className="h-9 rounded-xl text-xs" /></div></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label className="text-xs text-slate-600">接单状态</Label><SelectField value={profile.availabilityStatus} onChange={(availabilityStatus) => setProfile({ ...profile, availabilityStatus: availabilityStatus as DesignerProfile['availabilityStatus'] })}><SelectItem value="available">可接单</SelectItem><SelectItem value="busy">忙碌中</SelectItem><SelectItem value="unavailable">暂停接单</SelectItem></SelectField></div><div className="space-y-1.5"><Label className="text-xs text-slate-600">主页状态</Label><SelectField value={profile.publicStatus || 'draft'} onChange={(publicStatus) => setProfile({ ...profile, publicStatus: publicStatus as DesignerProfile['publicStatus'] })}><SelectItem value="draft">仅自己可见</SelectItem><SelectItem value="published">公开给品牌方</SelectItem><SelectItem value="hidden">暂时隐藏</SelectItem></SelectField></div></div><div className="flex justify-end"><Button type="submit" disabled={saving} className="h-9 rounded-xl bg-rose-600 text-xs text-white hover:bg-rose-700"><Save className="mr-1.5 h-3.5 w-3.5" />{saving ? '保存中…' : '保存个人主页'}</Button></div></CardContent></Card></form>
    <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]"><Card><CardHeader><CardTitle className="flex items-center justify-between text-base"><span className="flex items-center gap-2"><ImagePlus className="h-4 w-4 text-rose-600" />我的作品集</span><Badge variant="outline" className="text-[10px]">已展示 {portfolios.filter((item) => item.status === 'published').length} / {portfolios.length}</Badge></CardTitle></CardHeader><CardContent>{portfolios.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center text-xs text-slate-400">还没有作品，右侧添加第一个项目吧。</div> : <div className="grid gap-3 sm:grid-cols-2">{portfolios.map((item) => <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="relative aspect-[4/3] bg-slate-100"><img src={item.coverUrl} alt={item.title} className="h-full w-full object-cover" /><Badge className={`absolute left-2 top-2 text-[10px] ${item.status === 'published' ? 'bg-emerald-500 text-white' : 'bg-white/90 text-slate-600'}`}>{item.status === 'published' ? '已发布' : '草稿'}</Badge></div><div className="p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><h3 className="truncate text-xs font-bold text-slate-800">{item.title}</h3><p className="mt-1 truncate text-[10px] text-slate-400">{[item.industry, item.category, item.platform].filter(Boolean).join(' · ') || '未设置分类'}</p></div>{item.isFeatured && <Badge className="shrink-0 bg-amber-50 text-[10px] text-amber-700">精选</Badge>}</div><div className="mt-3 flex justify-end gap-1"><Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-rose-600" onClick={() => { setEditingId(item.id); editPortfolio(item); }}><Edit3 className="h-3.5 w-3.5" /></Button><Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-rose-600" onClick={() => void removePortfolio(item.id)}><Trash2 className="h-3.5 w-3.5" /></Button></div></div></article>)}</div>}</CardContent></Card>
      <Card><CardHeader><CardTitle className="flex items-center justify-between text-base"><span>{editingId ? '编辑作品项目' : '添加作品项目'}</span>{editingId && <Button type="button" variant="ghost" className="h-7 rounded-lg text-[11px]" onClick={() => { setEditingId(null); setDraft({ ...emptyPortfolio }); }}>取消编辑</Button>}</CardTitle></CardHeader><CardContent><form onSubmit={savePortfolio} className="space-y-3"><div className="space-y-1.5"><Label className="text-xs text-slate-600">项目名称</Label><Input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="例如：春季女装主图视觉" className="h-9 rounded-xl text-xs" /></div><ImageUpload value={draft.imageUrls} folder="designer-portfolio" onChange={(imageUrls) => setDraft({ ...draft, imageUrls, coverUrl: draft.coverUrl || imageUrls[0] || '' })} /><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label className="text-xs text-slate-600">设计类型</Label><SelectField value={draft.category} onChange={(category) => setDraft({ ...draft, category })}>{categories.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectField></div><div className="space-y-1.5"><Label className="text-xs text-slate-600">所属行业</Label><SelectField value={draft.industry} onChange={(industry) => setDraft({ ...draft, industry })}>{industries.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectField></div></div><div className="space-y-1.5"><Label className="text-xs text-slate-600">投放平台</Label><SelectField value={draft.platform || 'none'} onChange={(platform) => setDraft({ ...draft, platform: platform === 'none' ? '' : platform as PlatformType })}><SelectItem value="none">不限平台</SelectItem>{platforms.map((item) => <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectField></div><div className="space-y-1.5"><Label className="text-xs text-slate-600">项目说明</Label><Textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} rows={3} placeholder="说明项目目标、设计思路和最终效果" className="rounded-xl text-xs" /></div><div className="space-y-1.5"><Label className="text-xs text-slate-600">你的职责</Label><Input value={draft.designerRole} onChange={(event) => setDraft({ ...draft, designerRole: event.target.value })} placeholder="例如：视觉方案、页面设计、精修合成" className="h-9 rounded-xl text-xs" /></div><div className="space-y-1.5"><Label className="text-xs text-slate-600">项目标签</Label><Input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="简约、质感、转化" className="h-9 rounded-xl text-xs" /></div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label className="text-xs text-slate-600">发布状态</Label><SelectField value={draft.status} onChange={(status) => setDraft({ ...draft, status: status as DesignerPortfolio['status'] })}><SelectItem value="draft">保存草稿</SelectItem><SelectItem value="published">发布到主页</SelectItem><SelectItem value="hidden">隐藏作品</SelectItem></SelectField></div><label className="flex h-9 cursor-pointer items-center gap-2 self-end rounded-xl border border-slate-200 px-3 text-xs text-slate-600"><input type="checkbox" checked={draft.isFeatured} onChange={(event) => setDraft({ ...draft, isFeatured: event.target.checked })} className="accent-rose-600" />设为精选作品</label></div><Button type="submit" disabled={saving} className="h-9 w-full rounded-xl bg-rose-600 text-xs text-white hover:bg-rose-700">{saving ? '保存中…' : editingId ? '保存作品修改' : '添加作品'}</Button></form></CardContent></Card>
    </div>
  </section>;
}
