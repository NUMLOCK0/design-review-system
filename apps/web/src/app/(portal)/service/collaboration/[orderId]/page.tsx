'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { OrderChat } from '@/components/chat/order-chat';

export default function ServiceCollaborationDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const searchParams = useSearchParams();
  const intakeMode = searchParams.get('type') === 'intake';
  return <OrderChat key={`${intakeMode ? 'intake' : 'order'}:${orderId}`} orderId={orderId} serviceMode intakeMode={intakeMode} />;
}
