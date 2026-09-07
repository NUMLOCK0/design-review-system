'use client';

import React, { useState, useEffect, useRef } from 'react';
import * as Select from '@radix-ui/react-select';
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
  AlertCircle,
  Link as LinkIcon,
  Plus,
  Trash2,
  Layers,
  UploadCloud,
  ExternalLink,
  ChevronDown,
  Loader2,
  FileText,
  Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/auth';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useRouter } from 'next/navigation';
import type { 
  DesignOrder, 
  PlatformType, 
  ImageGroupType, 
  OrderImageRequirementItem,
  OrderReferenceImageItem,
  ReviewRule
} from '@design-review/shared';

const CATEGORIES = ['全部', '主图设计', '详情页设计', '活动海报', '3D建模与渲染', '精修合成'];
const PLATFORMS: { id: PlatformType; name: string }[] = [
  { id: 'tmall', name: '天猫商城' },
  { id: 'taobao', name: '淘宝网' },
  { id: 'douyin', name: '抖音电商' },
  { id: 'pinduoduo', name: '拼多多' },
  { id: 'universal', name: '全网通用' },
];

export default function OrderMarketPage() {
  const router = useRouter();
  const user = useCurrentUser();
  const [orders, setOrders] = useState<DesignOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [activeCategory, setActiveCategory] = useState('全部');
  const [activePlatform, setActivePlatform] = useState('all');
  const [activeUrgency, setActiveUrgency] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<DesignOrder | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; label: string } | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewRules, setReviewRules] = useState<ReviewRule[]>([]);

  // 表单状态：每张图片均有独立的描述与要求
  const [formData, setFormData] = useState({
    title: '',
    category: '主图设计',
    platform: 'tmall' as PlatformType,
    budget: '',
    deadlineDays: '3',
    urgency: 'normal' as 'normal' | 'urgent' | 'super_urgent',
    reviewRuleId: '',
    requirements: '',
    imageRequirementGroups: [
      {
        id: 'grp_req_1',
        name: '1:1 白底透气主图',
        groupType: 'main_1_1' as ImageGroupType,
        quantity: 1,
        dimensions: '800x800',
        description: '白底纯净无噪点，微距突出面料细节质感',
        referenceImages: [
          'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&auto=format&fit=crop&q=80'
        ],
        referenceImageItems: [
          {
            id: 'ref_img_1',
            url: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=800&auto=format&fit=crop&q=80',
            description: '参考该图的白色背景通透度与面料微距光影'
          }
        ],
        referenceLinks: ['https://dribbble.com/shots/fashion-clean-ui']
      },
      {
        id: 'grp_req_2',
        name: '3:4 模特场景图',
        groupType: 'main_3_4' as ImageGroupType,
        quantity: 2,
        dimensions: '750x1000',
        description: '自然采光外景，突出穿着版型与上身效果',
        referenceImages: [
          'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&auto=format&fit=crop&q=80'
        ],
        referenceImageItems: [
          {
            id: 'ref_img_2',
            url: 'https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=800&auto=format&fit=crop&q=80',
            description: '参考该外景模特的站姿构图与暖色阳光氛围'
          }
        ],
        referenceLinks: []
      }
    ] as OrderImageRequirementItem[]
  });

  const [uploadingGroupIndex, setUploadingGroupIndex] = useState<number | null>(null);

  const fetchOrders = async (nextPage = 1, append = false) => {
    try {
      append ? setLoadingMore(true) : setLoading(true);
      const params = new URLSearchParams({
        page: String(nextPage),
        pageSize: '15',
        category: activeCategory === '全部' ? 'all' : activeCategory,
        platform: activePlatform,
        urgency: activeUrgency,
        keyword: searchKeyword
      });
      const res = await fetch(`http://localhost:8080/api/design-orders?${params}`);
      const data = await res.json();
      if (data.success) {
        setOrders((current) => append ? [...current, ...data.data] : data.data);
        setPage(nextPage);
        setHasMore(data.hasMore);
      }
    } catch (e) {
      console.error(e);
      toast.error('获取接单广场数据失败');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, [activeCategory, activePlatform, activeUrgency, searchKeyword]);

  useEffect(() => {
    if (user?.role !== 'advertiser') return;
    fetchWithAuth('/review-rules/mine')
      .then((response) => response.json())
      .then((result) => {
        const nextRules = result.success ? result.data || [] : [];
        setReviewRules(nextRules);
        if (nextRules[0]) setFormData((current) => ({ ...current, reviewRuleId: current.reviewRuleId || nextRules[0].id }));
      })
      .catch(() => setReviewRules([]));
  }, [user?.role]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !hasMore) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !loading && !loadingMore) {
        fetchOrders(page + 1, true);
      }
    }, { rootMargin: '240px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [page, hasMore, loading, loadingMore, activeCategory, activePlatform, activeUrgency, searchKeyword]);

  // 增加图片需求组
  const handleAddImageGroup = () => {
    const newGroup: OrderImageRequirementItem = {
      id: `grp_req_${Date.now()}`,
      name: `图片需求组 #${formData.imageRequirementGroups.length + 1}`,
      groupType: 'main_1_1',
      quantity: 1,
      dimensions: '800x800',
      description: '',
      referenceImages: [],
      referenceImageItems: [],
      referenceLinks: []
    };
    setFormData({
      ...formData,
      imageRequirementGroups: [...formData.imageRequirementGroups, newGroup]
    });
  };

  // 移除图片需求组
  const handleRemoveImageGroup = (index: number) => {
    if (formData.imageRequirementGroups.length <= 1) {
      toast.warning('至少保留一个图片需求组');
      return;
    }
    const updated = formData.imageRequirementGroups.filter((_, idx) => idx !== index);
    setFormData({ ...formData, imageRequirementGroups: updated });
  };

  // 上传参考图到指定组 (并附带默认描述)
  const handleUploadGroupImage = async (e: React.ChangeEvent<HTMLInputElement>, groupIndex: number) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingGroupIndex(groupIndex);
    const body = new FormData();
    body.append('file', file);
    body.append('folder', 'reference-samples');

    try {
      const res = await fetchWithAuth('/upload', {
        method: 'POST',
        body
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || '上传失败');
      }

      const updatedGroups = [...formData.imageRequirementGroups];
      const targetGroup = updatedGroups[groupIndex];
      const newImgUrl = data.data.url;

      // 同步更新纯链接数组与对象数组
      targetGroup.referenceImages = targetGroup.referenceImages || [];
      targetGroup.referenceImages.push(newImgUrl);

      targetGroup.referenceImageItems = targetGroup.referenceImageItems || [];
      targetGroup.referenceImageItems.push({
        id: `ref_img_${Date.now()}`,
        url: newImgUrl,
        description: ''
      });

      setFormData({ ...formData, imageRequirementGroups: updatedGroups });
      toast.success('参考图已上传，请在下方输入该图的具体设计要求');
    } catch (err: any) {
      toast.error(err.message || '参考图上传失败');
    } finally {
      setUploadingGroupIndex(null);
    }
  };

  // 更新某张参考图片的专属描述
  const handleUpdateImageDescription = (groupIndex: number, imgIndex: number, text: string) => {
    const updatedGroups = [...formData.imageRequirementGroups];
    const targetGroup = updatedGroups[groupIndex];
    if (!targetGroup.referenceImageItems) {
      targetGroup.referenceImageItems = (targetGroup.referenceImages || []).map((url, i) => ({
        id: `ref_img_${i}`,
        url,
        description: ''
      }));
    }
    if (targetGroup.referenceImageItems[imgIndex]) {
      targetGroup.referenceImageItems[imgIndex].description = text;
      setFormData({ ...formData, imageRequirementGroups: updatedGroups });
    }
  };

  // 移除某张参考图
  const handleRemoveReferenceImage = (groupIndex: number, imgIndex: number) => {
    const updatedGroups = [...formData.imageRequirementGroups];
    const targetGroup = updatedGroups[groupIndex];
    if (targetGroup.referenceImages) {
      targetGroup.referenceImages.splice(imgIndex, 1);
    }
    if (targetGroup.referenceImageItems) {
      targetGroup.referenceImageItems.splice(imgIndex, 1);
    }
    setFormData({ ...formData, imageRequirementGroups: updatedGroups });
  };

  // 增加参考链接
  const handleAddReferenceLink = (groupIndex: number, linkUrl: string) => {
    if (!linkUrl.trim()) return;
    const updatedGroups = [...formData.imageRequirementGroups];
    updatedGroups[groupIndex].referenceLinks.push(linkUrl.trim());
    setFormData({ ...formData, imageRequirementGroups: updatedGroups });
  };

  // 移除参考链接
  const handleRemoveReferenceLink = (groupIndex: number, linkIndex: number) => {
    const updatedGroups = [...formData.imageRequirementGroups];
    updatedGroups[groupIndex].referenceLinks.splice(linkIndex, 1);
    setFormData({ ...formData, imageRequirementGroups: updatedGroups });
  };

  const handlePublishOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.budget) {
      toast.error('请填写需求标题和预算金额');
      return;
    }

    setSubmitting(true);
    try {
      const deadline = new Date(Date.now() + Number(formData.deadlineDays) * 86400000).toISOString();
      const res = await fetchWithAuth('/design-orders', {
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
          reviewRuleId: formData.reviewRuleId || undefined,
          reviewRuleName: reviewRules.find((rule) => rule.id === formData.reviewRuleId)?.name,
          imageRequirementGroups: formData.imageRequirementGroups,
          creatorId: user?.id,
          creatorName: user?.name,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.message || '发布失败');
      }

      toast.success('多组图片设计需求派单成功！已同步至接单大厅');
      setIsPublishOpen(false);
      fetchOrders();
    } catch (err: any) {
      toast.error(err.message || '派单失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClaimOrder = async (orderId: string) => {
    try {
      const res = await fetchWithAuth(`/design-orders/${orderId}/claim`, {
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
      toast.success(data.message, {
        description: '正在为您自动跳转至【我的任务中心】...'
      });
      fetchOrders();
      // 接单成功后自动跳转到我的任务中心
      setTimeout(() => {
        router.push('/review-tasks');
      }, 600);
    } catch (err: any) {
      toast.error(err.message || '接单失败');
    }
  };

  const filteredOrders = orders;

  return (
    <div className="space-y-6">
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
              每张图片专属描述
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {user?.role === 'advertiser' && <Dialog open={isPublishOpen} onOpenChange={setIsPublishOpen}>
            <DialogContent className="max-w-3xl bg-white rounded-3xl p-6 max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <PlusCircle className="w-5 h-5 text-blue-600" />
                  发布多图片需求组定制派单
                </DialogTitle>
                <CardDescription className="text-xs text-slate-500">
                  支持按规格增加多个图片组，上传的每一张参考图都可以填写针对性的设计要求描述
                </CardDescription>
              </DialogHeader>

              <form onSubmit={handlePublishOrder} className="space-y-4 mt-2">
                {/* 1. 基本信息 */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">需求标题 *</label>
                  <Input
                    required
                    placeholder="如：2026秋冬轻奢羽绒服天猫首屏主图全套5张定制"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="text-xs rounded-xl h-9"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">设计类目</label>
                    <Select.Root value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}><Select.Trigger className="flex h-9 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/15"><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className="z-50 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-md"><Select.Viewport>{CATEGORIES.filter((category) => category !== '全部').map((category) => <Select.Item key={category} value={category} className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>{category}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">投放电商平台</label>
                    <Select.Root value={formData.platform} onValueChange={(value) => setFormData({ ...formData, platform: value as PlatformType })}><Select.Trigger className="flex h-9 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/15"><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className="z-50 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-md"><Select.Viewport>{PLATFORMS.map((platform) => <Select.Item key={platform.id} value={platform.id} className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>{platform.name}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root>
                  </div>
                </div>

                {/* 2. 价格、周期与加急程度 (位于图片组上方) */}
                <div className="grid grid-cols-3 gap-3 pt-1 pb-1">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">订单价格 (元) *</label>
                    <Input
                      type="number"
                      required
                      min="50"
                      placeholder="800"
                      value={formData.budget}
                      onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                      className="text-xs rounded-xl font-mono h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">交付周期</label>
                    <Select.Root value={formData.deadlineDays} onValueChange={(value) => setFormData({ ...formData, deadlineDays: value })}><Select.Trigger className="flex h-9 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/15"><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className="z-50 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-md"><Select.Viewport><Select.Item value="1" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>24 小时极速交付</Select.ItemText></Select.Item><Select.Item value="2" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>2 天交付</Select.ItemText></Select.Item><Select.Item value="3" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>3 天标准交付</Select.ItemText></Select.Item><Select.Item value="5" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>5 天深度打磨</Select.ItemText></Select.Item></Select.Viewport></Select.Content></Select.Portal></Select.Root>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700">加急程度</label>
                    <Select.Root value={formData.urgency} onValueChange={(value) => setFormData({ ...formData, urgency: value as any })}><Select.Trigger className="flex h-9 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/15"><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className="z-50 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-md"><Select.Viewport><Select.Item value="normal" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>标准单</Select.ItemText></Select.Item><Select.Item value="urgent" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>加急单</Select.ItemText></Select.Item><Select.Item value="super_urgent" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>特急单 (置顶)</Select.ItemText></Select.Item></Select.Viewport></Select.Content></Select.Portal></Select.Root>
                  </div>
                </div>

                {/* 3. 核心功能：多图片需求组 + 单图独立描述 */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                    <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-blue-600" />
                      图片需求组清单 ({formData.imageRequirementGroups.length} 组)
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddImageGroup}
                      className="text-[11px] h-7 rounded-xl border-dashed border-blue-300 text-blue-600 hover:bg-blue-50"
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      增加图片组
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {formData.imageRequirementGroups.map((group, gIdx) => {
                      const imageItems = group.referenceImageItems || (group.referenceImages || []).map((url, i) => ({
                        id: `ref_img_${i}`,
                        url,
                        description: ''
                      }));

                      return (
                        <div
                          key={group.id || gIdx}
                          className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-1">
                              <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-bold text-[10px] flex items-center justify-center">
                                {gIdx + 1}
                              </span>
                              <Input
                                value={group.name}
                                onChange={(e) => {
                                  const updated = [...formData.imageRequirementGroups];
                                  updated[gIdx].name = e.target.value;
                                  setFormData({ ...formData, imageRequirementGroups: updated });
                                }}
                                placeholder="组名称 (如：1:1白底图)"
                                className="text-xs rounded-xl h-8 bg-white font-semibold max-w-xs"
                              />
                              <Select.Root value={group.groupType} onValueChange={(value) => {
                                  const updated = [...formData.imageRequirementGroups];
                                  updated[gIdx].groupType = value as ImageGroupType;
                                  setFormData({ ...formData, imageRequirementGroups: updated });
                                }}><Select.Trigger className="flex h-8 w-36 items-center justify-between rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/15"><Select.Value /><Select.Icon><ChevronDown className="h-3.5 w-3.5 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className="z-50 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-md"><Select.Viewport><Select.Item value="main_1_1" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>1:1 方形主图</Select.ItemText></Select.Item><Select.Item value="main_3_4" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>3:4 竖版长图</Select.ItemText></Select.Item><Select.Item value="detail" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>商详长图切片</Select.ItemText></Select.Item></Select.Viewport></Select.Content></Select.Portal></Select.Root>
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="flex items-center gap-1 text-xs text-slate-500">
                                <span>数量:</span>
                                <Input
                                  type="number"
                                  min="1"
                                  max="20"
                                  value={group.quantity}
                                  onChange={(e) => {
                                    const updated = [...formData.imageRequirementGroups];
                                    updated[gIdx].quantity = Number(e.target.value);
                                    setFormData({ ...formData, imageRequirementGroups: updated });
                                  }}
                                  className="w-12 h-8 text-xs text-center rounded-xl bg-white"
                                />
                                <span>张</span>
                              </div>

                              {formData.imageRequirementGroups.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveImageGroup(gIdx)}
                                  className="h-7 w-7 text-slate-400 hover:text-rose-500 rounded-xl"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* 本组参考样例图列表 (每张图片均有独立描述) */}
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                              <span>参考样例图与单图描述清单</span>
                              <label className="text-blue-600 hover:underline flex items-center gap-1 cursor-pointer font-bold">
                                {uploadingGroupIndex === gIdx ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Plus className="w-3.5 h-3.5" />
                                )}
                                <span>上传参考图</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => handleUploadGroupImage(e, gIdx)}
                                  className="hidden"
                                />
                              </label>
                            </div>

                            {imageItems.length === 0 ? (
                              <div className="p-3 bg-white/60 rounded-xl border border-dashed border-slate-200 text-center text-[11px] text-slate-400">
                                暂无参考图，点击上方“上传参考图”为本组添加样例
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {imageItems.map((item, imgIdx) => (
                                  <div
                                    key={item.id || imgIdx}
                                    className="p-2.5 bg-white rounded-xl border border-slate-200 flex items-start gap-3 shadow-xs"
                                  >
                                    <div className="relative w-14 h-14 rounded-lg overflow-hidden bg-slate-100 shrink-0 border border-slate-200">
                                      <img src={item.url} alt="样例图" className="w-full h-full object-cover" />
                                    </div>

                                    <div className="flex-1 min-w-0 space-y-1">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-bold text-slate-700">
                                          参考图 #{imgIdx + 1} 诉求描述
                                        </span>
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => handleRemoveReferenceImage(gIdx, imgIdx)}
                                          className="h-5 w-5 text-slate-400 hover:text-rose-500"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </div>
                                      <Input
                                        placeholder="如：借鉴此图的金属反光质感 / 学习左侧卖点文字排版层级..."
                                        value={item.description || ''}
                                        onChange={(e) => handleUpdateImageDescription(gIdx, imgIdx, e.target.value)}
                                        className="text-xs h-8 bg-slate-50/80 rounded-lg border-slate-200"
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* 本组外部参考链接 */}
                          <div className="space-y-1.5 pt-1">
                            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                              <span>外部参考链接 (如天猫竞品 / Figma / 小红书等)</span>
                            </div>

                            <div className="space-y-1">
                              {group.referenceLinks.map((link, lIdx) => (
                                <div key={lIdx} className="flex items-center justify-between gap-2 p-1.5 px-2 bg-white rounded-xl border border-slate-200 text-xs">
                                  <div className="flex items-center gap-1.5 truncate text-blue-600">
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                    <a href={link} target="_blank" rel="noreferrer" className="truncate hover:underline text-[11px]">
                                      {link}
                                    </a>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleRemoveReferenceLink(gIdx, lIdx)}
                                    className="h-5 w-5 text-slate-400 hover:text-rose-500"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              ))}

                              <div className="flex items-center gap-2">
                                <Input
                                  id={`link_input_${gIdx}`}
                                  placeholder="输入参考链接如 https://dribbble.com/..."
                                  className="text-xs h-7 rounded-xl bg-white"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      const input = e.currentTarget;
                                      handleAddReferenceLink(gIdx, input.value);
                                      input.value = '';
                                    }
                                  }}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const input = document.getElementById(`link_input_${gIdx}`) as HTMLInputElement;
                                    if (input && input.value) {
                                      handleAddReferenceLink(gIdx, input.value);
                                      input.value = '';
                                    }
                                  }}
                                  className="text-[10px] h-7 rounded-xl px-2.5 shrink-0"
                                >
                                  添加链接
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4. 整体文案诉求与设计说明 */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">整体文案诉求与设计说明</label>
                  <Textarea
                    rows={2}
                    placeholder="简述风格基调、促销利益点文案、品牌调性..."
                    value={formData.requirements}
                    onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
                    className="text-xs rounded-xl"
                  />
                </div>

                <DialogFooter className="mt-4 gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsPublishOpen(false)} className="rounded-xl text-xs">
                    取消
                  </Button>
                  <Button type="submit" disabled={submitting} className="rounded-xl text-xs bg-blue-600 hover:bg-blue-700 text-white">
                    {submitting ? '发布中...' : '确认派发多组需求'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>}
        </div>
      </div>

      {/* 分类筛选 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-2xl text-xs font-semibold transition ${
                activeCategory === cat
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200/70'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="text-xs text-slate-500 font-medium">已加载 <b className="text-blue-600">{filteredOrders.length}</b> 个需求</div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/70 bg-white/80 p-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setSearchKeyword(keyword.trim())}
            placeholder="搜索订单号、标题、需求说明或发布方"
            className="h-9 rounded-xl pl-9 text-xs"
          />
        </div>
        <Select.Root value={activePlatform} onValueChange={setActivePlatform}><Select.Trigger className="flex h-9 w-32 items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-600 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/15"><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className="z-50 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-md"><Select.Viewport><Select.Item value="all" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>全部平台</Select.ItemText></Select.Item>{PLATFORMS.map((platform) => <Select.Item key={platform.id} value={platform.id} className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>{platform.name}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root>
        <Select.Root value={activeUrgency} onValueChange={setActiveUrgency}><Select.Trigger className="flex h-9 w-32 items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-600 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/15"><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className="z-50 overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-md"><Select.Viewport><Select.Item value="all" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>全部时效</Select.ItemText></Select.Item><Select.Item value="normal" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>标准单</Select.ItemText></Select.Item><Select.Item value="urgent" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>加急单</Select.ItemText></Select.Item><Select.Item value="super_urgent" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>特急单</Select.ItemText></Select.Item></Select.Viewport></Select.Content></Select.Portal></Select.Root>
        <Button onClick={() => setSearchKeyword(keyword.trim())} className="h-9 rounded-xl bg-slate-800 px-4 text-xs text-white hover:bg-slate-700">查询</Button>
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
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {filteredOrders.map((order) => {
            const isClaimed = order.status !== 'open';
            const groupsCount = order.imageRequirementGroups?.length || 1;

            return (
              <Card
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                className="cursor-pointer rounded-2xl border border-slate-200/80 bg-white shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all duration-300 flex flex-col justify-between overflow-hidden group"
              >
                <div>
                  {/* 卡片头部 */}
                  <div className="p-3 pb-2">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200">
                          {order.category}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px] bg-blue-50 text-blue-600 border-blue-100">
                          {groupsCount}组图片
                        </Badge>
                      </div>
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
                    <h3 className="font-bold text-xs text-slate-800 line-clamp-2 group-hover:text-blue-600 transition">
                      {order.title}
                    </h3>
                  </div>

                  {/* 参考样例图展示 */}
                  {order.referenceImages && order.referenceImages.length > 0 && (
                    <div className="px-3 pb-2">
                      <div className="relative h-24 w-full rounded-xl overflow-hidden bg-slate-100 border border-slate-200/50">
                        <img
                          src={order.referenceImages[0]}
                          alt="参考图"
                          className="w-full h-full object-cover group-hover:scale-105 transition duration-500"
                        />
                        <div className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full">
                          {order.referenceImages.length} 张参考样例
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 需求组与图片说明预览 */}
                  {order.imageRequirementGroups && order.imageRequirementGroups.length > 0 && (
                    <div className="px-3 pb-2">
                      <div className="space-y-1">
                        {order.imageRequirementGroups.slice(0, 2).map((grp, idx) => (
                          <div key={idx} className="flex items-center justify-between text-[11px] bg-slate-50 p-1.5 px-2.5 rounded-xl text-slate-600">
                            <span className="font-medium truncate max-w-[180px]">{grp.name}</span>
                            <span className="font-mono text-slate-400">{grp.quantity}张 · {grp.dimensions || '标准'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 需求文案 */}
                  <div className="px-3 pb-2">
                    <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed bg-slate-50/70 p-2 rounded-lg">
                      {order.requirements || '发布方已设定单图专属描述，请接单后查阅图例及外链。'}
                    </p>
                  </div>
                </div>

                  {/* 卡片底部操作与金额 */}
                <div className="p-3 pt-2 border-t border-slate-100 bg-slate-50/40">
                  <div className="flex items-center justify-between mb-3 text-xs">
                    <div>
                      <div className="text-[10px] text-slate-400">订单价格</div>
                      <div className="font-extrabold text-base text-emerald-600 font-mono">
                        ¥{order.designerPayout || order.budget}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] text-slate-400">交付要求</div>
                      <div className="text-xs font-semibold text-slate-600">
                        {order.urgency === 'super_urgent' ? '特急交付' : order.urgency === 'urgent' ? '加急交付' : '标准排期'}
                      </div>
                    </div>
                  </div>

                  <Button
                    onClick={(e) => { e.stopPropagation(); handleClaimOrder(order.id); }}
                    className="w-full rounded-2xl text-xs h-9 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/20 gap-1.5 font-semibold"
                  >
                    <Coins className="w-4 h-4" />
                    立即抢单接取
                    <ArrowUpRight className="w-3.5 h-3.5 ml-auto" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <div ref={loadMoreRef} className="h-12 py-3 text-center text-xs text-slate-400">
        {loadingMore ? '正在加载更多...' : hasMore ? '下拉加载更多' : filteredOrders.length > 0 ? '已加载全部需求' : ''}
      </div>

      <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto rounded-3xl bg-white p-6">
          {selectedOrder && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base text-slate-800">{selectedOrder.title}</DialogTitle>
                <CardDescription className="text-xs">{selectedOrder.orderNo} · {selectedOrder.creatorName}</CardDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 text-xs text-slate-600">
                <div>设计类目：<b>{selectedOrder.category}</b></div>
                <div>投放平台：<b>{PLATFORMS.find((p) => p.id === selectedOrder.platform)?.name || selectedOrder.platform}</b></div>
                <div>设计师收入：<b className="text-emerald-600">¥{selectedOrder.designerPayout || selectedOrder.budget}</b></div>
                <div>交付时间：<b>{new Date(selectedOrder.deadline).toLocaleString('zh-CN')}</b></div>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3 text-xs leading-6 text-slate-600 whitespace-pre-wrap">{selectedOrder.requirements || '暂无补充说明'}</div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-800">图片需求组清单</h3>
                  <span className="text-[11px] text-slate-400">共 {selectedOrder.imageRequirementGroups?.length || 0} 组</span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700">作品审核流</label>
                  <Select.Root value={formData.reviewRuleId || 'unselected'} onValueChange={(value) => setFormData({ ...formData, reviewRuleId: value === 'unselected' ? '' : value })}><Select.Trigger className="flex h-9 w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs text-slate-800 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-500/15"><Select.Value /><Select.Icon><ChevronDown className="h-4 w-4 text-slate-400" /></Select.Icon></Select.Trigger><Select.Portal><Select.Content position="popper" className="z-50 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-md"><Select.Viewport><Select.Item value="unselected" className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>暂不绑定（后续补充）</Select.ItemText></Select.Item>{reviewRules.map((rule) => <Select.Item key={rule.id} value={rule.id} className="cursor-pointer rounded-lg px-2 py-1.5 text-xs outline-none hover:bg-slate-100"><Select.ItemText>{rule.name}</Select.ItemText></Select.Item>)}</Select.Viewport></Select.Content></Select.Portal></Select.Root>
                </div>
                <div className="space-y-2">
                  {(selectedOrder.imageRequirementGroups || []).map((group, index) => (
                    <div key={group.id || index} className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-slate-800">{index + 1}. {group.name}</div>
                          <div className="mt-1 text-[11px] text-slate-500">{group.quantity} 张 · {group.dimensions || '标准尺寸'} · {group.groupType}</div>
                        </div>
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] text-blue-600">需求组</span>
                      </div>
                      {group.description && <p className="mt-2 text-[11px] leading-5 text-slate-500">{group.description}</p>}
                      {group.referenceImages?.length > 0 && (
                        <div className="mt-2 flex gap-2 overflow-x-auto">
                          {group.referenceImages.map((image, imageIndex) => (
                            <button
                              type="button"
                              key={`${image}-${imageIndex}`}
                              onClick={() => setPreviewImage({ url: image, label: `${group.name}参考图${imageIndex + 1}` })}
                              className="group/image relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-200"
                            >
                              <img src={image} alt={`${group.name}参考图${imageIndex + 1}`} className="h-full w-full object-cover transition group-hover/image:scale-105" />
                              <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-[9px] text-white">点击放大</span>
                            </button>
                          ))}
                        </div>
                      )}
                      {group.referenceImageItems?.some((item) => item.description) && (
                        <div className="mt-2 space-y-1 text-[11px] text-slate-500">
                          {group.referenceImageItems.filter((item) => item.description).map((item) => <p key={item.id}>参考图说明：{item.description}</p>)}
                        </div>
                      )}
                      {group.referenceLinks?.length > 0 && (
                        <div className="mt-2 space-y-1 text-[11px]">
                          {group.referenceLinks.map((link) => <a key={link} href={link} target="_blank" rel="noreferrer" className="block truncate text-blue-600 hover:underline">参考链接：{link}</a>)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => { setSelectedOrder(null); handleClaimOrder(selectedOrder.id); }} className="rounded-xl bg-blue-600 text-xs text-white">立即抢单接取</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-4xl rounded-3xl border-slate-700 bg-slate-950 p-4">
          {previewImage && (
            <>
              <DialogHeader>
                <DialogTitle className="text-sm text-slate-100">{previewImage.label}</DialogTitle>
              </DialogHeader>
              <div className="flex max-h-[75vh] items-center justify-center overflow-auto rounded-2xl bg-black/30 p-2">
                <img src={previewImage.url} alt={previewImage.label} className="max-h-[70vh] max-w-full rounded-xl object-contain" />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
