'use client';
import { useParams } from 'next/navigation';
import { OrderEvaluationPanel } from '@/components/order-evaluations';
export default function Page() { const { id } = useParams<{ id: string }>(); return <OrderEvaluationPanel orderId={id} />; }
