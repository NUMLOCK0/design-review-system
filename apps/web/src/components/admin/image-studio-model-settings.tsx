'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bot, Loader2, Plus, Save, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type AiConfig = { id: string; name: string; baseUrl: string; model: string; enabled: boolean; keyConfigured: boolean };
type Capability = 'text' | 'vision' | 'image';
type Profile = { id: string; name: string; capability: Capability; aiConfigId: string; protocol: string; model: string | null; options: Record<string, unknown>; enabled: boolean };
type Draft = Omit<Profile, 'id'> & { id?: string; resultHosts: string; timeoutMs: string; pollIntervalMs: string; statusPath: string; cancelPath: string; sizes: string; qualityLevels: string };
const blank = (): Draft => ({ name: '', capability: 'image', aiConfigId: '', protocol: 'openai-images', model: '', options: {}, enabled: true,
  resultHosts: '', timeoutMs: '600000', pollIntervalMs: '3000', statusPath: '/media/status', cancelPath: '', sizes: '1024x1024, 1536x1024, 1024x1536, auto', qualityLevels: 'auto, low, medium, high' });

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(path, options);
  const result = await response.json() as { success: boolean; data: T; message?: string };
  if (!response.ok || !result.success) throw new Error(result.message || '请求失败');
  return result.data;
}

export function ImageStudioModelSettings() {
  const [configs, setConfigs] = useState<AiConfig[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [draft, setDraft] = useState<Draft>(blank());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [available, saved] = await Promise.all([
        request<AiConfig[]>('/image-studio/admin/ai-configs'), request<Profile[]>('/image-studio/admin/model-profiles'),
      ]);
      setConfigs(available); setProfiles(saved);
      setDraft((current) => ({ ...current, aiConfigId: current.aiConfigId || available.find((item) => item.enabled)?.id || '' }));
    } catch (error) { toast.error(error instanceof Error ? error.message : '模型设置加载失败'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const choose = (profile: Profile) => setDraft({ ...blank(), ...profile, model: profile.model || '',
    resultHosts: Array.isArray(profile.options.resultHosts) ? profile.options.resultHosts.join(', ') : '',
    sizes: Array.isArray(profile.options.sizes) ? profile.options.sizes.join(', ') : blank().sizes,
    qualityLevels: Array.isArray(profile.options.qualityLevels) ? profile.options.qualityLevels.join(', ') : blank().qualityLevels,
    timeoutMs: String(profile.options.timeoutMs || 600000), pollIntervalMs: String(profile.options.pollIntervalMs || 3000),
    statusPath: String(profile.options.statusPath || '/media/status'), cancelPath: String(profile.options.cancelPath || '') });

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true);
    try {
      const options = {
        timeoutMs: Number(draft.timeoutMs), pollIntervalMs: Number(draft.pollIntervalMs),
        statusPath: draft.statusPath, cancelPath: draft.cancelPath || undefined,
        resultHosts: draft.resultHosts.split(',').map((host) => host.trim().toLowerCase()).filter(Boolean),
        sizes: draft.sizes.split(',').map((size) => size.trim()).filter(Boolean).slice(0, 20),
        qualityLevels: draft.qualityLevels.split(',').map((quality) => quality.trim().toLowerCase()).filter(Boolean).slice(0, 10),
      };
      const saved = await request<Profile>('/image-studio/admin/model-profiles', { method: 'POST', body: JSON.stringify({
        id: draft.id, name: draft.name, capability: draft.capability, aiConfigId: draft.aiConfigId,
        protocol: draft.protocol, model: draft.model || null, options, enabled: draft.enabled,
      }) });
      setProfiles((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setDraft({ ...blank(), aiConfigId: configs.find((item) => item.enabled)?.id || '' }); toast.success('模型档案已保存');
    } catch (error) { toast.error(error instanceof Error ? error.message : '保存失败'); }
    finally { setSaving(false); }
  };

  return <main className="min-h-screen bg-[#f6f7fb] p-4 text-slate-900 sm:p-8"><div className="mx-auto max-w-6xl space-y-6">
    <header className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><p className="flex items-center gap-2 text-xs font-semibold text-indigo-700"><Bot className="h-4 w-4" />平台运营 · 生图工作台</p><h1 className="mt-2 text-2xl font-bold">模型档案与调用协议</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">每个档案引用一套已启用的 AI 配置。可分别维护文生文、图生文和图像生成档案，工作台按操作类型提交到对应模型。</p></header>
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-600" /><h2 className="font-semibold">已保存的 AI 配置</h2></div>{configs.length ? <div className="mt-3 grid gap-2 sm:grid-cols-2">{configs.map((config) => <div key={config.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-medium">{config.name}</span><span className={`rounded-full px-2 py-1 text-[10px] ${config.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{config.enabled ? '已启用' : '已禁用'}</span></div><p className="mt-1 truncate text-xs text-slate-500">{config.baseUrl}</p><p className={`mt-1 text-[11px] ${config.keyConfigured ? 'text-slate-400' : 'font-semibold text-amber-700'}`}>默认模型：{config.model} · Key {config.keyConfigured ? '已托管' : '无法解密，需重新填写'}</p></div>)}</div> : <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">尚未配置 AI Key，请先到 <a className="underline" href="/admin/settings/ai">AI 大模型设置</a> 添加。</p>}</section>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="flex items-center justify-between"><h2 className="font-semibold">模型档案</h2><span className="text-xs text-slate-400">{profiles.length} 项</span></div>{loading ? <div className="grid h-32 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div> : profiles.length ? <div className="mt-4 space-y-3">{profiles.map((profile) => <button key={profile.id} type="button" onClick={() => choose(profile)} className={`w-full rounded-2xl border p-4 text-left transition hover:border-indigo-300 ${draft.id === profile.id ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200'}`}><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="font-medium">{profile.name}</span><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">{profile.capability === 'image' ? '图像生成' : profile.capability === 'vision' ? '图生文' : '文生文'}</span></div><p className="mt-1 text-xs text-slate-500">协议：{profile.protocol} · 模型：{profile.model || configs.find((item) => item.id === profile.aiConfigId)?.model || '默认'}</p></div><span className={`text-xs ${profile.enabled ? 'text-emerald-700' : 'text-slate-400'}`}>{profile.enabled ? '已启用' : '已停用'}</span></div></button>)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">还没有模型档案，添加文生文、图生文或图像生成档案后即可按任务调用。</div>}</section>

      <form onSubmit={save} className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between"><h2 className="font-semibold">{draft.id ? '编辑档案' : '新增档案'}</h2><Button type="button" variant="ghost" size="sm" onClick={() => setDraft({ ...blank(), aiConfigId: configs.find((item) => item.enabled)?.id || '' })}><Plus className="mr-1 h-3.5 w-3.5" />清空</Button></div>
        <Field label="档案名称"><Input required maxLength={120} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="例如：主用商品图模型" /></Field>
        <Field label="模型能力"><select value={draft.capability} onChange={(event) => { const capability = event.target.value as Capability; setDraft({ ...draft, capability, protocol: capability === 'image' ? 'openai-images' : 'openai-chat' }); }} className="control"><option value="text">文生文</option><option value="vision">图生文 / 多模态理解</option><option value="image">图像生成</option></select></Field>
        <Field label="引用现有 API 配置"><select required value={draft.aiConfigId} onChange={(event) => setDraft({ ...draft, aiConfigId: event.target.value })} className="control"><option value="">选择已启用配置</option>{configs.filter((config) => config.enabled).map((config) => <option key={config.id} value={config.id}>{config.name} · {config.model}</option>)}</select></Field>
        <Field label="调用协议"><select value={draft.protocol} onChange={(event) => setDraft({ ...draft, protocol: event.target.value })} className="control">{draft.capability !== 'image' ? <option value="openai-chat">OpenAI 兼容 Chat Completions</option> : <><option value="openai-images">OpenAI 兼容 Images</option><option value="native-async">原生异步任务</option></>}</select></Field>
        <Field label="模型 ID 覆盖（选填）"><Input maxLength={160} value={draft.model || ''} onChange={(event) => setDraft({ ...draft, model: event.target.value })} placeholder="留空使用 API 配置中的模型 ID" /></Field>
        {draft.capability === 'vision' && <p className="rounded-xl bg-indigo-50 p-3 text-xs leading-5 text-indigo-800 sm:col-span-2">该档案用于素材识别、商品分析等带图片输入的任务。请确认服务商模型支持图像输入；同一配置可以另建文生文档案。</p>}
        {draft.capability === 'image' && <>
          {draft.protocol === 'native-async' && <><Field label="任务状态路径"><Input required value={draft.statusPath} onChange={(event) => setDraft({ ...draft, statusPath: event.target.value })} /></Field><Field label="取消路径（可选，使用 :taskId 占位）"><Input value={draft.cancelPath} onChange={(event) => setDraft({ ...draft, cancelPath: event.target.value })} placeholder="/media/cancel/:taskId" /></Field><Field label="后台查询间隔（毫秒）"><Input type="number" min={1000} max={30000} step={500} value={draft.pollIntervalMs} onChange={(event) => setDraft({ ...draft, pollIntervalMs: event.target.value })} /></Field></>}
          <Field label="上游图片域名白名单（逗号分隔）"><Input value={draft.resultHosts} onChange={(event) => setDraft({ ...draft, resultHosts: event.target.value })} placeholder="cdn.provider.com" /><span className="block text-[10px] font-normal text-slate-400">仅用于服务端下载上游返回的图片 URL；Base64 结果不需要填写。</span></Field>
          <Field label="支持的图片尺寸（逗号分隔）"><Input value={draft.sizes} onChange={(event) => setDraft({ ...draft, sizes: event.target.value })} placeholder="1024x1024, auto" /><span className="block text-[10px] font-normal text-slate-400">工作台只展示当前图像模型档案声明支持的尺寸。</span></Field>
          <Field label="支持的生成质量（逗号分隔）"><Input value={draft.qualityLevels} onChange={(event) => setDraft({ ...draft, qualityLevels: event.target.value })} placeholder="auto, low, medium, high" /></Field>
          <Field label="单任务超时（毫秒）"><Input type="number" min={30000} max={1800000} value={draft.timeoutMs} onChange={(event) => setDraft({ ...draft, timeoutMs: event.target.value })} /></Field>
        </>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />启用此档案</label>
        <Button disabled={saving || !configs.some((config) => config.enabled)} className="h-11 w-full rounded-xl bg-indigo-600 text-white hover:bg-indigo-700">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}保存模型档案</Button>
      </form>
    </div>
  </div><style jsx>{`.control{height:2.5rem;width:100%;border:1px solid #e2e8f0;border-radius:.75rem;background:white;padding:0 .75rem;font-size:.875rem;outline:none}.control:focus{border-color:#818cf8}`}</style></main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5 text-xs font-semibold text-slate-600">{label}{children}</label>; }
