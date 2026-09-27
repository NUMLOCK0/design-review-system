'use client';

import React, { useState, useEffect } from 'react';
import * as Select from '@radix-ui/react-select';
import { 
  Sliders, 
  Plus, 
  CheckCircle2, 
  ShieldAlert, 
  Sparkles, 
  AlertCircle,
  Users,
  Layers,
  Clock,
  Trash2,
  UserCheck,
  ChevronRight,
  Save,
  RotateCcw,
  ChevronDown
} from 'lucide-react';
import { PLATFORM_MAP, type PlatformType, type ReviewRule, type ReviewRuleLevel } from '@design-review/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/auth';

type AdminRuleFormData = {
  name: string;
  platform: PlatformType;
  category: string;
  rejectLimit: number;
  reviewHoursLimit: number;
  levels: Array<{ level: number; reviewerIds: string[]; approvalMode: 'any' | 'all' }>;
};

export default function ReviewRulesPage() {
  const [rules, setRules] = useState<ReviewRule[]>([]);
  const [reviewers, setReviewers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // 表单状态：支持动态增加审核层级与指定人员
  const [formData, setFormData] = useState<AdminRuleFormData>({
    name: '',
    platform: 'tmall' as PlatformType,
    category: '服饰鞋包',
    rejectLimit: 3,
    reviewHoursLimit: 24,
    levels: [
      {
        level: 1,
        reviewerIds: [],
        approvalMode: 'any' as 'any' | 'all'
      }
    ]
  });

  const fetchRules = async (nextPage = page) => {
    try {
      setLoading(true);
      const res = await fetchWithAuth(`/review-rules?page=${nextPage}&pageSize=${pageSize}`);
      const data = await res.json();
      if (data.success) {
        setRules(data.data);
        setTotal(data.total || 0);
        if (data.reviewers) {
          setReviewers(data.reviewers);
        }
      }
    } catch (e) {
      toast.error('获取审核规则失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules(1);
  }, []);

  const changePage = (nextPage: number) => { setPage(nextPage); void fetchRules(nextPage); };

  const handleAddLevel = () => {
    if (formData.levels.length >= 3) {
      toast.warning('审核流程最多支持 3 级递进审核');
      return;
    }
    setFormData({
      ...formData,
      levels: [
        ...formData.levels,
        {
          level: formData.levels.length + 1,
          reviewerIds: [],
          approvalMode: 'any'
        }
      ]
    });
  };

  const handleRemoveLevel = (index: number) => {
    if (formData.levels.length <= 1) {
      toast.warning('至少保留 1 个基础审核层级');
      return;
    }
    const newLevels = formData.levels.filter((_, i) => i !== index).map((lvl, idx) => ({
      ...lvl,
      level: idx + 1
    }));
    setFormData({ ...formData, levels: newLevels });
  };

  const handleLevelReviewerChange = (levelIndex: number, reviewerId: string) => {
    const newLevels = [...formData.levels];
    newLevels[levelIndex].reviewerIds = [reviewerId];
    setFormData({ ...formData, levels: newLevels });
  };

  const handleLevelModeChange = (levelIndex: number, mode: 'any' | 'all') => {
    const newLevels = [...formData.levels];
    newLevels[levelIndex].approvalMode = mode;
    setFormData({ ...formData, levels: newLevels });
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
      toast.error('请输入规则流名称');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetchWithAuth('/review-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || '创建规则失败');
      }

      toast.success('自定义审核人员与流转规则已生效！');
      setIsCreateOpen(false);
      setFormData({
        name: '',
        platform: 'tmall',
        category: '服饰鞋包',
        rejectLimit: 3,
        reviewHoursLimit: 24,
        levels: [
          {
            level: 1,
            reviewerIds: [],
            approvalMode: 'any'
          }
        ]
      });
      setPage(1);
      fetchRules(1);
    } catch (err: any) {
      toast.error(err.message || '发布规则失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-3 sm:space-y-6 sm:p-6 lg:p-8">
      {/* 顶部标题栏与新建操作 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6 rounded-3xl bg-white/70 border border-white/80 shadow-sm backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Sliders className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">
              多级审核规则流与责任人配置
            </h1>
            <Badge variant="outline" className="bg-indigo-50 text-indigo-600 border-indigo-200 text-[11px]">
              支持自定义指派
            </Badge>
          </div>
          <p className="text-xs text-slate-500">
            自由编排设计稿从初审到终审的流转流水线，按类目分派主管、质检员与会签模式
          </p>
        </div>

        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold px-4 h-10 rounded-2xl shadow-md shadow-blue-500/20 gap-1.5">
              <Plus className="w-4 h-4" />
              新建自定义审核人员流
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl bg-white rounded-3xl p-6">
            <DialogHeader>
              <DialogTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Sliders className="w-5 h-5 text-indigo-600" />
                配置新的审核人员流转链路
              </DialogTitle>
              <CardDescription className="text-xs text-slate-500">
                可自定义设置 1~3 级审核环节，并为每个层级独立指定责任审核人员与会签策略
              </CardDescription>
            </DialogHeader>

            <form onSubmit={handleCreateRule} className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">规则名称 <span aria-hidden="true" className="text-rose-500">*</span></label>
                <Input
                  required
                  placeholder="如：天猫大促核心商详 3级联合质检流"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="text-xs rounded-xl h-9"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">适用平台</label>
                  <Select.Root value={formData.platform} onValueChange={(value) => setFormData({ ...formData, platform: value as any })}><Select.Trigger className="flex h-9 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/15"><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className="z-50 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-md"><Select.Viewport>{Object.entries(PLATFORM_MAP).map(([key, item]) => <Select.Item key={key} value={key} className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>{item.label}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">所属商品类目</label>
                  <Input
                    placeholder="如：美妆个护 / 服饰鞋包"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="text-xs rounded-xl h-9"
                  />
                </div>
              </div>

              {/* 核心：自定义审核人员层级配置 */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-indigo-600" />
                    多级审核人员指派链路 ({formData.levels.length} 级)
                  </label>
                  {formData.levels.length < 3 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddLevel}
                      className="text-[11px] h-7 rounded-xl border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50"
                    >
                      <Plus className="w-3 h-3 mr-1" />
                      增加下一级审核节点
                    </Button>
                  )}
                </div>

                <div className="space-y-2.5">
                  {formData.levels.map((lvl, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl border border-indigo-100 bg-indigo-50/40 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-[11px] flex items-center justify-center">
                          L{lvl.level}
                        </span>
                        <span className="text-xs font-semibold text-slate-700">
                          {idx === 0 ? '初审质检' : idx === 1 ? '主管复审' : '总监终审'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-1 max-w-xs">
                        <Select.Root value={lvl.reviewerIds[0]} onValueChange={(value) => handleLevelReviewerChange(idx, value)}><Select.Trigger className="flex h-8 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/15"><Select.Value placeholder="选择审核人" /><Select.Icon><ChevronDown className="h-3.5 w-3.5 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className="z-50 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-md"><Select.Viewport>{reviewers.map((reviewer) => <Select.Item key={reviewer.id} value={reviewer.id} className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>{reviewer.name} ({reviewer.department})</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root>
                      </div>

                      <div className="flex items-center gap-2">
                        <Select.Root value={lvl.approvalMode} onValueChange={(value) => handleLevelModeChange(idx, value as any)}><Select.Trigger className="flex h-8 w-36 items-center justify-between rounded-xl border border-slate-200 bg-white px-2 text-[11px] text-slate-600 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/15"><Select.Value /><Select.Icon><ChevronDown className="h-3.5 w-3.5 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className="z-50 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-md"><Select.Viewport><Select.Item value="any" className="cursor-pointer rounded-lg px-2 py-1.5 text-[11px] outline-none hover:bg-slate-100"><Select.ItemText>单人通过即流转</Select.ItemText></Select.Item><Select.Item value="all" className="cursor-pointer rounded-lg px-2 py-1.5 text-[11px] outline-none hover:bg-slate-100"><Select.ItemText>全员必须会签</Select.ItemText></Select.Item></Select.Viewport></Select.Content></Select.Portal></Select.Root>

                        {formData.levels.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveLevel(idx)}
                            className="h-8 w-8 text-slate-400 hover:text-rose-500 rounded-xl"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">时效考核 (小时内)</label>
                  <Input
                    type="number"
                    value={formData.reviewHoursLimit}
                    onChange={(e) => setFormData({ ...formData, reviewHoursLimit: Number(e.target.value) })}
                    className="text-xs rounded-xl font-mono h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">驳回返修上限 (次)</label>
                  <Input
                    type="number"
                    value={formData.rejectLimit}
                    onChange={(e) => setFormData({ ...formData, rejectLimit: Number(e.target.value) })}
                    className="text-xs rounded-xl font-mono h-9"
                  />
                </div>
              </div>

              <DialogFooter className="mt-4 gap-2">
                <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)} className="rounded-xl text-xs">
                  取消
                </Button>
                <Button type="submit" disabled={submitting} className="rounded-xl text-xs bg-indigo-600 hover:bg-indigo-700 text-white">
                  {submitting ? '保存中...' : '发布并生效'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* 规则卡片列表 */}
      {loading ? (
        <div className="py-20 text-center text-xs text-slate-400">正在载入审核规则...</div>
      ) : (
        <><div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {rules.map((rule) => {
            const platform = PLATFORM_MAP[rule.platform] || PLATFORM_MAP.universal;
            return (
              <Card key={rule.id} className="glass-card border-white/80 p-6 space-y-4 shadow-sm rounded-3xl bg-white/70 backdrop-blur-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <Badge variant="outline" className="text-[11px] bg-white border-slate-200">
                      {platform.label} · {rule.category}
                    </Badge>
                    <h3 className="text-sm font-bold text-slate-800 mt-2">{rule.name}</h3>
                  </div>
                  <Badge variant="secondary" className="bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] gap-1 px-2">
                    <CheckCircle2 className="w-3 h-3" />
                    生效中
                  </Badge>
                </div>

                {/* 审核人员与层级链路详情 */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                    指派的审核人员链路:
                  </p>
                  <div className="space-y-2">
                    {rule.levels && rule.levels.length > 0 ? (
                      rule.levels.map((lvl, idx) => (
                        <div key={lvl.id || idx} className="flex items-center justify-between text-xs bg-slate-50/80 p-2.5 rounded-2xl border border-slate-100">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px] flex items-center justify-center">
                              L{lvl.level}
                            </span>
                            <span className="font-semibold text-slate-800">
                              {lvl.reviewerNames?.join('、') || '指定审核员'}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                            {lvl.approvalMode === 'all' ? '全员会签' : '单人通过'}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-xs text-slate-400">默认初审流：王总监 (单人通过)</div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" /> 时效考核: {rule.reviewHoursLimit} 小时内
                  </span>
                  <span>驳回上限预警: {rule.rejectLimit} 次</span>
                </div>
              </Card>
            );
          })}
        </div><AdminPagination page={page} pageSize={pageSize} total={total} onPageChange={changePage} /></>
      )}
    </div>
  );
}
