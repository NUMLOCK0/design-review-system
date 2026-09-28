'use client';

import { useParams } from 'next/navigation';
import { MessageCategoryList } from '@/components/messages/message-center';
import { MobileSecondaryLayout } from '@/components/mobile/mobile-secondary-layout';

export default function MobileMessageCategoryPage() {
  const params = useParams<{ type: string }>();
  return <MobileSecondaryLayout title="消息" fallbackHref="/mobile/messages">
    <MessageCategoryList type={params.type} mobile />
  </MobileSecondaryLayout>;
}
