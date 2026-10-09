'use client';

import { useCallback, useEffect, useState } from 'react';
import { requirementChanges, PLATFORM_MAP, type PlatformType, type CollaborationForm, type CollaborationWorkspace, type FormAnswers, type FormTemplate } from '@design-review/shared';
import { fetchWithAuth, getCurrentUser } from '@/lib/auth';
import { FormPreview } from '@/components/admin/form-preview';

async function read<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(path, options); const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || '需求协作请求失败');
  return result.data;
}
async function command<T>(path: string, body: unknown, method = 'POST'): Promise<T> {
  const identity = getCurrentUser()?.id || '';
  const storageKey = `requirement-command:${identity}:${method}:${path}`;
  const signature = JSON.stringify(body); let key = crypto.randomUUID();
  const previous = sessionStorage.getItem(storageKey);
  if (previous) { const cached = JSON.parse(previous); if (cached.signature === signature) key = cached.key; }
  sessionStorage.setItem(storageKey, JSON.stringify({ signature, key }));
  const result = await read<T>(path, { method, headers: { 'Idempotency-Key': key }, body: signature });
  sessionStorage.removeItem(storageKey); return result;
}
const formStatus = { sent: '待填写', filling: '填写中', submitted: '已提交', returned: '待补充' };
const candidateStatus = { confirming: '待确认', confirmed: '已确认', rejected: '已退回', superseded: '已失效' };
const decisionText = { pending: '待确认', confirmed: '已确认', rejected: '已退回' };

export function RequirementCollaboration({ orderId, refreshToken }: { orderId: string; refreshToken: number }) {
  const base = `/collaboration/orders/${encodeURIComponent(orderId)}`;
  const [workspace, setWorkspace] = useState<CollaborationWorkspace | null>(null);
  const [templates, setTemplates] = useState<FormTemplate[]>([]); const [templateId, setTemplateId] = useState('');
  const [selected, setSelected] = useState<string[]>([]); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false); const [form, setForm] = useState<CollaborationForm | null>(null); const [answers, setAnswers] = useState<FormAnswers>({});
  const [detail, setDetail] = useState<{ kind: 'candidate' | 'requirement'; id: string } | null>(null); const [comment, setComment] = useState('');
  const currentUser = getCurrentUser(); const [policy, setPolicy] = useState<'both' | 'brand'>('both');
  const refresh = useCallback(async () => {
    const next = await read<CollaborationWorkspace>(base); setWorkspace(next);
    setSelected(current => current.filter(id => next.forms.some(item => item.id === id && item.status === 'submitted')));
  }, [base]);
  useEffect(() => { let active = true; void read<CollaborationWorkspace>(base).then(next => { if (active) setWorkspace(next); }).catch(cause => { if (active) setError(cause.message); }); return () => { active = false; }; }, [base, refreshToken]);
  useEffect(() => { void read<FormTemplate[]>('/form-templates/published').then(setTemplates).catch(cause => setError(cause.message)); }, []);
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return; setBusy(true); setError('');
    try { await action(); await refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '操作失败'); }
    finally { setBusy(false); }
  };
  const closed = ['cancelled', 'completed'].includes(workspace?.status || '');
  const submitted = workspace?.forms.filter(item => item.status === 'submitted') || [];
  const latest = workspace?.requirements[0];
  const candidate = detail?.kind === 'candidate' ? workspace?.candidates.find(item => item.id === detail.id) : undefined;
  const requirement = detail?.kind === 'requirement' ? workspace?.requirements.find(item => item.id === detail.id) : undefined;
  const content = candidate?.content || requirement?.content;
  const previous = requirement ? workspace?.requirements.find(item => item.version === requirement.version - 1) : latest;
  const changes = content ? requirementChanges(previous?.content, content) : [];
  const canDecide = !closed && candidate?.status === 'confirming' && candidate.approvers.some(item => item.userId === currentUser?.id && item.decision === 'pending');
  const button = 'rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-40';
  const primary = `${button} role-primary-bg text-white`;
  function openForm(item: CollaborationForm) { setForm(item); setAnswers(item.answers); setComment(''); }
  async function openFile(url: string) {
    const assetId = /^\/api\/upload\/assets\/(asset_[a-zA-Z0-9_-]+)$/.exec(url)?.[1];
    if (!assetId) throw new Error('文件地址无效');
    const response = await fetchWithAuth(`${base}/files/${assetId}`);
    if (!response.ok) throw new Error('资料读取失败或无权访问');
    const blobUrl = URL.createObjectURL(await response.blob());
    const link = document.createElement('a'); link.href = blobUrl;
    const filename = /filename="([^";]+)"/.exec(response.headers.get('content-disposition') || '')?.[1];
    link.download = filename ? decodeURIComponent(filename) : '需求资料'; link.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
  }
  async function saveForm(submit: boolean) {
    if (!form) return;
    await command(`${base}/forms/${form.id}${submit ? '/submit' : ''}`, { lockVersion: form.lockVersion, answers }, submit ? 'POST' : 'PATCH'); setForm(null);
  }
  return <section className="rounded-2xl border border-emerald-100 bg-white p-4">
    <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-3 text-left"><span><span className="block text-xs font-bold role-primary-text">需求协作</span><span className="mt-1 block text-[11px] text-slate-500">{workspace?.forms.length || 0} 张表单 · {latest ? `正式需求 v${latest.version}` : '等待需求确认'}</span></span><span className="text-xs role-primary-text">{open ? '收起' : '填写 / 确认 →'}</span></button>
    {error && <p role="alert" className="mt-3 break-words text-xs text-rose-600">{error}<button type="button" onClick={() => void run(refresh)} className="ml-2 underline">重新加载</button></p>}
    {open && workspace && <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
      {!closed && <div className="flex flex-wrap gap-2"><select value={templateId} onChange={event => setTemplateId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-2 text-xs"><option value="">选择已发布需求模板</option>{templates.map(template => <option key={template.id} value={template.id}>{template.name} · v{template.publishedVersion || template.version}</option>)}</select><button type="button" disabled={busy || !templateId} className={primary} onClick={() => void run(async () => { const template = templates.find(item => item.id === templateId)!; await command(`${base}/forms`, { templateId, templateVersion: template.publishedVersion || template.version }); setTemplateId(''); })}>发送填写表单</button></div>}
      {!templates.length && <p className="text-xs text-slate-500">暂无已发布模板，请先在后台表单配置器发布。</p>}
      {workspace.forms.map(item => <div key={item.id} className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3"><span className="min-w-0 flex-1 text-xs font-medium">{item.template.name}<span className="ml-2 text-slate-400">{formStatus[item.status]} · 提交 {item.revision} 次</span></span><button type="button" onClick={() => openForm(item)} className={button}>{item.status !== 'submitted' && item.assigneeId === currentUser?.id ? '填写' : '查看'}</button></div>)}
      {submitted.length > 0 && !closed && <div className="space-y-3 rounded-xl bg-slate-50 p-3"><p className="text-xs font-semibold">选择本次需求来源</p>{submitted.map(item => <label key={item.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.includes(item.id)} onChange={event => setSelected(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id))} />{item.template.name} · 第 {item.revision} 次提交</label>)}<div className="flex flex-wrap items-center gap-2"><select value={workspace.designerId ? policy : 'brand'} onChange={event => setPolicy(event.target.value as 'both' | 'brand')} className="rounded-lg border p-2 text-xs"><option value="both" disabled={!workspace.designerId}>双方确认</option><option value="brand" disabled={Boolean(workspace.designerId) && currentUser?.id === workspace.creatorId}>品牌方确认</option></select><button type="button" disabled={busy || !selected.length} className={primary} onClick={() => void run(async () => { const result = await command<{ id: string }>(`${base}/candidates`, { formIds: selected, policy: workspace.designerId ? policy : 'brand', baseVersion: latest?.version || 0 }); setDetail({ kind: 'candidate', id: result.id }); })}>汇总并发起确认</button></div></div>}
      {workspace.candidates.map(item => <button type="button" key={item.id} onClick={() => { setDetail({ kind: 'candidate', id: item.id }); setComment(''); }} className="block w-full rounded-xl border border-slate-200 p-3 text-left text-xs"><span className="font-semibold">{item.policy === 'both' ? '双方需求确认' : '品牌方需求确认'} · {candidateStatus[item.status]}</span><span className="mt-1 block text-slate-500">{item.approvers.map(approver => `${approver.name}：${decisionText[approver.decision]}`).join(' / ')}</span></button>)}
      {workspace.requirements.map(item => <div key={item.id} className="flex flex-wrap items-center gap-2 rounded-xl role-primary-soft p-3"><button type="button" onClick={() => setDetail({ kind: 'requirement', id: item.id })} className="min-w-0 flex-1 text-left text-xs font-semibold role-primary-text">{item.requirementNo} · v{item.version}{item.id === latest?.id ? ' · 最新' : ' · 历史'}</button>{item.id === latest?.id && currentUser?.id === workspace.designerId && !closed && <button type="button" disabled={busy || workspace.execution?.requirementVersionId === item.id} className={primary} onClick={() => void run(() => command(`${base}/requirements/${item.id}/execute`, {}))}>{workspace.execution?.requirementVersionId === item.id ? '已承接执行' : '承接此版需求'}</button>}</div>)}
    </div>}
    {(form || content) && <div className="fixed inset-0 z-[85] flex items-end justify-center bg-slate-950/40 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label={form ? '需求表单' : '需求版本详情'}><div className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl"><div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-base font-bold">{form?.template.name || (requirement ? `正式需求 v${requirement.version}` : '核对需求并确认')}</h2><button type="button" disabled={busy} className={button} onClick={() => { setForm(null); setDetail(null); }}>关闭</button></div>
      {error && <p role="alert" className="mb-4 text-sm text-rose-600">{error}</p>}
      {form ? <><FormPreview onOpenFile={openFile} key={`${form.id}:${form.lockVersion}`} fields={form.template.fields} initialData={form.answers} readOnly={closed || form.status === 'submitted' || form.assigneeId !== currentUser?.id} runtime onDataChange={setAnswers} />{form.comment && <p className="my-3 text-xs text-amber-700">补充说明：{form.comment}</p>}{!closed && (form.status === 'submitted' ? <div className="mt-4 space-y-3"><textarea value={comment} onChange={event => setComment(event.target.value)} rows={2} maxLength={1000} placeholder="退回补充或发起修订的原因" className="w-full rounded-lg border p-3 text-sm" /><button type="button" disabled={busy || !comment.trim()} className={button} onClick={() => void run(async () => { await command(`${base}/forms/${form.id}/return`, { lockVersion: form.lockVersion, comment: comment.trim() }); setForm(null); })}>退回补充 / 发起修订</button></div> : form.assigneeId === currentUser?.id && <div className="mt-4 flex gap-2"><button type="button" disabled={busy} className={button} onClick={() => void run(() => saveForm(false))}>保存草稿</button><button type="button" disabled={busy} className={primary} onClick={() => void run(() => saveForm(true))}>提交需求资料</button></div>)}</> : content && <div className="space-y-5">
        <div className="rounded-xl bg-slate-50 p-4 text-sm"><h3 className="font-semibold">{content.title}</h3><p className="mt-2 text-xs text-slate-500">{content.category} · {PLATFORM_MAP[content.platform as PlatformType]?.label || content.platform} · {content.deadline || '未设置期限'}</p><p className="mt-2 text-xs text-slate-500">源文件交付：{content.requiresPsd ? '需要' : '未要求'}</p><p className="mt-3 whitespace-pre-wrap">{content.originalRequirements || '未填写原始说明'}</p></div>
        {changes.length > 0 && <div className="rounded-xl border border-amber-200 p-3"><h3 className="text-sm font-semibold">与上版变化 · {changes.length} 项</h3>{changes.map((change, index) => <div key={index} className="mt-3 break-words text-xs"><p className="font-semibold">{change.label}</p><p className="mt-1 text-slate-500">原：{change.before}</p><p className="mt-1 text-emerald-700">现：{change.after}</p></div>)}</div>}
        {content.sources.map(source => <section key={source.submissionId} className="border-t pt-4"><h3 className="mb-3 text-sm font-semibold">{source.title} · 模板 v{source.templateVersion} · 第 {source.revision} 次提交</h3><FormPreview onOpenFile={openFile} fields={source.fields} initialData={source.answers} readOnly runtime /></section>)}
        <div className="space-y-2 text-xs">{(candidate?.approvers || requirement?.approvers || []).map(approver => <p key={approver.userId}>{approver.name}：{decisionText[approver.decision]}{approver.comment ? ` · ${approver.comment}` : ''}{approver.actedAt ? ` · ${new Date(approver.actedAt).toLocaleString()}` : ''}</p>)}</div>
        {canDecide ? <><textarea value={comment} onChange={event => setComment(event.target.value)} rows={2} maxLength={1000} placeholder="可填写确认意见；退回时必填原因" className="w-full rounded-lg border p-3 text-sm" /><div className="flex gap-2">{(['rejected', 'confirmed'] as const).map(decision => <button key={decision} type="button" disabled={busy || (decision === 'rejected' && !comment.trim())} className={decision === 'confirmed' ? primary : button} onClick={() => void run(async () => { await command(`${base}/candidates/${candidate!.id}/decisions`, { contentHash: candidate!.contentHash, decision, comment: comment.trim() }); setComment(''); })}>{decision === 'confirmed' ? '确认此份需求无误' : '退回补充'}</button>)}</div></> : candidate && <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">{candidateStatus[candidate.status]} · 此处展示的是固定版本，修订后需重新确认。</p>}
      </div>}
    </div></div>}
  </section>;
}
