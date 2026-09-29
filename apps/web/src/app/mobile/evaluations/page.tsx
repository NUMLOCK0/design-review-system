import { MyEvaluations } from '@/components/order-evaluations';
import { MobileSecondaryLayout } from '@/components/mobile/mobile-secondary-layout';
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) { const { tab } = await searchParams; return <MobileSecondaryLayout title="我的评价"><MyEvaluations mobile initialTab={tab} /></MobileSecondaryLayout>; }
