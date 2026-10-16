'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import { JsonForms, JsonFormsDispatch, withJsonFormsControlProps, withJsonFormsLayoutProps } from '@jsonforms/react';
import { rankWith, uiTypeIs, type ControlProps, type JsonSchema, type LayoutProps, type UISchemaElement } from '@jsonforms/core';
import { vanillaCells, vanillaRenderers } from '@jsonforms/vanilla-renderers';
import { buildFormSchema, type FormField, type FormFieldKind, type FormOption } from '@design-review/shared';
import { uploadFile } from '@/lib/upload';
import { AuthenticatedImage } from '@/components/authenticated-image';
import { toast } from 'sonner';

const span = (width: unknown) => Math.max(10, Math.min(100, Math.round(Number(width) || 100)));
const FileOpener = createContext<((url: string) => Promise<void>) | undefined>(undefined);

function PercentGrid({ uischema, schema, path, renderers, cells, visible, enabled }: LayoutProps) {
  if (!visible) return null;
  const children = (uischema as { elements?: UISchemaElement[] }).elements || [];
  const groups: Array<{ title?: string; help?: string; elements: UISchemaElement[] }> = [{ elements: [] }];
  for (const child of children) {
    const options = (child as { options?: { kind?: FormFieldKind; label?: string; help?: string } }).options;
    if (child.type === 'FormDecor' && options?.kind === 'section') groups.push({ title: options.label, help: options.help, elements: [] });
    else groups[groups.length - 1].elements.push(child);
  }
  return <div className="space-y-4">{groups.filter((group) => group.title || group.elements.length).map((group, groupIndex) => <section key={groupIndex} className={group.title ? 'rounded-xl border border-slate-200 bg-slate-50/70 p-4' : ''}>
    {group.title && <div className="mb-4 flex items-start gap-2"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" /><div><h3 className="text-sm font-bold text-slate-800">{group.title}</h3>{group.help && <p className="mt-1 text-xs text-slate-500">{group.help}</p>}</div></div>}
    <div className="form-preview-grid grid gap-y-5" style={{ gridTemplateColumns: 'repeat(100, minmax(0, 1fr))' }}>{group.elements.map((child, index) => <div key={`${child.type}-${index}`} className="min-w-0 pr-4" style={{ gridColumn: `span ${span((child as { options?: { widthPercent?: number } }).options?.widthPercent)} / span ${span((child as { options?: { widthPercent?: number } }).options?.widthPercent)}` }}><JsonFormsDispatch uischema={child} schema={schema} path={path} renderers={renderers} cells={cells} enabled={enabled} /></div>)}</div>
  </section>)}</div>;
}

function FormDecor({ uischema }: { uischema: UISchemaElement }) {
  const options = (uischema as { options?: { kind?: FormFieldKind; label?: string; help?: string } }).options || {};
  if (options.kind === 'divider') return <hr className="my-3 border-slate-200" />;
  if (options.kind === 'section') return <div className="border-b border-slate-200 pb-2"><h3 className="text-base font-bold text-slate-800">{options.label}</h3>{options.help && <p className="mt-1 text-xs text-slate-500">{options.help}</p>}</div>;
  return <p className="whitespace-pre-wrap text-sm leading-6 text-slate-500">{options.label}</p>;
}

function FieldControl(props: ControlProps) {
  const { data, handleChange, path, label, required, errors, enabled, visible, uischema, schema } = props;
  const options = (uischema as { options?: { kind?: FormFieldKind; placeholder?: string; choices?: FormOption[]; presets?: string[]; children?: FormField[]; required?: boolean; maxFiles?: number | null } }).options || {};
  const kind = options.kind || 'text';
  const choices = options.choices || [];
  const maxFiles = options.maxFiles === null ? null : options.maxFiles ?? 1;
  const [uploading, setUploading] = useState(false);
  const openFile = useContext(FileOpener);
  if (!visible) return null;
  const disabled = !enabled;
  const set = (value: unknown) => handleChange(path, value);
  const inputClass = 'h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-50';
  const upload = async (fileList?: FileList | null) => {
    const selected = Array.from(fileList || []);
    if (!selected.length) return;
    const current = Array.isArray(data) ? data.filter((value): value is string => typeof value === 'string') : typeof data === 'string' && data ? [data] : [];
    if (maxFiles !== null && (maxFiles === 1 ? selected.length > 1 : current.length + selected.length > maxFiles)) {
      toast.error(`最多上传 ${maxFiles} 个文件`); return;
    }
    setUploading(true);
    try {
      const added: string[] = [];
      for (const file of selected) {
        const result = await uploadFile(file, kind === 'image' ? 'order-reference-images' : 'order-materials');
        added.push(result.url);
        set(maxFiles === 1 ? result.url : [...current, ...added]);
      }
    } catch (error) { toast.error(error instanceof Error ? error.message : '上传失败'); }
    finally { setUploading(false); }
  };
  const body = (() => {
    if (kind === 'repeat') {
      const children = options.children || [];
      const childForm = buildFormSchema(children);
      const rows = Array.isArray(data) ? data as Record<string, unknown>[] : [];
      const min = Number(schema.minItems || 0);
      const max = Number(schema.maxItems || 10);
      return <div className="space-y-3">
        {rows.map((row, index) => <div key={index} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="mb-3 flex items-center justify-between"><span className="text-xs font-bold text-slate-600">第 {index + 1} 项</span><button type="button" disabled={disabled || rows.length <= min} onClick={() => set(rows.filter((_, i) => i !== index))} className="text-xs text-rose-600 disabled:opacity-40">删除</button></div>
          <JsonForms schema={childForm.schema as JsonSchema} uischema={childForm.uischema as unknown as UISchemaElement} data={row} readonly={disabled} renderers={renderers} cells={vanillaCells} onChange={({ data: next }) => set(rows.map((item, i) => i === index ? next : item))} />
        </div>)}
        <button type="button" disabled={disabled || rows.length >= max} onClick={() => set([...rows, {}])} className="rounded-xl border border-dashed border-blue-300 bg-blue-50 px-4 py-2 text-xs font-semibold text-blue-700 disabled:opacity-40">＋ 添加一项</button>
      </div>;
    }
    if (kind === 'image' || kind === 'file') {
      const files = Array.isArray(data) ? data.filter((value): value is string => typeof value === 'string') : typeof data === 'string' && data ? [data] : [];
      const canAdd = maxFiles === null || files.length < maxFiles || maxFiles === 1;
      return <div className="space-y-2">
        {!disabled && canAdd && <label className="flex min-h-20 cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 text-center text-xs text-slate-500 hover:border-blue-400">
          {uploading ? '上传中…' : maxFiles === 1 && files.length ? '重新上传' : kind === 'image' ? '点击上传图片' : '点击上传文件'}
          <input type="file" multiple={maxFiles !== 1} accept={kind === 'image' ? 'image/*' : undefined} disabled={disabled || uploading} className="sr-only" onChange={(event) => { void upload(event.target.files); event.target.value = ''; }} />
        </label>}
        <p className="text-[11px] text-slate-400">已上传 {files.length} 个{maxFiles === null ? ' · 不限制个数' : ` · 最多 ${maxFiles} 个`}</p>
        {files.map((url, index) => <div key={`${url}-${index}`} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-xs">
          {kind === 'image' && <AuthenticatedImage src={url} alt={`${label} ${index + 1}`} className="h-14 w-14 shrink-0 rounded object-cover" />}
          {kind === 'file' && openFile ? <button type="button" className="min-w-0 flex-1 truncate text-left text-emerald-700 underline" onClick={() => { void openFile(url).catch(error => toast.error(error.message)); }}>查看文件 {index + 1}</button> : <span className="min-w-0 flex-1 truncate text-slate-600">{kind === 'image' ? `图片 ${index + 1}` : `文件 ${index + 1}`}</span>}
          {!disabled && <button type="button" onClick={() => { const next = files.filter((_, fileIndex) => fileIndex !== index); set(maxFiles === 1 ? next[0] : next); }} className="shrink-0 text-rose-600">移除</button>}
        </div>)}
      </div>;
    }
    if (kind === 'textarea') return <textarea value={String(data ?? '')} disabled={disabled} placeholder={options.placeholder} rows={4} onChange={(event) => set(event.target.value)} className={`${inputClass} h-auto min-h-24 py-2.5`} />;
    if (kind === 'switch') return <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={Boolean(data)} disabled={disabled} onChange={(event) => set(event.target.checked)} className="h-4 w-4 accent-blue-600" />{data ? '已开启' : '未开启'}</label>;
    if (kind === 'checkbox') return <div className="flex flex-wrap gap-3">{choices.map((choice) => <label key={choice.value} className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={Array.isArray(data) && data.includes(choice.value)} disabled={disabled} onChange={(event) => { const current = Array.isArray(data) ? data as string[] : []; set(event.target.checked ? [...current, choice.value] : current.filter((item) => item !== choice.value)); }} className="h-4 w-4 accent-blue-600" />{choice.label}</label>)}</div>;
    if (kind === 'radio') return <div className="flex flex-wrap gap-3">{choices.map((choice) => <label key={choice.value} className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-slate-700"><input type="radio" name={path} checked={data === choice.value} disabled={disabled} onChange={() => set(choice.value)} className="h-4 w-4 accent-blue-600" />{choice.label}</label>)}</div>;
    if (kind === 'select') return <select value={String(data ?? '')} disabled={disabled} onChange={(event) => set(event.target.value || undefined)} className={inputClass}><option value="">请选择</option>{choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select>;
    const htmlType = ({ phone: 'tel', url: 'url', datetime: 'datetime-local' } as Record<string, string>)[kind] || kind;
    const value = kind === 'datetime' && typeof data === 'string' ? data.slice(0, 16) : data ?? '';
    return <input type={htmlType} value={value as string | number} disabled={disabled} placeholder={options.placeholder} min={schema.minimum} max={schema.maximum} onChange={(event) => {
      if (kind === 'number') set(event.target.value === '' ? undefined : Number(event.target.value));
      else if (kind === 'datetime') set(event.target.value ? new Date(event.target.value).toISOString() : undefined);
      else set(event.target.value || undefined);
    }} className={inputClass} />;
  })();
  return <div className="space-y-1.5"><label className="block text-xs font-semibold text-slate-700">{label}{(required || options.required) && <span className="ml-0.5 text-rose-500">*</span>}</label>{body}{options.presets?.length ? <div className="flex flex-wrap gap-1.5 pt-0.5">{options.presets.map((preset) => <button key={preset} type="button" disabled={disabled} onClick={() => { const choice = kind === 'select' ? choices.find((item) => item.label === preset || item.label.startsWith(preset)) : undefined; set(choice?.value || preset); }} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50">{preset}</button>)}</div> : null}{schema.description && <p className="text-xs text-slate-400">{schema.description}</p>}{errors && <p className="text-xs text-rose-600">{errors.includes('required property') ? '请填写该字段' : errors}</p>}</div>;
}

const renderers = [
  { tester: rankWith(20, uiTypeIs('PercentGrid')), renderer: withJsonFormsLayoutProps(PercentGrid) },
  { tester: rankWith(20, uiTypeIs('FormDecor')), renderer: FormDecor },
  { tester: rankWith(20, (ui) => ui.type === 'Control'), renderer: withJsonFormsControlProps(FieldControl) },
  ...vanillaRenderers,
];

export function FormPreview({ fields, onDataChange, initialData, readOnly = false, runtime = false, onOpenFile }: { fields: FormField[]; onDataChange?: (data: Record<string, unknown>) => void; initialData?: Record<string, unknown>; readOnly?: boolean; runtime?: boolean; onOpenFile?: (url: string) => Promise<void> }) {
  const [data, setData] = useState<Record<string, unknown>>(() => ({ ...Object.fromEntries(fields.filter((field) => field.defaultValue !== undefined).map((field) => [field.key, field.defaultValue])), ...initialData }));
  const [errors, setErrors] = useState<string[]>([]);
  const generated = useMemo(() => buildFormSchema(fields), [fields]);
  return <FileOpener.Provider value={onOpenFile}><div className="space-y-4">
    <JsonForms schema={generated.schema as JsonSchema} uischema={generated.uischema as unknown as UISchemaElement} data={data} readonly={readOnly} renderers={renderers} cells={vanillaCells} onChange={(event) => { setData(event.data || {}); setErrors((event.errors || []).map((item) => item.message || '校验失败')); onDataChange?.(event.data || {}); }} />
    {!readOnly && <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-500">实时校验：{errors.length ? `${errors.length} 项待修正` : '通过'}{!runtime && ' · 此处仅预览，不会提交业务数据'}</div>}
  </div></FileOpener.Provider>;
}
