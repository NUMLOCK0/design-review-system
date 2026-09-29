import { MyOrderApplications } from '@/components/order-applications';
import { MobileSecondaryLayout } from '@/components/mobile/mobile-secondary-layout';

export default function ApplicationsPage() {
  return <MobileSecondaryLayout title="我的接单申请" fallbackHref="/mobile/orders"><MyOrderApplications mobile /></MobileSecondaryLayout>;
}
