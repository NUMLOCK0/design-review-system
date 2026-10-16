'use client';

import { BusinessCardBoxTool } from '@/components/chat/business-card-box';
import type { SendCard } from './tool-ui';

export function BusinessCardTool({ onSend }: { onSend: SendCard }) {
  return <BusinessCardBoxTool onSend={onSend} />;
}
