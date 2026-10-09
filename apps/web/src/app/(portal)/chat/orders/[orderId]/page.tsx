'use client';

import { useParams } from 'next/navigation';
import { OrderChat } from '@/components/chat/order-chat';

export default function OrderChatPage() {
  const { orderId } = useParams<{ orderId: string }>();
  return <OrderChat key={orderId} orderId={orderId} />;
}
