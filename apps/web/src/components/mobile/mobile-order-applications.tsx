'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { DesignOrder } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { BrandOrderApplications } from '@/components/order-applications';
import { MobileSecondaryLayout } from '@/components/mobile/mobile-secondary-layout';

export function MobileOrderApplications() {
  const { id, applicationId } = useParams<{ id: string; applicationId?: string }>();
  const [order, setOrder] = useState<DesignOrder | null>(null);
  const [error, setError] = useState('');
  const load = async () => {
    try {
      const response = await fetchWithAuth(`/design-orders/${id}`);
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '订单无法访问');
      setOrder(result.data);
    } catch (reason: any) { setError(reason.message); }
  };
  useEffect(() => { void load(); }, [id]);
  return <MobileSecondaryLayout title={applicationId ? '接单申请详情' : '接单申请'} fallbackHref={applicationId ? `/mobile/orders/${id}/applications` : `/mobile/orders/${id}`}>
    {error ? <p role="alert" className="text-sm text-rose-600">{error}</p> : order ? <BrandOrderApplications order={order} mobile applicationId={applicationId} onUpdated={() => void load()} /> : <p className="py-10 text-center text-sm text-slate-500">正在加载订单…</p>}
  </MobileSecondaryLayout>;
}
