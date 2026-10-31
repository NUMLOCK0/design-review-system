'use client';

import { useState } from 'react';
import { normalizeDesignChoiceQuestion, type DesignChoiceQuestion } from '@design-review/shared';

export function DesignQuestionChoiceField({ question, value, onChange, disabled = false, accent = 'violet', mode = 'brand' }: {
  question: DesignChoiceQuestion; value: string; onChange: (value: string) => void;
  disabled?: boolean; accent?: 'violet' | 'amber'; mode?: 'brand' | 'product';
}) {
  const { options, recommendation } = normalizeDesignChoiceQuestion(question, mode);
  const [otherSelected, setOtherSelected] = useState(false);
  const [otherDraft, setOtherDraft] = useState(options.includes(value) ? '' : value);
  const isCustomValue = Boolean(value) && !options.includes(value);
  const showCustom = otherSelected || isCustomValue;
  const selectedClasses = accent === 'amber' ? 'border-amber-500 bg-amber-50 text-amber-900 ring-1 ring-amber-200' : 'border-violet-500 bg-violet-50 text-violet-900 ring-1 ring-violet-200';
  const buttonClasses = (selected: boolean) => `min-h-9 rounded-lg border px-3 py-2 text-left text-xs font-normal leading-5 transition disabled:cursor-not-allowed disabled:opacity-60 ${selected ? selectedClasses : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300'}`;
  return <div className="mt-2 space-y-2">
    <div className="flex flex-wrap gap-2" role="group" aria-label={`${question.label}推荐选项`}>
      {options.map((option) => <button key={option} type="button" aria-pressed={!showCustom && value === option} disabled={disabled}
        onClick={() => { if (isCustomValue) setOtherDraft(value); setOtherSelected(false); onChange(option); }}
        className={buttonClasses(!showCustom && value === option)}>{option}{option === recommendation && <span className="ml-1.5 text-[10px] text-violet-600">推荐</span>}</button>)}
      <button type="button" aria-pressed={showCustom} disabled={disabled} onClick={() => { setOtherSelected(true); onChange(isCustomValue ? value : otherDraft); }}
        className={buttonClasses(showCustom)}>其他</button>
    </div>
    {showCustom && <label className="block text-xs font-normal text-slate-500">其他想法
      <textarea aria-label={`${question.label}自定义答案`} value={value} disabled={disabled} maxLength={1000} rows={2}
        onChange={(event) => { setOtherDraft(event.target.value); onChange(event.target.value); }} placeholder="请输入你的具体想法"
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-violet-400 disabled:bg-slate-50" />
    </label>}
  </div>;
}
