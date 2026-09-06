'use client';

import React, { useState, useEffect } from 'react';
import { 
  ShoppingBag, 
  PlusCircle, 
  Clock, 
  Coins, 
  Sparkles, 
  Filter, 
  CheckCircle2, 
  ArrowUpRight, 
  Upload, 
  Image as ImageIcon,
  Flame,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { getCurrentUser } from '@/lib/auth';
import type { DesignOrder, PlatformType } from '@design-review/shared';

const CATEGORIES = ['全部', '主图设计', '详情页设计', '活动海报', '3D建模与渲染', '精修合成'];
const PLATFORMS: { id: PlatformType; name: string }[] = [
  { id: 'tmall', name: '天猫商城' },
  { id: 'taobao', name: '淘宝网' },
  { id: 'douyin', name: '抖音电商' },
  { id: 'pinduoduo', name: '拼多多' },
  { id: 'universal', name: '全网通用' },
];

export default function OrderMarketPage() {
  const user = getCurrentUser();
  const [orders, setOrders] = useState<DesignOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 表单状态
  const [formData, setFormData] = useState({
    title: '',
    category: '主图设计',
    platform: 'tmall' as PlatformType,
    budget: '',
    deadlineDays: '3',
    urgency: 'normal' as 'normal' | 'urgent' | 'super_urgent',
    requirements: '',
    referenceUrl: '',
  });

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const res = await fetch('http://localhost:8080/api/design-orders');
      const data = await res.json();
      if (data.success) {
        setOrders(data.data);
      }
    } catch (e) {
      console.error(e);
      toast.error('获取接单广场数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const handlePublishOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.budget) {
      toast.error('请填写需求标题和预算金额');
      return;
    }

    setSubmitting(true);
    try {
      const deadline = new Date(Date.now() + Number(formData.deadlineDays) * 86400000).toISOString();
      const res = await fetch('http://localhost:8080/api/design-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          category: formData.category,
          platform: formData.platform,
          budget: Number(formData.budget),
          urgency: formData.urgency,
          deadline,
          requirements: formData.requirements,
          referenceImages: formData.referenceUrl ? [formData.referenceUrl] : [],
          creatorId: user?.id || 'u_guest',
          creatorName: user?.name || '前台商户/运营',
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || '发布失败');
      }

      toast.success('设计需求派单成功！已发布至接单广场');
      setIsPublishOpen(false);
      setFormData({
        title: '',
        category: '主图设计',
        platform: 'tmall',
        budget: '',
        deadlineDays: '3',
        urgency: 'normal',
        requirements: '',
        referenceUrl: '',
      });
      fetchOrders();
    } catch (err: any) {
      toast.error(err.message || '派单失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaimOrder = async (orderId: string) => {
    try {
      const res = await fetch(`http://localhost:8080/api/design-orders/${orderId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          designerId: user?.id || 'u_des_1',
          designerName: user?.name || '李设计师',
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || '接单失败');
      }
      toast.success(data.message);
      fetchOrders();
    } catch (err: any) {
      toast.error(err.message || '接单失败');
    }
  };

  const filteredOrders = orders.filter(
    (o) => activeCategory === '全部' || o.category === activeCategory
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* 顶部标题与派单按钮 */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-card p-6 rounded-3xl bg-white/70 border border-white/80 shadow-sm backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center text-white shadow-md shadow-orange-500/20">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">
              设计接单与派单大厅
            </h1>
            <Badge variant="outline" className="bg-amber-50 text-amber-600 border-amber-200 text-[11px]">
              前台市场
            </Badge>
          </div>
          <p className="text-xs text-slate-500">
            设计师可在线抢单赚取收益；运营/商户可随时发起主图、详情页、活动海报等定制需求
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Dialog open={isPublishOpen} onOpenChange={setIsPublishOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded-2xl shadow-md shadow-blue-500/20 gap-1.5 h-10">
                <PlusCircle className="w-4 h-4" />
                发布新需求 / 派单
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl bg-white rounded-3xl p-6">
              <DialogHeader>
                <DialogTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-blue-600" />
                  发布新的设计定制需求
                </DialogTitle>
                <CardDescription className="text-xs text-slate-500">
                  提交需求后将自动扣除系统预设抽成比例并向全体签约设计师派发接单
                </CardDescription>
              </DialogHeader>

              <form onSubmit={handlePublishOrder} className="space-y-4 mt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">需求标题 *</label>
                  <Input
                    required
                    placeholder="如：秋冬羊绒大衣淘宝主图5张套系设计"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="text-xs rounded-xl"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">设计类目 *</label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      className="w-full h-9 bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {CATEGORIES.filter((c) => c !== '全部').map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">投放电商平台 *</label>
                    <select
                      value={formData.platform}
                      onChange={(e) => setFormData({ ...formData, platform: e.target.value as PlatformType })}
                      className="w-full h-9 bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {PLATFORMS.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">总预算 (元) *</label>
                    <Input
                      type="number"
                      required
                      min="50"
                      placeholder="800"
                      value={formData.budget}
                      onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                      className="text-xs rounded-xl"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">交付周期</label>
                    <select
                      value={formData.deadlineDays}
                      onChange={(e) => setFormData({ ...formData, deadlineDays: e.target.value })}
                      className="w-full h-9 bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 outline-none"
                    >
                      <option value="1">24 小时极速交付</option>
                      <option value="2">2 天交付</option>
                      <option value="3">3 天标准交付</option>
                      <option value="5">5 天深度打磨</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">加急程度</label>
                    <select
                      value={formData.urgency}
                      onChange={(e) => setFormData({ ...formData, urgency: e.target.value as any })}
                      className="w-full h-9 bg-slate-50 border border-slate-200 text-slate-800 text-xs rounded-xl px-3 outline-none"
                    >
                      <option value="normal">标准单</option>
                      <option value="urgent">加急单</option>
                      <option value="super_urgent">特急单 (优先置顶)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">参考样例图 URL / 素材链接</label>
                  <Input
                    placeholder="https://images.unsplash.com/photo-..."
                    value={formData.referenceUrl}
                    onChange={(e) => setFormData({ ...formData, referenceUrl: e.target.value })}
                    className="text-xs rounded-xl"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">设计详细要求与文案卖点</label>
                  <Textarea
                    rows={3}
                    placeholder="请详细列举设计排版风格、模特诉求、文案卖点及尺寸规格要求..."
                    value={formData.requirements}
                    onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                    className="text-xs rounded-xl"
                  />
                </div>

                {formData.budget && (
                  <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-2xl flex items-center justify-between text-xs">
                    <span className="text-slate-600">
                      预计平台抽成 (约15%): <b className="text-slate-800">¥{(Number(formData.budget) * 0.15).toFixed(2)}</b>
                    </span>
                    <span className="text-blue-600 font-bold">
                      设计师到手所得: ¥{(Number(formData.budget) * 0.85).toFixed(2)}
                    </span>
                  </div>
                )}

                <DialogFooter className="mt-4 gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsPublishOpen(false)} className="rounded-xl text-xs">
                    取消
                  </Button>
                  <Button type="submit" disabled={submitting} className="rounded-xl text-xs bg-blue-600 hover:bg-blue-700 text-white">
                    {submitting ? '发布中...' : '确认派发需求'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 分类筛选与统计卡片 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-2xl text-xs font-semibold transition ${
                activeCategory === cat
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-white/80 text-slate-600 hover:bg-white border border-slate-200/60'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-500 font-medium">
          当前共 <b className="text-blue-600">{filteredOrders.length}</b> 个需求待承接
        </div>
      </div>

      {/* 接单卡片列表 */}
      {loading ? (
        <div className="py-20 text-center text-xs text-slate-400">正在载入接单广场数据...</div>
      ) : filteredOrders.length === 0 ? (
        <div className="py-20 text-center glass-card rounded-3xl p-8">
          <Sparkles className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-medium">暂无对应分类的接单需求</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredOrders.map((order) => {
            const isClaimed = order.status !== 'open';
            return (
              <Card
                key={order.id}
                className="rounded-3xl border border-white/80 bg-white/70 shadow-sm hover:shadow-md transition-all duration-300 backdrop-blur-sm flex flex-col justify-between overflow-hidden group"
              >
                <div>
                  {/* 卡片头部 */}
                  <div className="p-5 pb-3">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200">
                        {order.category}
                      </Badge>
                      {order.urgency === 'super_urgent' && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                          <Flame className="w-3 h-3" /> 特急
                        </span>
                      )}
                      {order.urgency === 'urgent' && (
                        <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          加急
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-sm text-slate-800 line-clamp-2 group-hover:text-blue-600 transition">
                      {order.title}
                    </h3>
                  </div>

                  {/* 参考图（若有） */}
                  {order.referenceImages && order.referenceImages.length > 0 && (
                    <div className="px-5 pb-3">
                      <div className="relative h-28 w-full rounded-2xl overflow-hidden bg-slate-100 border border-slate-200/50">
                        <img
                          src={order.referenceImages[0]}
                          alt="参考图"
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        />
                        <div className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full">
                          参考图例
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 需求文案 */}
                  <div className="px-5 pb-3">
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed bg-slate-50/70 p-2.5 rounded-xl">
                      {order.requirements || '发布方暂未提供详细附言，接单后可直接与商户沟通。'}
                    </p>
                  </div>
                </div>

                {/* 卡片底部操作与金额 */}
                <div className="p-5 pt-3 border-t border-slate-100 bg-gradient-to-b from-transparent to-slate-50/50">
                  <div className="flex items-center justify-between mb-3 text-xs">
                    <div>
                      <div className="text-[10px] text-slate-400">设计师税后所得</div>
                      <div className="font-extrabold text-base text-emerald-600 font-mono">
                        ¥{order.designerPayout}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400">客户总预算</div>
                      <div className="text-xs font-semibold text-slate-600 font-mono">
                        ¥{order.budget} <span className="text-[10px] text-slate-400">(抽成 {(order.platformCommissionRate * 100).toFixed(0)}%)</span>
                      </div>
                    </div>
                  </div>

                  {isClaimed ? (
                    <Button
                      disabled
                      variant="secondary"
                      className="w-full rounded-2xl text-xs h-9 bg-slate-100 text-slate-400 gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4 text-slate-400" />
                      已由 {order.claimedByName || '其他设计师'} 接取
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleClaimOrder(order.id)}
                      className="w-full rounded-2xl text-xs h-9 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20 gap-1.5 font-semibold"
                    >
                      <Coins className="w-4 h-4" />
                      立即抢单接取
                      <ArrowUpRight className="w-3.5 h-3.5 ml-auto" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
