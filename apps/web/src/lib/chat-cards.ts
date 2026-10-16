import { parseWorkflowMessage, type FormField, type FormMobileStyle } from '@design-review/shared';
const PREFIX = 'COZI_CHAT_CARD_V1:';

export type ChatCard =
  | { kind: 'image'; caption: string; attachments: Array<{ name: string; url: string }> }
  | { kind: 'video'; caption: string; attachment: { name: string; url: string } }
  | { kind: 'proposal'; title: string; optionA: string; optionB: string; detailA: string; detailB: string }
  | { kind: 'decision'; proposalMessageId: string; option: 'A' | 'B'; note: string }
  | { kind: 'requirement_review'; decision: 'confirmed' | 'needs_details'; note: string }
  | { kind: 'work_card'; templateId: string; title: string; mobileStyle?: FormMobileStyle; fields: Array<{ label: string; value: string; options?: string[]; kind?: 'image'; schema?: FormField }>; attachments: Array<{ name: string; url: string }>; revisionOf?: string }
  | { kind: 'form_answers'; formMessageId: string; answers: Array<{ fieldIndex: number; value: string }> }
  | { kind: 'snapshot_ack'; snapshotMessageId: string; decision: 'confirmed' | 'needs_changes'; note: string }
  | { kind: 'choice'; source: 'combo' | 'style'; title: string; prompt: string; options: Array<{ id: string; label: string; detail: string }>; attachments?: Array<{ name: string; url: string }> }
  | { kind: 'choice_answer'; choiceMessageId: string; optionId: string; optionLabel: string; note: string }
  | { kind: 'annotation'; annotationId: string; taskId: string; taskNo: string; imageId: string; imageVersion: number; revision: number; productName: string; imageIndex: number; imageUrl: string; annotations: Array<{ id: string; type: 'pin'; x: number; y: number; color: string; comment: string; creatorId: string; creatorName: string; createdAt: string }> }
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
    if (card.kind === 'image' && typeof card.caption === 'string' && Array.isArray(card.attachments) && card.attachments.length > 0 && card.attachments.length <= 9 && card.attachments.every((item: any) => typeof item?.name === 'string' && typeof item?.url === 'string' && /^\/api\/upload\/previews\/asset_[a-f0-9]{32}$/.test(item.url))) return card as ChatCard;
    if (card.kind === 'video' && typeof card.caption === 'string' && typeof (card.attachment as any)?.name === 'string' && /^\/api\/upload\/assets\/asset_[a-f0-9]{32}$/.test(String((card.attachment as any)?.url || ''))) return card as ChatCard;
    if (card.kind === 'proposal' && ['title', 'optionA', 'optionB', 'detailA', 'detailB'].every((key) => typeof card[key] === 'string')) {
      return card as ChatCard;
    }
    if (card.kind === 'decision' && typeof card.proposalMessageId === 'string' && (card.option === 'A' || card.option === 'B') && typeof card.note === 'string') {
      return card as ChatCard;
    }
    if (card.kind === 'requirement_review' && (card.decision === 'confirmed' || card.decision === 'needs_details') && typeof card.note === 'string') {
      return card as ChatCard;
    }
    if (card.kind === 'work_card' && typeof card.templateId === 'string' && typeof card.title === 'string' && (card.mobileStyle === undefined || ['comfortable', 'compact', 'large'].includes(String(card.mobileStyle))) && Array.isArray(card.fields) && card.fields.every((field: any) => typeof field?.label === 'string' && typeof field?.value === 'string' && (field.options === undefined || Array.isArray(field.options) && field.options.every((option: unknown) => typeof option === 'string'))) && Array.isArray(card.attachments) && card.attachments.every((item: any) => typeof item?.name === 'string' && typeof item?.url === 'string')) return card as ChatCard;
    if (card.kind === 'form_answers' && typeof card.formMessageId === 'string' && Array.isArray(card.answers) && card.answers.every((answer: any) => Number.isInteger(answer?.fieldIndex) && answer.fieldIndex >= 0 && typeof answer?.value === 'string')) return card as ChatCard;
    if (card.kind === 'snapshot_ack' && typeof card.snapshotMessageId === 'string' && (card.decision === 'confirmed' || card.decision === 'needs_changes') && typeof card.note === 'string') return card as ChatCard;
    if (card.kind === 'choice' && (card.source === 'combo' || card.source === 'style') && typeof card.title === 'string' && typeof card.prompt === 'string' && Array.isArray(card.options) && card.options.every((item: any) => typeof item?.id === 'string' && typeof item?.label === 'string' && typeof item?.detail === 'string') && (card.attachments === undefined || Array.isArray(card.attachments) && card.attachments.every((item: any) => typeof item?.name === 'string' && typeof item?.url === 'string'))) return card as ChatCard;
    if (card.kind === 'choice_answer' && typeof card.choiceMessageId === 'string' && typeof card.optionId === 'string' && typeof card.optionLabel === 'string' && typeof card.note === 'string') return card as ChatCard;
    if (card.kind === 'annotation' && typeof card.annotationId === 'string' && typeof card.taskId === 'string' && typeof card.imageId === 'string' && typeof card.imageVersion === 'number' && typeof card.revision === 'number' && typeof card.productName === 'string' && typeof card.imageIndex === 'number' && /^\/api\/upload\/(?:assets|previews)\/asset_[a-f0-9]{32}$/.test(String(card.imageUrl || '')) && Array.isArray(card.annotations) && card.annotations.length > 0 && card.annotations.length <= 12 && card.annotations.every((item: any) => typeof item?.id === 'string' && item.type === 'pin' && Number.isFinite(item.x) && item.x >= 0 && item.x <= 100 && Number.isFinite(item.y) && item.y >= 0 && item.y <= 100 && typeof item.comment === 'string' && typeof item.color === 'string')) return card as ChatCard;
    if (card.kind === 'recall' && typeof card.targetMessageId === 'string') return card as ChatCard;
  } catch { /* Malformed cards remain readable as raw messages. */ }
  return null;
}

export function chatPreview(body: string) {
  const workflow = parseWorkflowMessage(body);
  if (workflow) return workflow.title;
  if (/^\/api\/upload\/previews\/asset_[a-f0-9]{32}$/.test(body.trim())) return '图片';
  if (/^\/api\/upload\/assets\/asset_[a-f0-9]{32}$/.test(body.trim())) return '视频';
  const card = parseChatCard(body);
  if (!card) return body;
  if (card.kind === 'image') return card.caption.trim() || `图片 · ${card.attachments.length} 张`;
  if (card.kind === 'video') return card.caption.trim() || '视频';
  if (card.kind === 'proposal') return `A/B 方案：${card.title}`;
  if (card.kind === 'decision') return `品牌方选择方案 ${card.option}`;
  if (card.kind === 'work_card') return /^biz_\d+$/.test(card.templateId) ? `业务需求卡：${card.title}` : `协作卡片：${card.title}`;
  if (card.kind === 'form_answers') return '已提交品牌需求表单';
  if (card.kind === 'snapshot_ack') return card.decision === 'confirmed' ? '已确认需求快照' : '需求快照需要修改';
  if (card.kind === 'choice') return `待选择：${card.title}`;
  if (card.kind === 'choice_answer') return `已选择：${card.optionLabel}`;
  if (card.kind === 'annotation') return `图片批注：${card.productName} · ${card.annotations.length} 处`;
  if (card.kind === 'recall') return '撤回了一条消息';
  return card.decision === 'confirmed' ? '设计师已确认需求范围' : '设计师请求补充需求';
}
