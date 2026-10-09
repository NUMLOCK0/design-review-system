'use client';

import { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ServiceCardComposer } from '@/components/chat/service-card-composer';
import { SERVICE_WORK_TEMPLATES } from '@/lib/service-collaboration-templates';
import { ToolButton, type SendCard } from './tool-ui';

export function TemplateCardTool({ icon, label, description, templateId, allowedTemplateIds, onSend }: { icon: LucideIcon; label: string; description: string; templateId: string; allowedTemplateIds: string[]; onSend: SendCard }) {
  const [open, setOpen] = useState(false);
  const template = SERVICE_WORK_TEMPLATES.find(item => item.id === templateId);
  if (!template) return null;
  const initial = { kind: 'work_card' as const, templateId, title: template.title, fields: template.fields.map(field => ({ ...field })), attachments: [] };
  return <><ToolButton icon={icon} label={label} description={description} onClick={() => setOpen(true)} />{open && <ServiceCardComposer initial={initial} allowedTemplateIds={allowedTemplateIds} onClose={() => setOpen(false)} onSend={onSend} />}</>;
}
