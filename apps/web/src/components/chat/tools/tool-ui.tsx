'use client';

import type { LucideIcon } from 'lucide-react';
import type { ChatCard } from '@/lib/chat-cards';
import { DEFAULT_FORM_MOBILE_STYLE, type FormField, type FormMobileStyle } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';

export type SendCard = (card: ChatCard) => Promise<boolean | undefined>;

export async function sendQuestionChecklist(title: string, questions: Array<string | { label: string; options?: string[]; kind?: 'image'; schema?: FormField }>, onSend: SendCard, mobileStyle: FormMobileStyle = DEFAULT_FORM_MOBILE_STYLE) {
  if (!questions.length || questions.length > 24) throw new Error('会话清单最多支持 24 项，请减少选择内容');
  const card: Extract<ChatCard, { kind: 'work_card' }> = {
    kind: 'work_card',
    templateId: 'intake_checklist',
    title,
    mobileStyle,
    fields: questions.map((question) => {
      const label = typeof question === 'string' ? question : question.label;
      const options = typeof question === 'string' ? [] : question.options || [];
      const kind = typeof question === 'string' ? undefined : question.kind;
      const schema = typeof question === 'string' ? undefined : question.schema;
      return { label: label.slice(0, 80), value: '请品牌方填写', ...(kind ? { kind } : {}), ...(options.length ? { options: options.slice(0, 20).map((option) => option.slice(0, 100)) } : {}), ...(schema ? { schema } : {}) };
    }),
    attachments: [],
  };
  if (`COZI_CHAT_CARD_V1:${JSON.stringify(card)}`.length > 7800) throw new Error('表单配置过大，无法通过聊天消息发送；请减少问题或使用订单表单');
  return onSend(card);
}

export function ToolButton({ icon: Icon, label, description, onClick }: { icon: LucideIcon; label: string; description: string; onClick: () => void }) {
  return <button type="button" title={description} aria-label={label} onClick={onClick} className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"><Icon className="h-4 w-4" /><span>{label}</span></button>;
}

export const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400';
export const primaryClass = 'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40';

export async function createToolForm(orderId: string, path: 'preset' | 'composed' | 'published', body: unknown): Promise<void> {
  const payload = JSON.stringify(body);
  const storageKey = `chat-tool-form:${orderId}:${path}:${payload}`;
  let commandId = crypto.randomUUID();
  try { commandId = sessionStorage.getItem(storageKey) || commandId; sessionStorage.setItem(storageKey, commandId); } catch { /* Browser storage can be disabled. */ }
  const endpoint = path === 'published' ? '' : `/${path}`;
  const response = await fetchWithAuth(`/collaboration/orders/${encodeURIComponent(orderId)}/forms${endpoint}`, {
    method: 'POST', headers: { 'Idempotency-Key': commandId }, body: payload,
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || '需求表单发送失败');
  try { sessionStorage.removeItem(storageKey); } catch { /* The server result already succeeded. */ }
}
