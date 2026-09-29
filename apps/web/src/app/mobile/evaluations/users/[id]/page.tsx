'use client';
import { useParams } from 'next/navigation';
import { PublicEvaluations } from '@/components/order-evaluations';
import { MobileSecondaryLayout } from '@/components/mobile/mobile-secondary-layout';
export default function Page() { const { id } = useParams<{ id: string }>(); return <MobileSecondaryLayout title="合作评价" fallbackHref="/mobile/orders"><PublicEvaluations userId={id} /></MobileSecondaryLayout>; }
