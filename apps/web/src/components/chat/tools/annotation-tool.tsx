'use client';

import { Crop } from 'lucide-react';
import { TemplateCardTool } from './template-card-tool';
import type { SendCard } from './tool-ui';

export function AnnotationTool({ onSend }: { onSend: SendCard }) {
  return <TemplateCardTool icon={Crop} label="批注" description="上传设计稿，圈选修改位置并发送批注卡" templateId="annotation" allowedTemplateIds={['annotation']} onSend={onSend} />;
}
