'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, FileText, Info, Layers2, Sparkles } from 'lucide-react';

export function OrderModeChooser({ mobile = false }: { mobile?: boolean }) {
  const root = mobile ? '/mobile/orders' : '/advertiser/orders';
  const simple = mobile ? '/mobile/orders/new/simple' : '/advertiser/orders/new/simple';
  const professional = mobile ? '/mobile/orders/new/professional' : '/advertiser/orders/new/professional';

  return <main className="min-h-dvh bg-slate-50 px-4 py-5 sm:px-6 sm:py-9">
    <div className="mx-auto max-w-4xl">
      <Link href={root} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-sm font-medium text-slate-500 hover:bg-white hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--role-primary-border)]"><ArrowLeft className="h-4 w-4" />返回订单</Link>

      <header className="mb-6 mt-4 sm:mb-8 sm:mt-6">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl role-primary-soft role-primary-text"><FileText className="h-5 w-5" /></span><div><h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">选择发单方式</h1><p className="mt-1 text-xs leading-5 text-slate-500 sm:text-sm">先选填写方式，下面可以查看各自适合的需求和准备内容。</p></div></div>
      </header>

      <nav aria-label="发单方式" className="grid grid-cols-2 gap-3 sm:gap-4">
        <Link href={simple} className="group flex min-h-24 items-center gap-2.5 rounded-2xl border border-[var(--role-primary-border)] bg-white px-3 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--role-primary-border)] sm:gap-4 sm:px-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl role-primary-soft role-primary-text sm:h-11 sm:w-11"><Sparkles className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900 sm:text-base">简易发单</span><span className="mt-1 block text-[11px] text-slate-500 sm:text-xs">快速填写重点</span></span>
          <ArrowRight className="h-4 w-4 shrink-0 role-primary-text transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link href={professional} className="group flex min-h-24 items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3 py-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[var(--role-primary-border)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--role-primary-border)] sm:gap-4 sm:px-5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition group-hover:bg-[var(--role-primary-soft)] group-hover:text-[var(--role-primary)] sm:h-11 sm:w-11"><Layers2 className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-slate-900 sm:text-base">专业发单</span><span className="mt-1 block text-[11px] text-slate-500 sm:text-xs">逐组设置规格</span></span>
          <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-[var(--role-primary)]" />
        </Link>
      </nav>

      <section aria-labelledby="mode-help-title" className="mt-7 border-t border-slate-200 pt-5 sm:mt-9 sm:pt-6">
        <h2 id="mode-help-title" className="text-sm font-bold text-slate-900 sm:text-base">发单方式说明</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2 sm:gap-8">
          <article>
            <h3 className="text-xs font-semibold role-primary-text">简易发单 · 需求明确，想快速发布</h3>
            <p className="mt-2 text-xs leading-5 text-slate-600">围绕一个主要交付规格填写订单名称、平台、数量、预算和周期，并补充风格或参考链接。适合内容简单、重点明确的设计需求。</p>
            <p className="mt-2 text-[11px] leading-5 text-slate-400">可填写：设计类型、交付规格、参考风格、需求简述、预算与周期。</p>
          </article>
          <article className="border-t border-slate-200 pt-5 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
            <h3 className="text-xs font-semibold text-slate-800">专业发单 · 多规格或逐图要求较多</h3>
            <p className="mt-2 text-xs leading-5 text-slate-600">按图片组分别设置尺寸和数量，再逐张补充素材、设计要点与参考资料。适合主图、详情页等交付规格较多或说明较细的项目。</p>
            <p className="mt-2 text-[11px] leading-5 text-slate-400">可填写：图片分组、尺寸数量、单图说明、素材与参考链接。</p>
          </article>
        </div>
      </section>

      <aside className="mt-6 flex items-start gap-2.5 border-t border-blue-100 pt-4 text-xs leading-5 text-slate-500 sm:mt-7">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
        <p>两种方式使用相同的审核流、最低预算计算和客服审核流程；提交前请确认需求及交付周期。</p>
      </aside>
    </div>
  </main>;
}
