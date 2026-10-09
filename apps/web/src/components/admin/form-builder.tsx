'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, rectIntersection, useDraggable, useDroppable, useSensor, useSensors, type CollisionDetection, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronDown, ClipboardList, Code2, Copy, Download, Eye, FileText, GripVertical, LayoutTemplate, Plus, Save, Settings2, Trash2, Upload } from 'lucide-react';
import { buildFormSchema, createFormField, createOrderPresetDraft, FORM_FIELD_KINDS, ORDER_FORM_PRESETS, type FormField, type FormFieldKind, type FormFieldWidth, type FormTemplate, type OrderFormPreset } from '@design-review/shared';
import { fetchWithAuth } from '@/lib/auth';
import { FormPreview } from './form-preview';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

type EditorTemplate = FormTemplate;
type FormCategory = { id: string; name: string; description: string; sortOrder: number; isActive: boolean; updatedAt: string };
type Mode = 'design' | 'preview' | 'schema';
type Confirmation = { title: string; description: string; confirmText: string; destructive?: boolean; onConfirm: () => void };
const widths: FormFieldWidth[] = [25, 33, 50, 66, 75, 100];
const decorated = new Set<FormFieldKind>(['section', 'divider', 'paragraph']);
const choiceKinds = new Set<FormFieldKind>(['select', 'radio', 'checkbox']);
const fieldName = (kind: FormFieldKind) => FORM_FIELD_KINDS.find((item) => item.kind === kind)?.label || kind;
const starter = (): EditorTemplate => {
  const now = new Date().toISOString();
  return { id: '', name: '发单需求表单', description: '配置品牌方发单时填写的补充需求', target: 'order', fields: [
    { ...createFormField('section', 1), key: 'intro', label: '设计需求' },
    { ...createFormField('text', 2), key: 'productName', label: '商品名称', required: true, placeholder: '请输入商品或项目名称', width: 50 },
    { ...createFormField('select', 3), key: 'visualStyle', label: '期望风格', width: 50, options: [{ label: '简约现代', value: 'minimal' }, { label: '活泼年轻', value: 'vibrant' }, { label: '高级质感', value: 'premium' }] },
    { ...createFormField('textarea', 4), key: 'sellingPoints', label: '核心卖点', width: 100, placeholder: '描述希望重点呈现的内容' },
  ], version: 0, publishedVersion: 0, status: 'draft', createdAt: now, updatedAt: now };
};

const cnInput = 'h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100';
const cnLabel = 'mb-1.5 block text-[11px] font-semibold text-slate-500';
const formCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  const fieldHits = pointerHits.filter(({ id }) => id !== 'canvas' && id !== 'canvas:end');
  if (fieldHits.length) return fieldHits;
  if (args.pointerCoordinates) return pointerHits;
  const intersections = rectIntersection(args);
  return intersections.length ? intersections : closestCenter(args);
};

function PaletteItem({ kind, onAdd }: { kind: FormFieldKind; onAdd: (kind: FormFieldKind) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${kind}` });
  return <div ref={setNodeRef} className={`flex min-h-10 w-full items-center gap-1 rounded-xl border border-slate-200 bg-white px-1.5 text-xs font-medium text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 ${isDragging ? 'opacity-40' : ''}`}><button type="button" {...attributes} {...listeners} aria-label={`拖动${fieldName(kind)}到画布`} className="flex min-w-0 flex-1 cursor-grab items-center gap-1.5 px-1.5 py-2 text-left active:cursor-grabbing"><GripVertical className="h-3.5 w-3.5 shrink-0 text-slate-300" /><span className="truncate">{fieldName(kind)}</span></button><button type="button" onClick={() => onAdd(kind)} aria-label={`添加${fieldName(kind)}`} className="rounded p-1 text-slate-400 hover:bg-blue-100 hover:text-blue-700"><Plus className="h-3.5 w-3.5" /></button></div>;
}

function CanvasField({ field, selected, dropBefore, onSelect, onDuplicate, onRemove }: { field: FormField; selected: boolean; dropBefore: boolean; onSelect: () => void; onDuplicate: () => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: field.id });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, gridColumn: `span ${Math.max(10, Math.min(100, Math.round(field.width)))} / span ${Math.max(10, Math.min(100, Math.round(field.width)))}`, marginRight: 12 }} className={`relative min-w-0 rounded-2xl border bg-white p-3 shadow-sm transition ${selected ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-200'} ${isDragging ? 'z-20 opacity-40 shadow-xl' : ''}`}>
    {dropBefore && <span className="pointer-events-none absolute -top-2 left-0 right-3 h-1 rounded-full bg-blue-500" />}
    <div className="mb-2 flex items-center gap-1"><button ref={setActivatorNodeRef} type="button" {...attributes} {...listeners} aria-label={`拖动${field.label}`} className="flex h-7 w-6 cursor-grab items-center justify-center rounded text-slate-400 hover:bg-slate-100 active:cursor-grabbing"><GripVertical className="h-4 w-4" /></button><button type="button" onClick={onSelect} className="min-w-0 flex-1 truncate text-left text-xs font-bold text-slate-700">{field.label}{field.required && <span className="ml-1 text-rose-500">*</span>}</button><span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{field.width}%</span><button type="button" title="复制字段" aria-label="复制字段" onClick={onDuplicate} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600"><Copy className="h-3.5 w-3.5" /></button><button type="button" title="删除字段" aria-label="删除字段" onClick={onRemove} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button></div>
    <button type="button" onClick={onSelect} className="block w-full text-left">{field.kind === 'section' ? <div className="border-b pb-2 text-sm font-bold text-slate-700">{field.label}</div> : field.kind === 'divider' ? <hr className="my-3 border-slate-200" /> : field.kind === 'paragraph' ? <p className="text-xs leading-5 text-slate-500">{field.label}</p> : field.kind === 'repeat' ? <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3 text-xs text-slate-500">{field.children?.length || 0} 个子字段 · 使用时可添加/删除条目</div> : choiceKinds.has(field.kind) ? <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-400">{field.options?.map((item) => item.label).join('、') || '请选择'}</div> : field.kind === 'switch' ? <div className="h-5 w-9 rounded-full bg-slate-200" /> : <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs text-slate-400">{field.placeholder || fieldName(field.kind)}</div>}</button>
    {field.condition && <p className="mt-2 text-[10px] text-amber-600">◇ 按条件显示</p>}
  </div>;
}

function CanvasEndDrop({ active }: { active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas:end' });
  return <div ref={setNodeRef} className={`mt-3 flex min-h-12 items-center justify-center rounded-xl border-2 border-dashed text-xs font-semibold transition ${isOver ? 'border-blue-500 bg-blue-100 text-blue-700' : active ? 'border-blue-200 bg-blue-50/50 text-blue-500' : 'border-slate-200 text-slate-400'}`}>拖到这里添加至末尾</div>;
}

function CanvasDrop({ fields, selectedId, dropTarget, dragging, onSelect, onDuplicate, onRemove }: { fields: FormField[]; selectedId: string | null; dropTarget: string | null; dragging: boolean; onSelect: (id: string) => void; onDuplicate: (id: string) => void; onRemove: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas' });
  return <div ref={setNodeRef} className={`min-h-80 rounded-2xl border-2 border-dashed p-4 transition sm:p-5 ${isOver ? 'border-blue-400 bg-blue-50/60' : 'border-slate-200 bg-slate-50/70'}`}>
    {fields.length ? <SortableContext items={fields.map((field) => field.id)} strategy={rectSortingStrategy}><div className="form-canvas-grid grid gap-y-3" style={{ gridTemplateColumns: 'repeat(100, minmax(0, 1fr))' }}>{fields.map((field) => <CanvasField key={field.id} field={field} selected={selectedId === field.id} dropBefore={dragging && dropTarget === field.id} onSelect={() => onSelect(field.id)} onDuplicate={() => onDuplicate(field.id)} onRemove={() => onRemove(field.id)} />)}</div></SortableContext> : <div className="flex min-h-64 flex-col items-center justify-center gap-2 text-center"><LayoutTemplate className="h-9 w-9 text-slate-300" /><p className="text-sm font-semibold text-slate-500">将左侧字段拖到这里</p><p className="text-xs text-slate-400">也可以点击字段直接添加</p></div>}
    {fields.length > 0 && <CanvasEndDrop active={dragging} />}
  </div>;
}

export function FormBuilder() {
  const router = useRouter();
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [categories, setCategories] = useState<FormCategory[]>([]);
  const [draft, setDraft] = useState<EditorTemplate>(() => starter());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [mode, setMode] = useState<Mode>('design');
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const selected = draft.fields.find((field) => field.id === selectedId) || null;
  const schema = useMemo(() => buildFormSchema(draft.fields), [draft.fields]);
  const generated = useMemo(() => JSON.stringify(schema, null, 2), [schema]);

  const load = async (selectId?: string) => {
    try {
      const response = await fetchWithAuth('/form-templates'); const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '加载失败');
      const items = result.data as FormTemplate[];
      setTemplates(items);
      try {
        const categoryResponse = await fetchWithAuth('/form-templates/categories');
        const categoryResult = await categoryResponse.json();
        if (categoryResponse.ok && categoryResult.success) setCategories(categoryResult.data || []);
      } catch { setCategories([]); }
      if (selectId) { const next = items.find((item) => item.id === selectId); if (next) setDraft(next); }
      else setDraft(items.find((item) => item.status !== 'archived') || starter());
      setDirty(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : '表单加载失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const update = (patch: Partial<EditorTemplate>) => { setDraft((current) => ({ ...current, ...patch })); setDirty(true); };
  const confirmDiscard = (description: string, onConfirm: () => void) => {
    if (!dirty) { onConfirm(); return; }
    setConfirmation({ title: '放弃未保存的修改？', description, confirmText: '放弃修改', destructive: true, onConfirm });
  };
  const usePreset = (preset: OrderFormPreset) => {
    confirmDiscard('选择业务模板会替换当前表单的基本信息和字段。', () => {
      setDraft(createOrderPresetDraft(preset)); setSelectedId(null); setDirty(true); setMode('design');
    });
  };
  const newForm = () => confirmDiscard('新建表单会清空当前未保存的内容。', () => {
    setDraft(starter()); setSelectedId(null); setDirty(true); setMode('design'); setStep(1);
  });
  const selectTemplate = (id: string) => {
    const next = templates.find((item) => item.id === id);
    if (!next || next.id === draft.id) return;
    confirmDiscard('切换表单会丢弃当前未保存的修改。', () => {
      setDraft(next); setSelectedId(null); setDirty(false); setMode('design'); setStep(1);
    });
  };
  const continueToFields = () => {
    if (!draft.name.trim()) { toast.error('请先填写表单名称'); return; }
    setStep(2); setMode('design');
  };
  const uniqueKey = (fields: FormField[], base: string) => { let key = base.replace(/[^A-Za-z0-9_]/g, '_'); if (!/^[A-Za-z]/.test(key)) key = `field_${key}`; let i = 2; while (fields.some((item) => item.key === key)) key = `${base}_${i++}`; return key; };
  const addField = (kind: FormFieldKind, index = draft.fields.length) => {
    const field = createFormField(kind, draft.fields.length + 1);
    field.key = uniqueKey(draft.fields, field.key);
    const next = [...draft.fields]; next.splice(index, 0, field);
    update({ fields: next }); setSelectedId(field.id); setMode('design');
  };
  const patchField = (id: string, patch: Partial<FormField>) => update({ fields: draft.fields.map((field) => field.id === id ? { ...field, ...patch } : patch.key && field.condition?.fieldKey === selected?.key ? { ...field, condition: { ...field.condition, fieldKey: patch.key } as NonNullable<FormField['condition']> } : field) });
  const removeField = (id: string) => { update({ fields: draft.fields.filter((field) => field.id !== id) }); if (selectedId === id) setSelectedId(null); };
  const duplicateField = (id: string) => {
    const index = draft.fields.findIndex((field) => field.id === id); if (index < 0) return;
    const original = draft.fields[index];
    const clone = structuredClone(original); clone.id = `field_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; clone.key = uniqueKey(draft.fields, `${original.key}_copy`); clone.label += ' 副本';
    const fields = [...draft.fields]; fields.splice(index + 1, 0, clone); update({ fields }); setSelectedId(clone.id);
  };
  const dragEnd = ({ active, over }: DragEndEvent) => {
    setActiveDragId(null); setDropTarget(null);
    if (!over) return;
    const activeId = String(active.id); const overId = String(over.id);
    if (activeId.startsWith('palette:')) {
      const kind = activeId.slice(8) as FormFieldKind;
      const index = draft.fields.findIndex((field) => field.id === overId);
      addField(kind, index < 0 ? draft.fields.length : index);
      return;
    }
    const from = draft.fields.findIndex((field) => field.id === activeId);
    if (from < 0 || activeId === overId) return;
    const fields = draft.fields.filter((field) => field.id !== activeId);
    const to = fields.findIndex((field) => field.id === overId);
    fields.splice(to < 0 ? fields.length : to, 0, draft.fields[from]);
    if (fields.some((field, index) => field.id !== draft.fields[index].id)) update({ fields });
  };
  const save = async (value = draft): Promise<FormTemplate | null> => {
    setBusy(true);
    try {
      const body = { name: value.name, description: value.description, target: value.target, category: value.category, tag: value.tag, presetId: value.presetId, fields: value.fields };
      const response = await fetchWithAuth(value.id ? `/form-templates/${value.id}` : '/form-templates', { method: value.id ? 'PUT' : 'POST', body: JSON.stringify(body) });
      const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.message || '保存失败');
      const saved = result.data as FormTemplate; setDraft(saved); setSelectedId(null); setDirty(false); await load(saved.id); toast.success('草稿已保存'); return saved;
    } catch (error) { toast.error(error instanceof Error ? error.message : '保存失败'); return null; }
    finally { setBusy(false); }
  };
  const publish = async () => {
    const saved = dirty || !draft.id ? await save() : draft;
    if (!saved) return;
    setBusy(true);
    try {
      const response = await fetchWithAuth(`/form-templates/${saved.id}/publish`, { method: 'POST' }); const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '发布失败');
      setDraft(result.data); await load(saved.id); toast.success(`已发布 v${result.data.publishedVersion}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : '发布失败'); }
    finally { setBusy(false); }
  };
  const archive = async () => {
    if (!draft.id) return;
    setBusy(true);
    try { const response = await fetchWithAuth(`/form-templates/${draft.id}`, { method: 'DELETE' }); if (!response.ok) throw new Error('归档失败'); setDraft(starter()); setSelectedId(null); setStep(1); await load(); toast.success('表单已归档'); }
    catch (error) { toast.error(error instanceof Error ? error.message : '归档失败'); } finally { setBusy(false); }
  };
  const confirmArchive = () => setConfirmation({ title: '归档表单？', description: `归档「${draft.name}」后，已发布版本将停止供新表单读取。`, confirmText: '确认归档', destructive: true, onConfirm: () => { void archive(); } });
  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ name: draft.name, description: draft.description, target: draft.target, category: draft.category, tag: draft.tag, presetId: draft.presetId, fields: draft.fields }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${draft.name || 'form'}.json`; link.click(); URL.revokeObjectURL(url);
  };
  const importJson = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 100_000) throw new Error('配置文件不能超过 100 KB');
      const parsed = JSON.parse(await file.text());
      if (!Array.isArray(parsed.fields) || parsed.fields.length > 100 || typeof parsed.name !== 'string' || !parsed.fields.every((field: unknown) => field && typeof field === 'object' && typeof (field as FormField).id === 'string' && typeof (field as FormField).key === 'string' && typeof (field as FormField).label === 'string' && FORM_FIELD_KINDS.some((item) => item.kind === (field as FormField).kind) && Number.isInteger((field as FormField).width) && (field as FormField).width >= 10 && (field as FormField).width <= 100)) throw new Error('文件不是有效的表单配置');
      const next = starter();
      const applyImport = () => {
        update({ ...next, name: parsed.name, description: String(parsed.description || ''), target: parsed.target === 'general' ? 'general' : 'order', category: typeof parsed.category === 'string' ? parsed.category : undefined, tag: typeof parsed.tag === 'string' ? parsed.tag : undefined, presetId: typeof parsed.presetId === 'string' ? parsed.presetId : undefined, fields: parsed.fields });
        setSelectedId(null); setStep(1); setMode('design'); toast.success('已导入到新草稿，请检查后保存');
      };
      confirmDiscard('导入配置会替换当前未保存的表单内容。', applyImport);
    } catch (error) { toast.error(error instanceof Error ? error.message : '导入失败'); }
  };

  return (
    <div className="min-w-0 w-full space-y-5 p-3 sm:p-5 lg:p-6">
      <header className="rounded-3xl border border-white bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button type="button" onClick={() => confirmDiscard('返回运营配置会丢弃当前未保存的表单内容。', () => router.push('/admin/settings'))} className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"><ArrowLeft className="h-3.5 w-3.5" />返回运营配置</button>
            <p className="text-xs font-bold text-blue-600">平台运营 / 表单配置</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-900">表单题目与类目配置</h1>
            <p className="mt-1 text-sm text-slate-500">配置业务类目、表单题目、校验规则和发布版本，供发单与订单协作用。</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={newForm} className="flex h-9 items-center gap-1 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"><Plus className="h-4 w-4" />新建表单</button>
            {step === 2 && <>
              <button type="button" disabled={busy} onClick={() => void save()} className="flex h-9 items-center gap-1 rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"><Save className="h-4 w-4" />保存草稿</button>
              <button type="button" disabled={busy} onClick={() => void publish()} className="flex h-9 items-center gap-1 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"><Check className="h-4 w-4" />发布版本</button>
            </>}
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
          <span className="text-xs font-semibold text-slate-500">当前表单</span>
          <select aria-label="选择表单" value={draft.id} onChange={(event) => event.target.value ? selectTemplate(event.target.value) : newForm()} className="h-9 min-w-44 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700">
            <option value="">新建草稿</option>
            {templates.filter((item) => item.status !== 'archived').map((item) => <option key={item.id} value={item.id}>{item.name} {item.publishedVersion ? `(v${item.publishedVersion})` : '(草稿)'}</option>)}
          </select>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${draft.status === 'published' && !dirty ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{dirty ? '未保存' : draft.status === 'published' ? `已发布 v${draft.publishedVersion}` : '草稿'}</span>
          <div className="ml-auto flex items-center gap-1">
            <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { void importJson(event.target.files?.[0]); event.target.value = ''; }} />
            <button type="button" onClick={() => fileInput.current?.click()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="导入 JSON" aria-label="导入 JSON"><Upload className="h-4 w-4" /></button>
            <button type="button" onClick={exportJson} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="导出 JSON" aria-label="导出 JSON"><Download className="h-4 w-4" /></button>
            {draft.id && <button type="button" onClick={confirmArchive} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600" title="归档表单" aria-label="归档表单"><Trash2 className="h-4 w-4" /></button>}
          </div>
        </div>
      </header>

      <nav aria-label="表单配置步骤" className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <button type="button" onClick={() => setStep(1)} aria-current={step === 1 ? 'step' : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left transition ${step === 1 ? 'bg-blue-50 text-blue-800' : 'text-slate-500 hover:bg-slate-50'}`}>
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step === 1 ? 'bg-blue-600 text-white' : 'bg-emerald-100 text-emerald-700'}`}>{step === 2 ? <Check className="h-4 w-4" /> : '1'}</span>
          <span><strong className="block text-xs sm:text-sm">基本参数</strong><small className="hidden text-[11px] font-normal opacity-70 sm:block">用途、名称与业务信息</small></span>
        </button>
        <button type="button" onClick={continueToFields} aria-current={step === 2 ? 'step' : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left transition ${step === 2 ? 'bg-blue-50 text-blue-800' : 'text-slate-500 hover:bg-slate-50'}`}>
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${step === 2 ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>2</span>
          <span><strong className="block text-xs sm:text-sm">题目配置</strong><small className="hidden text-[11px] font-normal opacity-70 sm:block">拖拽题目、编辑规则与预览发布</small></span>
        </button>
      </nav>

      {step === 1 ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-5"><p className="text-xs font-bold text-blue-600">步骤 1 / 2</p><h2 className="mt-1 text-lg font-bold text-slate-900">设置表单基本参数</h2><p className="mt-1 text-xs leading-5 text-slate-500">这些信息用于识别和使用表单，字段内容在下一步配置。</p></div>
            <div className="space-y-5">
              <div><span className={cnLabel}>表单用途</span><div className="grid gap-2 sm:grid-cols-2">
                {([{ value: 'order', title: '发单表单', description: '品牌方发布设计需求时使用' }, { value: 'general', title: '通用表单', description: '用于其他业务场景或独立收集' }] as const).map((item) => <button key={item.value} type="button" onClick={() => update({ target: item.value })} className={`rounded-xl border p-4 text-left transition ${draft.target === item.value ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 hover:border-blue-300'}`}><span className="block text-sm font-semibold text-slate-800">{item.title}</span><span className="mt-1 block text-xs text-slate-500">{item.description}</span></button>)}
              </div></div>
              <div><label htmlFor="form-name" className={cnLabel}>表单名称 <span className="text-rose-500">*</span></label><input id="form-name" value={draft.name} onChange={(event) => update({ name: event.target.value })} className={cnInput} maxLength={120} placeholder="例如：品牌设计需求表" /></div>
              <div><label htmlFor="form-description" className={cnLabel}>表单说明</label><textarea id="form-description" value={draft.description} onChange={(event) => update({ description: event.target.value })} className={`${cnInput} h-24 py-2`} maxLength={1000} placeholder="简要说明填写场景和用途" /></div>
              <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="form-category" className={cnLabel}>业务类目</label><div className="flex gap-2"><select id="form-category" value={draft.category || ''} onChange={(event) => update({ category: event.target.value || undefined })} className={`${cnInput} min-w-0 flex-1`}><option value="">未分类</option>{categories.filter((item) => item.isActive || item.name === draft.category).map((item) => <option key={item.id} value={item.name}>{item.name}{item.isActive ? '' : '（已停用）'}</option>)}</select><Link href="/admin/settings/forms/categories" className="inline-flex h-9 shrink-0 items-center rounded-xl border border-blue-200 px-2.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-50">管理类目</Link></div><p className="mt-1 text-[10px] text-slate-400">题目保存在表单字段中，类目用于组织和筛选表单。</p></div><div><label htmlFor="form-tag" className={cnLabel}>简短标签</label><input id="form-tag" value={draft.tag || ''} onChange={(event) => update({ tag: event.target.value })} className={cnInput} placeholder="如：主图设计" maxLength={80} /></div></div>
            </div>
            <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5"><p className="text-xs text-slate-400">当前包含 {draft.fields.length} 个字段，可在下一步调整。</p><button type="button" onClick={continueToFields} className="flex h-10 items-center gap-1.5 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">下一步：配置字段<ArrowRight className="h-4 w-4" /></button></div>
          </section>
          <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2"><LayoutTemplate className="h-4 w-4 text-emerald-600" /><h2 className="text-sm font-bold text-slate-800">从业务模板开始</h2></div>
            <p className="mt-2 text-xs leading-5 text-slate-500">选择模板会带入基本参数和预设字段，下一步仍可自由拖拽调整。</p>
            <div className="mt-4 max-h-[560px] space-y-4 overflow-y-auto pr-1">{[...new Set(ORDER_FORM_PRESETS.map((item) => item.category))].map((category) => <div key={category}><p className="mb-2 text-[10px] font-bold tracking-wide text-slate-400">{category}</p><div className="space-y-2">{ORDER_FORM_PRESETS.filter((item) => item.category === category).map((item) => <button key={item.id} type="button" onClick={() => usePreset(item)} className={`w-full rounded-xl border px-3 py-2.5 text-left transition hover:border-emerald-300 hover:bg-emerald-50 ${draft.presetId === item.id && !draft.id ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-white'}`}><span className="block text-xs font-semibold text-slate-700">{item.name}</span><span className="mt-1 block text-[11px] text-slate-400">{item.tag} · {item.sections.reduce((count, section) => count + section.fields.length, 0)} 个字段</span></button>)}</div></div>)}</div>
            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-700"><FileText className="mb-2 h-4 w-4" />草稿保存后可继续编辑；发布时生成新版本。</div>
          </aside>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"><button type="button" onClick={() => setStep(1)} className="flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-blue-700"><ArrowLeft className="h-4 w-4" />返回基本参数</button><p className="text-xs text-slate-500"><span className="font-semibold text-slate-700">{draft.name}</span> · {draft.fields.length} 个字段 · 拖动字段可调整位置</p></div>
          <DndContext sensors={sensors} collisionDetection={formCollisionDetection} onDragStart={({ active }) => { setActiveDragId(String(active.id)); setDropTarget(null); }} onDragOver={({ over }) => setDropTarget(over ? String(over.id) : null)} onDragCancel={() => { setActiveDragId(null); setDropTarget(null); }} onDragEnd={dragEnd}>
            <div className="grid min-w-0 items-start gap-4 md:grid-cols-[180px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_260px] 2xl:grid-cols-[220px_minmax(0,1fr)_290px]">
              <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:sticky md:top-4"><div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-800"><ClipboardList className="h-4 w-4 text-blue-600" />字段组件</div><div className="max-h-[calc(100vh-14rem)] space-y-4 overflow-y-auto pr-1">{[...new Set(FORM_FIELD_KINDS.map((item) => item.group))].map((group) => <div key={group}><p className="mb-2 text-[10px] font-bold tracking-wide text-slate-400">{group}</p><div className="grid grid-cols-2 gap-1.5 md:grid-cols-1">{FORM_FIELD_KINDS.filter((item) => item.group === group).map((item) => <PaletteItem key={item.kind} kind={item.kind} onAdd={addField} />)}</div></div>)}</div><p className="mt-4 text-[11px] leading-5 text-slate-400">拖到画布中添加，拖动画布字段调整顺序；也可点击 + 添加。</p></aside>
              <main className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-sm font-bold text-slate-800">{draft.name || '未命名表单'}</h2><p className="mt-0.5 text-xs text-slate-400">{draft.fields.length} 个组件 · 每个字段可设置占用宽度</p></div><div className="flex rounded-xl bg-slate-100 p-1">{([{ id: 'design', icon: Settings2, text: '设计' }, { id: 'preview', icon: Eye, text: '预览' }, { id: 'schema', icon: Code2, text: 'Schema' }] as const).map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => setMode(item.id)} className={`flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold ${mode === item.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500'}`}><Icon className="h-3.5 w-3.5" />{item.text}</button>; })}</div></div>
                {mode === 'design' ? <CanvasDrop fields={draft.fields} selectedId={selectedId} dropTarget={dropTarget === activeDragId ? null : dropTarget} dragging={Boolean(activeDragId)} onSelect={setSelectedId} onDuplicate={duplicateField} onRemove={removeField} /> : mode === 'preview' ? <div className="min-h-80 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"><div className="mb-5 flex items-start justify-between gap-3 border-b border-slate-200 pb-4"><div><h3 className="text-base font-bold text-slate-900">{draft.name}</h3><p className="mt-1 text-xs leading-5 text-slate-500">{draft.description}</p></div>{draft.category && <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">{draft.category}</span>}</div><FormPreview key={draft.id || draft.presetId || draft.name} fields={draft.fields} /></div> : <div className="space-y-2"><p className="text-xs text-slate-500">标准 JSON Schema + JSON Forms UI Schema，可供 Web 与小程序按相同配置实现。</p><pre className="max-h-[650px] overflow-auto rounded-xl bg-slate-900 p-4 text-[11px] leading-5 text-slate-100">{generated}</pre></div>}
              </main>
              <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:col-start-2 xl:sticky xl:top-4 xl:col-start-auto"><div className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-800"><Settings2 className="h-4 w-4 text-blue-600" />{selected ? '字段属性' : '字段设置'}</div>{selected ? <FieldProperties key={selected.id} field={selected} fields={draft.fields} onChange={(patch) => patchField(selected.id, patch)} onRemove={() => removeField(selected.id)} /> : <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center"><Settings2 className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-3 text-xs font-semibold text-slate-600">选择画布中的字段</p><p className="mt-1 text-[11px] leading-5 text-slate-400">可设置宽度、选项、校验和显示条件。</p></div>}</aside>
            </div>
            <DragOverlay dropAnimation={null}>{activeDragId && <div className="pointer-events-none min-w-40 rounded-xl border border-blue-400 bg-white px-4 py-3 text-xs font-semibold text-blue-700 shadow-xl"><GripVertical className="mr-1 inline h-3.5 w-3.5" />{activeDragId.startsWith('palette:') ? `添加 ${fieldName(activeDragId.slice(8) as FormFieldKind)}` : draft.fields.find((field) => field.id === activeDragId)?.label || '移动字段'}</div>}</DragOverlay>
          </DndContext>
        </>
      )}
      {loading && <p className="text-center text-xs text-slate-400">正在加载表单配置…</p>}
      <AlertDialog open={Boolean(confirmation)} onOpenChange={(open) => { if (!open) setConfirmation(null); }}><AlertDialogContent className="max-w-md rounded-2xl bg-white"><AlertDialogHeader><AlertDialogTitle>{confirmation?.title}</AlertDialogTitle><AlertDialogDescription>{confirmation?.description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction className={confirmation?.destructive ? 'bg-rose-600 text-white hover:bg-rose-700' : 'bg-blue-600 text-white hover:bg-blue-700'} onClick={() => { const action = confirmation?.onConfirm; setConfirmation(null); action?.(); }}>{confirmation?.confirmText}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
      <style jsx global>{`@media(max-width:900px){.form-canvas-grid>div,.form-preview-grid>div{grid-column:span 100 / span 100 !important}}`}</style>
    </div>
  );
}

function FieldProperties({ field, fields, onChange, onRemove }: { field: FormField; fields: FormField[]; onChange: (patch: Partial<FormField>) => void; onRemove: () => void }) {
  const [showAdvanced, setShowAdvanced] = useState(true);
  const canRequire = !decorated.has(field.kind);
  const setOption = (index: number, patch: { label?: string; value?: string }) => onChange({ options: (field.options || []).map((option, i) => i === index ? { ...option, ...patch } : option) });
  const setChild = (id: string, patch: Partial<FormField>) => onChange({ children: (field.children || []).map((item) => item.id === id ? { ...item, ...patch } : item) });
  return <div className="max-h-[calc(100vh-14rem)] space-y-4 overflow-y-auto pr-1 text-xs"><div className="rounded-xl bg-slate-50 px-3 py-2 font-semibold text-slate-600">{fieldName(field.kind)}</div><div><label className={cnLabel}>标题 / 文案</label><input value={field.label} onChange={(event) => onChange({ label: event.target.value })} className={cnInput} /></div><div><label className={cnLabel}>字段标识 key</label><input value={field.key} onChange={(event) => onChange({ key: event.target.value })} className={cnInput} /><p className="mt-1 text-[10px] text-slate-400">英文字母开头，只能包含字母、数字和下划线</p></div><div><label className={cnLabel}>占用宽度</label><div className="grid grid-cols-3 gap-1.5">{widths.map((width) => <button key={width} type="button" onClick={() => onChange({ width })} className={`h-8 rounded-lg border text-[11px] font-semibold ${field.width === width ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'}`}>{width}%</button>)}</div><div className="mt-2 flex items-center gap-2"><input type="number" min="10" max="100" value={field.width} onChange={(event) => onChange({ width: Number(event.target.value) })} className={`${cnInput} w-24`} /><span className="text-[11px] text-slate-400">自定义 10%–100%</span></div></div>
    {canRequire && <label className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2"><span className="font-semibold text-slate-600">必填</span><input type="checkbox" checked={Boolean(field.required)} onChange={(event) => onChange({ required: event.target.checked })} className="h-4 w-4 accent-blue-600" /></label>}
    {!decorated.has(field.kind) && <><div><label className={cnLabel}>提示文字</label><input value={field.placeholder || ''} onChange={(event) => onChange({ placeholder: event.target.value })} className={cnInput} /></div><div><label className={cnLabel}>帮助说明</label><textarea value={field.help || ''} onChange={(event) => onChange({ help: event.target.value })} className={`${cnInput} h-20 py-2`} /></div></>}
    {choiceKinds.has(field.kind) && <div className="space-y-2"><div className="flex items-center justify-between"><span className={cnLabel}>选项</span><button type="button" onClick={() => onChange({ options: [...(field.options || []), { label: `选项${(field.options?.length || 0) + 1}`, value: `option_${(field.options?.length || 0) + 1}` }] })} className="text-[11px] font-semibold text-blue-600">＋ 添加</button></div>{(field.options || []).map((option, index) => <div key={index} className="flex gap-1"><input value={option.label} aria-label={`选项${index + 1}名称`} onChange={(event) => setOption(index, { label: event.target.value })} className={`${cnInput} min-w-0 flex-1 px-2`} /><input value={option.value} aria-label={`选项${index + 1}值`} onChange={(event) => setOption(index, { value: event.target.value })} className={`${cnInput} min-w-0 flex-1 px-2`} /><button type="button" onClick={() => onChange({ options: field.options?.filter((_, i) => i !== index) })} className="text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button></div>)}</div>}
    {['text', 'textarea', 'select'].includes(field.kind) && <div><label className={cnLabel}>快捷选项（每行一个）</label><textarea value={(field.presets || []).join('\n')} onChange={(event) => onChange({ presets: event.target.value.split('\n').map((item) => item.trim()).filter(Boolean) })} placeholder="例如：简约高级" className={`${cnInput} h-24 py-2`} /><p className="mt-1 text-[10px] text-slate-400">预览时显示为可点击的快捷填入标签</p></div>}
    {!decorated.has(field.kind) && field.kind !== 'repeat' && field.kind !== 'file' && field.kind !== 'image' && <div><label className={cnLabel}>默认值</label>{field.kind === 'switch' ? <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={Boolean(field.defaultValue)} onChange={(event) => onChange({ defaultValue: event.target.checked })} className="h-4 w-4 accent-blue-600" />默认开启</label> : field.kind === 'checkbox' ? <div className="flex flex-wrap gap-2">{(field.options || []).map((option) => <label key={option.value} className="flex items-center gap-1 text-[11px] text-slate-600"><input type="checkbox" checked={Array.isArray(field.defaultValue) && field.defaultValue.includes(option.value)} onChange={(event) => { const values = Array.isArray(field.defaultValue) ? field.defaultValue : []; onChange({ defaultValue: event.target.checked ? [...values, option.value] : values.filter((value) => value !== option.value) }); }} />{option.label}</label>)}</div> : choiceKinds.has(field.kind) ? <select value={String(field.defaultValue || '')} onChange={(event) => onChange({ defaultValue: event.target.value || undefined })} className={cnInput}><option value="">无默认值</option>{(field.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input type={field.kind === 'number' ? 'number' : 'text'} value={String(field.defaultValue ?? '')} onChange={(event) => onChange({ defaultValue: event.target.value === '' ? undefined : field.kind === 'number' ? Number(event.target.value) : event.target.value })} className={cnInput} />}</div>}
    {field.kind === 'repeat' && <div className="space-y-3 rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between"><span className="font-semibold text-slate-700">子字段</span><button type="button" onClick={() => { const child = createFormField('text', (field.children?.length || 0) + 1); child.key = `item_${Date.now().toString(36)}`; onChange({ children: [...(field.children || []), child] }); }} className="text-blue-600">＋ 添加</button></div>{(field.children || []).map((child, index) => <div key={child.id} className="space-y-1.5 rounded-lg bg-slate-50 p-2"><div className="flex gap-1"><input value={child.label} aria-label="子字段标题" onChange={(event) => setChild(child.id, { label: event.target.value })} className={`${cnInput} min-w-0 flex-1`} /><button type="button" onClick={() => onChange({ children: field.children?.filter((item) => item.id !== child.id) })} className="text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button></div><div className="flex gap-1"><input value={child.key} aria-label="子字段标识" onChange={(event) => setChild(child.id, { key: event.target.value })} className={`${cnInput} min-w-0 flex-1`} /><select value={child.kind} aria-label="子字段类型" onChange={(event) => setChild(child.id, { kind: event.target.value as FormFieldKind })} className={`${cnInput} min-w-0 flex-1`}>{FORM_FIELD_KINDS.filter((item) => !decorated.has(item.kind) && item.kind !== 'repeat').map((item) => <option key={item.kind} value={item.kind}>{item.label}</option>)}</select></div><label className="flex items-center gap-1 text-[11px] text-slate-500"><input type="checkbox" checked={Boolean(child.required)} onChange={(event) => setChild(child.id, { required: event.target.checked })} />必填</label><div className="flex gap-1">{index > 0 && <button type="button" title="上移" onClick={() => onChange({ children: arrayMove(field.children || [], index, index - 1) })}><ArrowUp className="h-3.5 w-3.5" /></button>}{index < (field.children?.length || 0) - 1 && <button type="button" title="下移" onClick={() => onChange({ children: arrayMove(field.children || [], index, index + 1) })}><ArrowDown className="h-3.5 w-3.5" /></button>}</div></div>)}<div className="grid grid-cols-2 gap-2"><div><label className={cnLabel}>最少条数</label><input type="number" min="0" value={field.minItems ?? 0} onChange={(event) => onChange({ minItems: Number(event.target.value) })} className={cnInput} /></div><div><label className={cnLabel}>最多条数</label><input type="number" min="1" value={field.maxItems ?? 10} onChange={(event) => onChange({ maxItems: Number(event.target.value) })} className={cnInput} /></div></div></div>}
    {!decorated.has(field.kind) && <div className="border-t border-slate-100 pt-3"><button type="button" onClick={() => setShowAdvanced((value) => !value)} className="flex w-full items-center justify-between font-semibold text-slate-700">校验与显示规则<ChevronDown className={`h-4 w-4 transition ${showAdvanced ? 'rotate-180' : ''}`} /></button>{showAdvanced && <div className="mt-3 space-y-3">{['text', 'textarea', 'email', 'phone', 'url'].includes(field.kind) && <div className="grid grid-cols-2 gap-2"><div><label className={cnLabel}>最短长度</label><input type="number" min="0" value={field.minLength ?? ''} onChange={(event) => onChange({ minLength: event.target.value ? Number(event.target.value) : undefined })} className={cnInput} /></div><div><label className={cnLabel}>最长长度</label><input type="number" min="0" value={field.maxLength ?? ''} onChange={(event) => onChange({ maxLength: event.target.value ? Number(event.target.value) : undefined })} className={cnInput} /></div></div>}{field.kind === 'number' && <div className="grid grid-cols-2 gap-2"><div><label className={cnLabel}>最小值</label><input type="number" value={field.min ?? ''} onChange={(event) => onChange({ min: event.target.value ? Number(event.target.value) : undefined })} className={cnInput} /></div><div><label className={cnLabel}>最大值</label><input type="number" value={field.max ?? ''} onChange={(event) => onChange({ max: event.target.value ? Number(event.target.value) : undefined })} className={cnInput} /></div></div>}{['text', 'textarea', 'phone'].includes(field.kind) && <div><label className={cnLabel}>正则表达式</label><input value={field.pattern || ''} onChange={(event) => onChange({ pattern: event.target.value })} placeholder="例如 ^[A-Z]+$" className={cnInput} /></div>}<div><label className={cnLabel}>显示条件</label><select value={field.condition?.fieldKey || ''} onChange={(event) => onChange({ condition: event.target.value ? { fieldKey: event.target.value, operator: 'equals', value: '' } : undefined })} className={cnInput}><option value="">始终显示</option>{fields.filter((item) => item.id !== field.id && !decorated.has(item.kind) && item.kind !== 'repeat').map((item) => <option key={item.id} value={item.key}>{item.label}（{item.key}）</option>)}</select></div>{field.condition && <div className="grid grid-cols-2 gap-2"><select value={field.condition.operator} onChange={(event) => onChange({ condition: { ...field.condition!, operator: event.target.value as NonNullable<FormField['condition']>['operator'] } })} className={cnInput}><option value="equals">等于</option><option value="notEquals">不等于</option><option value="notEmpty">不为空</option></select>{field.condition.operator !== 'notEmpty' && <input value={field.condition.value || ''} onChange={(event) => onChange({ condition: { ...field.condition!, value: event.target.value } })} placeholder="比较值" className={cnInput} />}</div>}</div>}</div>}
    <button type="button" onClick={onRemove} className="flex h-9 w-full items-center justify-center gap-1 rounded-xl border border-rose-200 text-xs font-semibold text-rose-600 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />删除字段</button>
  </div>;
}
