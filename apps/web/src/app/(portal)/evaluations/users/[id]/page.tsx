'use client';
import { useParams } from 'next/navigation';
import { PublicEvaluations } from '@/components/order-evaluations';
export default function Page() { const { id } = useParams<{ id: string }>(); return <PublicEvaluations userId={id} />; }
