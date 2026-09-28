'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronDown, FileText, Sparkles } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function OrderModeDropdown({ children }: { children: ReactNode }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={8} className="w-80 rounded-2xl border-slate-200 bg-white p-2 shadow-xl">
      <DropdownMenuItem asChild className="cursor-pointer rounded-xl p-0 focus:bg-rose-50">
        <Link href="/advertiser/orders/new/simple" className="flex items-start gap-3 whitespace-normal px-3 py-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><Sparkles className="h-4 w-4" /></span>
          <span className="min-w-0"><span className="block text-sm font-semibold text-slate-800">简易发单</span><span className="mt-1 block text-xs leading-5 text-slate-500">填写设计风格、参考链接和基本交付要求，快速发布需求。</span></span>
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className="cursor-pointer rounded-xl p-0 focus:bg-slate-50">
        <Link href="/advertiser/orders/new/professional" className="flex items-start gap-3 whitespace-normal px-3 py-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><FileText className="h-4 w-4" /></span>
          <span className="min-w-0"><span className="block text-sm font-semibold text-slate-800">专业发单</span><span className="mt-1 block text-xs leading-5 text-slate-500">逐组配置图片尺寸、数量、素材和每张图的设计说明。</span></span>
        </Link>
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

export function OrderModeDropdownButton({ label = '发布订单', className = '' }: { label?: string; className?: string }) {
  return <OrderModeDropdown><button type="button" className={className}>{label}<ChevronDown className="ml-2 inline h-4 w-4" /></button></OrderModeDropdown>;
}
