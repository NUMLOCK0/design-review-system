'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, ChevronRight, CirclePlus, Clock3, ShieldCheck, Trash2 } from 'lucide-react';
import type { PlatformType, ReviewRule } from '@design-review/shared';
import { fetchWithAuth, getCurrentUser } from '@/lib/auth';
import { MobileOptionPicker } from '@/components/mobile/mobile-create-order';
import { goBackOrReplace } from '@/components/mobile/mobile-navigation';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

type Reviewer = { id: string; name: string };
type RuleLevelDraft = { reviewerIds: string[]; approvalMode: 'any' | 'all' };
type RuleDraft = {
  name: string;
  platform: PlatformType;
  category: string;
  rejectLimit: number;
  reviewHoursLimit: number;
  levels: RuleLevelDraft[];
};

const platforms: Array<{ value: PlatformType; label: string }> = [
  { value: 'tmall', label: '天猫' }, { value: 'taobao', label: '淘宝' }, { value: 'douyin', label: '抖音电商' },
  { value: 'pinduoduo', label: '拼多多' }, { value: 'universal', label: '全网通用' },
];
const approvalModes = [{ value: 'any', label: '任一审核人通过' }, { value: 'all', label: '全部审核人通过' }];
const platformName = (value: string) => platforms.find((item) => item.value === value)?.label || value;
const emptyDraft = (reviewerId = ''): RuleDraft => ({
  name: '', platform: 'tmall', category: '全品类', rejectLimit: 3, reviewHoursLimit: 24,
  levels: [{ reviewerIds: reviewerId ? [reviewerId] : [], approvalMode: 'any' }],
});

export function MobileReviewFlows() {
  const [rules, setRules] = useState<ReviewRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth('/review-rules/mine');
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '加载审核流失败');
      setRules(result.data || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '加载审核流失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (rule: ReviewRule) => {
    setBusyId(rule.id);
    try {
      const response = await fetchWithAuth(`/review-rules/mine/${encodeURIComponent(rule.id)}`, {
        method: 'PUT', body: JSON.stringify({ isActive: !rule.isActive }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '更新失败');
      setRules((current) => current.map((item) => item.id === rule.id ? result.data : item));
      toast.success(result.message || (result.data.isActive ? '审核流已启用' : '审核流已停用'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新失败');
    } finally {
      setBusyId('');
    }
  };

  const currentUser = getCurrentUser();
  if (currentUser?.role !== 'advertiser') return <div className="px-4 py-16 text-center text-sm text-slate-500">仅品牌方可以管理审核流</div>;

  return <section className="min-h-dvh bg-[#f5f7fb] pb-[calc(158px+env(safe-area-inset-bottom))]">
    <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-4 pt-[max(env(safe-area-inset-top),8px)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-xl items-center gap-3">
        <Link href="/mobile/profile" aria-label="返回个人中心" className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600"><ArrowLeft className="h-5 w-5" /></Link>
        <div className="min-w-0 flex-1"><h1 className="text-base font-extrabold text-slate-900">审核流设置</h1><p className="text-[10px] text-slate-400">配置作品交付后的审核步骤</p></div>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl role-primary-soft role-primary-text"><ShieldCheck className="h-[18px] w-[18px]" /></span>
      </div>
    </header>

    <div className="mx-auto max-w-xl space-y-5 px-4 pt-5">
      <div className="rounded-[18px] bg-blue-50 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white role-primary-text"><ShieldCheck className="h-[18px] w-[18px]" /></span>
          <div className="min-w-0 flex-1"><h2 className="text-sm font-bold text-slate-800">默认审核方式</h2><p className="mt-1 text-xs leading-5 text-slate-500">新建订单默认选中“自己审核”，也可以切换到下方其他审核流。</p></div>
        </div>
        <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10px] font-bold role-primary-text"><Check className="h-3 w-3" />默认启用</div>
      </div>

      <div className="flex items-center justify-between"><h2 className="text-[15px] font-extrabold text-slate-900">我的审核流</h2><span className="text-[11px] text-slate-400">{loading ? '加载中…' : `共 ${rules.length} 个`}</span></div>
      {loading ? <div className="space-y-3">{[1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-[18px] bg-white" />)}</div> : rules.length ? <div className="space-y-3">
        {rules.map((rule) => <article key={rule.id} className="rounded-[18px] border border-slate-100 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,.025)]">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl role-primary-soft role-primary-text"><ShieldCheck className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold text-slate-800">{rule.name}</h3><p className="mt-1 text-[11px] text-slate-400">{platformName(rule.platform)} · {rule.category || '全品类'}</p></div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${rule.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{rule.isActive ? '启用中' : '已停用'}</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-[10px] text-slate-400"><Clock3 className="h-3.5 w-3.5" />审核时限 {rule.reviewHoursLimit} 小时</div>
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
            {(rule.levels || []).map((level, index) => <div key={level.id || index} className="flex items-center gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[10px] font-bold role-primary-text">{index + 1}</span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700">{level.reviewerNames?.join('、') || '待配置'}</span>
              <span className="shrink-0 text-[10px] text-slate-400">{level.approvalMode === 'all' ? '全部通过' : '任一通过'}</span>
            </div>)}
            {!rule.levels?.length && <p className="text-xs text-slate-400">暂未配置审核节点</p>}
          </div>
          <div className="mt-3 flex items-center border-t border-slate-100 pt-3">
            <Link href={`/mobile/review-flows/${encodeURIComponent(rule.id)}`} className="flex min-h-10 items-center gap-1 rounded-lg px-3 text-xs font-bold text-slate-600 active:bg-slate-50">编辑<ChevronRight className="h-4 w-4" /></Link>
            <span className="ml-auto mr-2 text-[11px] text-slate-400">{rule.id.startsWith('rule_self_') ? '默认流程' : rule.isActive ? '启用' : '停用'}</span>
            <Switch checked={rule.isActive} disabled={busyId === rule.id || rule.id.startsWith('rule_self_')} onCheckedChange={() => void toggle(rule)} aria-label={`${rule.isActive ? '停用' : '启用'}${rule.name}`} />
          </div>
        </article>)}
      </div> : <div className="rounded-[18px] border border-dashed border-slate-200 bg-white px-5 py-10 text-center"><ShieldCheck className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-700">暂未配置其他审核流</p><p className="mt-1 text-xs text-slate-400">你仍可以使用默认的“自己审核”流程</p></div>}
    </div>

    <div className="fixed inset-x-0 bottom-[calc(62px+env(safe-area-inset-bottom))] z-20 border-t border-slate-200/80 bg-white/95 px-4 py-3 backdrop-blur">
      <Link href="/mobile/review-flows/new" className="mx-auto flex h-12 max-w-xl items-center justify-center gap-2 rounded-[15px] role-primary-bg text-sm font-bold text-white shadow-sm"><CirclePlus className="h-[18px] w-[18px]" />新建审核流</Link>
    </div>
  </section>;
}

export function MobileReviewFlowEditor({ ruleId }: { ruleId?: string }) {
  const router = useRouter();
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [draft, setDraft] = useState<RuleDraft>(() => emptyDraft());
  const [loading, setLoading] = useState(Boolean(ruleId));
  const [saving, setSaving] = useState(false);
  const editing = Boolean(ruleId);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [reviewerResponse, ruleResponse] = await Promise.all([
          fetchWithAuth('/review-rules/mine/reviewers'),
          ruleId ? fetchWithAuth('/review-rules/mine') : Promise.resolve(null),
        ]);
        const reviewerResult = await reviewerResponse.json();
        if (!reviewerResponse.ok || !reviewerResult.success) throw new Error(reviewerResult.message || '加载审核人失败');
        const nextReviewers: Reviewer[] = reviewerResult.data || [];
        if (!active) return;
        setReviewers(nextReviewers);
        if (ruleId && ruleResponse) {
          const ruleResult = await ruleResponse.json();
          if (!ruleResponse.ok || !ruleResult.success) throw new Error(ruleResult.message || '加载审核流失败');
          const rule: ReviewRule | undefined = (ruleResult.data || []).find((item: ReviewRule) => item.id === ruleId);
          if (!rule) throw new Error('审核流不存在或无权编辑');
          setDraft({
            name: rule.name,
            platform: rule.platform,
            category: rule.category || '全品类',
            rejectLimit: rule.rejectLimit || 3,
            reviewHoursLimit: rule.reviewHoursLimit || 24,
            levels: rule.levels?.length ? rule.levels.map((level) => ({ reviewerIds: [...level.reviewerIds], approvalMode: level.approvalMode })) : emptyDraft(nextReviewers[0]?.id).levels,
          });
        } else {
          setDraft(emptyDraft(nextReviewers[0]?.id));
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : '加载审核流失败');
        if (ruleId) router.replace('/mobile/review-flows');
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [ruleId, router]);

  const updateLevel = (index: number, patch: Partial<RuleLevelDraft>) => setDraft((current) => ({
    ...current,
    levels: current.levels.map((level, levelIndex) => levelIndex === index ? { ...level, ...patch } : level),
  }));

  const save = async () => {
    if (!draft.name.trim()) return toast.error('请填写审核流名称');
    if (!draft.reviewHoursLimit || draft.reviewHoursLimit < 1) return toast.error('审核时限至少为 1 小时');
    if (!draft.levels.length || draft.levels.some((level) => !level.reviewerIds.length)) return toast.error('请为每个审核节点选择审核人');
    if (draft.levels.some((level) => level.reviewerIds.some((id) => !reviewers.some((reviewer) => reviewer.id === id)))) return toast.error('审核人无效，请重新选择');
    setSaving(true);
    try {
      const response = await fetchWithAuth(ruleId ? `/review-rules/mine/${encodeURIComponent(ruleId)}` : '/review-rules/mine', {
        method: ruleId ? 'PUT' : 'POST', body: JSON.stringify(draft),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '保存失败');
      toast.success(result.message || '审核流已保存');
      router.replace('/mobile/review-flows');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const reviewerOptions = reviewers.map((reviewer) => ({ value: reviewer.id, label: reviewer.id === getCurrentUser()?.id ? `${reviewer.name}（我）` : reviewer.name }));
  const setReviewer = (index: number, value: string) => updateLevel(index, { reviewerIds: [value] });

  if (loading) return <div className="grid min-h-dvh place-items-center text-sm text-slate-400">正在加载审核流…</div>;

  return <section className="min-h-dvh bg-[#f5f7fb] pb-[calc(100px+env(safe-area-inset-bottom))]">
    <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-4 pt-[max(env(safe-area-inset-top),8px)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-xl items-center gap-3">
        <button type="button" aria-label="返回" onClick={() => goBackOrReplace(router, '/mobile/review-flows')} className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="min-w-0 flex-1 truncate text-base font-extrabold text-slate-900">{editing ? '编辑审核流' : '新建审核流'}</h1>
        <button type="button" disabled={saving} onClick={() => void save()} className="min-h-10 px-2 text-sm font-bold role-primary-text">{saving ? '保存中…' : '保存'}</button>
      </div>
    </header>

    <div className="mx-auto max-w-xl space-y-5 px-4 py-5">
      <section className="space-y-4 rounded-[18px] border border-slate-100 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,.025)]">
        <div><h2 className="text-sm font-bold text-slate-800">基本信息</h2><p className="mt-1 text-[11px] text-slate-400">为流程设置清晰的名称和适用范围</p></div>
        <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">审核流名称 <span className="text-rose-500">*</span></span><Input maxLength={40} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="例如：主图设计审核" className="h-11 rounded-xl bg-slate-50" /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">适用平台</span><MobileOptionPicker title="适用平台" options={platforms} value={draft.platform} onChange={(value) => setDraft((current) => ({ ...current, platform: value as PlatformType }))} /></label>
          <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">适用类目</span><Input maxLength={40} value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} placeholder="全品类" className="h-11 rounded-xl bg-slate-50" /></label>
        </div>
        <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">审核时限 <span aria-hidden="true" className="text-rose-500">*</span></span><div className="relative"><Input type="number" min={1} max={720} value={draft.reviewHoursLimit} onChange={(event) => setDraft((current) => ({ ...current, reviewHoursLimit: Number(event.target.value) }))} className="h-11 rounded-xl bg-slate-50 pr-14" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">小时内</span></div></label>
      </section>

      <section className="space-y-3">
        <div><h2 className="text-sm font-bold text-slate-800">审核节点</h2><p className="mt-1 text-[11px] text-slate-400">按顺序完成每一级审核后，进入下一节点</p></div>
        {draft.levels.map((level, index) => <article key={index} className="relative rounded-[18px] border border-slate-100 bg-white p-4 shadow-[0_4px_20px_rgba(15,23,42,.025)]">
          {index < draft.levels.length - 1 && <span aria-hidden="true" className="absolute -bottom-3 left-[25px] z-10 h-3 w-px bg-blue-200" />}
          <div className="flex items-center gap-2.5"><span className="flex h-7 w-7 items-center justify-center rounded-full role-primary-bg text-xs font-bold text-white">{index + 1}</span><h3 className="flex-1 text-sm font-bold text-slate-800">第 {index + 1} 级审核</h3>
            {draft.levels.length > 1 && <ConfirmAction title="移除此审核节点？" description={`第 ${index + 1} 级的审核人和通过条件将被移除。`} confirmText="确认移除" onConfirm={() => setDraft((current) => ({ ...current, levels: current.levels.filter((_, levelIndex) => levelIndex !== index) }))}><button type="button" aria-label={`移除第 ${index + 1} 级审核`} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 active:bg-rose-50 active:text-rose-600"><Trash2 className="h-4 w-4" /></button></ConfirmAction>}
          </div>
          <div className="mt-4 space-y-3">
            <label className="block space-y-1.5"><span className="text-xs font-semibold text-slate-600">审核人 <span aria-hidden="true" className="text-rose-500">*</span></span>{reviewerOptions.length ? <MobileOptionPicker title="审核人" options={reviewerOptions} value={level.reviewerIds[0] || ''} onChange={(value) => setReviewer(index, value)} /> : <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700">暂无可选审核人</p>}</label>
            <div><span className="mb-1.5 block text-xs font-semibold text-slate-600">通过条件</span><div className="grid grid-cols-2 gap-2">{approvalModes.map((mode) => { const active = level.approvalMode === mode.value; return <button key={mode.value} type="button" aria-pressed={active} onClick={() => updateLevel(index, { approvalMode: mode.value as RuleLevelDraft['approvalMode'] })} className={`flex min-h-10 items-center justify-center gap-1 rounded-xl border px-2 text-[11px] font-semibold ${active ? 'role-primary-soft role-primary-border role-primary-text' : 'border-slate-200 bg-white text-slate-500'}`}>{active && <Check className="h-3.5 w-3.5" />}{mode.label}</button>; })}</div></div>
          </div>
        </article>)}
        <button type="button" onClick={() => setDraft((current) => ({ ...current, levels: [...current.levels, { reviewerIds: reviewers[0] ? [reviewers[0].id] : [], approvalMode: 'any' }] }))} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-dashed role-primary-border bg-white text-xs font-bold role-primary-text active:role-primary-soft"><CirclePlus className="h-4 w-4" />添加下一级审核</button>
      </section>
      <p className="px-1 text-[11px] leading-5 text-slate-400">当前账号仅能指派自己为审核人。关闭审核流后，新订单将无法选择该流程，但已关联订单不受影响。</p>
    </div>

    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
      <button type="button" disabled={saving} onClick={() => void save()} className="mx-auto flex h-12 w-full max-w-xl items-center justify-center rounded-[15px] role-primary-bg text-sm font-bold text-white disabled:opacity-60">{saving ? '保存中…' : editing ? '保存审核流' : '创建审核流'}</button>
    </div>
  </section>;
}
