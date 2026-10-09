import { parseWorkflowMessage } from '@design-review/shared';
const PREFIX = 'COZI_CHAT_CARD_V1:';

export type ChatCard =
  | { kind: 'proposal'; title: string; optionA: string; optionB: string; detailA: string; detailB: string }
  | { kind: 'decision'; proposalMessageId: string; option: 'A' | 'B'; note: string }
  | { kind: 'requirement_review'; decision: 'confirmed' | 'needs_details'; note: string }
  | { kind: 'work_card'; templateId: string; title: string; fields: Array<{ label: string; value: string }>; attachments: Array<{ name: string; url: string }>; revisionOf?: string }
  | { kind: 'snapshot_ack'; snapshotMessageId: string; decision: 'confirmed' | 'needs_changes'; note: string }
  | { kind: 'choice'; source: 'combo' | 'style'; title: string; prompt: string; options: Array<{ id: string; label: string; detail: string }> }
  | { kind: 'choice_answer'; choiceMessageId: string; optionId: string; optionLabel: string; note: string }
  | { kind: 'recall'; targetMessageId: string };

export function encodeChatCard(card: ChatCard) {
  return PREFIX + JSON.stringify(card);
}

export function parseChatCard(body: string): ChatCard | null {
  if (!body.startsWith(PREFIX)) return null;
  try {
    const value: unknown = JSON.parse(body.slice(PREFIX.length));
    if (!value || typeof value !== 'object') return null;
    const card = value as Record<string, unknown>;
    if (card.kind === 'proposal' && ['title', 'optionA', 'optionB', 'detailA', 'detailB'].every((key) => typeof card[key] === 'string')) {
      return card as ChatCard;
    }
    if (card.kind === 'decision' && typeof card.proposalMessageId === 'string' && (card.option === 'A' || card.option === 'B') && typeof card.note === 'string') {
      return card as ChatCard;
    }
    if (card.kind === 'requirement_review' && (card.decision === 'confirmed' || card.decision === 'needs_details') && typeof card.note === 'string') {
      return card as ChatCard;
    }
    if (card.kind === 'work_card' && typeof card.templateId === 'string' && typeof card.title === 'string' && Array.isArray(card.fields) && card.fields.every((field: any) => typeof field?.label === 'string' && typeof field?.value === 'string') && Array.isArray(card.attachments) && card.attachments.every((item: any) => typeof item?.name === 'string' && typeof item?.url === 'string')) return card as ChatCard;
    if (card.kind === 'snapshot_ack' && typeof card.snapshotMessageId === 'string' && (card.decision === 'confirmed' || card.decision === 'needs_changes') && typeof card.note === 'string') return card as ChatCard;
    if (card.kind === 'choice' && (card.source === 'combo' || card.source === 'style') && typeof card.title === 'string' && typeof card.prompt === 'string' && Array.isArray(card.options) && card.options.every((item: any) => typeof item?.id === 'string' && typeof item?.label === 'string' && typeof item?.detail === 'string')) return card as ChatCard;
    if (card.kind === 'choice_answer' && typeof card.choiceMessageId === 'string' && typeof card.optionId === 'string' && typeof card.optionLabel === 'string' && typeof card.note === 'string') return card as ChatCard;
    if (card.kind === 'recall' && typeof card.targetMessageId === 'string') return card as ChatCard;
  } catch { /* Malformed cards remain readable as raw messages. */ }
  return null;
}

export function chatPreview(body: string) {
  const workflow = parseWorkflowMessage(body);
  if (workflow) return workflow.title;
  const card = parseChatCard(body);
  if (!card) return body;
  if (card.kind === 'proposal') return `A/B 方案：${card.title}`;
  if (card.kind === 'decision') return `品牌方选择方案 ${card.option}`;
  if (card.kind === 'work_card') return `协作卡片：${card.title}`;
  if (card.kind === 'snapshot_ack') return card.decision === 'confirmed' ? '已确认需求快照' : '需求快照需要修改';
  if (card.kind === 'choice') return `待选择：${card.title}`;
  if (card.kind === 'choice_answer') return `已选择：${card.optionLabel}`;
  if (card.kind === 'recall') return '撤回了一条消息';
  return card.decision === 'confirmed' ? '设计师已确认需求范围' : '设计师请求补充需求';
}
