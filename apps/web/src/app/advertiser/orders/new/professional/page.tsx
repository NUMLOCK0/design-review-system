'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreateOrderDialog } from '@/components/create-order-dialog';
import { getCurrentUser } from '@/lib/auth';
import { RoleTheme } from '@/components/layout/role-theme';

export default function ProfessionalAdvertiserOrderPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'advertiser') {
      router.replace(`/login/advertiser?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    setReady(true);
  }, [router]);
  if (!ready) return <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-400">正在加载订单表单…</main>;
  return <><RoleTheme /><CreateOrderDialog open fullscreen onOpenChange={(open) => { if (!open) router.push('/advertiser/orders'); }} onCreated={() => router.push('/advertiser/orders')} onUpdated={() => router.push('/advertiser/orders')} /></>;
}
