'use client';

import { useEffect, useState } from 'react';
import { Check, Puzzle } from 'lucide-react';
import { createOrderPresetDraft, DEFAULT_FORM_MOBILE_STYLE, FORM_FIELD_KINDS, ORDER_FORM_PRESETS, type FormField, type FormMobileStyle, type FormTemplate } from '@design-review/shared';
import { getCurrentUser, fetchWithAuth } from '@/lib/auth';
import { ToolDialog } from './tool-dialog';
import { createToolForm, primaryClass, sendQuestionChecklist, type SendCard } from './tool-ui';

type SavedCombo = { id: string; name: string; selections: Record<string, string[]> };
type Selection = { templateId: string; templateVersion: number; fieldKeys: string[] };
type TemplateGroup = { title: string; fields: FormField[] };
const fallbackTemplates: FormTemplate[] = ORDER_FORM_PRESETS.map(preset => ({
  ...createOrderPresetDraft(preset), id: `preset_${preset.id}`, version: 1, publishedVersion: 1, status: 'published',
}));
const isQuestion = (field: FormField) => !['section', 'divider', 'paragraph'].includes(field.kind);
const fieldKindLabel = (field: FormField) => FORM_FIELD_KINDS.find(item => item.kind === field.kind)?.label || field.kind;

function RepeatChildrenPreview({ fields }: { fields: FormField[] }) {
  return <span className="mt-2 block rounded-lg border border-indigo-100 bg-white/80 px-2.5 py-2">
    <span className="block text-[10px] font-semibold text-indigo-600">包含的子字段</span>
    {fields.length ? <span className="mt-1.5 block space-y-1.5">{fields.map((child, index) => <span key={`${child.id}-${index}`} className="block border-l-2 border-indigo-100 pl-2 text-[11px] leading-4 text-slate-600">
      <span className="font-medium text-slate-700">{child.label}</span>
      {child.required && <span className="ml-1 text-rose-500">必填</span>}
      <span className="ml-1.5 text-slate-400">{fieldKindLabel(child)}</span>
      {child.help && <span className="mt-0.5 block text-slate-400">{child.help}</span>}
      {!!(child.options?.length || child.presets?.length) && <span className="mt-0.5 block text-slate-400">可选：{(child.options?.map(option => option.label) || child.presets || []).join('、')}</span>}
      {child.kind === 'repeat' && <RepeatChildrenPreview fields={child.children || []} />}
    </span>)}</span> : <span className="mt-1 block text-[10px] text-amber-600">尚未配置子字段</span>}
  </span>;
}

function groupsFor(template: FormTemplate): TemplateGroup[] {
  const groups: TemplateGroup[] = [];
  let current: TemplateGroup = { title: template.name, fields: [] };
  for (const field of template.fields) {
    if (field.kind === 'section') {
      if (current.fields.length) groups.push(current);
      current = { title: field.label, fields: [] };
    } else if (isQuestion(field)) current.fields.push(field);
  }
  if (current.fields.length) groups.push(current);
  return groups;
}

function sanitizeSelections(value: unknown, templates: FormTemplate[], maxCount: number): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const input = value as Record<string, unknown>;
  const result: Record<string, string[]> = {};
  let remaining = maxCount;
  for (const template of templates) {
    if (remaining <= 0) break;
    const raw = input[template.id] ?? (template.presetId ? input[template.presetId] : undefined);
    if (!Array.isArray(raw)) continue;
    const allowed = new Set(template.fields.filter(isQuestion).map(field => field.key));
    const keys = [...new Set(raw.filter((key): key is string => typeof key === 'string' && allowed.has(key)))].slice(0, remaining);
    if (keys.length) { result[template.id] = keys; remaining -= keys.length; }
  }
  return result;
}

export function ChoiceComboDialog({ orderId, onClose, onSent, intakeMode = false, onSend }: { orderId: string; onClose: () => void; onSent: () => void; intakeMode?: boolean; onSend: SendCard }) {
  const [templates, setTemplates] = useState<FormTemplate[]>(fallbackTemplates);
  const [category, setCategory] = useState(fallbackTemplates[0].id);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<SavedCombo[]>([]);
  const [templateName, setTemplateName] = useState('');
  const storageKey = `chat-combo-templates:${getCurrentUser()?.id || 'guest'}`;
  const selectionLimit = intakeMode ? 24 : 80;

  useEffect(() => {
    let active = true;
    let rawSaved: SavedCombo[] = [];
    try {
      const value: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
      if (Array.isArray(value)) rawSaved = value.filter(item => typeof item?.id === 'string' && typeof item?.name === 'string' && item?.selections && typeof item.selections === 'object').slice(0, 20);
    } catch { rawSaved = []; }
    void fetchWithAuth('/form-templates/published?target=order').then(async response => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '加载管理员表单失败');
      if (!active) return;
      const configured = Array.isArray(result.data) && result.data.length ? result.data as FormTemplate[] : fallbackTemplates;
      setTemplates(configured);
      setCategory(current => configured.some(item => item.id === current) ? current : configured[0].id);
      setSelected(current => sanitizeSelections(current, configured, selectionLimit));
      setSaved(rawSaved.map(item => ({ ...item, selections: sanitizeSelections(item.selections, configured, selectionLimit) })).filter(item => Object.values(item.selections).some(keys => keys.length)));
    }).catch(cause => {
      if (!active) return;
      setTemplates(fallbackTemplates);
      setSelected(current => sanitizeSelections(current, fallbackTemplates, selectionLimit));
      setSaved(rawSaved.map(item => ({ ...item, selections: sanitizeSelections(item.selections, fallbackTemplates, selectionLimit) })).filter(item => Object.values(item.selections).some(keys => keys.length)));
      setError(cause instanceof Error ? cause.message : '加载管理员表单失败');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [storageKey, selectionLimit]);

  const template = templates.find(item => item.id === category) || templates[0];
  const groups = template ? groupsFor(template) : [];
  const count = Object.values(selected).reduce((sum, keys) => sum + keys.length, 0);

  const toggle = (templateId: string, key: string) => {
    const keys = selected[templateId] || [];
    if (keys.includes(key)) {
      setError('');
      setSelected(current => ({ ...current, [templateId]: (current[templateId] || []).filter(item => item !== key) }));
      return;
    }
    if (count >= selectionLimit) { setError(`最多选择 ${selectionLimit} 题，请先取消部分问题`); return; }
    setError('');
    setSelected(current => ({ ...current, [templateId]: [...(current[templateId] || []), key] }));
  };

  const setCurrentCategory = (include: boolean) => {
    if (!template) return;
    const otherCount = Object.entries(selected).reduce((sum, [id, keys]) => sum + (id === template.id ? 0 : keys.length), 0);
    const allKeys = template.fields.filter(isQuestion).map(field => field.key);
    const available = Math.max(0, selectionLimit - otherCount);
    if (include && allKeys.length > available) setError(`当前表单还有 ${available} 项可选，已按上限选择`);
    else setError('');
    const existing = selected[template.id] || [];
    const bounded = [...existing, ...allKeys.filter(key => !existing.includes(key))].slice(0, available);
    setSelected(current => ({ ...current, [template.id]: include ? bounded : [] }));
  };

  const send = async () => {
    if (!template || !count || count > selectionLimit) { setError(`请选择 1 至 ${selectionLimit} 题`); return; }
    const selections: Selection[] = Object.entries(selected).filter(([, fieldKeys]) => fieldKeys.length).map(([templateId, fieldKeys]) => {
      const source = templates.find(item => item.id === templateId)!;
      return { templateId, templateVersion: source.publishedVersion || source.version, fieldKeys };
    });
    setBusy(true); setError('');
    try {
      if (intakeMode) {
        const questions = selections.flatMap(selection => {
          const source = templates.find(item => item.id === selection.templateId)!;
          return source.fields.filter(field => selection.fieldKeys.includes(field.key) && isQuestion(field)).map(field => ({
            label: `${source.name} · ${field.label}`,
            options: field.options?.map(option => option.label) || field.presets || [],
            ...(field.kind === 'image' ? { kind: 'image' as const } : {}),
            schema: { ...field, key: `${source.id}_${field.key}`, label: `${source.name} · ${field.label}`, condition: field.condition ? { ...field.condition, fieldKey: `${source.id}_${field.condition.fieldKey}` } : undefined },
          }));
        });
        const selectedStyles = [...new Set(selections.map(selection => templates.find(item => item.id === selection.templateId)?.mobileStyle || DEFAULT_FORM_MOBILE_STYLE))];
        const mobileStyle: FormMobileStyle = selectedStyles.length === 1 ? selectedStyles[0] : DEFAULT_FORM_MOBILE_STYLE;
        const sent = await sendQuestionChecklist('组合需求收集清单', questions, onSend, mobileStyle);
        if (!sent) return;
      } else {
        await createToolForm(orderId, 'composed', { selections });
        onSent();
      }
      onClose();
    } catch (cause) { setError(cause instanceof Error ? cause.message : '发送失败'); }
    finally { setBusy(false); }
  };

  const saveTemplate = () => {
    if (!templateName.trim() || !count) { setError('请填写模板名称并选择问题'); return; }
    if (saved.length >= 20) { setError('最多保存 20 个自建模板，请先删除不常用模板'); return; }
    const next = [...saved, { id: crypto.randomUUID(), name: templateName.trim().slice(0, 40), selections: sanitizeSelections(selected, templates, selectionLimit) }];
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setSaved(next); setTemplateName(''); setError(''); }
    catch { setError('本地存储不可用，模板未保存'); }
  };

  const removeTemplate = (id: string) => {
    const next = saved.filter(item => item.id !== id);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setSaved(next); }
    catch { setError('本地存储不可用，无法删除'); }
  };

  return <ToolDialog title="组合发单" description={intakeMode ? '从管理员发布的表单中选择问题，组合成当前会话的协作清单。' : '从管理员发布的标准表单中挑选问题，组合为一张可填写的需求表单。'} onClose={onClose} footer={
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 text-xs"><span className="font-semibold text-slate-700">已选 {count} 题</span>{error && <p role="alert" className="mt-1 truncate text-rose-600">{error}</p>}</div>
      <button type="button" disabled={busy || loading || !count || count > selectionLimit} onClick={() => void send()} className={primaryClass}>{busy ? '发送中…' : intakeMode ? '发送协作清单' : '发送组合表单'}</button>
    </div>
  }>
    <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="max-h-64 space-y-1 overflow-y-auto md:max-h-[min(56vh,520px)] md:border-r md:border-slate-100 md:pr-3">
        {saved.length > 0 && <section className="mb-3 rounded-xl bg-indigo-50/60 p-2.5"><p className="mb-1.5 px-1 text-[11px] font-bold text-indigo-700">我的自建模板</p>{saved.map(item => <div key={item.id} className="flex items-center gap-1"><button type="button" onClick={() => { setSelected(sanitizeSelections(item.selections, templates, selectionLimit)); setError(''); }} className="min-w-0 flex-1 truncate rounded-lg px-2 py-2 text-left text-xs text-slate-700 hover:bg-white">{item.name}</button><button type="button" onClick={() => removeTemplate(item.id)} aria-label={`删除模板 ${item.name}`} className="rounded-md px-2 py-1 text-slate-400 hover:bg-white hover:text-rose-500">×</button></div>)}</section>}
        <p className="px-2 pb-1 text-[11px] font-semibold text-slate-400">管理员发布的表单</p>
        {templates.map(item => <button key={item.id} type="button" onClick={() => setCategory(item.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left text-xs transition ${category === item.id ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}><span className="min-w-0 truncate">{item.name}</span><span className={`ml-2 min-w-5 rounded-full px-1.5 py-0.5 text-center text-[10px] ${selected[item.id]?.length ? 'bg-indigo-100 text-indigo-700' : 'text-slate-400'}`}>{selected[item.id]?.length || ''}</span></button>)}
      </aside>
      <section className="min-h-56 min-w-0">
        {loading ? <p className="text-sm text-slate-500">正在读取管理员表单…</p> : template ? <>
          <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-[11px] font-medium text-slate-400">选择需要填写的问题</p><h3 className="mt-0.5 text-sm font-bold text-slate-800">{template.name}</h3></div><div className="flex shrink-0 items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] text-slate-500">{template.fields.filter(isQuestion).length} 项</span><button type="button" onClick={() => setCurrentCategory(true)} className="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800">全选</button><button type="button" onClick={() => setCurrentCategory(false)} className="text-[10px] font-semibold text-slate-500 hover:text-slate-700">清空</button></div></div>
          <div className="max-h-64 space-y-4 overflow-y-auto pr-1 md:max-h-[min(56vh,520px)]">{groups.map(group => <div key={group.title}><p className="mb-2 text-[11px] font-semibold text-slate-500">{group.title}</p><div className="space-y-1.5">{group.fields.map(field => {
            const checked = (selected[template.id] || []).includes(field.key);
            const options = field.options?.map(option => option.label) || field.presets || [];
            return <label key={field.id} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-xs transition ${checked ? 'border-indigo-200 bg-indigo-50/50' : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50/60'}`}><span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 bg-white'}`}>{checked && <Check className="h-3 w-3" />}</span><input type="checkbox" checked={checked} onChange={() => toggle(template.id, field.key)} className="sr-only" /><span className="min-w-0 flex-1"><span className="block leading-5 text-slate-700">{field.label}{field.required && <span className="ml-1 text-rose-500">必填</span>}<span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{fieldKindLabel(field)}</span></span>{options.length > 0 && <span className="mt-2 flex flex-wrap gap-1.5">{options.map(option => <span key={option} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] leading-4 text-slate-600">{option}</span>)}</span>}{field.kind === 'repeat' && <RepeatChildrenPreview fields={field.children || []} />}</span></label>;
          })}</div></div>)}</div>
        </> : <p className="text-sm text-slate-500">当前没有已发布的可组合问题。</p>}
      </section>
    </div>
    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400"><span>{Object.values(selected).filter(keys => keys.length).length} 个表单来源</span><span>最多 {selectionLimit} 题</span></div>
    <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-4 sm:flex-row"><input value={templateName} onChange={event => setTemplateName(event.target.value)} maxLength={40} placeholder="输入名称，保存为自建模板" className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-xs outline-none transition focus:border-indigo-300 focus:ring-2 focus:ring-indigo-50" /><button type="button" onClick={saveTemplate} disabled={!count} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-indigo-100 px-3 py-2.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-50 disabled:opacity-40"><Puzzle className="h-3.5 w-3.5" />保存当前组合</button></div>
  </ToolDialog>;
}
