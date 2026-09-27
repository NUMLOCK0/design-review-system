'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BriefcaseBusiness, RefreshCw, Sparkles } from 'lucide-react';
import type { DesignerProfile } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AuthenticatedImage } from '@/components/authenticated-image';

type RecommendedDesigner = DesignerProfile & { portfolioCount: number };

export function RecommendedDesigners() {
  const [items, setItems] = useState<RecommendedDesigner[]>([]);
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth('/designers/recommended?limit=4');
      const result = await response.json();
      if (response.ok && result.success) setItems(result.data || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  return <Card className="border-rose-100"><CardContent className="p-5">
    <div className="mb-4 flex items-center justify-between"><div><h2 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Sparkles className="h-4 w-4 text-rose-500" />推荐设计师</h2><p className="mt-1 text-[11px] text-slate-400">根据公开作品与接单偏好，为您匹配合适的人选</p></div><Button type="button" variant="ghost" onClick={() => void load()} disabled={loading} className="h-7 rounded-lg px-2 text-[11px] text-slate-400 hover:text-rose-600"><RefreshCw className={`mr-1 h-3 w-3 ${loading ? 'animate-spin' : ''}`} />换一批</Button></div>
    {loading ? <div className="py-8 text-center text-xs text-slate-400">正在匹配设计师…</div> : items.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">暂无公开设计师，发布后会在这里展示推荐人选。</div> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{items.map((designer) => <article key={designer.userId} className="group rounded-2xl border border-slate-200 bg-white p-3 transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md"><div className="flex items-center gap-2.5"><div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-orange-500 via-rose-500 to-fuchsia-600 text-sm font-bold text-white">{designer.avatarUrl ? <AuthenticatedImage src={designer.avatarUrl} alt={designer.name} className="h-full w-full object-cover" /> : designer.name.slice(0, 1)}</div><div className="min-w-0"><h3 className="truncate text-xs font-bold text-slate-800">{designer.name}</h3><p className="truncate text-[10px] text-slate-400">{designer.headline || '视觉设计师'}</p></div></div>{designer.portfolioUrls?.length ? <div className="mt-3 grid grid-cols-3 gap-1 overflow-hidden rounded-lg">{designer.portfolioUrls.slice(0, 3).map((url, index) => <AuthenticatedImage key={`${url}-${index}`} src={url} alt="设计师作品预览" className="aspect-square w-full object-cover" />)}</div> : null}<div className="mt-3 flex flex-wrap gap-1">{[...(designer.industries || []), ...designer.categories].slice(0, 3).map((tag) => <Badge key={tag} variant="outline" className="border-rose-100 bg-rose-50/50 px-1.5 py-0 text-[9px] text-rose-700">{tag}</Badge>)}</div><div className="mt-3 flex items-center justify-between text-[10px] text-slate-400"><span className="flex items-center gap-1"><BriefcaseBusiness className="h-3 w-3" />{designer.portfolioCount} 个作品</span><span className={designer.availabilityStatus === 'available' ? 'text-emerald-600' : 'text-amber-600'}>{designer.availabilityStatus === 'available' ? '可接单' : '排期中'}</span></div><p className="mt-2 min-h-8 text-[10px] leading-4 text-slate-500">{designer.recommendationReasons?.slice(0, 2).join(' · ')}</p><Link href={`/designers/${designer.userId}`} className="mt-3 flex items-center justify-center gap-1 rounded-lg bg-rose-50 py-1.5 text-[10px] font-semibold text-rose-600 transition hover:bg-rose-100">查看主页<ArrowRight className="h-3 w-3" /></Link></article>)}</div>}
  </CardContent></Card>;
}
