'use client';

import { Pipette } from 'lucide-react';
import { TemplateCardTool } from './template-card-tool';
import type { SendCard } from './tool-ui';

export function PaletteTool({ onSend }: { onSend: SendCard }) {
  return <TemplateCardTool icon={Pipette} label="色盘" description="选择品牌主色、辅助色和点缀色并发送" templateId="palette" allowedTemplateIds={['palette']} onSend={onSend} />;
}
