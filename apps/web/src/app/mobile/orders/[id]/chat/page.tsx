'use client';

import { useParams } from 'next/navigation';
import { OrderChat } from '@/components/chat/order-chat';

export default function MobileOrderChatPage() {
  const { id } = useParams<{ id: string }>();
  return <OrderChat key={id} orderId={id} mobile />;
}
