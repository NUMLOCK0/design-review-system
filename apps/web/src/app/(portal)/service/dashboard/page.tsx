import { RolePlaceholder } from '@/components/role-placeholder';

export default function ServiceDashboardPage() {
  return (
    <RolePlaceholder
      roles={['customer_service']}
      title="客服工作台"
      nextSteps={[
        { label: '订单发布审核', href: '/service/order-audits' },
        { label: '纠纷处理中心', href: '/service/disputes' },
      ]}
    />
  );
}
