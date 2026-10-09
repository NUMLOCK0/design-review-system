'use client';

import { MessagesSquare } from 'lucide-react';
import { TemplateCardTool } from './template-card-tool';
import type { SendCard } from './tool-ui';

export function ActionCardTool({ onSend }: { onSend: SendCard }) {
  return <TemplateCardTool icon={MessagesSquare} label="沟通卡箱" description="改稿、A/B 评审、加急、合规、增项与验收" templateId="revision" allowedTemplateIds={['revision', 'ab_review', 'urgent', 'compliance', 'addon', 'delivery']} onSend={onSend} />;
}
