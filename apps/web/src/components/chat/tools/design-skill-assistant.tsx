'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, ExternalLink, Image, LoaderCircle, Search, Send, Sparkles } from 'lucide-react';
import type { DesignSkill, FormMobileStyle } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { parseChatCard, type ChatCard } from '@/lib/chat-cards';
import type { SendCard } from './tool-ui';

type Message = { id: string; senderId: string; senderName: string; body: string; createdAt?: string };
type Recommendation = { skill: DesignSkill; reason: string; score: number };
type SearchResult = { id: string; title: string; thumbnailUrl: string; sourceUrl: string; creator: string; creatorUrl?: string; provider: string; license: string; licenseVersion?: string; licenseUrl?: string; width: number; height: number };
type Recognition = { messageId: string; summary: string; intent: string; extractedRequirements: string[]; followUpQuestions: string[]; recommendations: Recommendation[]; imageQuery: string; images: SearchResult[]; generatedBy: 'ai' };
type RecognitionItem = { message: Message; busy: boolean; result?: Recognition; error?: string };
type ApiResult<T> = { success: boolean; message?: string; data: T };

async function post<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetchWithAuth(path, { method: 'POST', body: JSON.stringify(payload) });
  const result = await response.json() as ApiResult<T>;
  if (!response.ok || !result.success) throw new Error(result.message || '请求失败');
  return result.data;
}

function makeQuestionCard(skill: DesignSkill, question: DesignSkill['questions'][number]): Extract<ChatCard, { kind: 'work_card' }> {
  const options = question.options?.slice(0, 20).map((option) => option.slice(0, 100)) || [];
  return {
    kind: 'work_card', templateId: 'design_skill_intake', title: `${skill.name} · ${question.label}`.slice(0, 160), mobileStyle: 'compact' as FormMobileStyle,
    fields: [{ label: question.label.slice(0, 80), value: '请填写', ...(options.length ? { options } : {}),
      schema: { id: question.id.slice(0, 80), key: question.key.slice(0, 80), kind: question.kind, label: question.label.slice(0, 80), width: 100,
        required: question.required, placeholder: question.placeholder?.slice(0, 120) || '', help: question.prompt.slice(0, 180),
        ...(options.length ? { options: options.map((label) => ({ label, value: label })) } : {}),
        ...(question.kind === 'image' || question.kind === 'file' ? { maxFiles: 1 } : {}) } }], attachments: [],
  };
}

function messagePreview(message: Message) {
  const card = parseChatCard(message.body);
  if (!card) return message.body.slice(0, 500);
  if (card.kind === 'image') return `发送了 ${card.attachments.length} 张图片${card.caption ? `：${card.caption}` : ''}`;
  if (card.kind === 'video') return `发送了视频${card.caption ? `：${card.caption}` : ''}`;
  if (card.kind === 'form_answers') return '提交了需求表单回答';
  if (card.kind === 'choice_answer') return `选择「${card.optionLabel}」${card.note ? `：${card.note}` : ''}`;
  return `发送了${card.kind === 'work_card' ? card.title : '设计协作消息'}`;
}

function ReferenceGrid({ images, selected, onToggle }: { images: SearchResult[]; selected: string[]; onToggle: (id: string) => void }) {
  return <div className="mt-2 grid grid-cols-2 gap-2">{images.map((image) => <div key={image.id} className={`overflow-hidden rounded-lg border bg-white ${selected.includes(image.id) ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200'}`}><div className="relative"><a href={image.sourceUrl} target="_blank" rel="noopener noreferrer"><img src={image.thumbnailUrl} alt={image.title} loading="lazy" referrerPolicy="no-referrer" className="aspect-[4/3] w-full bg-slate-100 object-cover" /></a><input type="checkbox" aria-label={`选择图片：${image.title}`} checked={selected.includes(image.id)} onChange={() => onToggle(image.id)} className="absolute left-2 top-2 h-4 w-4 accent-indigo-600" /><a href={image.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label="打开图片来源" className="absolute right-2 top-2 rounded-md bg-white/90 p-1.5 text-slate-700"><ExternalLink className="h-3.5 w-3.5" /></a></div><div className="p-2"><a href={image.sourceUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-[10px] font-semibold text-slate-700">{image.title || '打开图片来源'}</a><p className="mt-1 truncate text-[10px] text-slate-400">{image.creator || '作者未注明'} · {image.license}{image.licenseVersion ? ` ${image.licenseVersion}` : ''}</p></div></div>)}</div>;
}

function RecognitionCard({ item, canRespond, showRecommendations, onSendQuestion, onSendText, onSendReferences }: {
  item: RecognitionItem; canRespond: boolean;
  showRecommendations: boolean;
  onSendQuestion: (recommendation: Recommendation, question: DesignSkill['questions'][number]) => Promise<void>;
  onSendText: (text: string) => Promise<void>;
  onSendReferences: (images: SearchResult[], query: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedSkillId, setSelectedSkillId] = useState('');
  const [sendingQuestionId, setSendingQuestionId] = useState('');
  const [notice, setNotice] = useState('');
  const images = item.result?.images || [];
  const sendQuestionText = async (recommendation: Recommendation, question: DesignSkill['questions'][number]) => {
    const actionId = `${recommendation.skill.id}:${question.id}:text`;
    const label = question.label.trim();
    const guidance = question.prompt.trim();
    const prompt = guidance && guidance !== label ? `${label}（${guidance}）` : label;
    setSendingQuestionId(actionId); setNotice('');
    try {
      await onSendText(`关于「${recommendation.skill.name}」，想和您确认一下：${prompt}`);
      setNotice(`已发送问题「${question.label}」`);
    } catch (error) { setNotice(error instanceof Error ? error.message : '问题发送失败'); }
    finally { setSendingQuestionId(''); }
  };
  const sendQuestionForm = async (recommendation: Recommendation, question: DesignSkill['questions'][number]) => {
    const actionId = `${recommendation.skill.id}:${question.id}:form`;
    setSendingQuestionId(actionId); setNotice('');
    try {
      await onSendQuestion(recommendation, question);
      setNotice(`已发送「${question.label}」单题表单`);
    } catch (error) { setNotice(error instanceof Error ? error.message : '单题表单发送失败'); }
    finally { setSendingQuestionId(''); }
  };
  const sendSelected = async () => {
    await onSendReferences(images.filter((image) => selected.includes(image.id)), item.result?.imageQuery || '');
    setSelected([]);
  };
  return <article className="mx-auto w-full max-w-[680px] rounded-2xl border border-violet-200 bg-white p-4 shadow-sm sm:p-5" aria-live="polite">
    <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Sparkles className="h-4 w-4" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-bold text-violet-800">消息识别</p><span className="text-[10px] text-slate-400">针对 {item.message.senderName || '品牌方'} · {item.message.createdAt ? new Date(item.message.createdAt).toLocaleString() : '刚刚'}</span></div><p className="mt-1 line-clamp-3 break-words text-xs leading-5 text-slate-500">“{messagePreview(item.message)}”</p></div>{item.busy && <LoaderCircle className="h-4 w-4 shrink-0 animate-spin text-violet-500" />}</div>
    {item.busy && <p className="ml-12 mt-3 text-xs text-slate-500">正在识别需求、匹配 Skills 并查找相关参考图…</p>}
    {item.error && <p role="alert" className="ml-12 mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{item.error}</p>}
    {item.result && <div className="ml-12 mt-3 space-y-3"><section className="rounded-xl bg-violet-50/70 p-3"><p className="text-[11px] font-bold text-violet-700">{item.result.intent}</p><p className="mt-1 text-sm leading-6 text-slate-800">{item.result.summary}</p>{item.result.extractedRequirements.length > 0 && <div className="mt-3"><p className="text-[11px] font-semibold text-slate-500">已识别信息</p><ul className="mt-1 space-y-1">{item.result.extractedRequirements.map((text, index) => <li key={index} className="text-xs leading-5 text-slate-700">• {text}</li>)}</ul></div>}{item.result.followUpQuestions.length > 0 && <div className="mt-3"><p className="text-[11px] font-semibold text-slate-500">建议追问</p><ol className="mt-1 space-y-1">{item.result.followUpQuestions.map((text, index) => <li key={index} className="text-xs leading-5 text-slate-700">{index + 1}. {text}</li>)}</ol></div>}</section>
      {showRecommendations && item.result.recommendations.length > 0 && <section><p className="text-xs font-bold text-slate-700">本次会话推荐 Skills <span className="font-normal text-slate-400">· 已结合前文上下文，选择后查看该技能的问题</span></p><div className="mt-2 grid gap-2">{item.result.recommendations.map((recommendation) => {
        const active = selectedSkillId === recommendation.skill.id;
        const questions = [...recommendation.skill.questions].sort((a, b) => a.priority - b.priority);
        return <div key={recommendation.skill.id} className={`rounded-xl border p-3 ${active ? 'border-violet-300 bg-violet-50/40' : 'border-slate-200'}`}><button type="button" aria-expanded={active} disabled={!questions.length || Boolean(sendingQuestionId)} onClick={() => { setSelectedSkillId(active ? '' : recommendation.skill.id); setNotice(''); }} className="flex w-full items-start justify-between gap-2 text-left disabled:opacity-50"><span><span className="block text-xs font-semibold text-slate-900">{recommendation.skill.name}</span><span className="mt-1 block text-[10px] text-violet-600">{recommendation.skill.category} · 匹配度 {Math.round(recommendation.score * 100)}%</span></span><Sparkles className="h-4 w-4 shrink-0 text-violet-400" /></button><p className="mt-2 text-xs leading-5 text-slate-500">{recommendation.reason}</p>{!questions.length && <p className="mt-2 text-[11px] text-slate-400">该 Skill 暂无配置问题</p>}{active && questions.length > 0 && <ol className="mt-3 space-y-2">{questions.map((question) => {
          const textActionId = `${recommendation.skill.id}:${question.id}:text`;
          const formActionId = `${recommendation.skill.id}:${question.id}:form`;
          return <li key={question.id} className="flex items-center gap-2 rounded-lg border border-violet-100 bg-white px-3 py-2.5"><span className="min-w-0 flex-1"><span className="block break-words text-xs font-medium text-slate-800">{question.label}{question.required && <span className="ml-1 text-rose-500">*</span>}</span>{question.prompt && <span className="mt-1 block break-words text-[10px] leading-4 text-slate-500">{question.prompt}</span>}</span><button type="button" title="以文字发送问题" aria-label={`以文字发送问题：${question.label}`} disabled={!canRespond || Boolean(sendingQuestionId)} onClick={() => void sendQuestionText(recommendation, question)} className="shrink-0 rounded-lg p-2 text-violet-600 hover:bg-violet-50 disabled:opacity-40">{sendingQuestionId === textActionId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button><button type="button" title="发送单题表单" aria-label={`发送单题表单：${question.label}`} disabled={!canRespond || Boolean(sendingQuestionId)} onClick={() => void sendQuestionForm(recommendation, question)} className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40">{sendingQuestionId === formActionId ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}</button>
          </li>;
        })}</ol>}</div>;
      })}</div>{notice && <p role="status" className="mt-2 text-[11px] text-slate-500">{notice}</p>}</section>}
      {item.result.imageQuery && <section><div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-slate-700">参考图片</p><span className="text-[10px] text-slate-400">Openverse · {images.length ? `${images.length} 张` : '暂无匹配'}</span></div><p className="mt-1 text-[11px] text-slate-500">搜索词：{item.result.imageQuery}</p>{images.length > 0 && <><ReferenceGrid images={images} selected={selected} onToggle={(id) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < 4 ? [...current, id] : current)} /><div className="mt-2 flex justify-end"><button type="button" disabled={!canRespond || !selected.length} onClick={() => void sendSelected()} className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">发送已选 {selected.length} 张</button></div></>}</section>}
    </div>}
  </article>;
}

export function DesignSkillAssistant({ conversationId, messages, currentUserId, brandUserIds, intakeMode, onSend, onSendText, onFormSent, canRespond = true }: {
  conversationId: string; messages: Message[]; currentUserId?: string; brandUserIds: string[]; intakeMode: boolean; onSend: SendCard; onSendText: (text: string) => Promise<boolean | undefined>; onFormSent: () => void; canRespond?: boolean;
}) {
  const [recognitions, setRecognitions] = useState<RecognitionItem[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedSearchResults, setSelectedSearchResults] = useState<string[]>([]);
  const seenMessagesRef = useRef<{ key: string; ids: Set<string> }>({ key: '', ids: new Set() });
  const analyzedMessagesRef = useRef(new Set<string>());
  const requestQueueRef = useRef(Promise.resolve());
  const brandIds = useMemo(() => new Set(brandUserIds.filter(Boolean)), [brandUserIds.join('|')]);

  const latestAnsweredFormId = useMemo(() => {
    const sentForms = new Map<string, Message>();
    for (const message of messages) {
      const card = parseChatCard(message.body);
      if (card?.kind === 'work_card' && card.templateId === 'design_skill_intake' && !brandIds.has(message.senderId)) sentForms.set(message.id, message);
    }
    for (const message of [...messages].reverse()) {
      if (!brandIds.has(message.senderId)) continue;
      const card = parseChatCard(message.body);
      if (card?.kind === 'form_answers' && sentForms.has(card.formMessageId)) return card.formMessageId;
    }
    return '';
  }, [messages, brandIds]);

  useEffect(() => {
    if (!messages.length || !brandIds.size) return;
    const key = `${intakeMode ? 'intake' : 'order'}:${conversationId}`;
    const isNewConversation = seenMessagesRef.current.key !== key;
    if (isNewConversation) {
      const latestBrandMessage = [...messages].reverse().find((message) => brandIds.has(message.senderId) && message.senderId !== currentUserId);
      seenMessagesRef.current = { key, ids: new Set() };
      for (const message of messages) seenMessagesRef.current.ids.add(message.id);
      if (latestBrandMessage) seenMessagesRef.current.ids.delete(latestBrandMessage.id);
      analyzedMessagesRef.current.clear();
      requestQueueRef.current = Promise.resolve();
      setRecognitions([]);
    }

    const newBrandMessages = messages.filter((message) => {
      if (seenMessagesRef.current.ids.has(message.id)) return false;
      seenMessagesRef.current.ids.add(message.id);
      return brandIds.has(message.senderId) && message.senderId !== currentUserId;
    });
    for (const message of newBrandMessages) {
      if (analyzedMessagesRef.current.has(message.id)) continue;
      analyzedMessagesRef.current.add(message.id);
      setRecognitions((items) => [...items, { message, busy: true }]);
      requestQueueRef.current = requestQueueRef.current.then(async () => {
        try {
          let data: { status: 'processing' | 'complete' | 'failed'; result?: Recognition | null; error?: string };
          let attempts = 0;
          do {
            if (attempts) await new Promise((resolve) => window.setTimeout(resolve, 1000));
            data = await post('/chat/design-skills/recognize-message', {
              conversationType: intakeMode ? 'intake' : 'order', conversationId, messageId: message.id,
            });
            attempts += 1;
          } while (data.status === 'processing' && attempts < 35);
          if (data.status === 'complete' && data.result) {
            setRecognitions((items) => items.map((item) => item.message.id === message.id ? { ...item, busy: false, result: data.result! } : item));
          } else {
            const error = data.status === 'processing' ? '识别仍在处理中，请稍后刷新' : data.error || '消息识别失败';
            setRecognitions((items) => items.map((item) => item.message.id === message.id ? { ...item, busy: false, error } : item));
          }
        } catch (error) {
          setRecognitions((items) => items.map((item) => item.message.id === message.id ? { ...item, busy: false, error: error instanceof Error ? error.message : '消息识别失败' } : item));
        }
      });
    }
  }, [messages, brandIds, currentUserId, conversationId, intakeMode]);

  const sendQuestionForm = async (recommendation: Recommendation, question: DesignSkill['questions'][number]) => {
    const card = makeQuestionCard(recommendation.skill, question);
    const sent = await onSend(card);
    if (sent === false) throw new Error('单题表单发送失败，请检查会话状态');
    onFormSent();
  };

  const sendQuestionText = async (text: string) => {
    const sent = await onSendText(text);
    if (sent === false) throw new Error('问题发送失败，请检查会话状态');
    onFormSent();
  };

  const latestRecognition = recognitions[recognitions.length - 1];
  const latestRecommendationMessageId = latestRecognition && !latestRecognition.busy && latestRecognition.result ? latestRecognition.message.id : '';

  const sendReferences = async (images: SearchResult[], searchQuery: string) => {
    const references = images.slice(0, 4).map(({ id, title, thumbnailUrl, sourceUrl, creator, creatorUrl, provider, license, licenseVersion, licenseUrl }) => ({
      id, title, thumbnailUrl, sourceUrl, creator, ...(creatorUrl ? { creatorUrl } : {}), provider, license, ...(licenseVersion ? { licenseVersion } : {}), ...(licenseUrl ? { licenseUrl } : {}),
    }));
    if (!references.length) return;
    const card: Extract<ChatCard, { kind: 'style_reference_set' }> = { kind: 'style_reference_set', title: '风格参考图片', query: searchQuery.slice(0, 220), references };
    if (JSON.stringify(card).length > 7400) { setNotice('所选图片信息过长，请减少到 1–2 张后再发送。'); return; }
    setSending(true);
    try {
      const sent = await onSend(card);
      if (sent === false) throw new Error('发送失败，请检查会话状态');
      onFormSent(); setNotice('已将参考图片发送到会话。'); setSearchResults([]); setSelectedSearchResults([]);
    } catch (error) { setNotice(error instanceof Error ? error.message : '发送失败'); }
    finally { setSending(false); }
  };

  const searchImages = async () => {
    if (!latestAnsweredFormId) return;
    setSearchBusy(true); setNotice(''); setSearchResults([]); setSelectedSearchResults([]);
    try {
      const data = await post<{ query: string; provider: string; results: SearchResult[] }>('/chat/design-skills/search-images', {
        conversationType: intakeMode ? 'intake' : 'order', conversationId, formMessageId: latestAnsweredFormId, ...(query.trim() ? { query: query.trim() } : {}),
      });
      setQuery(data.query); setSearchResults(data.results || []);
      setNotice(data.results?.length ? `已从 ${data.provider} 找到 ${data.results.length} 张图片。` : '没有找到匹配图片，可修改搜索词后重试。');
    } catch (error) { setNotice(error instanceof Error ? error.message : '图片搜索失败'); }
    finally { setSearchBusy(false); }
  };

  return <div className="space-y-3" aria-live="polite">
    {recognitions.map((item) => <RecognitionCard key={item.message.id} item={item} canRespond={canRespond} showRecommendations={item.message.id === latestRecommendationMessageId} onSendQuestion={sendQuestionForm} onSendText={sendQuestionText} onSendReferences={sendReferences} />)}
    {latestAnsweredFormId && <details className="mx-auto w-full max-w-[680px] rounded-xl border border-slate-200 bg-white p-3"><summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-semibold text-slate-600"><Image className="h-4 w-4 text-indigo-500" />按已提交的 Skill 表单搜索更多参考图</summary><div className="mt-3 flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={220} placeholder="可修改自动生成的搜索词" className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-400" /><button type="button" onClick={() => void searchImages()} disabled={!canRespond || searchBusy} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{searchBusy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{searchBusy ? '搜索中' : '搜索'}</button></div>{searchResults.length > 0 && <><ReferenceGrid images={searchResults} selected={selectedSearchResults} onToggle={(id) => setSelectedSearchResults((current) => current.includes(id) ? current.filter((value) => value !== id) : current.length < 4 ? [...current, id] : current)} /><div className="mt-2 flex justify-end"><button type="button" disabled={!canRespond || !selectedSearchResults.length || sending} onClick={() => void sendReferences(searchResults.filter((item) => selectedSearchResults.includes(item.id)), query)} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{sending ? '发送中…' : `发送已选 ${selectedSearchResults.length} 张`}</button></div></>}{notice && <p role="status" className="mt-2 text-xs text-slate-500">{notice}</p>}</details>}
  </div>;
}
