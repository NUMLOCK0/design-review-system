'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronRight, Edit3, ImagePlus, Plus, Save, Trash2, X } from 'lucide-react';
import type { DesignerPortfolio, DesignerProfile, PlatformType } from '@design-review/shared';
import { fetchWithAuth, updateCurrentUserName } from '@/lib/auth';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { ImageUpload } from '@/components/image-upload';
import { MobileOptionPicker, type MobilePickerOption } from '@/components/mobile/mobile-create-order';
import { MobileSecondaryLayout } from '@/components/mobile/mobile-secondary-layout';
import { useDesignerClaimEligibility } from '@/hooks/use-designer-claim-eligibility';
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { CustomerServiceReviewModal } from '@/components/customer-service-review-modal';

const blankProfile: DesignerProfile = { userId: '', name: '', headline: '', bio: '', industries: [], yearsExperience: 0, publicStatus: 'draft', profileCompleted: false, categories: [], platforms: [], styles: [], minBudget: 0, maxActiveOrders: 3, availabilityStatus: 'available', portfolioUrls: [], activeOrderCount: 0, qualityScore: 85, onTimeRate: 92 };
const industries = ['服饰', '美妆', '食品', '家居', '数码', '母婴', '珠宝', '鞋包', '家电', '运动户外', '宠物用品', '汽车用品', '文创礼品', '办公文具', '家具建材', '医药健康', '其他'].map((label) => ({ value: label, label }));
const styles = ['简约', '质感', '年轻化', '极简高级', '清新自然', '轻奢精致', '国潮东方', '复古怀旧', '时尚潮流', '可爱治愈', '科技未来', '插画手绘', '促销活力'].map((label) => ({ value: label, label }));
const categories = ['主图设计', '详情页设计', '活动海报', '3D建模与渲染', '精修合成', '店铺首页设计', 'Banner/横幅设计', '产品包装设计', '短视频封面', '品牌视觉设计'].map((label) => ({ value: label, label }));
const platforms: Array<{ value: PlatformType; label: string }> = [{ value: 'tmall', label: '天猫' }, { value: 'taobao', label: '淘宝' }, { value: 'douyin', label: '抖音电商' }, { value: 'pinduoduo', label: '拼多多' }, { value: 'universal', label: '全网通用' }];
const visibilityOptions: MobilePickerOption[] = [{ value: 'draft', label: '仅自己可见' }, { value: 'published', label: '公开给品牌方' }, { value: 'hidden', label: '暂时隐藏' }];

function ProfileField({ label, required, ...props }: React.ComponentProps<typeof Input> & { label: string; required?: boolean }) {
  return <label className="block space-y-1.5"><span className="block text-xs font-semibold text-slate-700">{label}{required && <span aria-hidden="true" className="ml-1 text-rose-600">*</span>}</span><Input {...props} required={required} className={`h-11 rounded-xl border-slate-200 bg-white text-sm focus-visible:ring-rose-500/20 ${props.className || ''}`} /></label>;
}

function MultiSelectField({ label, value, options, onChange }: { label: string; value: string[]; options: Array<{ value: string; label: string }>; onChange: (value: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const selectedLabels = value.map((item) => options.find((option) => option.value === item)?.label || item);
  return <div className="space-y-2 py-3">
    <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-slate-700">{label}</span><button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold role-primary-text">{value.length ? '修改选择' : '选择项目'}<ChevronDown className="h-3.5 w-3.5" /></button></div>
    {selectedLabels.length ? <div className="flex flex-wrap gap-1.5">{selectedLabels.map((item, index) => <button key={`${value[index]}-${index}`} type="button" aria-label={`移除${item}`} onClick={() => onChange(value.filter((_, i) => i !== index))} className="inline-flex min-h-8 items-center gap-1 rounded-lg bg-rose-50 px-2.5 text-[11px] font-semibold text-rose-700">{item}<X className="h-3 w-3" /></button>)}</div> : <p className="text-[11px] text-slate-400">尚未选择</p>}
    <Drawer direction="bottom" open={open} onOpenChange={setOpen}><DrawerContent className="max-h-[82dvh] rounded-t-[24px] bg-white pb-[max(env(safe-area-inset-bottom),12px)]"><DrawerHeader className="text-left"><DrawerTitle className="text-base">选择{label}</DrawerTitle><DrawerDescription className="text-xs">可多选，完成后点击确认</DrawerDescription></DrawerHeader><div className="max-h-[58dvh] space-y-1 overflow-y-auto px-4 pb-3">{options.map((option) => { const selected = value.includes(option.value); return <button key={option.value} type="button" aria-pressed={selected} onClick={() => onChange(selected ? value.filter((item) => item !== option.value) : [...value, option.value])} className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 text-left text-sm ${selected ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-100 bg-white text-slate-700'}`}><span className={`flex h-5 w-5 items-center justify-center rounded-md border ${selected ? 'border-rose-600 bg-rose-600 text-white' : 'border-slate-300 bg-white'}`}>{selected && <Check className="h-3.5 w-3.5" />}</span>{option.label}</button>; })}</div><DrawerFooter className="border-t border-slate-100 px-4 pt-3"><button type="button" onClick={() => setOpen(false)} className="min-h-11 w-full rounded-xl role-primary-bg text-sm font-bold text-white">确认选择{value.length ? `（${value.length}）` : ''}</button></DrawerFooter></DrawerContent></Drawer>
  </div>;
}

function Value({ label, children, className = '' }: { label: string; children?: React.ReactNode; className?: string }) {
  return <div className={`min-w-0 ${className}`}><p className="text-[10px] font-medium text-slate-500">{label}</p><div className="mt-1.5 break-words text-xs leading-5 text-slate-800">{children || <span className="text-slate-300">未填写</span>}</div></div>;
}

function Chips({ values }: { values: string[] }) {
  return values.length ? <div className="flex flex-wrap gap-1.5">{values.map((item) => <span key={item} className="rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700">{item}</span>)}</div> : <span className="text-[11px] text-slate-300">未填写</span>;
}

export function MobileDesignerProfilePage() {
  const [profile, setProfile] = useState<DesignerProfile>(blankProfile);
  const [savedProfile, setSavedProfile] = useState<DesignerProfile>(blankProfile);
  const [editingProfile, setEditingProfile] = useState(false);
  const [works, setWorks] = useState<DesignerPortfolio[]>([]);
  const [title, setTitle] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [editingWork, setEditingWork] = useState<DesignerPortfolio | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'profile' | 'portfolio'>('profile');
  const [workDrawerOpen, setWorkDrawerOpen] = useState(false);
  const [customerServiceModalOpen, setCustomerServiceModalOpen] = useState(false);
  const claimReadiness = useDesignerClaimEligibility(true);

  const load = async () => {
    try {
      const [profileResponse, worksResponse] = await Promise.all([fetchWithAuth('/designer-profile/me'), fetchWithAuth('/designer-portfolios/mine')]);
      const [profileResult, worksResult] = await Promise.all([profileResponse.json(), worksResponse.json()]);
      if (!profileResponse.ok || !profileResult.success || !worksResponse.ok || !worksResult.success) throw new Error(profileResult.message || worksResult.message || '主页加载失败');
      const current = { ...blankProfile, ...profileResult.data };
      setProfile(current); setSavedProfile(current); setWorks(worksResult.data || []);
    } catch (error) { toast.error(error instanceof Error ? error.message : '主页加载失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      const response = await fetchWithAuth('/designer-profile/me', { method: 'PUT', body: JSON.stringify(profile) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '资料保存失败');
      const updated = { ...blankProfile, ...result.data };
      setProfile(updated); setSavedProfile(updated); updateCurrentUserName(updated.name); setEditingProfile(false); toast.success('个人资料已保存');
    } catch (error) { toast.error(error instanceof Error ? error.message : '资料保存失败'); }
    finally { setSaving(false); }
  };

  const togglePublicStatus = async () => {
    const next: NonNullable<DesignerProfile['publicStatus']> = profile.publicStatus === 'published' ? 'hidden' : 'published';
    setSaving(true);
    try {
      const response = await fetchWithAuth('/designer-profile/me', { method: 'PUT', body: JSON.stringify({ ...profile, publicStatus: next }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '主页状态更新失败');
      const updated = { ...blankProfile, ...result.data }; setProfile(updated); setSavedProfile(updated);
      toast.success(next === 'published' ? '主页已公开给品牌方' : '主页已暂停公开');
    } catch (error) { toast.error(error instanceof Error ? error.message : '主页状态更新失败'); }
    finally { setSaving(false); }
  };

  const openNewWork = () => { setEditingWork(null); setTitle(''); setImages([]); setWorkDrawerOpen(true); };
  const openEditWork = (work: DesignerPortfolio) => { setEditingWork(work); setTitle(work.title); setImages(work.imageUrls || []); setWorkDrawerOpen(true); };
  const saveWork = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !images.length) return toast.error('请填写作品名称并上传作品图');
    setSaving(true);
    try {
      const response = await fetchWithAuth(editingWork ? `/designer-portfolios/${editingWork.id}` : '/designer-portfolios', { method: editingWork ? 'PUT' : 'POST', body: JSON.stringify({ ...(editingWork || {}), title: title.trim(), imageUrls: images, coverUrl: images[0], status: 'pending_review' }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '作品保存失败');
      setWorks((current) => editingWork ? current.map((item) => item.id === editingWork.id ? result.data : item) : [result.data, ...current]);
      setTitle(''); setImages([]); setEditingWork(null); setWorkDrawerOpen(false); toast.success(result.data.status === 'pending_review' ? '作品已提交审核' : editingWork ? '作品已保存' : '作品已提交审核');
      if (result.data.status === 'pending_review') setCustomerServiceModalOpen(true);
    } catch (error) { toast.error(error instanceof Error ? error.message : '作品保存失败'); }
    finally { setSaving(false); }
  };
  const removeWork = async (work: DesignerPortfolio) => {
    if (!window.confirm(`确认删除作品“${work.title}”？`)) return;
    try {
      const response = await fetchWithAuth(`/designer-portfolios/${work.id}`, { method: 'DELETE' }); const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '删除失败');
      setWorks((current) => current.filter((item) => item.id !== work.id)); toast.success('作品已删除');
    } catch (error) { toast.error(error instanceof Error ? error.message : '删除失败'); }
  };

  const workStatus: Record<DesignerPortfolio['status'], string> = { published: '已审核公开', pending_review: '审核中', hidden: '已下架', draft: '草稿' };
  const publishedCount = works.filter((work) => work.status === 'published').length;
  const platformNames = (profile.platforms || []).map((value) => platforms.find((option) => option.value === value)?.label || value);

  return <MobileSecondaryLayout title="主页与作品" fallbackHref="/mobile/profile">
    <section className="space-y-4 pb-[calc(88px+env(safe-area-inset-bottom))]">
      <div><p className="text-[11px] font-semibold role-primary-text">设计师空间</p><p className="mt-1 text-xs leading-5 text-slate-500">管理你的品牌展示资料与设计案例</p></div>
      {(claimReadiness.loading || claimReadiness.error || !claimReadiness.eligibility?.canClaim) && <div role={claimReadiness.loading ? 'status' : 'alert'} className="flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-rose-900"><AlertCircle className="h-5 w-5 shrink-0 text-rose-600" /><div className="min-w-0 flex-1"><p className="text-xs font-bold">{claimReadiness.loading ? '接单资格核验中' : '完善资料后再接单'}</p><p className="mt-1 text-[11px] leading-5 text-rose-800">{claimReadiness.loading ? '正在核对个人资料和作品审核状态…' : claimReadiness.error ? '暂时无法确认接单资格，请检查个人资料和作品状态。' : '完善个人资料并通过作品审核后即可接单。'}</p></div><button type="button" onClick={() => { if (claimReadiness.eligibility?.profileCompleted && claimReadiness.eligibility.approvedPortfolioCount === 0) setActiveSection('portfolio'); else { setActiveSection('profile'); setEditingProfile(true); } }} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-xl bg-white px-3 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">去完善<ChevronRight className="h-3.5 w-3.5" /></button></div>}
      <div role="tablist" aria-label="主页资料分区" className="grid grid-cols-2 rounded-2xl bg-slate-100 p-1"><button type="button" role="tab" aria-selected={activeSection === 'profile'} onClick={() => setActiveSection('profile')} className={`min-h-11 rounded-xl px-3 text-xs font-bold ${activeSection === 'profile' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-500'}`}>个人资料</button><button type="button" role="tab" aria-selected={activeSection === 'portfolio'} onClick={() => setActiveSection('portfolio')} className={`min-h-11 rounded-xl px-3 text-xs font-bold ${activeSection === 'portfolio' ? 'bg-white text-rose-700 shadow-sm' : 'text-slate-500'}`}>作品集管理</button></div>
      {loading ? <div className="rounded-2xl bg-white p-8 text-center text-sm text-slate-400">正在加载个人主页…</div> : activeSection === 'profile' ? <>
        {editingProfile ? <form onSubmit={saveProfile} className="overflow-hidden rounded-[22px] border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-4"><h2 className="text-sm font-extrabold text-slate-900">基础资料</h2><p className="mt-1 text-[11px] leading-5 text-slate-500">让品牌方快速了解你的专业方向</p></div>
          <div className="space-y-4 px-4 py-4">
            <ProfileField label="展示名称" required value={profile.name} onChange={(event) => setProfile({ ...profile, name: event.target.value })} maxLength={64} autoComplete="nickname" placeholder="请输入展示名称" />
            <ProfileField label="一句话简介" value={profile.headline || ''} onChange={(event) => setProfile({ ...profile, headline: event.target.value })} placeholder="例如：专注电商视觉设计 6 年" />
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-700">个人简介</span><Textarea rows={3} maxLength={2000} value={profile.bio || ''} onChange={(event) => setProfile({ ...profile, bio: event.target.value })} placeholder="介绍经验、风格和擅长解决的问题" className="rounded-xl border-slate-200 text-sm" /></label>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-100 px-3"><MultiSelectField label="擅长行业" options={industries} value={profile.industries || []} onChange={(value) => setProfile({ ...profile, industries: value })} /><MultiSelectField label="设计风格" options={styles} value={profile.styles || []} onChange={(value) => setProfile({ ...profile, styles: value })} /><MultiSelectField label="擅长设计类型" options={categories} value={profile.categories || []} onChange={(value) => setProfile({ ...profile, categories: value })} /><MultiSelectField label="擅长平台" options={platforms} value={profile.platforms || []} onChange={(value) => setProfile({ ...profile, platforms: value as PlatformType[] })} /></div>
            <div className="grid grid-cols-2 gap-3"><ProfileField label="从业年限" type="number" inputMode="numeric" min="0" max="80" value={profile.yearsExperience || 0} onChange={(event) => setProfile({ ...profile, yearsExperience: Number(event.target.value) })} /><ProfileField label="最低预算（元）" type="number" inputMode="decimal" min="0" value={profile.minBudget || ''} onChange={(event) => setProfile({ ...profile, minBudget: Number(event.target.value) })} /></div>
            <ProfileField label="最大进行中订单" type="number" inputMode="numeric" min="1" max="20" value={profile.maxActiveOrders} onChange={(event) => setProfile({ ...profile, maxActiveOrders: Number(event.target.value) })} />
            <label className="block space-y-1.5"><span className="block text-xs font-semibold text-slate-700">主页状态</span><MobileOptionPicker title="主页公开状态" value={profile.publicStatus || 'draft'} onChange={(value) => setProfile({ ...profile, publicStatus: value as DesignerProfile['publicStatus'] })} options={visibilityOptions} /></label>
          </div>
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pt-3 backdrop-blur" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}><div className="mx-auto flex max-w-xl gap-2"><button type="button" disabled={saving} onClick={() => { setProfile(savedProfile); setEditingProfile(false); }} className="min-h-11 flex-1 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 disabled:opacity-50">取消</button><button type="submit" disabled={saving} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl role-primary-bg text-sm font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? '保存中…' : '保存资料'}</button></div></div>
        </form> : <article className="overflow-hidden rounded-[22px] border border-slate-200 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4"><div><h2 className="text-sm font-extrabold text-slate-900">基础资料</h2><p className="mt-1 text-[11px] text-slate-500">个人主页展示信息</p></div><button type="button" onClick={() => setEditingProfile(true)} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700"><Edit3 className="h-3.5 w-3.5" />编辑资料</button></div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 px-4 py-4"><Value label="展示名称">{profile.name}</Value><Value label="一句话简介">{profile.headline}</Value><Value label="个人简介" className="col-span-2">{profile.bio}</Value><Value label="擅长行业"><Chips values={profile.industries || []} /></Value><Value label="设计风格"><Chips values={profile.styles || []} /></Value><Value label="擅长设计类型"><Chips values={profile.categories || []} /></Value><Value label="擅长平台"><Chips values={platformNames} /></Value><Value label="从业年限">{profile.yearsExperience ? `${profile.yearsExperience} 年` : ''}</Value><Value label="最低预算">{profile.minBudget ? `¥${Number(profile.minBudget).toLocaleString('zh-CN')}` : ''}</Value><Value label="最大进行中订单">{profile.maxActiveOrders ? `${profile.maxActiveOrders} 单` : ''}</Value></div>
          <div className="flex items-center gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3"><div className="min-w-0 flex-1"><p className="text-[10px] font-medium text-slate-500">主页状态</p><p className="mt-1.5 flex items-center gap-2 text-xs font-semibold text-slate-800"><span className={`h-2 w-2 rounded-full ${profile.publicStatus === 'published' ? 'bg-emerald-500' : 'bg-slate-400'}`} />{{ draft: '仅自己可见', published: '公开给品牌方', hidden: '暂时隐藏' }[profile.publicStatus || 'draft']}</p></div><button type="button" disabled={saving} onClick={() => void togglePublicStatus()} className={`min-h-10 shrink-0 rounded-xl px-3 text-xs font-bold disabled:opacity-50 ${profile.publicStatus === 'published' ? 'border border-slate-200 bg-white text-slate-600' : 'role-primary-bg text-white'}`}>{saving ? '更新中…' : profile.publicStatus === 'published' ? '暂停公开' : '公开主页'}</button></div>
        </article>}
      </> : <section className="space-y-3">
        <div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-extrabold text-slate-900">我的作品集</h2><p className="mt-1 text-[11px] text-slate-500">已审核公开 {publishedCount} 件 · 共 {works.length} 件</p></div><button type="button" onClick={openNewWork} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl role-primary-bg px-3 text-xs font-bold text-white"><Plus className="h-4 w-4" />添加作品</button></div>
        {works.length ? <div className="grid grid-cols-2 gap-3">{works.map((work) => <article key={work.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="relative aspect-[4/3] bg-slate-100"><AuthenticatedImage src={work.coverUrl} alt={work.title} className="h-full w-full object-cover" /><span className={`absolute left-2 top-2 rounded-full px-2 py-1 text-[9px] font-bold ${work.status === 'published' ? 'bg-emerald-50 text-emerald-700' : work.status === 'pending_review' ? 'bg-amber-50 text-amber-700' : work.status === 'hidden' ? 'bg-slate-100 text-slate-600' : 'bg-white/95 text-slate-600'}`}>{workStatus[work.status]}</span></div><div className="p-3"><h3 className="truncate text-xs font-bold text-slate-900">{work.title}</h3><p className="mt-1 truncate text-[10px] text-slate-500">{[work.industry, work.category, work.platform].filter(Boolean).join(' · ') || `${work.imageUrls.length} 张作品图`}</p><div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2"><button type="button" onClick={() => openEditWork(work)} className="inline-flex min-h-9 items-center gap-1 text-[11px] font-semibold role-primary-text"><Edit3 className="h-3.5 w-3.5" />编辑</button><button type="button" aria-label={`删除作品${work.title}`} onClick={() => void removeWork(work)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button></div></div></article>)}</div> : <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center"><ImagePlus className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm font-semibold text-slate-700">还没有作品</p><p className="mt-1 text-xs text-slate-400">添加完整案例，通过审核后可参与接单</p><button type="button" onClick={openNewWork} className="mt-4 min-h-10 rounded-xl role-primary-bg px-4 text-xs font-bold text-white">添加第一个作品</button></div>}
      </section>}
      <Drawer direction="bottom" open={workDrawerOpen} onOpenChange={setWorkDrawerOpen}><DrawerContent className="max-h-[90dvh] rounded-t-[24px] bg-white pb-[max(env(safe-area-inset-bottom),12px)]"><DrawerHeader className="border-b border-slate-100 px-4 pb-3 text-left"><div className="flex items-start justify-between gap-3"><div><DrawerTitle className="text-base font-extrabold">{editingWork ? '编辑作品项目' : '添加作品项目'}</DrawerTitle><DrawerDescription className="mt-1 text-xs">填写项目信息并上传作品图片</DrawerDescription></div><button type="button" aria-label="关闭" onClick={() => setWorkDrawerOpen(false)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600"><X className="h-4 w-4" /></button></div></DrawerHeader><form onSubmit={saveWork} className="flex min-h-0 flex-1 flex-col"><div className="space-y-4 overflow-y-auto px-4 py-4"><ProfileField label="项目名称" required value={title} onChange={(event) => setTitle(event.target.value)} maxLength={50} placeholder="例如：春季护肤主图视觉" /><ImageUpload required value={images} onChange={setImages} folder="designer-portfolio" label="作品图片" variant="square" squareSize="sm" /></div><DrawerFooter className="border-t border-slate-100 px-4 pt-3"><button type="submit" disabled={saving} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl role-primary-bg text-sm font-bold text-white disabled:opacity-50"><ImagePlus className="h-4 w-4" />{saving ? '提交中…' : editingWork ? '保存作品修改' : '提交审核'}</button></DrawerFooter></form></DrawerContent></Drawer>
      <CustomerServiceReviewModal
        open={customerServiceModalOpen}
        onClose={() => setCustomerServiceModalOpen(false)}
        isMobile
      />
    </section>
  </MobileSecondaryLayout>;
}
