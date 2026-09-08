'use client';

import { useEffect, useState } from 'react';
import * as Select from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';
import type { PlatformType, ReviewRule } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

type Reviewer = { id: string; name: string };
type RuleDraft = {
  name: string;
  platform: PlatformType;
  category: string;
  rejectLimit: number;
  reviewHoursLimit: number;
  levels: Array<{ reviewerIds: string[]; approvalMode: 'any' | 'all' }>;
};

const createEmptyDraft = (reviewerId = ''): RuleDraft => ({
  name: '', platform: 'tmall', category: '全品类', rejectLimit: 3, reviewHoursLimit: 24,
  levels: [{ reviewerIds: reviewerId ? [reviewerId] : [], approvalMode: 'any' }]
});

export default function AdvertiserReviewFlowsPage() {
  const [rules, setRules] = useState<ReviewRule[]>([]);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [draft, setDraft] = useState<RuleDraft>(() => createEmptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [rulesResponse, reviewersResponse] = await Promise.all([
      fetchWithAuth('/review-rules/mine'),
      fetchWithAuth('/review-rules/mine/reviewers')
    ]);
    const rulesResult = await rulesResponse.json();
    const reviewersResult = await reviewersResponse.json();
    if (!rulesResponse.ok || !rulesResult.success) throw new Error(rulesResult.message || '加载审核流失败');
    setRules(rulesResult.data || []);
    setReviewers(reviewersResult.data || []);
  };

  useEffect(() => { load().catch((error) => toast.error(error.message || '加载审核流失败')); }, []);

  const openCreate = () => { setEditingId(null); setFormOpen(true); setDraft(createEmptyDraft(reviewers[0]?.id)); };
  const openEdit = (rule: ReviewRule) => {
    const level = rule.levels?.[0];
    setEditingId(rule.id);
    setFormOpen(true);
    setDraft({
      name: rule.name,
      platform: rule.platform,
      category: rule.category || '全品类',
      rejectLimit: rule.rejectLimit,
      reviewHoursLimit: rule.reviewHoursLimit,
      levels: [{ reviewerIds: [...(level?.reviewerIds || (reviewers[0] ? [reviewers[0].id] : []))], approvalMode: level?.approvalMode || 'any' }]
    });
  };

  const save = async () => {
    if (!draft.name.trim()) return toast.error('请填写审核流名称');
    setSaving(true);
    try {
      const response = await fetchWithAuth(editingId ? `/review-rules/mine/${editingId}` : '/review-rules/mine', {
        method: editingId ? 'PUT' : 'POST',
        body: JSON.stringify(draft)
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '保存失败');
      toast.success(result.message);
      setEditingId(null);
      setFormOpen(false);
      setDraft(createEmptyDraft(reviewers[0]?.id));
      await load();
    } catch (error: any) {
      toast.error(error.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (rule: ReviewRule) => {
    try {
      const response = await fetchWithAuth(`/review-rules/mine/${rule.id}`, { method: 'PUT', body: JSON.stringify({ isActive: !rule.isActive }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '更新失败');
      setRules((current) => current.map((item) => item.id === rule.id ? result.data : item));
    } catch (error: any) {
      toast.error(error.message || '更新失败');
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold text-blue-600">品牌方配置</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">作品审核流</h1>
        </div>
        <Button onClick={openCreate} className="h-9 rounded-xl bg-blue-600 text-xs text-white hover:bg-blue-700">新建审核流</Button>
      </div>

      {formOpen && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="审核流名称" className="bg-white text-xs" />
            <Input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="适用类目" className="bg-white text-xs" />
            <Select.Root value={draft.platform} onValueChange={(value) => setDraft({ ...draft, platform: value as PlatformType })}><Select.Trigger className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/15"><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className="z-50 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-md"><Select.Viewport><Select.Item value="tmall" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>天猫</Select.ItemText></Select.Item><Select.Item value="taobao" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>淘宝</Select.ItemText></Select.Item><Select.Item value="douyin" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>抖音电商</Select.ItemText></Select.Item><Select.Item value="pinduoduo" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>拼多多</Select.ItemText></Select.Item><Select.Item value="universal" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>全网通用</Select.ItemText></Select.Item></Select.Viewport></Select.Content></Select.Portal></Select.Root>
            <Input type="number" min={1} value={draft.reviewHoursLimit} onChange={(event) => setDraft({ ...draft, reviewHoursLimit: Number(event.target.value) })} placeholder="审核时限" className="bg-white text-xs" />
          </div>
          <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
            <span className="text-xs font-semibold text-slate-700">第一级审核人</span>
            <Select.Root value={draft.levels[0].reviewerIds[0]} onValueChange={(value) => setDraft({ ...draft, levels: [{ ...draft.levels[0], reviewerIds: [value] }] })}><Select.Trigger className="flex h-9 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/15 md:w-48"><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className="z-50 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-md"><Select.Viewport>{reviewers.map((reviewer) => <Select.Item key={reviewer.id} value={reviewer.id} className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>{reviewer.name}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root>
            <Select.Root value={draft.levels[0].approvalMode} onValueChange={(value) => setDraft({ ...draft, levels: [{ ...draft.levels[0], approvalMode: value as 'any' | 'all' }] })}><Select.Trigger className="flex h-9 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 text-xs outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/15 md:w-48"><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className="z-50 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-md"><Select.Viewport><Select.Item value="any" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>任一审核人通过</Select.ItemText></Select.Item><Select.Item value="all" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>全部审核人通过</Select.ItemText></Select.Item></Select.Viewport></Select.Content></Select.Portal></Select.Root>
            <div className="ml-auto flex gap-2"><Button variant="outline" onClick={() => { setEditingId(null); setFormOpen(false); setDraft(createEmptyDraft(reviewers[0]?.id)); }} className="h-8 rounded-xl text-xs">取消</Button><Button onClick={save} disabled={saving} className="h-8 rounded-xl bg-blue-600 text-xs text-white">{saving ? '保存中…' : '保存'}</Button></div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {rules.map((rule) => (
          <article key={rule.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-sm font-bold text-slate-800">{rule.name}</h2><p className="mt-2 text-xs text-slate-500">{rule.category || '全品类'} · {rule.reviewHoursLimit} 小时内完成</p></div>
              <Badge className={rule.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}>{rule.isActive ? '启用中' : '已停用'}</Badge>
            </div>
            <div className="mt-4 space-y-2">{(rule.levels || []).map((level) => <div key={level.id} className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">第 {level.level} 级：{level.reviewerNames.join('、') || '待配置'} · {level.approvalMode === 'all' ? '全部通过' : '任一通过'}</div>)}</div>
            <div className="mt-4 flex gap-2"><Button variant="outline" onClick={() => openEdit(rule)} className="h-8 rounded-xl text-xs">编辑</Button><Button variant="ghost" onClick={() => toggle(rule)} className="h-8 rounded-xl text-xs">{rule.isActive ? '停用' : '启用'}</Button></div>
          </article>
        ))}
        {rules.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">暂未配置审核流</div>}
      </div>
    </section>
  );
}
