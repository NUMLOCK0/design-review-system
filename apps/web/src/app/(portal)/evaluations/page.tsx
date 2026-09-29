import { MyEvaluations } from '@/components/order-evaluations';
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) { const { tab } = await searchParams; return <MyEvaluations initialTab={tab} />; }
