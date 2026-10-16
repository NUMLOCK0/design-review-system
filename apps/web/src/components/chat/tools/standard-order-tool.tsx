'use client';

import { useEffect, useState } from 'react';
import { FileInput } from 'lucide-react';
import { createOrderPresetDraft, DEFAULT_FORM_MOBILE_STYLE, ORDER_FORM_PRESETS, type FormTemplate } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { ToolDialog } from './tool-dialog';
import { ToolButton, createToolForm, primaryClass, sendQuestionChecklist, type SendCard } from './tool-ui';

const fallbackTemplates: FormTemplate[] = ORDER_FORM_PRESETS.map(preset => ({
  ...createOrderPresetDraft(preset), id: `preset_${preset.id}`, version: 1, publishedVersion: 1, status: 'published',
}));
const displayFields = (template: FormTemplate) => template.fields.filter(field => !['section', 'divider', 'paragraph'].includes(field.kind));

export function StandardOrderTool({ orderId, onSent, intakeMode = false, onSend }: { orderId: string; onSent: () => void; intakeMode?: boolean; onSend: SendCard }) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<FormTemplate[]>(fallbackTemplates);
  const [selected, setSelected] = useState(fallbackTemplates[0].id);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const template = templates.find(item => item.id === selected) || templates[0];
  const questions = template ? displayFields(template).map(field => ({
    label: `${template.name} · ${field.label}`,
    options: field.kind === 'select' || field.kind === 'radio' || field.kind === 'checkbox' ? (field.options || []).map(option => option.label) : field.presets || [],
    ...(field.kind === 'image' ? { kind: 'image' as const } : {}),
    schema: { ...field, label: `${template.name} · ${field.label}` },
  })) : [];

  useEffect(() => {
    let active = true;
    setLoading(true);
    void fetchWithAuth('/form-templates/published?target=order').then(async response => {
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '加载已发布表单失败');
      if (active && Array.isArray(result.data) && result.data.length) {
        const published = result.data as FormTemplate[];
        setTemplates(published);
        setSelected(current => published.some(item => item.id === current) ? current : published[0].id);
      }
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '加载已发布表单失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const send = async () => {
    if (!template || busy) return;
    setBusy(true); setError('');
    try {
      if (intakeMode) {
        const sent = await sendQuestionChecklist(`${template.name}需求收集清单`, questions, onSend, template.mobileStyle || DEFAULT_FORM_MOBILE_STYLE);
        if (!sent) return;
      } else {
        await createToolForm(orderId, 'published', { templateId: template.id, templateVersion: template.publishedVersion || template.version });
        onSent();
      }
      setOpen(false);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '发送失败'); }
    finally { setBusy(false); }
  };

  return <><ToolButton icon={FileInput} label="标准发单" description="使用后台发布的标准表单发单" onClick={() => setOpen(true)} />{open && <ToolDialog title="标准发单" description={intakeMode ? '选择管理员发布的表单，将需求项发送为当前会话协作清单。' : '选择管理员发布的标准表单；品牌方可在当前订单中填写、保存和提交。'} onClose={() => setOpen(false)} footer={<div className="flex items-center justify-between gap-3"><p role={error ? 'alert' : undefined} className="max-w-[65%] truncate text-xs text-rose-600">{error || (intakeMode && questions.length > 24 ? '该表单超过邀请会话清单的 24 项限制' : '')}</p><button type="button" disabled={busy || loading || !template || (intakeMode && (questions.length === 0 || questions.length > 24))} onClick={() => void send()} className={primaryClass}>{busy ? '发送中…' : intakeMode ? '发送协作清单' : '发送填写表单'}</button></div>}><div className="grid gap-4 md:grid-cols-[220px_1fr]"><div className="max-h-96 space-y-1 overflow-y-auto">{templates.map(item => <button key={item.id} type="button" onClick={() => setSelected(item.id)} className={`w-full rounded-lg px-3 py-2 text-left text-xs ${selected === item.id ? 'bg-indigo-50 font-bold text-indigo-700' : 'hover:bg-slate-50'}`}><span className="block">{item.name}</span><span className="mt-1 block text-[10px] font-normal text-slate-400">{item.category || '订单表单'} · {displayFields(item).length} 项</span></button>)}</div><div className="min-w-0">{loading ? <p className="text-sm text-slate-500">正在读取已发布表单…</p> : template ? <><h3 className="text-sm font-bold">{template.name}</h3><p className="mt-1 text-xs text-slate-500">{template.description}</p><div className="mt-4 max-h-72 space-y-3 overflow-y-auto">{template.fields.map(field => field.kind === 'section' ? <p key={field.id} className="border-t pt-2 text-xs font-semibold text-slate-700">{field.label}</p> : !['divider', 'paragraph'].includes(field.kind) ? <p key={field.id} className="text-xs text-slate-500">{field.label}{field.required ? ' · 必填' : ''}</p> : null)}</div></> : <p className="text-sm text-slate-500">没有可用的已发布表单</p>}</div></div></ToolDialog>}</>;
}
