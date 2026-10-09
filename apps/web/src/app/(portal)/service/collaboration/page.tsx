'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithAuth } from '@/lib/auth';
import { clearSelectedServiceChat, getSelectedServiceChat, getSelectedServiceIntake } from '@/lib/service-chat-selection';
import { ServiceConversationSidebar } from '@/components/chat/service-conversation-sidebar';
import { CreateIntakeConversation } from '@/components/chat/create-intake-conversation';
import { Menu } from 'lucide-react';

type Conversation = { orderId: string };
type ApiResult<T> = { success: boolean; message?: string; data?: T };

export default function ServiceCollaborationPage() {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'empty' | 'error'>('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [mobileListOpen, setMobileListOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const openConversation = async () => {
      const identityResponse = await fetchWithAuth('/auth/me');
      const identity = await identityResponse.json() as ApiResult<{ id: string }>;
      if (!identityResponse.ok || !identity.success || !identity.data?.id) throw new Error(identity.message || '身份确认失败');
      if (!active) return;

      const userId = identity.data.id;
      const selectedIntakeId = getSelectedServiceIntake(userId);
      if (selectedIntakeId) {
        const selectedResponse = await fetchWithAuth(`/intake-sessions/${encodeURIComponent(selectedIntakeId)}`);
        if (selectedResponse.ok) {
          const selected = await selectedResponse.json() as ApiResult<{ id: string }>;
          if (selected.success && selected.data?.id === selectedIntakeId) {
            if (active) router.replace(`/service/collaboration/${encodeURIComponent(selectedIntakeId)}?type=intake`);
            return;
          }
        }
        if (selectedResponse.status !== 403 && selectedResponse.status !== 404 && selectedResponse.status !== 200) throw new Error('恢复上次会话失败，请重试');
        clearSelectedServiceChat(userId);
      }
      const selectedOrderId = getSelectedServiceChat(userId);
      if (selectedOrderId) {
        const selectedResponse = await fetchWithAuth(`/chat/orders/${encodeURIComponent(selectedOrderId)}`);
        if (selectedResponse.ok) {
          const selected = await selectedResponse.json() as ApiResult<Conversation>;
          if (selected.success && selected.data?.orderId === selectedOrderId) {
            if (active) router.replace(`/service/collaboration/${encodeURIComponent(selectedOrderId)}`);
            return;
          }
        }
        if (selectedResponse.status !== 403 && selectedResponse.status !== 404 && selectedResponse.status !== 200) {
          throw new Error('恢复上次会话失败，请重试');
        }
        clearSelectedServiceChat(userId);
      }

      const response = await fetchWithAuth('/chat/conversations?limit=1');
      const result = await response.json() as ApiResult<Conversation[]>;
      if (!response.ok || !result.success) throw new Error(result.message || '会话加载失败');
      const first = result.data?.[0];
      if (active) {
        if (first) router.replace(`/service/collaboration/${encodeURIComponent(first.orderId)}`);
        else {
          const intakeResponse = await fetchWithAuth('/intake-sessions');
          const intakes = await intakeResponse.json() as ApiResult<Array<{ id: string }>>;
          if (!intakeResponse.ok || !intakes.success) throw new Error(intakes.message || '会话加载失败');
          if (intakes.data?.[0]) router.replace(`/service/collaboration/${encodeURIComponent(intakes.data[0].id)}?type=intake`);
          else setState('empty');
        }
      }
    };
    void openConversation().catch((cause) => {
      if (active) {
        setError(cause instanceof Error ? cause.message : '会话加载失败');
        setState('error');
      }
    });
    return () => { active = false; };
  }, [router, attempt]);

  if (state === 'loading') return <div className="flex h-[calc(100dvh-65px)] items-center justify-center text-sm text-slate-500">正在打开会话…</div>;
  if (state === 'empty') return <div className="flex h-[calc(100dvh-65px)] min-h-0 bg-white"><ServiceConversationSidebar mobileOpen={mobileListOpen} onClose={() => setMobileListOpen(false)} /><div className="flex min-w-0 flex-1 flex-col"><div className="flex items-center justify-between border-b p-4 text-sm font-bold text-slate-800"><div className="flex items-center gap-2"><button type="button" aria-label="打开会话列表" onClick={() => setMobileListOpen(true)} className="md:hidden"><Menu className="h-5 w-5" /></button><span>订单会话</span></div><span className="md:hidden"><CreateIntakeConversation /></span></div><div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm text-slate-500"><p>暂无可用会话</p><p className="text-xs text-slate-400">点击右上角加号创建邀请会话</p></div></div></div>;
  return <div className="flex h-[calc(100dvh-65px)] flex-col items-center justify-center gap-3 text-sm"><p role="alert" className="text-rose-600">{error}</p><button type="button" onClick={() => { setState('loading'); setAttempt((value) => value + 1); }} className="rounded-lg border border-slate-200 px-4 py-2 text-slate-700">重试</button></div>;
}
