'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { MobileCreateOrder } from '@/components/mobile/mobile-create-order';
import { OrderModeChooser } from '@/components/order-mode-chooser';

function MobileOrderEntry() {
  const search = useSearchParams();
  return search.get('edit') ? <MobileCreateOrder /> : <OrderModeChooser mobile />;
}

export default function MobileCreateOrderPage() {
  return <Suspense fallback={<div className="py-16 text-center text-sm text-slate-400">正在准备订单…</div>}><MobileOrderEntry /></Suspense>;
}
