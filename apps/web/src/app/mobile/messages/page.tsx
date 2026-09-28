'use client';

import { MessageCategoryOverview } from '@/components/messages/message-center';
import { MobileSecondaryLayout } from '@/components/mobile/mobile-secondary-layout';
import { useCurrentUser } from '@/hooks/use-current-user';

export default function MobileMessagesPage() {
  const user = useCurrentUser();
  return <MobileSecondaryLayout title="消息" fallbackHref="/mobile" bottomNavigation={user?.role === 'advertiser'} hideHeader>
    <MessageCategoryOverview mobile />
  </MobileSecondaryLayout>;
}
