'use client';

import { ChoiceComboTool } from './choice-combo-tool';
import { AiStyleTool } from './ai-style-tool';
import { StandardOrderTool } from './standard-order-tool';
import { BusinessCardTool } from './business-card-tool';
import { ActionCardTool } from './action-card-tool';
import { AnnotationTool } from './annotation-tool';
import { PaletteTool } from './palette-tool';
import { AbTestTool } from './ab-test-tool';
import { QualityTool } from './quality-tool';
import { EscrowTool } from './escrow-tool';
import { SizeGuideTool } from './size-guide-tool';
import { SourceGuideTool } from './source-guide-tool';
import type { SendCard } from './tool-ui';

export function ServiceChatToolbar({ orderId, requirements, onSend, onFormSent }: { orderId: string; requirements: string; onSend: SendCard; onFormSent: () => void }) {
  return <div className="mb-2 flex items-center gap-1 overflow-x-auto border-b border-slate-100 pb-2" aria-label="客服协作工具栏">
    <ChoiceComboTool orderId={orderId} onSent={onFormSent} />
    <AiStyleTool requirements={requirements} onSend={onSend} />
    <StandardOrderTool orderId={orderId} onSent={onFormSent} />
    <BusinessCardTool onSend={onSend} />
    <ActionCardTool onSend={onSend} />
    <span className="mx-1 h-5 shrink-0 border-l border-slate-200" />
    <AnnotationTool onSend={onSend} />
    <PaletteTool onSend={onSend} />
    <AbTestTool onSend={onSend} />
    <span className="mx-1 h-5 shrink-0 border-l border-slate-200" />
    <QualityTool onSend={onSend} />
    <EscrowTool orderId={orderId} onSend={onSend} />
    <span className="mx-1 h-5 shrink-0 border-l border-slate-200" />
    <SizeGuideTool onSend={onSend} />
    <SourceGuideTool onSend={onSend} />
  </div>;
}
