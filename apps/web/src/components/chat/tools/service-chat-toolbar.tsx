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
import { ChatEcommerceAgent } from './chat-ecommerce-agent';
import type { SendCard } from './tool-ui';

export function ServiceChatToolbar({ orderId, conversationTitle, platform, requirements, messages, onSend, onFormSent, intakeMode = false, currentUserId, brandUserIds = [] }: { orderId: string; conversationTitle?: string; platform?: string | null; requirements: string; messages: Array<{ id: string; senderId: string; senderName: string; body: string; createdAt?: string }>; onSend: SendCard; onFormSent: () => void; intakeMode?: boolean; currentUserId?: string; brandUserIds?: string[] }) {
  return <div className="mb-2 flex items-center gap-1 overflow-x-auto border-b border-slate-100 pb-2" role="toolbar" aria-label="客服协作工具栏">
    <ChoiceComboTool orderId={orderId} onSent={onFormSent} intakeMode={intakeMode} onSend={onSend} />
    <AiStyleTool conversationId={orderId} intakeMode={intakeMode} requirements={requirements} messages={messages} onSend={onSend} />
    <ChatEcommerceAgent conversationId={orderId} conversationTitle={conversationTitle || '当前会话'} platform={platform} intakeMode={intakeMode} messages={messages} brandUserIds={brandUserIds} onSend={onSend} />
    <StandardOrderTool orderId={orderId} onSent={onFormSent} intakeMode={intakeMode} onSend={onSend} />
    <BusinessCardTool onSend={onSend} />
    <ActionCardTool onSend={onSend} />
    <span className="mx-1 h-5 shrink-0 border-l border-slate-200" />
    <AnnotationTool onSend={onSend} />
    <PaletteTool onSend={onSend} />
    <AbTestTool onSend={onSend} />
    <span className="mx-1 h-5 shrink-0 border-l border-slate-200" />
    <QualityTool onSend={onSend} />
    <EscrowTool orderId={orderId} onSend={onSend} intakeMode={intakeMode} />
    <span className="mx-1 h-5 shrink-0 border-l border-slate-200" />
    <SizeGuideTool onSend={onSend} />
    <SourceGuideTool onSend={onSend} />
  </div>;
}
