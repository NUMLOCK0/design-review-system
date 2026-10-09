'use client';

import { Layers3 } from 'lucide-react';
import { TemplateCardTool } from './template-card-tool';
import type { SendCard } from './tool-ui';

export function BusinessCardTool({ onSend }: { onSend: SendCard }) {
  return <TemplateCardTool icon={Layers3} label="业务卡片" description="选择 13 类设计业务卡片，编辑后发送" templateId="biz_1" allowedTemplateIds={Array.from({ length: 13 }, (_, index) => `biz_${index + 1}`)} onSend={onSend} />;
}
