'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { io, type Socket } from 'socket.io-client';
import { ArrowLeft, ArrowRight, Check, FileText, Menu, Search, Send, Share2, X } from 'lucide-react';
import { fetchWithAuth, getCurrentUser, type UserInfo } from '@/lib/auth';
import { loadPendingMessages, removePendingMessages, savePendingMessage, type PendingChatMessage } from '@/lib/chat-outbox';
import { chatPreview, encodeChatCard, parseChatCard, type ChatCard } from '@/lib/chat-cards';
import { ServiceCardComposer } from '@/components/chat/service-card-composer';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { RequirementCollaboration } from '@/components/chat/requirement-collaboration';
import { ChoiceCardView } from '@/components/chat/choice-card-view';
import { ServiceChatToolbar } from '@/components/chat/tools/service-chat-toolbar';
import { ServiceConversationSidebar } from '@/components/chat/service-conversation-sidebar';
import { CreateIntakeConversation } from '@/components/chat/create-intake-conversation';
import { ServiceTransferControl } from '@/components/chat/service-transfer-control';
import { setSelectedServiceChat, setSelectedServiceIntake } from '@/lib/service-chat-selection';
import { parseWorkflowMessage } from '@design-review/shared';

type Message = { id: string; orderId: string; seq: number; senderId: string; senderName: string; clientMessageId: string; body: string; createdAt: string };
type Pending = PendingChatMessage;
type ChatOrder = { orderId: string; orderNo: string; title: string; category: string; platform: string; budget: number; deadline: string | null; requirements: string; status: string; requiresPsd: boolean; creatorName: string; designerName: string; guestId?: string | null; assignedServiceId?: string | null; assignedServiceName?: string | null; assignedById?: string | null; assignedByName?: string | null; updatedAt?: string | null };
type Conversation = { orderId: string; orderNo: string; title: string; category: string; status: string; counterpartName: string; lastBody: string; lastMessageAt: string | null };
type Panel = 'chat' | 'archive' | 'brief' | 'proposal';

function dateLabel(value?: string | null) {
  if (!value) return '未设置';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusLabel(status?: string) {
  return ({ claimed: '已接单', in_progress: '设计制作中', submitted: '待审核', completed: '已完成', cancelled: '已关闭' } as Record<string, string>)[status || ''] || '订单协作中';
}

function StageProgress({ status, connected }: { status?: string; connected: boolean }) {
  const current = status === 'completed' || status === 'submitted' ? 4 : status === 'in_progress' ? 3 : 2;
  return <div className="rounded-xl border border-slate-200 bg-white px-3 py-3"><div className="flex items-center justify-between gap-2 overflow-x-auto">{['已接单', '需求确认', '设计 / 改稿', '交付验收'].map((label, index) => <div key={label} className="flex min-w-fit items-center gap-1.5"><span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${index + 1 <= current ? 'role-primary-bg text-white' : 'bg-slate-100 text-slate-400'}`}>{index + 1 < current || status === 'completed' ? <Check className="h-3 w-3" /> : index + 1}</span><span className={`text-[10px] ${index + 1 === current ? 'font-bold role-primary-text' : 'text-slate-500'}`}>{label}</span></div>)}</div><p className="mt-2 text-right text-[10px] text-slate-400">{connected ? '实时连接' : '断线后自动同步'} · {statusLabel(status)}</p></div>;
}

function BriefCard({ order, review, onOpen }: { order: ChatOrder; review?: ChatCard | null; onOpen?: () => void }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div><p className="text-[11px] font-bold role-primary-text">订单原始需求 · {order.orderNo}</p><h3 className="mt-1 text-sm font-bold text-slate-900">{order.title}</h3></div><FileText className="h-5 w-5 shrink-0 role-primary-text" /></div>
    <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs"><div><p className="text-slate-400">交付类型</p><p className="mt-1 font-semibold text-slate-700">{order.category}</p></div><div><p className="text-slate-400">平台</p><p className="mt-1 font-semibold text-slate-700">{order.platform}</p></div><div><p className="text-slate-400">截止时间</p><p className="mt-1 font-semibold text-slate-700">{dateLabel(order.deadline)}</p></div><div><p className="text-slate-400">源文件</p><p className="mt-1 font-semibold text-slate-700">{order.requiresPsd ? '需要交付' : '未要求'}</p></div></div>
    <div className="mt-4 border-t border-slate-100 pt-4"><p className="text-xs text-slate-400">需求说明</p><p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{order.requirements || '订单未填写详细需求。'}</p></div>
    {review?.kind === 'requirement_review' && <p className="mt-4 rounded-lg role-primary-soft px-3 py-2 text-xs font-medium role-primary-text">最新沟通：{review.decision === 'confirmed' ? '设计师已确认' : '等待品牌方补充'}</p>}
    {onOpen && <button type="button" onClick={onOpen} className="mt-4 flex w-full items-center justify-center gap-1 rounded-lg role-primary-soft py-2.5 text-xs font-semibold role-primary-text">查看完整需求 <ArrowRight className="h-3 w-3" /></button>}
  </div>;
}

function ArchivePanel({ order, messageCount, proposalCount, onBrief }: { order: ChatOrder | null; messageCount: number; proposalCount: number; onBrief: () => void }) {
  return <div className="space-y-4 text-sm"><div className="rounded-2xl role-primary-soft p-4"><p className="text-[11px] font-semibold role-primary-text">当前订单</p><p className="mt-1 font-bold text-slate-900">{order?.title}</p><p className="mt-1 text-xs text-slate-500">{order?.orderNo} · {statusLabel(order?.status)}</p></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="font-semibold text-slate-800">订单摘要</p><dl className="mt-3 space-y-3 text-xs">{[['交付内容', order?.category || '—'], ['平台', order?.platform || '—'], ['截止时间', dateLabel(order?.deadline)], ['订单预算', `¥ ${Number(order?.budget || 0).toLocaleString('zh-CN')}`], ['品牌方', order?.creatorName || '—'], ['设计师', order?.designerName || '—']].map(([label, value]) => <div key={label} className="flex justify-between gap-3 border-b border-slate-100 pb-2 last:border-0"><dt className="text-slate-400">{label}</dt><dd className="text-right font-medium text-slate-700">{value}</dd></div>)}</dl></div><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="font-semibold text-slate-800">协作记录</p><p className="mt-2 text-xs leading-5 text-slate-500">已保存 {messageCount} 条消息 · {proposalCount} 份 A/B 提案。订单正式状态仍以订单详情为准。</p><button type="button" onClick={onBrief} className="mt-3 text-xs font-semibold role-primary-text">查看原始需求 →</button></div></div>;
}

function ServiceContractPanel({ order, messages, onBrief }: { order: ChatOrder | null; messages: Message[]; onBrief: () => void }) {
  const cards = messages.map((message) => ({ message, card: parseChatCard(message.body) })).filter((entry): entry is { message: Message; card: Extract<ChatCard, { kind: 'work_card' }> } => entry.card?.kind === 'work_card');
  return <div className="space-y-4"><div className="rounded-2xl bg-blue-50 p-4"><p className="text-[11px] font-bold text-blue-700">需求档案</p><p className="mt-1 text-sm font-bold text-slate-900">{order?.title || '订单协作'}</p><p className="mt-1 text-xs text-slate-500">{order?.orderNo} · {order?.category}</p><button type="button" onClick={onBrief} className="mt-3 text-xs font-semibold text-blue-700">查看原始需求 →</button></div><div className="rounded-2xl border bg-white p-4"><h3 className="text-sm font-bold text-slate-800">卡片与修订记录</h3><p className="mt-1 text-xs text-slate-400">共 {cards.length} 份，按消息时间保存</p><div className="mt-3 max-h-72 space-y-2 overflow-y-auto">{cards.length ? cards.map(({ message, card }) => <div key={message.id} className="rounded-lg bg-slate-50 p-2 text-xs"><p className="font-semibold text-slate-800">{card.title}</p><p className="mt-1 text-slate-400">{card.revisionOf ? '修订版' : '初始版'} · {dateLabel(message.createdAt)}</p></div>) : <p className="text-xs text-slate-400">尚无结构化卡片</p>}</div></div><p className="text-xs leading-5 text-slate-400">卡片用于协作存证。订单价格、支付和验收状态以正式订单流程为准。</p></div>;
}

function MessageBody({ message, onProposal, decision, onSnapshotDecision, onChoiceAnswer, choiceAnswer, canRespond, canChoose, snapshotDecision, recalled }: { message: Message; onProposal: () => void; decision?: 'A' | 'B'; onSnapshotDecision?: (decision: 'confirmed' | 'needs_changes', note: string) => void; onChoiceAnswer?: (option: { id: string; label: string }, note: string) => Promise<unknown>; choiceAnswer?: { optionId: string; optionLabel: string }; canRespond?: boolean; canChoose?: boolean; snapshotDecision?: 'confirmed' | 'needs_changes'; recalled?: boolean }) {
  const [snapshotNote, setSnapshotNote] = useState('');
  const workflow = parseWorkflowMessage(message.body);
  if (workflow) return <div className="rounded-xl border border-emerald-100 bg-white p-4 text-slate-800"><p className="text-[11px] font-semibold role-primary-text">需求协作记录</p><p className="mt-1 text-sm font-bold">{workflow.title}</p><p className="mt-2 text-xs leading-5 text-slate-500">{workflow.description}</p><p className="mt-3 text-[11px] role-primary-text">在上方「需求协作」面板查看与处理</p></div>;
  const card = parseChatCard(message.body);
  if (recalled) return <p className="text-xs italic opacity-70">消息已撤回</p>;
  if (!card) return <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.body}</p>;
  if (card.kind === 'recall') return null;
  if (card.kind === 'choice') return <ChoiceCardView card={card} answer={choiceAnswer} canAnswer={Boolean(canChoose)} onAnswer={(option, note) => onChoiceAnswer?.(option, note) || Promise.resolve()} />;
  if (card.kind === 'choice_answer') return <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-xs text-emerald-800"><p className="font-bold">品牌方已选择：{card.optionLabel}</p>{card.note && <p className="mt-1 whitespace-pre-wrap">{card.note}</p>}</div>;
  if (card.kind === 'work_card') return <div className="w-full min-w-0 rounded-2xl border border-blue-100 bg-white p-4 text-slate-800 shadow-sm"><p className="text-[11px] font-semibold text-blue-600">{card.templateId === 'contract_snapshot' ? '需求锁定快照' : `协作卡片 · ${card.revisionOf ? '修订版' : '初始版'}`}</p><h3 className="mt-1 text-sm font-bold">{card.title}</h3><dl className="mt-3 space-y-2 border-t pt-3">{card.fields.map((field, index) => <div key={index} className="grid gap-1 text-xs sm:grid-cols-[120px_1fr]"><dt className="font-semibold text-slate-500">{field.label}</dt><dd className="whitespace-pre-wrap break-words text-slate-800">{field.value}</dd></div>)}</dl>{card.attachments.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{card.attachments.map((item) => <AuthenticatedImage key={item.url} src={item.url} alt={item.name} className="aspect-square w-full rounded-lg object-cover" />)}</div>}{card.templateId === 'contract_snapshot' && <div className="mt-4 border-t pt-3">{snapshotDecision ? <p className="text-xs font-semibold text-emerald-700">您已反馈：{snapshotDecision === 'confirmed' ? '确认' : '需要修改'}</p> : canRespond ? <><textarea value={snapshotNote} onChange={(event) => setSnapshotNote(event.target.value)} maxLength={500} rows={2} placeholder="如需修改，请填写具体内容" className="w-full rounded-lg border p-2 text-xs" /><div className="mt-2 flex gap-2"><button type="button" disabled={!snapshotNote.trim()} onClick={() => onSnapshotDecision?.('needs_changes', snapshotNote.trim())} className="rounded-lg border px-3 py-2 text-xs text-slate-600 disabled:opacity-40">需要修改</button><button type="button" onClick={() => onSnapshotDecision?.('confirmed', snapshotNote.trim())} className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white">确认快照</button></div></> : <p className="text-xs text-slate-400">等待订单双方确认；此记录不替代正式合同与订单流程。</p>}</div>}</div>;
  if (card.kind === 'snapshot_ack') return <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-slate-800"><p className="text-xs font-bold text-emerald-700">需求快照反馈：{card.decision === 'confirmed' ? '已确认' : '需要修改'}</p>{card.note && <p className="mt-1 whitespace-pre-wrap text-xs leading-5">{card.note}</p>}</div>;
  if (card.kind === 'proposal') return <div className="w-full min-w-0 rounded-2xl border border-slate-200 bg-white p-4 text-slate-800 shadow-sm"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-[11px] font-semibold role-primary-text">A/B 方案提案</span><span className={`rounded-full px-2 py-1 text-[10px] ${decision ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{decision ? `已选择方案 ${decision}` : '等待选择'}</span></div><h3 className="text-sm font-bold">{card.title}</h3><p className="mt-1 text-xs text-slate-500">两套视觉方向，品牌方可选择并反馈</p><div className="mt-4 grid grid-cols-2 gap-2">{([['A', card.optionA, card.detailA], ['B', card.optionB, card.detailB]] as const).map(([key, title, detail]) => <div key={key} className="rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="text-[10px] font-bold role-primary-text">方案 {key}</span><p className="mt-1 text-xs font-semibold">{title}</p><p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">{detail}</p></div>)}</div><button type="button" onClick={onProposal} className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg role-primary-soft py-2 text-xs font-semibold role-primary-text">查看方案与决策 <ArrowRight className="h-3 w-3" /></button></div>;
  if (card.kind === 'decision') return <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-slate-800"><p className="text-xs font-bold text-blue-700">品牌方选择方案 {card.option}</p>{card.note && <p className="mt-1 whitespace-pre-wrap text-xs leading-5">{card.note}</p>}</div>;
  return <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-slate-800"><p className="text-xs font-bold text-rose-700">{card.decision === 'confirmed' ? '设计师已在聊天中确认需求范围' : '设计师请求补充需求'}</p>{card.note && <p className="mt-1 whitespace-pre-wrap text-xs leading-5">{card.note}</p>}</div>;
}

async function readApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(path, options);
  const result = await response.json();
  if (!response.ok || !result.success) throw Object.assign(new Error(result.message || '请求失败'), { status: response.status });
  return result.data as T;
}

export function OrderChat({ orderId, mobile = false, serviceMode = false, intakeMode = false }: { orderId: string; mobile?: boolean; serviceMode?: boolean; intakeMode?: boolean }) {
  const user = useRef(getCurrentUser());
  const [currentUser, setCurrentUser] = useState<UserInfo | null>(user.current);
  const [order, setOrder] = useState<ChatOrder | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [draft, setDraft] = useState('');
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [identityReady, setIdentityReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const serviceReplyLocked = Boolean(serviceMode && currentUser?.role === 'customer_service' && order?.assignedServiceId && order.assignedServiceId !== currentUser.id);
  const [failedPending, setFailedPending] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitePath, setInvitePath] = useState('');
  const [inviteCodeUrl, setInviteCodeUrl] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [panel, setPanel] = useState<Panel>('chat');
  const [selectedProposal, setSelectedProposal] = useState<Message | null>(null);
  const [selectedOption, setSelectedOption] = useState<'A' | 'B'>('A');
  const [decisionNote, setDecisionNote] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [workCardOpen, setWorkCardOpen] = useState(false);
  const [revisionMessage, setRevisionMessage] = useState<Message | null>(null);
  const [proposalDraft, setProposalDraft] = useState({ title: '', optionA: '', optionB: '', detailA: '', detailB: '' });
  const socketRef = useRef<Socket | null>(null);
  const cursorRef = useRef(0);
  const syncingRef = useRef(false);
  const pendingRef = useRef<Pending[]>([]);
  const sendingRef = useRef(new Set<string>());
  const failedRef = useRef(new Map<string, string>());
  const savingRef = useRef(false);
  const identityReadyRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const confirmPending = useCallback(async (ids: string[]) => {
    if (!ids.length) return;
    await removePendingMessages(ids);
    for (const id of ids) failedRef.current.delete(id);
    setFailedPending((current) => Object.fromEntries(Object.entries(current).filter(([id]) => !ids.includes(id))));
    const remaining = pendingRef.current.filter((item) => !ids.includes(item.clientMessageId));
    pendingRef.current = remaining;
    setPending(remaining);
  }, []);

  const sync = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    try {
      let more = true;
      while (more) {
        const path = intakeMode ? `/intake-sessions/${encodeURIComponent(orderId)}/messages?afterSeq=${cursorRef.current}` : `/chat/orders/${encodeURIComponent(orderId)}/messages?afterSeq=${cursorRef.current}`;
        const page = await readApi<{ messages: Array<Message & { sessionId?: string }>; hasMore: boolean }>(path);
        const incoming = page.messages.map(message => ({ ...message, orderId }));
        if (incoming.length) {
          cursorRef.current = incoming[incoming.length - 1].seq;
          setMessages((current) => {
            const existing = new Set(current.map((item) => item.id));
            return [...current, ...incoming.filter((item) => !existing.has(item.id))].sort((a, b) => a.seq - b.seq);
          });
          const pendingIds = new Set(pendingRef.current.map((item) => item.clientMessageId));
          await confirmPending(incoming.filter((item) => item.senderId === user.current?.id && pendingIds.has(item.clientMessageId)).map((item) => item.clientMessageId));
        }
        more = page.hasMore && page.messages.length > 0;
      }
      setError('');
      if (!intakeMode) void readApi<Conversation[]>('/chat/conversations').then(setConversations).catch(() => undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '消息同步失败'); }
    finally { syncingRef.current = false; }
  }, [orderId, intakeMode, confirmPending]);

  const sendPending = useCallback(async (item: Pending) => {
    if (!identityReadyRef.current || item.userId !== user.current?.id || failedRef.current.has(item.clientMessageId)) return;
    if (sendingRef.current.has(item.clientMessageId)) return;
    sendingRef.current.add(item.clientMessageId);
    try {
      const socket = socketRef.current;
      let saved: Message | undefined;
      if (!intakeMode && socket?.connected) {
        try {
          saved = await new Promise<Message>((resolve, reject) => {
            socket.timeout(8000).emit('chat:send', { orderId, clientMessageId: item.clientMessageId, body: item.body },
              (timeout: Error | null, result: { ok: boolean; message?: Message; error?: string }) => {
                if (timeout || !result?.ok || !result.message) reject(timeout || new Error(result?.error || '发送失败'));
                else resolve(result.message);
              });
          });
        } catch { /* A timeout may mean the commit succeeded. The REST retry uses the same ID. */ }
      }
      if (!saved) saved = await readApi<Message & { sessionId?: string }>(intakeMode ? `/intake-sessions/${encodeURIComponent(orderId)}/messages` : `/chat/orders/${encodeURIComponent(orderId)}/messages`, {
        method: 'POST', body: JSON.stringify({ clientMessageId: item.clientMessageId, body: item.body }),
      });
      saved = { ...saved, orderId };
      setMessages((current) => current.some((message) => message.id === saved!.id) ? current : [...current, saved!].sort((a, b) => a.seq - b.seq));
      await confirmPending([item.clientMessageId]);
      await sync();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '消息待发送，稍后自动重试';
      const status = (cause as { status?: number })?.status;
      if (status && status >= 400 && status < 500 && status !== 401 && status !== 408 && status !== 429) {
        failedRef.current.set(item.clientMessageId, message);
        setFailedPending((current) => ({ ...current, [item.clientMessageId]: message }));
      }
      setError(message);
    }
    finally { sendingRef.current.delete(item.clientMessageId); }
  }, [orderId, intakeMode, confirmPending, sync]);

  const flush = useCallback(async () => {
    if (!identityReadyRef.current || !user.current) return;
    try {
      const loaded = await loadPendingMessages(user.current.id, orderId);
      pendingRef.current = loaded;
      setPending(loaded);
      for (const item of loaded) void sendPending(item);
    } catch { setError('待发消息存储不可用，请检查浏览器设置'); }
  }, [orderId, sendPending]);

  useEffect(() => {
    const loadConversation = intakeMode
      ? readApi<{ id: string; title: string; creatorName: string; guestName: string | null; guestId: string | null; assignedServiceId?: string | null; assignedServiceName?: string | null; assignedById?: string | null; assignedByName?: string | null; updatedAt?: string | null }>(`/intake-sessions/${encodeURIComponent(orderId)}`).then(session => setOrder({
          orderId, orderNo: '邀请会话', title: session.title, category: '品牌沟通', platform: '微信小程序', budget: 0,
          deadline: null, requirements: '', status: 'open', requiresPsd: false, creatorName: session.creatorName,
          designerName: session.guestName || '等待对方加入', guestId: session.guestId, assignedServiceId: session.assignedServiceId, assignedServiceName: session.assignedServiceName,
          assignedById: session.assignedById, assignedByName: session.assignedByName, updatedAt: session.updatedAt,
        }))
      : readApi<ChatOrder>(`/chat/orders/${encodeURIComponent(orderId)}`).then(setOrder);
    loadConversation.catch((cause) => setError(cause.message));
    void readApi<UserInfo>('/auth/me').then(async (currentUser) => {
      user.current = currentUser;
      setCurrentUser(currentUser);
      identityReadyRef.current = true;
      await flush();
      setIdentityReady(true);
      await sync();
    }).catch((cause) => setError(cause instanceof Error ? cause.message : '身份确认失败'));

    const socket = intakeMode ? null : io(process.env.NEXT_PUBLIC_SOCKET_URL || (process.env.NODE_ENV === 'development' ? `${window.location.protocol}//${window.location.hostname}:8080` : window.location.origin), {
      path: '/socket.io', transports: ['websocket'], reconnection: true,
      auth: async (callback) => {
        try {
          const data = await readApi<{ ticket: string }>('/chat/socket-ticket', { method: 'POST' });
          callback({ ticket: data.ticket });
        } catch { callback({ ticket: '' }); }
      },
    });
    socketRef.current = socket;
    socket?.on('connect', () => { setConnected(true); void sync().then(flush); });
    socket?.on('disconnect', () => setConnected(false));
    socket?.on('chat:message', () => { void sync(); });
    const timer = window.setInterval(() => { void sync().then(flush); }, 15000);
    const resume = () => { void sync().then(flush); };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => { window.clearInterval(timer); window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume); socket?.disconnect(); socketRef.current = null; };
  }, [orderId, intakeMode, sync, flush]);

  useEffect(() => {
    if (serviceMode && identityReady && currentUser && order?.orderId === orderId) {
      if (intakeMode) setSelectedServiceIntake(currentUser.id, orderId);
      else setSelectedServiceChat(currentUser.id, orderId);
    }
  }, [serviceMode, intakeMode, identityReady, currentUser, order, orderId]);

  useEffect(() => {
    if (!serviceMode) return;
    const refreshAssignment = async () => {
      try {
        if (intakeMode) {
          const session = await readApi<{ assignedServiceId?: string | null; assignedServiceName?: string | null; assignedById?: string | null; assignedByName?: string | null; updatedAt?: string | null }>(`/intake-sessions/${encodeURIComponent(orderId)}`);
          setOrder((current) => current ? { ...current, ...session } : current);
        } else {
          const latest = await readApi<ChatOrder>(`/chat/orders/${encodeURIComponent(orderId)}`);
          setOrder((current) => current ? { ...current, assignedServiceId: latest.assignedServiceId, assignedServiceName: latest.assignedServiceName, assignedById: latest.assignedById, assignedByName: latest.assignedByName, updatedAt: latest.updatedAt } : latest);
        }
      } catch { /* The conversation itself remains available; the server enforces current ownership on send. */ }
    };
    const timer = window.setInterval(() => void refreshAssignment(), 10000);
    return () => window.clearInterval(timer);
  }, [serviceMode, intakeMode, orderId]);

  useEffect(() => { if (panel === 'chat') bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, pending.length, panel]);

  useEffect(() => {
    if (!identityReady || !currentUser) return;
    try { setDraft(localStorage.getItem(`chat-draft:${currentUser.id}:${orderId}`) || ''); }
    catch { /* Browsers may disable local storage; sending still uses the durable outbox. */ }
    setDraftLoaded(true);
  }, [identityReady, currentUser?.id, orderId]);

  useEffect(() => {
    if (!draftLoaded || !currentUser) return;
    try { localStorage.setItem(`chat-draft:${currentUser.id}:${orderId}`, draft); }
    catch { /* The send button remains protected by IndexedDB persistence. */ }
  }, [draft, draftLoaded, currentUser?.id, orderId]);

  useEffect(() => () => { if (inviteCodeUrl) URL.revokeObjectURL(inviteCodeUrl); }, [inviteCodeUrl]);

  const queueMessage = async (content: string) => {
    const body = content.trim();
    if (!body || body.length > 5000 || !order || !user.current || !identityReadyRef.current || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    const item: Pending = { userId: user.current.id, orderId, clientMessageId: crypto.randomUUID(), body, createdAt: new Date().toISOString() };
    try {
      await savePendingMessage(item);
      pendingRef.current = [...pendingRef.current, item];
      setPending(pendingRef.current);
      setError('');
      void sendPending(item);
      return true;
    } catch { setError('浏览器无法保存待发消息，消息未发送；请检查存储权限或空间'); }
    finally { savingRef.current = false; setSaving(false); }
  };

  const submit = async () => { if (await queueMessage(draft)) setDraft(''); };
  const sendCard = (card: ChatCard) => queueMessage(encodeChatCard(card));
  const isDesigner = currentUser?.role === 'designer';
  const ownSnapshotAcks = useMemo(() => {
    const result = new Map<string, 'confirmed' | 'needs_changes'>();
    for (const message of messages) {
      const card = parseChatCard(message.body);
      if (message.senderId === currentUser?.id && card?.kind === 'snapshot_ack') result.set(card.snapshotMessageId, card.decision);
    }
    return result;
  }, [messages, currentUser?.id]);
  const choiceAnswers = useMemo(() => {
    const result = new Map<string, { optionId: string; optionLabel: string }>();
    for (const message of messages) {
      const card = parseChatCard(message.body);
      if (card?.kind === 'choice_answer') result.set(card.choiceMessageId, { optionId: card.optionId, optionLabel: card.optionLabel });
    }
    return result;
  }, [messages]);
  const recalledIds = useMemo(() => new Set(messages.map((message) => parseChatCard(message.body)).filter((card): card is Extract<ChatCard, { kind: 'recall' }> => card?.kind === 'recall').map((card) => card.targetMessageId)), [messages]);
  // Recall cards stay in history for synchronization, but the target message is the only visible notice.
  const visibleMessages = useMemo(() => messages.filter((message) => parseChatCard(message.body)?.kind !== 'recall'), [messages]);
  const visiblePending = useMemo(() => pending.filter((message) => parseChatCard(message.body)?.kind !== 'recall' || failedPending[message.clientMessageId]), [pending, failedPending]);
  const proposals = useMemo(() => messages.filter((message) => parseChatCard(message.body)?.kind === 'proposal'), [messages]);
  const decisions = useMemo(() => {
    const results = new Map<string, 'A' | 'B'>();
    for (const message of messages) {
      const card = parseChatCard(message.body);
      if (card?.kind === 'decision') results.set(card.proposalMessageId, card.option);
    }
    return results;
  }, [messages]);
  const latestProposal = proposals[proposals.length - 1];
  const review = [...messages].reverse().map((message) => parseChatCard(message.body)).find((card) => card?.kind === 'requirement_review');
  const filteredConversations = conversations.filter((item) => `${item.title} ${item.orderNo} ${item.counterpartName}`.toLowerCase().includes(search.toLowerCase()));
  const openProposal = (message: Message) => { setSelectedProposal(message); setSelectedOption('A'); setDecisionNote(''); setPanel('proposal'); };
  const sendReview = async (decision: 'confirmed' | 'needs_details') => {
    if (decision === 'needs_details' && !reviewNote.trim()) { setError('请填写需要补充的内容'); return; }
    if (await sendCard({ kind: 'requirement_review', decision, note: reviewNote.trim() })) { setReviewNote(''); setPanel('chat'); }
  };
  const sendDecision = async () => {
    if (selectedProposal && await sendCard({ kind: 'decision', proposalMessageId: selectedProposal.id, option: selectedOption, note: decisionNote.trim() })) setPanel('chat');
  };
  const sendProposal = async () => {
    const values = Object.values(proposalDraft).map((value) => value.trim());
    if (values.some((value) => !value)) { setError('请填写标题和两套方案的名称、说明'); return; }
    if (await sendCard({ kind: 'proposal', title: values[0], optionA: values[1], optionB: values[2], detailA: values[3], detailB: values[4] })) {
      setComposerOpen(false);
      setProposalDraft({ title: '', optionA: '', optionB: '', detailA: '', detailB: '' });
    }
  };

  const createInviteCode = async () => {
    if (!intakeMode || inviteBusy) return;
    setInviteBusy(true); setInvitePath(''); setInviteCodeUrl(''); setError('');
    try {
      const invite = await readApi<{ token: string; path: string }>(`/intake-sessions/${encodeURIComponent(orderId)}/invite`, { method: 'POST' });
      setInvitePath(invite.path); setInviteOpen(true);
      const response = await fetchWithAuth(`/intake-sessions/${encodeURIComponent(orderId)}/invite-code`, { method: 'POST', body: JSON.stringify({ token: invite.token }) });
      if (!response.ok) { const result = await response.json(); throw new Error(result.message || '生成小程序码失败'); }
      setInviteCodeUrl(URL.createObjectURL(await response.blob()));
    } catch (cause) { setError(cause instanceof Error ? cause.message : '创建邀请码失败'); setInviteOpen(true); }
    finally { setInviteBusy(false); }
  };
  const copyInvitePath = async () => {
    try { await navigator.clipboard.writeText(invitePath); }
    catch { setError('复制失败，请手动复制小程序路径'); }
  };

  const selectedCard = selectedProposal ? parseChatCard(selectedProposal.body) : null;
  const selectedDecision = selectedProposal && [...messages].reverse().map((message) => parseChatCard(message.body)).find((card) => card?.kind === 'decision' && card.proposalMessageId === selectedProposal.id);

  return <div className={mobile
    ? 'flex h-dvh flex-col bg-[#f7f8fc]'
    : serviceMode
      ? 'chat-workspace-root flex h-[calc(100dvh-57px)] w-full min-h-0 overflow-hidden bg-white sm:h-[calc(100dvh-65px)]'
      : 'flex h-[calc(100dvh-152px)] min-h-[680px] w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm'}>
    {!mobile && (serviceMode ? <ServiceConversationSidebar activeOrderId={intakeMode ? undefined : orderId} activeIntakeId={intakeMode ? orderId : undefined} mobileOpen={mobileListOpen} onClose={() => setMobileListOpen(false)} /> : <aside className="hidden w-[240px] shrink-0 flex-col border-r border-slate-200 bg-white md:flex xl:w-[270px]"><div className="border-b border-slate-100 p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900">订单会话</h2><span className="rounded-full role-primary-soft px-2 py-0.5 text-xs font-semibold role-primary-text">{conversations.length}</span></div><label className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5"><Search className="h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索订单 / 对方" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></label></div><div className="min-h-0 flex-1 overflow-y-auto p-2">{filteredConversations.map((item) => <Link key={item.orderId} href={serviceMode ? `/service/collaboration/${encodeURIComponent(item.orderId)}` : `/chat/orders/${encodeURIComponent(item.orderId)}`} className={`mb-1 block rounded-xl p-3 transition hover:bg-slate-50 ${item.orderId === orderId ? 'role-primary-soft' : ''}`}><div className="flex items-center gap-2"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">{item.counterpartName?.slice(0, 1) || '订'}</span><span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-800">{item.title}</span></div><p className="mt-2 truncate text-[11px] text-slate-400">{item.orderNo} · {item.counterpartName || '订单协作'}</p><p className="mt-1 truncate text-[11px] role-primary-text">{item.lastBody ? chatPreview(item.lastBody) : statusLabel(item.status)}</p></Link>)}{!filteredConversations.length && <p className="px-4 py-8 text-center text-xs text-slate-400">暂无匹配会话</p>}</div><div className="m-4 rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">消息按订单保存。断线重连后会自动补齐历史记录。</div></aside>)}
    <div className="flex min-w-0 flex-1 flex-col bg-[#f7f8fc]">
      {panel === 'chat' ? <>
        <header className="flex shrink-0 items-center gap-3 border-b border-slate-100 bg-white px-4 py-3">{serviceMode && <button type="button" aria-label="打开会话列表" onClick={() => setMobileListOpen(true)} className="rounded-lg p-1.5 text-slate-500 md:hidden"><Menu className="h-5 w-5" /></button>}<Link href={serviceMode ? '/service/dashboard' : mobile ? '/mobile/orders' : isDesigner ? '/review-tasks' : '/advertiser/orders'} aria-label="返回订单" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"><ArrowLeft className="h-5 w-5" /></Link><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-900">{order?.title || '订单协作'}</p><p className="truncate text-[11px] text-slate-400">{order?.orderNo || orderId} · {serviceMode ? `接待客服：${order?.assignedServiceName || '待分配'} · ${order?.creatorName} / ${order?.designerName}` : isDesigner ? order?.creatorName : order?.designerName}</p></div>{serviceMode && order && <ServiceTransferControl type={intakeMode ? 'intake' : 'order'} conversationId={orderId} currentUserId={currentUser?.id} assignment={order} onAssigned={(next) => setOrder((current) => current ? { ...current, ...next } : current)} />}{serviceMode && intakeMode && !order?.guestId && <button type="button" disabled={inviteBusy} onClick={() => void createInviteCode()} className="inline-flex items-center gap-1 rounded-full role-primary-soft px-3 py-1.5 text-xs font-semibold role-primary-text disabled:opacity-50"><Share2 className="h-3.5 w-3.5" />{inviteBusy ? '生成中…' : '创建邀请码'}</button>}{serviceMode && !intakeMode && <span className="md:hidden"><CreateIntakeConversation /></span>}{serviceMode && !intakeMode && <button type="button" onClick={() => window.print()} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">打印 Brief</button>}{!intakeMode && <button type="button" onClick={() => setPanel('archive')} className="rounded-full role-primary-soft px-3 py-1.5 text-xs font-semibold role-primary-text">档案</button>}</header>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4 sm:p-6" aria-live="polite">{!intakeMode && <><StageProgress status={order?.status} connected={connected} /><RequirementCollaboration key={orderId} orderId={orderId} refreshToken={messages[messages.length - 1]?.seq || 0} /></>}<div className={serviceMode ? 'w-full space-y-5' : 'mx-auto max-w-[680px] space-y-5'}><div className="mx-auto w-fit rounded-full bg-slate-200/70 px-3 py-1 text-[11px] text-slate-500">{intakeMode ? '沟通会话' : '订单协作时间线'}</div>{order && !intakeMode && <BriefCard order={order} review={review} onOpen={() => setPanel('brief')} />}{visibleMessages.map((message) => <article key={message.id} className={`flex ${message.senderId === currentUser?.id ? 'justify-end' : 'justify-start'}`}><div className={`min-w-0 max-w-[88%] ${['proposal', 'choice'].includes(parseChatCard(message.body)?.kind || '') ? 'w-full max-w-[560px]' : ''}`}><p className={`mb-1 text-[11px] text-slate-400 ${message.senderId === currentUser?.id ? 'text-right' : ''}`}>{message.senderName} · {dateLabel(message.createdAt)}</p><div className={parseChatCard(message.body) ? '' : `rounded-2xl px-4 py-3 ${message.senderId === currentUser?.id ? 'role-primary-bg text-white' : 'border border-slate-200 bg-white text-slate-800'}`}><MessageBody message={message} onProposal={() => openProposal(message)} decision={decisions.get(message.id)} choiceAnswer={choiceAnswers.get(message.id)} canChoose={currentUser?.role === 'advertiser' && message.senderId !== currentUser.id} onChoiceAnswer={(option, note) => sendCard({ kind: 'choice_answer', choiceMessageId: message.id, optionId: option.id, optionLabel: option.label, note })} canRespond={currentUser?.role === 'advertiser' || currentUser?.role === 'designer'} snapshotDecision={ownSnapshotAcks.get(message.id)} onSnapshotDecision={(decision, note) => void sendCard({ kind: 'snapshot_ack', snapshotMessageId: message.id, decision, note })} recalled={recalledIds.has(message.id)} /></div>{serviceMode && !intakeMode && parseChatCard(message.body)?.kind === 'work_card' && <button type="button" onClick={() => { setRevisionMessage(message); setWorkCardOpen(true); }} className="mt-1 text-[11px] font-semibold text-blue-600">基于此卡创建修订版</button>}{message.senderId === currentUser?.id && !intakeMode && !parseChatCard(message.body) && !recalledIds.has(message.id) && Date.now() - new Date(message.createdAt).getTime() < 120000 && <button type="button" onClick={() => void sendCard({ kind: 'recall', targetMessageId: message.id })} className="ml-2 mt-1 text-[11px] text-slate-400">撤回</button>}{message.senderId === currentUser?.id && !recalledIds.has(message.id) && <p className="mt-1 text-right text-[10px] text-slate-400">已保存</p>}</div></article>)}{visiblePending.map((message) => <article key={message.clientMessageId} className="flex justify-end"><div className="max-w-[85%] rounded-2xl role-primary-soft px-4 py-3 text-sm role-primary-text"><p className="text-[10px]">{failedPending[message.clientMessageId] ? `发送失败：${failedPending[message.clientMessageId]}` : "待服务器确认 · 自动重试中"}</p><p className="mt-1 whitespace-pre-wrap break-words">{parseChatCard(message.body)?.kind === 'recall' ? '撤回失败' : chatPreview(message.body)}</p><div className="mt-2 flex gap-3 text-[11px]"><button type="button" onClick={() => { failedRef.current.delete(message.clientMessageId); setFailedPending((current) => { const next = { ...current }; delete next[message.clientMessageId]; return next; }); void sendPending(message); }} className="underline">立即重试</button>{failedPending[message.clientMessageId] && <button type="button" onClick={() => void confirmPending([message.clientMessageId])} className="underline">放弃待发</button>}</div></div></article>)}{!visibleMessages.length && !visiblePending.length && <p className="py-4 text-center text-xs text-slate-400">从订单需求开始沟通，消息会保存在当前订单中</p>}<div ref={bottomRef} /></div></div>
        <footer className="shrink-0 border-t border-slate-100 bg-white p-3 pb-[max(env(safe-area-inset-bottom),12px)] sm:p-4"><div className={serviceMode ? 'w-full' : 'mx-auto max-w-[680px]'}>{error && <p role="alert" className="mb-2 text-xs text-rose-600">{error}</p>}{serviceReplyLocked && <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">会话已转交给 {order?.assignedServiceName}，你可以查看历史记录，但不能继续回复。</p>}{serviceMode && !intakeMode ? serviceReplyLocked ? null : <ServiceChatToolbar orderId={orderId} requirements={order?.requirements || ''} onSend={sendCard} onFormSent={() => void sync()} /> : intakeMode ? <p className="mb-2 text-xs text-slate-400">消息会保存在当前会话中</p> : <div className="mb-2 flex gap-2 overflow-x-auto pb-1 text-xs">{isDesigner ? <><button type="button" onClick={() => setPanel('brief')} className="shrink-0 rounded-full role-primary-soft px-3 py-2 font-semibold role-primary-text">业务需求卡</button><button type="button" onClick={() => setComposerOpen(true)} className="shrink-0 rounded-full bg-slate-100 px-3 py-2 text-slate-600">A/B 提案</button><button type="button" onClick={() => setDraft('[需求问题] ')} className="shrink-0 rounded-full bg-slate-100 px-3 py-2 text-slate-600">提出问题</button><Link href={mobile ? '/mobile/tasks' : '/review-tasks'} className="shrink-0 rounded-full bg-slate-100 px-3 py-2 text-slate-600">交付任务</Link></> : <><button type="button" onClick={() => setDraft('[需求补充] ')} className="shrink-0 rounded-full role-primary-soft px-3 py-2 font-semibold role-primary-text">补充需求</button><button type="button" onClick={() => latestProposal ? openProposal(latestProposal) : setError('设计师尚未提交 A/B 方案')} className="shrink-0 rounded-full bg-slate-100 px-3 py-2 text-slate-600">方案决策</button><button type="button" onClick={() => setDraft('[修改反馈] ')} className="shrink-0 rounded-full bg-slate-100 px-3 py-2 text-slate-600">修改反馈</button><Link href={mobile ? `/mobile/orders/${encodeURIComponent(orderId)}` : '/advertiser/orders'} className="shrink-0 rounded-full bg-slate-100 px-3 py-2 text-slate-600">查看订单</Link></>}</div>}<div className="flex gap-2 rounded-xl border border-slate-200 bg-white p-2 focus-within:role-primary-border"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submit(); } }} maxLength={5000} rows={mobile ? 2 : 3} disabled={!draftLoaded || serviceReplyLocked} placeholder={serviceReplyLocked ? `会话已转交给${order?.assignedServiceName}` : draftLoaded ? "输入消息…" : "正在恢复草稿…"} className="min-w-0 flex-1 resize-none border-0 bg-transparent p-2 text-sm outline-none" /><button type="button" onClick={() => void submit()} disabled={!draft.trim() || !order || !identityReady || saving || serviceReplyLocked} className="self-end rounded-lg role-primary-gradient p-3 text-white disabled:opacity-40" aria-label="发送消息"><Send className="h-4 w-4" /></button></div><p className="mt-1 hidden text-[10px] text-slate-400 sm:block">Enter 发送 · Shift+Enter 换行 · 服务端保存后显示“已保存”</p></div></footer>
      </> : <><header className="flex shrink-0 items-center gap-3 border-b border-slate-100 bg-white px-4 py-4"><button type="button" onClick={() => setPanel('chat')} aria-label="返回聊天" className="text-slate-500"><ArrowLeft className="h-5 w-5" /></button><h2 className="flex-1 text-sm font-bold text-slate-900">{panel === 'archive' ? '协作档案' : panel === 'brief' ? '确认需求范围' : '选择主图方案'}</h2><button type="button" onClick={() => setPanel('chat')} aria-label="关闭" className="text-slate-400"><X className="h-4 w-4" /></button></header><div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><div className={serviceMode ? 'w-full space-y-4' : 'mx-auto max-w-[680px] space-y-4'}>{error && <p role="alert" className="text-xs text-rose-600">{error}</p>}{panel === 'archive' ? <ArchivePanel order={order} messageCount={messages.length} proposalCount={proposals.length} onBrief={() => setPanel('brief')} /> : panel === 'brief' ? <>{order && <><BriefCard order={order} review={review} onOpen={() => undefined} /><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold text-slate-700">完整需求说明</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{order.requirements || '订单未填写详细需求。'}</p></div></>}{isDesigner && <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm font-semibold">需求核对</p><textarea value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} rows={3} maxLength={500} placeholder="如需补充，请写明问题或缺少的素材" className="mt-3 w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:role-primary-border" /><div className="mt-3 flex gap-2"><button type="button" onClick={() => void sendReview('needs_details')} disabled={saving || !identityReady} className="min-h-11 flex-1 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 disabled:opacity-40">请求补充</button><button type="button" onClick={() => void sendReview('confirmed')} disabled={saving || !identityReady} className="min-h-11 flex-1 rounded-xl role-primary-gradient text-xs font-semibold text-white disabled:opacity-40">确认需求范围</button></div><p className="mt-2 text-[11px] text-slate-400">操作会作为聊天记录发送，不会修改订单审核状态。</p></div>}</> : selectedCard?.kind === 'proposal' ? <><div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-xs font-semibold role-primary-text">A/B 方案提案</p><h3 className="mt-1 text-base font-bold text-slate-900">{selectedCard.title}</h3><p className="mt-1 text-xs text-slate-400">设计师提交 · {dateLabel(selectedProposal?.createdAt)}</p></div>{([['A', selectedCard.optionA, selectedCard.detailA], ['B', selectedCard.optionB, selectedCard.detailB]] as const).map(([key, title, detail]) => <button key={key} type="button" onClick={() => setSelectedOption(key)} className={`w-full rounded-2xl border bg-white p-4 text-left ${selectedOption === key ? 'role-primary-border ring-2 ring-[var(--role-primary-border)]' : 'border-slate-200'}`}><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full role-primary-soft text-xs font-bold role-primary-text">{key}</span><span className="font-semibold text-slate-900">{title}</span>{selectedOption === key && <Check className="ml-auto h-4 w-4 role-primary-text" />}</div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{detail}</p></button>)}{selectedDecision?.kind === 'decision' ? <p className="rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-700">已在聊天中选择方案 {selectedDecision.option}</p> : currentUser?.role === 'advertiser' && <><textarea value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} rows={2} maxLength={500} placeholder="可选：补充选择理由或调整建议" className="w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:role-primary-border" /><button type="button" onClick={() => void sendDecision()} disabled={saving || !identityReady} className="min-h-11 w-full rounded-xl role-primary-gradient text-sm font-semibold text-white disabled:opacity-40">确认选择方案 {selectedOption}</button><p className="text-[11px] text-slate-400">选择将保存为聊天记录，订单正式流程仍在订单页面处理。</p></>}</> : <p className="text-sm text-slate-500">方案不存在或尚未保存。</p>}</div></div></>}
    </div>
    {!mobile && !intakeMode && <aside className="hidden w-[260px] shrink-0 overflow-y-auto border-l border-slate-200 bg-white p-5 xl:block"><h2 className="border-b border-slate-100 pb-4 text-sm font-bold text-slate-900">{serviceMode ? '协作档案' : isDesigner ? '项目执行面板' : '订单决策面板'}</h2><div className="mt-4 rounded-2xl role-primary-soft p-4"><p className="text-[11px] text-slate-500">{isDesigner ? '待我处理' : '当前协作'}</p><p className="mt-1 text-sm font-bold role-primary-text">{isDesigner ? review?.kind === 'requirement_review' && review.decision === 'confirmed' ? '推进设计与交付' : '核对交付范围' : latestProposal ? '选择视觉方案' : '补充需求与反馈'}</p><p className="mt-2 text-xs text-slate-500">{isDesigner ? '从订单需求开始，沟通记录会保留在时间线' : '选择方案会保存为消息，双方可追溯'}</p></div><div className="mt-5">{serviceMode ? <ServiceContractPanel order={order} messages={messages} onBrief={() => setPanel('brief')} /> : <ArchivePanel order={order} messageCount={messages.length} proposalCount={proposals.length} onBrief={() => setPanel('brief')} />}</div></aside>}
    {serviceMode && !intakeMode && <>
      <style>{`@media print { body * { visibility: hidden !important; } .chat-workspace-root { overflow: visible !important; height: auto !important; border: 0 !important; } .chat-print-brief, .chat-print-brief * { visibility: visible !important; } .chat-print-brief { display: block !important; position: absolute; inset: 0; width: 100%; padding: 24px; background: white; color: #0f172a; } }`}</style>
      <section className="chat-print-brief hidden"><h1 className="text-2xl font-bold">订单协作 Brief</h1><p className="mt-2 text-sm">{order?.orderNo} · {order?.title}</p><dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><dt>品牌方</dt><dd>{order?.creatorName}</dd></div><div><dt>设计师</dt><dd>{order?.designerName}</dd></div><div><dt>交付类型</dt><dd>{order?.category}</dd></div><div><dt>截止时间</dt><dd>{dateLabel(order?.deadline)}</dd></div></dl><h2 className="mt-6 border-b pb-2 font-bold">原始需求</h2><p className="mt-2 whitespace-pre-wrap text-sm">{order?.requirements || '未填写'}</p><h2 className="mt-6 border-b pb-2 font-bold">协作卡片</h2>{messages.map((message) => { const card = parseChatCard(message.body); return card?.kind === 'work_card' ? <div key={message.id} className="mt-4 break-inside-avoid border-b pb-3 text-sm"><h3 className="font-semibold">{card.title}</h3><p className="text-xs">{message.senderName} · {dateLabel(message.createdAt)}</p>{card.fields.map((field, index) => <p key={index} className="mt-1 whitespace-pre-wrap">{field.label}：{field.value}</p>)}</div> : null; })}</section>
    </>}
    {inviteOpen && intakeMode && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setInviteOpen(false); }}><section role="dialog" aria-modal="true" aria-labelledby="intake-invite-title" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"><div className="flex items-center justify-between"><h2 id="intake-invite-title" className="text-lg font-bold text-slate-900">会话邀请码</h2><button type="button" aria-label="关闭" onClick={() => setInviteOpen(false)} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><p className="mt-2 text-xs text-slate-500">对方打开微信分享卡片或扫描小程序码，即可加入当前会话。</p>{inviteCodeUrl ? <img src={inviteCodeUrl} alt="加入会话的小程序码" className="mx-auto mt-4 h-48 w-48 rounded-lg border" /> : <div className="mt-4 flex h-48 items-center justify-center rounded-lg bg-slate-50 text-sm text-slate-400">{inviteBusy ? '正在生成小程序码…' : '小程序码暂不可用'}</div>}{invitePath && <div className="mt-4 flex gap-2"><input readOnly aria-label="小程序页面路径" value={invitePath} className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs" /><button type="button" onClick={() => void copyInvitePath()} className="shrink-0 rounded-lg role-primary-soft px-3 py-2 text-xs font-semibold role-primary-text">复制路径</button></div>}{error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}{inviteCodeUrl && <a href={inviteCodeUrl} download="会话邀请码.png" className="mt-4 block rounded-lg role-primary-gradient px-4 py-2.5 text-center text-sm font-semibold text-white">下载小程序码</a>}</section></div>}
    {workCardOpen && <ServiceCardComposer key={revisionMessage?.id || 'new'} onClose={() => setWorkCardOpen(false)} onSend={sendCard} initial={revisionMessage ? (parseChatCard(revisionMessage.body) as Extract<ChatCard, { kind: 'work_card' }>) : undefined} revisionOf={revisionMessage?.id} />}
    {composerOpen && <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/40 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="创建 A/B 提案"><div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-2xl"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold role-primary-text">{serviceMode ? '客服协作工具' : '设计师工具'}</p><h2 className="mt-1 text-lg font-bold text-slate-900">创建 A/B 方案提案</h2></div><button type="button" onClick={() => setComposerOpen(false)} aria-label="关闭提案" className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div><p className="mt-2 text-xs leading-5 text-slate-500">提案会作为当前订单的聊天卡片保存。图片素材与正式交付仍在订单任务中处理。</p><div className="mt-5 space-y-3">{([['title', '提案标题', '例如：主图视觉方向'], ['optionA', '方案 A 名称', '例如：轻盈自然'], ['detailA', '方案 A 说明', '说明视觉、配色与内容重点'], ['optionB', '方案 B 名称', '例如：质感聚焦'], ['detailB', '方案 B 说明', '说明视觉、配色与内容重点']] as const).map(([key, label, placeholder]) => <label key={key} className="block"><span className="text-xs font-semibold text-slate-700">{label}</span><textarea value={proposalDraft[key]} onChange={(event) => setProposalDraft((current) => ({ ...current, [key]: event.target.value }))} rows={key.startsWith('detail') ? 2 : 1} maxLength={key.startsWith('detail') ? 600 : 80} placeholder={placeholder} className="mt-1 w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:role-primary-border" /></label>)}</div>{error && <p role="alert" className="mt-2 text-xs text-rose-600">{error}</p>}<button type="button" onClick={() => void sendProposal()} disabled={saving || !identityReady} className="mt-5 min-h-11 w-full rounded-xl role-primary-gradient text-sm font-semibold text-white disabled:opacity-40">发送方案卡片</button></div></div>}
  </div>;
}
