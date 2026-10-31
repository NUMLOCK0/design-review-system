'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Plus, Search } from 'lucide-react';
import { fetchWithAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type ModelCapability = 'text' | 'vision' | 'image';
export type SelectedAiModel = { model: string; capability: ModelCapability; protocol: 'openai-chat' | 'openai-images' | 'native-async' };
export type ConfiguredAiModel = SelectedAiModel & { id: string; name: string; enabled: boolean };
type ProviderModel = { id: string; ownedBy?: string };
export const modelCapabilityLabels: Record<ModelCapability, string> = { text: '文本生成', vision: '图像理解 / 多模态', image: '图像生成' };

export function AiModelPicker({ configId, baseUrl, apiKey, selected, existing = [], onChange, disabled = false, multiple = true }: {
  configId?: string; baseUrl?: string; apiKey?: string; selected: SelectedAiModel[]; existing?: ConfiguredAiModel[];
  onChange: (models: SelectedAiModel[]) => void; disabled?: boolean; multiple?: boolean;
}) {
  const [catalog, setCatalog] = useState<ProviderModel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [manualModel, setManualModel] = useState('');
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    requestRef.current?.abort();
    setCatalog(null); setError(''); setLoading(false); setQuery('');
    return () => { requestRef.current?.abort(); };
  }, [configId, baseUrl, apiKey]);

  const getModels = async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true); setError('');
    try {
      const response = await fetchWithAuth('/admin/ai-configs/discover-models', { method: 'POST', signal: controller.signal,
        body: JSON.stringify({ ...(configId ? { configId } : {}), ...(baseUrl ? { baseUrl } : {}), ...(apiKey ? { apiKey } : {}) }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '获取模型失败');
      if (!controller.signal.aborted) setCatalog(result.data);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '获取模型失败');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  };

  const rows = useMemo(() => {
    const all = new Map<string, ProviderModel>();
    for (const model of catalog || []) all.set(model.id, model);
    for (const model of [...selected, ...existing]) if (!all.has(model.model)) all.set(model.model, { id: model.model });
    return [...all.values()].filter((model) => model.id.toLowerCase().includes(query.toLowerCase().trim()));
  }, [catalog, selected, existing, query]);

  const selectModel = (model: string, checked: boolean) => {
    if (!checked) { onChange(selected.filter((item) => item.model !== model)); return; }
    if (multiple && selected.length >= 100) { setError('每次最多添加 100 个模型'); return; }
    const value: SelectedAiModel = { model, capability: 'text', protocol: 'openai-chat' };
    onChange(multiple ? [...selected.filter((item) => item.model !== model), value] : [value]);
  };
  const changeType = (model: string, capability: ModelCapability) => onChange(selected.map((item) => item.model === model
    ? { ...item, capability, protocol: capability === 'image' ? 'openai-images' : 'openai-chat' } : item));

  return <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-3 sm:p-4" aria-label="选择模型与类型">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="text-sm font-semibold text-slate-800">选择模型与类型</h3><p className="mt-1 text-xs text-slate-500">获取服务商模型后，选择要添加的模型并设置用途。</p></div>
      <Button type="button" variant="outline" size="sm" onClick={() => void getModels()} disabled={disabled || loading || (!configId && (!baseUrl?.trim() || !apiKey?.trim()))}>
        {loading ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Download className="mr-1.5 size-4" />}{loading ? '获取中…' : catalog ? '重新获取' : '获取模型'}
      </Button>
    </div>
    {error && <p role="alert" className="rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{error}</p>}
    {catalog !== null && <p role="status" className="text-xs text-slate-500">已获取 {catalog.length} 个模型{catalog.length ? '，请按服务商支持的能力选择类型。' : '，可检查 Key 权限或手动添加。'}</p>}
    {(catalog?.length || selected.length || existing.length) ? <>
      <div className="relative"><Search className="absolute left-3 top-2.5 size-4 text-slate-400" /><Input aria-label="搜索模型" placeholder="搜索模型 ID" value={query} onChange={(event) => setQuery(event.target.value)} className="bg-white pl-9" /></div>
      <div className="max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white">
        {rows.length ? rows.map((model) => {
          const value = selected.find((item) => item.model === model.id);
          const configured = existing.filter((item) => item.model === model.id);
          return <div key={model.id} className={`border-b border-slate-100 p-3 last:border-0 ${value ? 'bg-indigo-50/60' : ''}`}>
            <div className="flex items-center gap-3">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"><input type={multiple ? 'checkbox' : 'radio'} checked={Boolean(value)} disabled={disabled} onChange={(event) => selectModel(model.id, event.target.checked)} aria-label={`选择 ${model.id}`} className="size-4 shrink-0 accent-indigo-600" /><span className="break-all text-xs font-medium text-slate-800">{model.id}</span></label>
              <select aria-label={`${model.id} 的模型类型`} disabled={disabled || !value} value={value?.capability || ''} onChange={(event) => changeType(model.id, event.target.value as ModelCapability)} className="h-9 max-w-[48%] rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 disabled:text-slate-400">
                {!value && <option value="">选择后设置类型</option>}{Object.entries(modelCapabilityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </div>
            {configured.length > 0 && <p className="mt-1 pl-6 text-[11px] text-emerald-700">已添加：{[...new Set(configured.map((item) => modelCapabilityLabels[item.capability]))].join('、')}</p>}
            {value?.capability === 'image' && <label className="mt-2 flex items-center gap-2 pl-6 text-[11px] text-slate-500">生成方式<select aria-label={`${model.id} 的生成方式`} disabled={disabled} value={value.protocol} onChange={(event) => onChange(selected.map((item) => item.model === model.id ? { ...item, protocol: event.target.value as SelectedAiModel['protocol'] } : item))} className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700"><option value="openai-images">OpenAI 兼容图像接口</option><option value="native-async">异步任务接口</option></select></label>}
          </div>;
        }) : <p className="p-4 text-center text-xs text-slate-400">没有匹配的模型</p>}
      </div>
      <p className="text-xs font-medium text-indigo-700">已选择 {selected.length} 个模型</p>
    </> : <p className="rounded-lg bg-white px-3 py-4 text-xs leading-5 text-slate-400">{configId ? '点击“获取模型”，读取此 API 配置可用的模型。' : '填写服务地址和 API Key 后，点击“获取模型”。'}</p>}
    <details className="text-xs text-slate-500"><summary className="cursor-pointer">服务商不支持获取？手动添加模型</summary><div className="mt-2 flex gap-2"><Input aria-label="手动模型 ID" maxLength={128} value={manualModel} onChange={(event) => setManualModel(event.target.value)} placeholder="填写服务商提供的模型 ID" className="min-w-0 bg-white" /><Button type="button" variant="outline" size="sm" className="h-10 shrink-0" disabled={disabled || !manualModel.trim()} onClick={() => { selectModel(manualModel.trim(), true); setManualModel(''); setQuery(''); }}><Plus className="mr-1 size-3.5" />选择</Button></div></details>
  </section>;
}
