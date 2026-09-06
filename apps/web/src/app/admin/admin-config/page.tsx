'use client';

import React, { useState, useEffect } from 'react';
import { 
  Percent, 
  Settings2, 
  ShieldCheck, 
  Save, 
  Sparkles, 
  DollarSign, 
  Layers, 
  BellRing,
  HelpCircle,
  TrendingUp,
  RotateCcw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import type { SystemConfig, CommissionTier } from '@design-review/shared';

export default function AdminConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState<SystemConfig | null>(null);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:8080/api/system-config');
      const data = await res.json();
      if (data.success) {
        setConfig(data.data);
      }
    } catch (e) {
      toast.error('加载系统运营配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await fetch('http://localhost:8080/api/system-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || '保存失败');
      }
      toast.success('商业化抽成与后台全局配置已成功生效！');
      setConfig(data.data);
    } catch (err: any) {
      toast.error(err.message || '保存配置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleTierRateChange = (index: number, newRate: number) => {
    if (!config) return;
    const newTiers = [...config.commissionTiers];
    newTiers[index] = {
      ...newTiers[index],
      defaultRate: newRate / 100,
    };
    setConfig({ ...config, commissionTiers: newTiers });
  };

  if (loading || !config) {
    return <div className="p-12 text-center text-xs text-slate-400">正在载入后台管理配置...</div>;
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* 顶部标题与保存操作 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6 rounded-3xl bg-white/70 border border-white/80 shadow-sm backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-blue-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Percent className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">
              平台商业化与抽成配置中心
            </h1>
            <Badge variant="outline" className="bg-indigo-50 text-indigo-600 border-indigo-200 text-[11px]">
              管理后台专区
            </Badge>
          </div>
          <p className="text-xs text-slate-500">
            精细化调控前台接单各设计类目抽成比例、加急单溢价系数、质检与超时规则
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={fetchConfig}
            className="rounded-2xl text-xs h-10 px-4 border-slate-200 gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            重置更改
          </Button>
          <Button
            disabled={saving}
            onClick={handleSave}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold px-5 h-10 rounded-2xl shadow-md shadow-blue-500/20 gap-1.5"
          >
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '发布生效配置'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 左侧：分类抽成阶梯配置 */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="rounded-3xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  各设计类目阶梯抽成比率 (Take Rate)
                </div>
                <span className="text-[11px] font-normal text-slate-500">
                  前台派单自动按此比例扣取平台服务费
                </span>
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                可针对不同技术门槛和客单价的设计类型实施差异化费率
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-2">
              <div className="divide-y divide-slate-100">
                {config.commissionTiers.map((tier, idx) => {
                  const ratePercent = Math.round(tier.defaultRate * 100);
                  return (
                    <div key={tier.id} className="py-3.5 flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-slate-800">{tier.category}</span>
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                            基准区间: {(tier.minRate * 100).toFixed(0)}% ~ {(tier.maxRate * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 truncate">{tier.description}</p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min="1"
                            max="50"
                            value={ratePercent}
                            onChange={(e) => handleTierRateChange(idx, Number(e.target.value))}
                            className="w-16 h-8 text-xs font-mono font-bold text-center rounded-xl bg-slate-50"
                          />
                          <span className="text-xs font-semibold text-slate-600">%</span>
                        </div>

                        {/* 收益模拟预览 */}
                        <div className="w-24 text-right">
                          <div className="text-[10px] text-slate-400">千元订单抽成</div>
                          <div className="text-xs font-bold font-mono text-indigo-600">
                            ¥{(1000 * tier.defaultRate).toFixed(0)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 前台通知与大促公告 */}
          <Card className="rounded-3xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <BellRing className="w-4 h-4 text-amber-500" />
                前台接单大厅系统广播与横幅公告
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Input
                placeholder="例如：2026 Q3 视觉大促季接单补贴已开启..."
                value={config.announcement || ''}
                onChange={(e) => setConfig({ ...config, announcement: e.target.value })}
                className="text-xs rounded-xl h-10 bg-slate-50"
              />
              <p className="text-[11px] text-slate-400">
                此公告将实时同步展示于前台设计师接单页面顶端。
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 右侧：全局常规运营参数 */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="rounded-3xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-slate-700" />
                常规运营规则
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700">单笔需求最低起步预算 (元)</Label>
                <div className="relative">
                  <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <Input
                    type="number"
                    value={config.minOrderBudget}
                    onChange={(e) => setConfig({ ...config, minOrderBudget: Number(e.target.value) })}
                    className="pl-9 text-xs rounded-xl font-mono h-9 bg-slate-50"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700">抢单无响应自动释放超时 (分钟)</Label>
                <Input
                  type="number"
                  value={config.autoClaimTimeoutMinutes}
                  onChange={(e) => setConfig({ ...config, autoClaimTimeoutMinutes: Number(e.target.value) })}
                  className="text-xs rounded-xl font-mono h-9 bg-slate-50"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-slate-700">加急单平台抽成浮动加成</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={Math.round(config.urgentMarkupRate * 100)}
                    onChange={(e) => setConfig({ ...config, urgentMarkupRate: Number(e.target.value) / 100 })}
                    className="text-xs rounded-xl font-mono h-9 bg-slate-50 w-24"
                  />
                  <span className="text-xs text-slate-500 font-semibold">%</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-800">允许设计师自由竞价</div>
                  <div className="text-[10px] text-slate-400">开启后设计师可提交议价方案</div>
                </div>
                <Switch
                  checked={config.allowDesignerBidding}
                  onCheckedChange={(checked) => setConfig({ ...config, allowDesignerBidding: checked })}
                />
              </div>
            </CardContent>
          </Card>

          {/* 质检与审核标准 */}
          <Card className="rounded-3xl border border-white/80 bg-white/70 shadow-sm backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                质检风控严格度
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { id: 'strict', label: '严谨模式 (默认)', desc: '强制3级逐级审核，单张驳回即需整套复查' },
                { id: 'standard', label: '标准模式', desc: '双级审核，允许单张部分通过提审' },
                { id: 'relaxed', label: '敏捷模式', desc: '单级审核，快速交付大促批量需求' },
              ].map((item) => (
                <div
                  key={item.id}
                  onClick={() => setConfig({ ...config, reviewStrictLevel: item.id as any })}
                  className={`p-3 rounded-2xl border cursor-pointer transition ${
                    config.reviewStrictLevel === item.id
                      ? 'border-blue-500 bg-blue-50/50'
                      : 'border-slate-100 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                    <span>{item.label}</span>
                    {config.reviewStrictLevel === item.id && (
                      <span className="w-2 h-2 rounded-full bg-blue-600" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{item.desc}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
