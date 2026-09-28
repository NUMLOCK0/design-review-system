'use client';

import { useParams } from 'next/navigation';
import { MessageDetail } from '@/components/messages/message-center';
import { MobileSecondaryLayout } from '@/components/mobile/mobile-secondary-layout';
import { MESSAGE_CATEGORIES } from '@/lib/messages';

export default function MobileMessageDetailPage() {
  const params = useParams<{ id: string; type: string }>();
  const category = MESSAGE_CATEGORIES.find((item) => item.type === params.type);
  return <MobileSecondaryLayout title="消息详情" fallbackHref={category ? `/mobile/messages/category/${category.type}` : '/mobile/messages'}>
    <MessageDetail id={params.id} mobile />
  </MobileSecondaryLayout>;
}
