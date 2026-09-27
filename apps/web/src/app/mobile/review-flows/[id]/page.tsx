'use client';

import { useParams } from 'next/navigation';
import { MobileReviewFlowEditor } from '@/components/mobile/mobile-review-flows';

export default function EditMobileReviewFlowPage() {
  const { id } = useParams<{ id: string }>();
  return <MobileReviewFlowEditor ruleId={id} />;
}
