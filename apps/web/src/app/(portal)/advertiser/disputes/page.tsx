import { RolePlaceholder } from '@/components/role-placeholder';

export default function AdvertiserDisputesPage() {
  return (
    <RolePlaceholder
      roles={['advertiser']}
      title="订单纠纷"
      nextSteps={[
        { label: '返回我的订单', href: '/advertiser/orders' },
        { label: '回到品牌方工作台', href: '/advertiser/dashboard' },
      ]}
    />
  );
}
