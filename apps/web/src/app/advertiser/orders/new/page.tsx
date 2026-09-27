'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DesignOrder } from '@design-review/shared';
import { CreateOrderDialog } from '@/components/create-order-dialog';
import { fetchWithAuth, getCurrentUser } from '@/lib/auth';
import { toast } from 'sonner';
import { RoleTheme } from '@/components/layout/role-theme';

export default function NewAdvertiserOrderPage() {
  const router = useRouter();
  const [editingOrder, setEditingOrder] = useState<DesignOrder | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser || currentUser.role !== 'advertiser') {
      router.replace(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return;
    }
    const editId = new URLSearchParams(window.location.search).get('edit');
    if (!editId) {
      setReady(true);
      return;
    }
    fetchWithAuth('/design-orders/mine?status=all&page=1&pageSize=100')
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.message || '加载订单失败');
        const order = (result.data || []).find((item: DesignOrder) => item.id === editId);
        if (!order) throw new Error('订单不存在或无权编辑');
        setEditingOrder(order);
        setReady(true);
      })
      .catch((error: any) => {
        toast.error(error.message || '加载订单失败');
        router.replace('/advertiser/orders');
      });
  }, [router]);

  if (!ready) return <main className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-400">正在加载订单表单…</main>;

  return <><RoleTheme /><CreateOrderDialog
    open
    fullscreen
    editingOrder={editingOrder}
    onOpenChange={(open) => { if (!open) router.push('/advertiser/orders'); }}
    onCreated={() => { router.push('/advertiser/orders'); }}
    onUpdated={() => { router.push('/advertiser/orders'); }}
  /></>;
}
