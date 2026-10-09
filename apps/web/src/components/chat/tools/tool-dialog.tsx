'use client';

import type { ReactNode } from 'react';

/** Reusable modal shell. Replace its center content with any React children. */
export function ToolDialog({ title, description, children, footer, onClose }: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
}) {
  return <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/45 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
    <div className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[86dvh] sm:rounded-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div><h2 className="text-base font-bold text-slate-900">{title}</h2>{description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}</div>
        <button type="button" onClick={onClose} aria-label="关闭" className="rounded-lg px-2 py-1 text-xl text-slate-400 hover:bg-slate-100">×</button>
      </header>
      <div className="min-h-0 overflow-y-auto p-5">{children}</div>
      {footer && <footer className="border-t border-slate-100 px-5 py-3">{footer}</footer>}
    </div>
  </div>;
}
