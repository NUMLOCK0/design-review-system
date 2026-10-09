'use client';

import { useEffect, useState } from 'react';
import { Check, Puzzle } from 'lucide-react';
import { ORDER_FORM_PRESETS } from '@design-review/shared';
import { getCurrentUser } from '@/lib/auth';
import { ToolDialog } from './tool-dialog';
import { createToolForm, primaryClass } from './tool-ui';

type SavedCombo = { id: string; name: string; selections: Record<string, string[]> };

export function ChoiceComboDialog({ orderId, onClose, onSent }: { orderId: string; onClose: () => void; onSent: () => void }) {
  const [category, setCategory] = useState(ORDER_FORM_PRESETS[0].id);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<SavedCombo[]>([]);
  const [templateName, setTemplateName] = useState('');
  const storageKey = `chat-combo-templates:${getCurrentUser()?.id || 'guest'}`;

  useEffect(() => {
    try {
      const value: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
      setSaved(Array.isArray(value) ? value.filter(item => typeof item?.id === 'string' && typeof item?.name === 'string' && item?.selections && typeof item.selections === 'object') : []);
    } catch { setSaved([]); }
  }, [storageKey]);

  const preset = ORDER_FORM_PRESETS.find(item => item.id === category)!;
  const count = Object.values(selected).reduce((sum, keys) => sum + keys.length, 0);
  const toggle = (presetId: string, key: string) => setSelected(current => {
    const keys = current[presetId] || [];
    return { ...current, [presetId]: keys.includes(key) ? keys.filter(item => item !== key) : [...keys, key] };
  });

  const send = async () => {
    const selections = Object.entries(selected).filter(([, fieldKeys]) => fieldKeys.length).map(([presetId, fieldKeys]) => ({ presetId, fieldKeys }));
    if (!selections.length) { setError('请至少勾选一道问题'); return; }
    setBusy(true); setError('');
    try { await createToolForm(orderId, 'composed', { selections }); onClose(); onSent(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '发送失败'); }
    finally { setBusy(false); }
  };

  const saveTemplate = () => {
    if (!templateName.trim() || !count) { setError('请填写模板名称并选择问题'); return; }
    const next = [...saved, { id: crypto.randomUUID(), name: templateName.trim().slice(0, 40), selections: selected }];
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setSaved(next); setTemplateName(''); setError(''); }
    catch { setError('本地存储不可用，模板未保存'); }
  };

  const removeTemplate = (id: string) => {
    const next = saved.filter(item => item.id !== id);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setSaved(next); }
    catch { setError('本地存储不可用，无法删除'); }
  };

  return <ToolDialog title="组合发单" description="从不同业务类型中挑选问题，组合成一张品牌方可填写的需求表单。" onClose={onClose} footer={
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 text-xs"><span className="font-semibold text-slate-700">已选 {count} 题</span>{error && <p role="alert" className="mt-1 truncate text-rose-600">{error}</p>}</div>
      <button type="button" disabled={busy || !count || count > 80} onClick={() => void send()} className={primaryClass}>{busy ? '发送中…' : '发送组合表单'}</button>
    </div>
  }>
    <div className="grid gap-4 md:grid-cols-[190px_minmax(0,1fr)]">
      <aside className="max-h-64 space-y-1 overflow-y-auto md:max-h-[min(56vh,520px)] md:border-r md:border-slate-100 md:pr-3">
        {saved.length > 0 && <section className="mb-3 rounded-xl bg-indigo-50/60 p-2.5">
          <p className="mb-1.5 px-1 text-[11px] font-bold text-indigo-700">我的自建模板</p>
          {saved.map(item => <div key={item.id} className="flex items-center gap-1">
            <button type="button" onClick={() => setSelected(item.selections)} className="min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-left text-xs text-slate-700 hover:bg-white">{item.name}</button>
            <button type="button" onClick={() => removeTemplate(item.id)} aria-label={`删除模板 ${item.name}`} className="rounded-md px-2 py-1 text-slate-400 hover:bg-white hover:text-rose-500">×</button>
          </div>)}
        </section>}
        <p className="px-2 pb-1 text-[11px] font-semibold text-slate-400">业务类别</p>
        {ORDER_FORM_PRESETS.map(item => <button key={item.id} type="button" onClick={() => setCategory(item.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs transition ${category === item.id ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
          <span>{item.name}</span><span className={`min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] ${selected[item.id]?.length ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400'}`}>{selected[item.id]?.length || ''}</span>
        </button>)}
      </aside>

      <section className="min-h-56 min-w-0">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><p className="text-[11px] font-medium text-slate-400">选择需要品牌方填写的问题</p><h3 className="mt-0.5 text-sm font-bold text-slate-800">{preset.name}</h3></div>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-500">{preset.sections.reduce((sum, section) => sum + section.fields.length, 0)} 个问题</span>
        </div>
        <div className="max-h-64 space-y-4 overflow-y-auto pr-1 md:max-h-[min(56vh,520px)]">
          {preset.sections.map(section => <div key={section.title}>
            <p className="mb-2 text-[11px] font-semibold text-slate-500">{section.title}</p>
            <div className="space-y-1.5">{section.fields.map(field => {
              const checked = (selected[preset.id] || []).includes(field.key);
              return <label key={field.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-xs transition ${checked ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/60'}`}>
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>{checked && <Check className="h-3 w-3" />}</span>
                <input type="checkbox" checked={checked} onChange={() => toggle(preset.id, field.key)} className="sr-only" />
                <span className="min-w-0 leading-5 text-slate-700">{field.label}{field.required && <span className="ml-1 text-rose-500">必填</span>}</span>
              </label>;
            })}</div>
          </div>)}
        </div>
      </section>
    </div>

    <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row">
      <input value={templateName} onChange={event => setTemplateName(event.target.value)} maxLength={40} placeholder="输入名称，保存为自建模板" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50" />
      <button type="button" onClick={saveTemplate} disabled={!count} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-100 px-3 py-2.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-40"><Puzzle className="h-3.5 w-3.5" />保存当前组合</button>
    </div>
  </ToolDialog>;
}
