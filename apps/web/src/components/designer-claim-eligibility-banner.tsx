'use client';

import Link from 'next/link';
import { AlertCircle, ArrowRight, LoaderCircle } from 'lucide-react';
import type { useDesignerClaimEligibility } from '@/hooks/use-designer-claim-eligibility';

type Readiness = ReturnType<typeof useDesignerClaimEligibility>;

export function DesignerClaimEligibilityBanner({ readiness, href, compact = false }: { readiness: Readiness; href: string; compact?: boolean }) {
  const { eligibility, loading, error } = readiness;
  if (!loading && !error && eligibility?.canClaim) return null;
  const reasons = [
    eligibility && !eligibility.profilePublished ? '公开个人主页' : '',
    eligibility && !eligibility.acceptingOrders ? '开启接单' : '',
    eligibility && !eligibility.profileCompleted ? '完善个人资料' : '',
    eligibility && eligibility.approvedPortfolioCount === 0 ? '至少提交一件审核通过的作品' : '',
  ].filter(Boolean);
  const message = loading ? '正在核对个人资料和作品审核状态…' : error ? '暂时无法确认接单资格，请先检查个人资料和作品状态。' : '完成' + reasons.join('、') + '后即可申请接单。';
  return <div role={loading ? 'status' : 'alert'} className={'flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 text-rose-900 ' + (compact ? 'p-3' : 'p-4')}>
    {loading ? <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-rose-600" /> : <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />}
    <div className="min-w-0 flex-1"><p className="text-xs font-bold">{loading ? '接单资格核验中' : '完善资料后再接单'}</p><p className="mt-1 text-[11px] leading-5 text-rose-800">{message}</p></div>
    {!loading && <Link href={href} className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-xl bg-white px-3 text-[11px] font-bold text-rose-700 shadow-sm ring-1 ring-rose-200 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">完善资料与作品<ArrowRight className="h-3.5 w-3.5" /></Link>}
  </div>;
}
