'use client';

import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { RecommendedDesigners } from '@/components/recommended-designers';

export default function RecommendedDesignersPage() {
  return <section className="space-y-5">
    <div className="rounded-3xl border border-rose-100 bg-gradient-to-r from-white to-rose-50/70 p-6">
      <Link href="/advertiser/dashboard" className="mb-4 inline-flex items-center gap-1 text-xs text-slate-500 transition hover:text-rose-600"><ArrowLeft className="h-3.5 w-3.5" />返回工作台</Link>
      <p className="flex items-center gap-2 text-xs font-semibold text-rose-600"><Sparkles className="h-4 w-4" />品牌方资源中心</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">推荐设计师</h1>
      <p className="mt-2 text-xs text-slate-500">浏览公开作品和接单偏好，选择适合您订单的设计师。</p>
    </div>
    <RecommendedDesigners />
  </section>;
}
