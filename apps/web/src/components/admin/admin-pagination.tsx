'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AdminPagination({ page, pageSize, total, onPageChange }: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-xs text-slate-500"><span>共 {total} 条 · 第 {page} / {pageCount} 页</span><div className="flex gap-2"><Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="h-8 rounded-lg text-xs"><ChevronLeft className="mr-1 h-3.5 w-3.5" />上一页</Button><Button type="button" variant="outline" size="sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} className="h-8 rounded-lg text-xs">下一页<ChevronRight className="ml-1 h-3.5 w-3.5" /></Button></div></div>;
}
