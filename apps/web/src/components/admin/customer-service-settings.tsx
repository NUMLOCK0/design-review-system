'use client';

import { useEffect, useState } from 'react';
import type { CustomerServiceContact } from '@design-review/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ImageUpload } from '@/components/image-upload';
import { ConfirmAction } from '@/components/ui/confirm-action';
import { fetchWithAuth } from '@/lib/auth';
import { toast } from 'sonner';

type ContactDraft = Pick<CustomerServiceContact, 'name' | 'wechat' | 'qrCodeUrl' | 'enabled' | 'sortOrder'>;
const emptyDraft: ContactDraft = { name: '', wechat: '', qrCodeUrl: '', enabled: true, sortOrder: 0 };

export function CustomerServiceSettings() {
  const [contacts, setContacts] = useState<CustomerServiceContact[]>([]);
  const [activeId, setActiveId] = useState('');
  const [draft, setDraft] = useState<ContactDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth('/system-config/customer-services');
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '加载客服配置失败');
      setContacts(result.data.contacts || []); setActiveId(result.data.activeCustomerServiceId || '');
    } catch (error: any) { toast.error(error.message || '加载客服配置失败'); } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const save = async (contact: ContactDraft, id?: string) => {
    setSaving(id || 'new');
    try {
      const response = await fetchWithAuth(id ? `/system-config/customer-services/${id}` : '/system-config/customer-services', { method: id ? 'PUT' : 'POST', body: JSON.stringify(contact) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '保存客服失败');
      setContacts(result.data.contacts || []); setActiveId(result.data.activeCustomerServiceId || '');
      if (!id) setDraft({ ...emptyDraft, sortOrder: (result.data.contacts || []).length });
      toast.success(id ? '客服配置已保存' : '客服已添加');
    } catch (error: any) { toast.error(error.message || '保存客服失败'); } finally { setSaving(null); }
  };

  const setActive = async (id: string) => {
    setActiveId(id);
    const response = await fetchWithAuth('/system-config/customer-services/active', { method: 'PUT', body: JSON.stringify({ id }) });
    const result = await response.json();
    if (!response.ok || !result.success) { setActiveId(activeId); toast.error(result.message || '切换客服失败'); return; }
    toast.success('订单页展示客服已切换');
  };

  const remove = async (id: string) => {
    const response = await fetchWithAuth(`/system-config/customer-services/${id}`, { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok || !result.success) return toast.error(result.message || '删除客服失败');
    setContacts(result.data.contacts || []); setActiveId(result.data.activeCustomerServiceId || ''); toast.success('客服已删除');
  };

  if (loading) return <div className="p-12 text-center text-xs text-slate-400">正在载入客服配置…</div>;
  return <div className="mx-auto max-w-5xl space-y-5 p-8">
    <Card className="rounded-3xl"><CardHeader><CardTitle className="text-base">新增客服</CardTitle><CardDescription>配置客服名称、微信号和二维码，添加后可选择订单页展示的客服。</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Field label="客服名称"><Input value={draft.name} placeholder="例如：小创客服" onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></Field><Field label="微信号"><Input value={draft.wechat} placeholder="请输入客服微信号" onChange={(event) => setDraft({ ...draft, wechat: event.target.value })} /></Field><Field label="二维码"><ImageUpload value={draft.qrCodeUrl ? [draft.qrCodeUrl] : []} onChange={(urls) => setDraft({ ...draft, qrCodeUrl: urls[0] || '' })} label="上传客服微信二维码" folder="customer-service-qrcodes" multiple={false} /></Field><div className="flex items-end"><Button type="button" onClick={() => void save(draft)} disabled={saving === 'new'} className="role-primary-gradient h-9 rounded-xl text-xs text-white">{saving === 'new' ? '添加中…' : '添加客服'}</Button></div></CardContent></Card>
    <Card className="rounded-3xl"><CardHeader><CardTitle className="text-base">客服列表</CardTitle><CardDescription>带有“当前展示”标记的客服，会显示在品牌方创建订单的第三步。</CardDescription></CardHeader><CardContent className="space-y-3">{!contacts.length && <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-xs text-slate-400">暂无客服，请先添加一位客服</div>}{contacts.map((contact) => <div key={contact.id} className={`rounded-2xl border p-4 ${activeId === contact.id ? 'border-[var(--role-primary-border)] bg-[var(--role-primary-soft)]' : 'border-slate-200 bg-white'}`}><div className="flex flex-col gap-4 lg:flex-row lg:items-center"><label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-semibold text-slate-700"><input type="radio" name="active-customer-service" checked={activeId === contact.id} disabled={!contact.enabled} onChange={() => void setActive(contact.id)} className="accent-[var(--role-primary)]" />当前展示</label><div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"><Field label="名称"><Input value={contact.name} onChange={(event) => setContacts(contacts.map((item) => item.id === contact.id ? { ...item, name: event.target.value } : item))} /></Field><Field label="微信号"><Input value={contact.wechat} onChange={(event) => setContacts(contacts.map((item) => item.id === contact.id ? { ...item, wechat: event.target.value } : item))} /></Field><Field label="二维码"><ImageUpload value={contact.qrCodeUrl ? [contact.qrCodeUrl] : []} onChange={(urls) => setContacts(contacts.map((item) => item.id === contact.id ? { ...item, qrCodeUrl: urls[0] || '' } : item))} label="更新二维码" folder="customer-service-qrcodes" multiple={false} /></Field><div className="flex items-end gap-2"><Switch checked={contact.enabled} onCheckedChange={(enabled) => setContacts(contacts.map((item) => item.id === contact.id ? { ...item, enabled } : item))} /><span className="pb-2 text-xs text-slate-500">启用</span></div></div><div className="flex shrink-0 gap-2"><Button type="button" onClick={() => void save(contact, contact.id)} disabled={saving === contact.id} className="h-9 rounded-xl text-xs role-primary-gradient text-white">{saving === contact.id ? '保存中…' : '保存'}</Button><ConfirmAction title="确认删除客服？" description={`删除「${contact.name}」后将无法在订单页展示。`} confirmText="确认删除" onConfirm={() => void remove(contact.id)}><Button type="button" variant="outline" className="h-9 rounded-xl text-xs text-rose-600">删除</Button></ConfirmAction></div></div></div>)}</CardContent></Card>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="space-y-1.5"><Label className="text-xs font-semibold text-slate-700">{label}</Label>{children}</div>; }
