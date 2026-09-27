'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { goBackOrReplace } from '@/components/mobile/mobile-navigation';

export function MobileSecondaryLayout({ title, fallbackHref = '/mobile/profile', action, children }: { title: string; fallbackHref?: string; action?: ReactNode; children: ReactNode }) {
  const router = useRouter();

  return <div className="min-h-dvh bg-[#f4f6f8]">
    <header className="sticky top-0 z-30 border-b border-slate-100 bg-white/95 px-4 pt-[max(env(safe-area-inset-top),8px)] backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-xl items-center gap-3">
        <button type="button" aria-label="返回" onClick={() => goBackOrReplace(router, fallbackHref)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 text-slate-600"><ArrowLeft className="h-5 w-5" /></button>
        <h1 className="min-w-0 flex-1 truncate text-sm font-extrabold">{title}</h1>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
    <div className="mx-auto w-full max-w-xl px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-4">{children}</div>
  </div>;
}
