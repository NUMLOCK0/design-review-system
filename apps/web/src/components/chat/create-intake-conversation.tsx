'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X } from 'lucide-react';
import { fetchWithAuth, getCurrentUser } from '@/lib/auth';
import { setSelectedServiceIntake } from '@/lib/service-chat-selection';

export function CreateIntakeConversation({ className = '' }: { className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function close() {
    if (saving) return;
    setOpen(false);
    setTitle('');
    setError('');
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = title.trim();
    if (saving || name.length < 2) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetchWithAuth('/intake-sessions', { method: 'POST', body: JSON.stringify({ title: name }) });
      const result = await response.json() as { success: boolean; message?: string; data?: { id: string } };
      if (!response.ok || !result.success || !result.data?.id) throw new Error(result.message || '创建会话失败');
      const userId = getCurrentUser()?.id;
      if (userId) setSelectedServiceIntake(userId, result.data.id);
      setOpen(false);
      router.push(`/service/collaboration/${encodeURIComponent(result.data.id)}?type=intake`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '创建会话失败');
    } finally { setSaving(false); }
  }

  return <>
    <button type="button" aria-label="创建邀请会话" title="创建邀请会话" onClick={() => setOpen(true)} className={`inline-flex h-8 w-8 items-center justify-center rounded-lg role-primary-soft role-primary-text hover:opacity-80 ${className}`}><Plus className="h-4 w-4" /></button>
    {open && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="create-intake-title" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onKeyDown={(event) => { if (event.key === 'Escape') close(); }}>
        <div className="flex items-center justify-between gap-3"><h2 id="create-intake-title" className="text-lg font-bold text-slate-900">创建邀请会话</h2><button type="button" aria-label="关闭" onClick={close} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
        <form onSubmit={(event) => void create(event)}><label htmlFor="intake-conversation-name" className="mt-5 block text-sm font-medium text-slate-700">会话名称</label><input id="intake-conversation-name" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="例如：秋季新品主图设计" className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:role-primary-border" />
          {error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}
          <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={close} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600">取消</button><button type="submit" disabled={saving || title.trim().length < 2} className="rounded-lg role-primary-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{saving ? '创建中…' : '创建会话'}</button></div>
        </form>
      </div>
    </div>}
  </>;
}
