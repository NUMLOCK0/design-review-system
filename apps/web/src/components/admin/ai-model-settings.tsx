'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { KeyRound, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type AiConfig = { id: string; name: string; baseUrl: string; model: string; keyConfigured: boolean; enabled: boolean; updatedAt: string };
type Draft = { name: string; baseUrl: string; model: string; apiKey: string };
const emptyDraft: Draft = { name: '', baseUrl: '', model: '', apiKey: '' };

export function AiModelSettings() {
  const [configs, setConfigs] = useState<AiConfig[]>([]);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const editingConfig = configs.find((config) => config.id === editingId);

  const request = async (path: string, options?: RequestInit) => {
    const response = await fetchWithAuth(`/admin/ai-configs${path}`, options);
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(result.message || '操作失败');
    return result.data;
  };

  const load = async () => {
    try { setConfigs(await request('')); }
    catch (error) { toast.error(error instanceof Error ? error.message : '加载配置失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const resetDraft = () => { setEditingId(null); setDraft(emptyDraft); };
  const closeDialog = () => {
    if (busy) return;
    setDialogOpen(false);
    resetDraft();
  };
  const add = () => {
    resetDraft();
    setDialogOpen(true);
  };
  const edit = (config: AiConfig) => {
    setEditingId(config.id);
    setDraft({ name: config.name, baseUrl: config.baseUrl, model: config.model, apiKey: '' });
    setDialogOpen(true);
  };

  const save = async () => {
    const keyRequired = !editingId || !editingConfig?.keyConfigured;
    if (!draft.name.trim() || !draft.baseUrl.trim() || !draft.model.trim() || (keyRequired && !draft.apiKey.trim())) {
      toast.error(keyRequired && editingId ? '此配置的 API Key 无法解密，请重新填写并保存' : '请填写名称、中转站地址、模型名称和 API Key'); return;
    }
    setBusy(true);
    try {
      await request(editingId ? `/${editingId}` : '', { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(draft) });
      toast.success(editingId ? '模型配置已更新' : '模型配置已添加');
      setDialogOpen(false);
      resetDraft();
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : '保存失败'); }
    finally { setBusy(false); }
  };

  const toggleEnabled = async (config: AiConfig) => {
    setBusy(true);
    try { setConfigs(await request(`/${config.id}/enabled`, { method: 'PUT', body: JSON.stringify({ enabled: !config.enabled }) })); toast.success(config.enabled ? '模型已禁用' : '模型已启用'); }
    catch (error) { toast.error(error instanceof Error ? error.message : '状态更新失败'); }
    finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      setConfigs(await request(`/${id}`, { method: 'DELETE' }));
      if (editingId === id) closeDialog();
      toast.success('模型配置已删除');
    } catch (error) { toast.error(error instanceof Error ? error.message : '删除失败'); }
    finally { setBusy(false); }
  };

  return <div className="mx-auto max-w-5xl space-y-5 p-3 sm:p-6 lg:p-8">
    <div className="rounded-3xl border border-white/80 bg-white/75 p-5 shadow-sm sm:p-7">
      <p className="text-xs font-semibold role-primary-text">平台运营</p>
      <h1 className="mt-2 text-2xl font-bold text-slate-900">AI 大模型配置</h1>
      <p className="mt-2 text-sm text-slate-500">同时保存多套服务商、模型和 Key。启用状态控制配置是否可被新任务选择；具体任务通过模型档案指定调用模型。</p>
    </div>

    <Card className="rounded-3xl"><CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="text-base">已保存的模型配置</CardTitle><CardDescription className="mt-1">多个配置可以同时启用，工作台会根据文生文、图生文和图像生成任务选择对应的模型档案。</CardDescription></div><Button type="button" onClick={add} className="role-primary-gradient shrink-0 rounded-xl text-white"><Plus className="mr-1.5 h-4 w-4" />新增模型配置</Button></CardHeader>
      <CardContent className="space-y-3">{loading ? <p className="py-8 text-center text-sm text-slate-400">正在加载…</p> : configs.length === 0 ?
        <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">暂无后台配置。添加模型服务配置后，为不同任务创建对应的模型档案。</div> :
        configs.map((config) => <div key={config.id} className={`rounded-2xl border p-4 ${config.enabled ? 'border-emerald-200 bg-emerald-50/30' : 'border-slate-200 bg-white'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><h2 className="font-semibold text-slate-900">{config.name}</h2><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{config.enabled ? '已启用' : '已禁用'}</span></div>
            <p className="mt-1 break-all text-xs text-slate-500">{config.baseUrl}</p><p className="mt-1 text-xs text-slate-500">模型：{config.model} · Key：{config.keyConfigured ? '已托管' : <span className="font-semibold text-amber-700">需重新填写</span>}</p></div>
            <div className="flex flex-wrap gap-2"><Button type="button" size="sm" variant={config.enabled ? 'outline' : 'default'} disabled={busy} onClick={() => void toggleEnabled(config)} className={config.enabled ? '' : 'role-primary-gradient text-white'}><Power className="mr-1 h-3.5 w-3.5" />{config.enabled ? '禁用' : '启用'}</Button>
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => edit(config)}><Pencil className="mr-1 h-3.5 w-3.5" />编辑</Button>
              <ConfirmAction title="删除模型配置？" description={`删除「${config.name}」后，其中转站地址和 Key 将无法恢复；仍被模型档案引用时无法删除。`} confirmText="确认删除" onConfirm={() => void remove(config.id)}><Button type="button" size="sm" variant="outline" disabled={busy} className="text-rose-600"><Trash2 className="mr-1 h-3.5 w-3.5" />删除</Button></ConfirmAction></div>
          </div>
        </div>)}
      </CardContent>
    </Card>

    <Dialog open={dialogOpen} onOpenChange={(open) => open ? setDialogOpen(true) : closeDialog()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-hidden rounded-3xl border-slate-200 bg-white p-0 shadow-2xl max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:max-h-[90dvh]">
        <form className="flex max-h-[calc(100dvh-2rem)] flex-col max-sm:max-h-[90dvh]" onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void save(); }}>
          <DialogHeader className="border-b border-slate-100 px-6 pb-5 pt-6 pr-12 text-left sm:px-7 sm:pt-7">
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700"><KeyRound className="h-5 w-5" /></div>
            <DialogTitle className="text-xl text-slate-900">{editingId ? '编辑模型配置' : '新增模型配置'}</DialogTitle>
            <DialogDescription>{editingId ? editingConfig?.keyConfigured ? 'API Key 留空会保留原有 Key。' : '原 API Key 无法解密，请重新填写 API Key 并保存。' : '配置服务商地址、模型名称和 API Key。新配置默认启用。'} Key 保存后不会显示在页面上。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 overflow-y-auto px-6 py-6 sm:grid-cols-2 sm:px-7">
            <Field label="配置名称"><Input autoFocus={!editingId} value={draft.name} maxLength={80} placeholder="例如：主用中转站" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field>
            <Field label="模型名称"><Input value={draft.model} maxLength={128} placeholder="例如：gpt-4o-mini" onChange={(event) => setDraft({ ...draft, model: event.target.value })} /></Field>
            <Field label="中转站地址"><Input type="url" value={draft.baseUrl} placeholder="https://example.com/v1" onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })} /><p className="text-[11px] leading-4 text-slate-400">支持填写站点根地址或包含 /v1 的地址，系统会补全 OpenAI 兼容接口路径。</p></Field>
            <Field label={editingId ? editingConfig?.keyConfigured ? '更换 API Key（选填）' : '重新配置 API Key' : 'API Key'}><Input type="password" autoComplete="new-password" value={draft.apiKey} placeholder={editingId ? editingConfig?.keyConfigured ? '留空则继续使用原 Key' : '输入新的服务端 API Key' : '输入服务端 API Key'} onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })} /></Field>
          </div>
          <DialogFooter className="border-t border-slate-100 px-6 py-4 sm:px-7">
            <Button type="button" variant="outline" disabled={busy} onClick={closeDialog} className="rounded-xl">取消</Button>
            <Button type="submit" disabled={busy} className="role-primary-gradient rounded-xl text-white">{busy ? '处理中…' : editingId ? '保存修改' : '添加配置'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs font-semibold text-slate-700">{label}</Label>{children}</div>;
}
