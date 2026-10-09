'use client';

import { Ruler } from 'lucide-react';
import { TemplateCardTool } from './template-card-tool';
import type { SendCard } from './tool-ui';

export function SizeGuideTool({ onSend }: { onSend: SendCard }) {
  return <TemplateCardTool icon={Ruler} label="尺寸速查" description="选择平台尺寸规范，核对后发送给客户" templateId="size_guide" allowedTemplateIds={['size_guide']} onSend={onSend} />;
}
