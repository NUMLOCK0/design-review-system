import { Suspense } from 'react';
import { MobileCreateOrder } from '@/components/mobile/mobile-create-order';

export default function MobileCreateOrderPage() {
  return <Suspense fallback={<div className="py-16 text-center text-sm text-slate-400">正在准备订单表单…</div>}><MobileCreateOrder /></Suspense>;
}
