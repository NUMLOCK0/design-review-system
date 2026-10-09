'use client';

import { FileCheck2 } from 'lucide-react';
import { TemplateCardTool } from './template-card-tool';
import type { SendCard } from './tool-ui';

export function SourceGuideTool({ onSend }: { onSend: SendCard }) {
  return <TemplateCardTool icon={FileCheck2} label="源文件规范" description="约定分层、命名、字体与打包清单" templateId="source_guide" allowedTemplateIds={['source_guide']} onSend={onSend} />;
}
