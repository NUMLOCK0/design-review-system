'use client';

import type { LucideIcon } from 'lucide-react';
import type { ChatCard } from '@/lib/chat-cards';
import { fetchWithAuth } from '@/lib/auth';

export type SendCard = (card: ChatCard) => Promise<boolean | undefined>;

export function ToolButton({ icon: Icon, label, description, onClick }: { icon: LucideIcon; label: string; description: string; onClick: () => void }) {
  return <button type="button" title={description} aria-label={label} onClick={onClick} className="flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"><Icon className="h-4 w-4" /><span>{label}</span></button>;
}

export const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-400';
export const primaryClass = 'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40';

export async function createToolForm(orderId: string, path: 'preset' | 'composed', body: unknown): Promise<void> {
  const payload = JSON.stringify(body);
  const storageKey = `chat-tool-form:${orderId}:${path}:${payload}`;
  let commandId = crypto.randomUUID();
  try { commandId = sessionStorage.getItem(storageKey) || commandId; sessionStorage.setItem(storageKey, commandId); } catch { /* Browser storage can be disabled. */ }
  const response = await fetchWithAuth(`/collaboration/orders/${encodeURIComponent(orderId)}/forms/${path}`, {
    method: 'POST', headers: { 'Idempotency-Key': commandId }, body: payload,
  });
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || '需求表单发送失败');
  try { sessionStorage.removeItem(storageKey); } catch { /* The server result already succeeded. */ }
}
