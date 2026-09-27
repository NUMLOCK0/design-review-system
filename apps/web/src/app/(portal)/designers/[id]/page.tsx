'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, BriefcaseBusiness, CalendarDays, CheckCircle2, Clock3, ExternalLink, Image as ImageIcon, Layers3, Sparkles } from 'lucide-react';
import type { DesignerPortfolio, DesignerProfile } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { toast } from 'sonner';

type PublicDesigner = DesignerProfile & { portfolios: DesignerPortfolio[]; portfolioCount: number };

export default function DesignerPublicPage() {
  const params = useParams<{ id: string }>();
  const [designer, setDesigner] = useState<PublicDesigner | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!params.id) return;
    fetchWithAuth(`/designers/${params.id}`).then(async (response) => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '设计师主页加载失败');
      setDesigner(result.data);
    }).catch((error: any) => toast.error(error.message || '设计师主页加载失败')).finally(() => setLoading(false));
  }, [params.id]);
  if (loading) return <div className="rounded-3xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-400">正在加载设计师主页…</div>;
  if (!designer) return <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-400">该设计师主页暂未公开</div>;
  return <section className="space-y-5">
    <Link href="/advertiser/dashboard" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 transition hover:text-rose-600"><ArrowLeft className="h-3.5 w-3.5" />返回品牌方工作台</Link>
    <Card className="overflow-hidden border-rose-100"><div className="h-32 bg-gradient-to-r from-rose-100 via-fuchsia-50 to-orange-50" /><CardContent className="relative -mt-12 p-6"><div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div className="flex items-end gap-4"><div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl border-4 border-white bg-gradient-to-br from-orange-500 via-rose-500 to-fuchsia-600 text-3xl font-bold text-white shadow-lg">{designer.avatarUrl ? <AuthenticatedImage src={designer.avatarUrl} alt={designer.name} className="h-full w-full object-cover" /> : designer.name.slice(0, 1)}</div><div className="pb-1"><div className="flex items-center gap-2"><h1 className="text-2xl font-bold text-slate-900">{designer.name}</h1><CheckCircle2 className="h-4 w-4 text-rose-500" /></div><p className="mt-1 text-sm text-rose-600">{designer.headline || '视觉设计师'}</p></div></div><Button asChild className="h-9 rounded-xl bg-rose-600 text-xs text-white hover:bg-rose-700"><Link href="/advertiser/orders">去订单中邀请接单<ExternalLink className="ml-1.5 h-3.5 w-3.5" /></Link></Button></div><div className="mt-6 grid gap-3 sm:grid-cols-4"><div className="rounded-2xl bg-rose-50/70 p-3"><p className="text-[11px] text-slate-500">作品项目</p><p className="mt-1 text-xl font-bold text-rose-600">{designer.portfolioCount}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">从业年限</p><p className="mt-1 text-xl font-bold text-slate-800">{designer.yearsExperience || 0}<span className="ml-1 text-xs font-normal">年</span></p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">质量评分</p><p className="mt-1 text-xl font-bold text-slate-800">{designer.qualityScore}<span className="ml-1 text-xs font-normal">分</span></p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[11px] text-slate-500">接单状态</p><p className="mt-1 text-sm font-bold text-emerald-600">{designer.availabilityStatus === 'available' ? '当前可接单' : designer.availabilityStatus === 'busy' ? '排期中' : '暂停接单'}</p></div></div></CardContent></Card>
    <div className="grid gap-5 lg:grid-cols-[.72fr_1.28fr]"><Card><CardContent className="space-y-5 p-5"><div><h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Sparkles className="h-4 w-4 text-rose-500" />关于我</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-600">{designer.bio || '这位设计师还没有填写个人简介。'}</p></div><div><h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Layers3 className="h-4 w-4 text-rose-500" />擅长方向</h2><div className="mt-3 flex flex-wrap gap-1.5">{[...(designer.industries || []), ...designer.categories, ...designer.styles].map((item) => <Badge key={item} variant="outline" className="border-rose-100 bg-rose-50/50 text-[10px] text-rose-700">{item}</Badge>)}</div></div><div className="space-y-2 border-t border-slate-100 pt-4 text-xs text-slate-500"><p className="flex items-center gap-2"><BriefcaseBusiness className="h-3.5 w-3.5 text-slate-400" />最低预算：{designer.minBudget ? `¥${designer.minBudget}` : '可沟通'}</p><p className="flex items-center gap-2"><Clock3 className="h-3.5 w-3.5 text-slate-400" />最大同时接单：{designer.maxActiveOrders} 单</p><p className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 text-slate-400" />准时交付率：{designer.onTimeRate}%</p></div></CardContent></Card><div><div className="mb-3 flex items-center justify-between"><div><h2 className="flex items-center gap-2 text-base font-bold text-slate-900"><ImageIcon className="h-4 w-4 text-rose-500" />作品集</h2><p className="mt-1 text-xs text-slate-400">精选公开项目，共 {designer.portfolioCount} 个</p></div></div><div className="grid gap-4 sm:grid-cols-2">{designer.portfolios.map((item) => <Card key={item.id} className="overflow-hidden border-slate-200"><div className="aspect-[4/3] overflow-hidden bg-slate-100"><AuthenticatedImage src={item.coverUrl} alt={item.title} className="h-full w-full object-cover transition duration-500 hover:scale-105" /></div><CardContent className="p-4"><h3 className="text-sm font-bold text-slate-800">{item.title}</h3><p className="mt-1 text-[11px] text-slate-400">{[item.industry, item.category, item.platform].filter(Boolean).join(' · ')}</p>{item.description && <p className="mt-3 line-clamp-3 text-xs leading-5 text-slate-500">{item.description}</p>}<div className="mt-3 flex flex-wrap gap-1">{item.tags.map((tag) => <span key={tag} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{tag}</span>)}</div></CardContent></Card>)}</div></div></div>
  </section>;
}
