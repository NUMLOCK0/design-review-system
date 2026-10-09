'use client';

import { useState } from 'react';
import type { ChatCard } from '@/lib/chat-cards';

type Choice = Extract<ChatCard, { kind: 'choice' }>;

export function ChoiceCardView({ card, answer, canAnswer, onAnswer }: {
  card: Choice;
  answer?: { optionId: string; optionLabel: string };
  canAnswer: boolean;
  onAnswer: (option: Choice['options'][number], note: string) => Promise<unknown>;
}) {
  const [selected, setSelected] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  return <div className="w-full rounded-2xl border border-indigo-100 bg-white p-4 text-slate-800 shadow-sm">
    <p className="text-[11px] font-semibold text-indigo-600">{card.source === 'style' ? '八方向风格选择' : '组合发单选择题'}</p>
    <h3 className="mt-1 text-sm font-bold">{card.title}</h3>
    <p className="mt-2 text-xs leading-5 text-slate-500">{card.prompt}</p>
    <div className="mt-3 grid gap-2 sm:grid-cols-2">{card.options.map(option => <button key={option.id} type="button" disabled={!canAnswer || !!answer || busy || submitted} onClick={() => setSelected(option.id)} className={`rounded-xl border p-3 text-left text-xs disabled:cursor-default ${answer?.optionId === option.id ? 'border-emerald-400 bg-emerald-50' : selected === option.id ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-slate-50'}`}><span className="font-semibold">{option.label}</span>{option.detail && <span className="mt-1 block leading-5 text-slate-500">{option.detail}</span>}</button>)}</div>
    {answer ? <p className="mt-3 text-xs font-semibold text-emerald-700">品牌方已选择：{answer.optionLabel}</p> : submitted ? <p className="mt-3 text-xs text-indigo-600">选择已提交，等待服务器确认…</p> : canAnswer ? <div className="mt-3 space-y-2"><textarea value={note} onChange={event => setNote(event.target.value)} maxLength={500} rows={2} placeholder="可选：补充选择理由" className="w-full resize-none rounded-lg border p-2 text-xs" /><button type="button" disabled={!selected || busy} onClick={async () => { const option = card.options.find(item => item.id === selected); if (!option) return; setBusy(true); try { if (await onAnswer(option, note.trim())) setSubmitted(true); } finally { setBusy(false); } }} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">确认选择</button></div> : <p className="mt-3 text-xs text-slate-400">等待品牌方选择</p>}
  </div>;
}
