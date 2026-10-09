'use client';

import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Edit3, Plus, RotateCcw, Save, Tag, X } from 'lucide-react';
import { fetchWithAuth } from '@/lib/auth';
import { toast } from 'sonner';

type FormCategory = { id: string; name: string; description: string; sortOrder: number; isActive: boolean; updatedAt: string };
const inputClass = 'h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100';

export function FormCategoryManager() {
  const [categories, setCategories] = useState<FormCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [sortOrder, setSortOrder] = useState('0');

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth('/form-templates/categories');
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '类目加载失败');
      setCategories(result.data || []);
    } catch (error) { toast.error(error instanceof Error ? error.message : '类目加载失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const clearEditor = () => { setEditingId(null); setName(''); setDescription(''); setSortOrder('0'); };
  const edit = (category: FormCategory) => { setEditingId(category.id); setName(category.name); setDescription(category.description); setSortOrder(String(category.sortOrder)); };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return toast.error('请填写类目名称');
    setBusy(true);
    try {
      const current = categories.find((item) => item.id === editingId);
      const payload = { name: name.trim(), description: description.trim(), sortOrder: Number(sortOrder) || 0, isActive: current?.isActive ?? true };
      const response = await fetchWithAuth(editingId ? `/form-templates/categories/${editingId}` : '/form-templates/categories', { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '保存类目失败');
      clearEditor(); await load(); toast.success(editingId ? '类目已更新' : '类目已创建');
    } catch (error) { toast.error(error instanceof Error ? error.message : '保存类目失败'); }
    finally { setBusy(false); }
  };

  const toggleActive = async (category: FormCategory) => {
    setBusy(true);
    try {
      const response = await fetchWithAuth(`/form-templates/categories/${category.id}`, { method: 'PUT', body: JSON.stringify({ name: category.name, description: category.description, sortOrder: category.sortOrder, isActive: !category.isActive }) });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || '更新类目状态失败');
      await load(); toast.success(category.isActive ? '类目已停用' : '类目已恢复');
    } catch (error) { toast.error(error instanceof Error ? error.message : '更新类目状态失败'); }
    finally { setBusy(false); }
  };

  return <main className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm sm:p-7">
        <Link href="/admin/settings/forms" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"><ArrowLeft className="h-4 w-4" />返回表单设计器</Link>
        <div className="mt-4 flex items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700"><Tag className="h-5 w-5" /></span><div><h1 className="text-xl font-bold text-slate-900">表单类目管理</h1><p className="mt-1 text-sm leading-6 text-slate-500">维护题库类目及其说明。停用只会隐藏新建表单时的选项，不会改动已发布表单和历史需求。</p></div></div>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5"><div><h2 className="text-sm font-bold text-slate-800">类目列表</h2><p className="mt-1 text-xs text-slate-400">{categories.filter((item) => item.isActive).length} 个启用 · {categories.length} 个全部</p></div><button type="button" onClick={() => { clearEditor(); document.getElementById('category-editor-name')?.focus(); }} className="flex h-9 items-center gap-1 rounded-xl bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"><Plus className="h-4 w-4" />新建类目</button></div>
          {loading ? <p className="p-8 text-center text-sm text-slate-400">加载中…</p> : categories.length ? <div className="divide-y divide-slate-100">{categories.map((category) => <article key={category.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate text-sm font-semibold text-slate-800">{category.name}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${category.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{category.isActive ? '启用' : '停用'}</span></div><p className="mt-1 truncate text-xs text-slate-500">{category.description || '暂无类目说明'}</p><p className="mt-1 text-[10px] text-slate-400">排序值 {category.sortOrder}</p></div><button type="button" onClick={() => edit(category)} className="flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-700"><Edit3 className="h-3.5 w-3.5" />编辑</button><button type="button" disabled={busy} onClick={() => void toggleActive(category)} className="flex h-9 items-center gap-1 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-600 hover:border-amber-300 hover:text-amber-700 disabled:opacity-50">{category.isActive ? <><X className="h-3.5 w-3.5" />停用</> : <><RotateCcw className="h-3.5 w-3.5" />恢复</>}</button></article>)}</div> : <p className="p-8 text-center text-sm text-slate-400">暂无类目，先创建一个类目。</p>}
        </section>

        <form onSubmit={(event) => void save(event)} className="space-y-4 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex items-center justify-between"><div><h2 className="text-sm font-bold text-slate-800">{editingId ? '编辑类目' : '新建类目'}</h2><p className="mt-1 text-xs text-slate-400">类目可对应一种设计业务或需求主题。</p></div>{editingId && <button type="button" onClick={clearEditor} className="text-xs font-semibold text-slate-500">取消编辑</button>}</div>
          <div><label htmlFor="category-editor-name" className="mb-1.5 block text-xs font-semibold text-slate-600">类目名称 <span className="text-rose-500">*</span></label><input id="category-editor-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className={inputClass} placeholder="如：电商视觉" /></div>
          <div><label className="mb-1.5 block text-xs font-semibold text-slate-600">类目说明</label><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={3} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" placeholder="说明类目适用的业务范围" /></div>
          <div><label className="mb-1.5 block text-xs font-semibold text-slate-600">排序值</label><input type="number" min={0} max={10000} value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} className={inputClass} /><p className="mt-1 text-[11px] text-slate-400">数字越小越靠前。</p></div>
          {editingId && <p className="rounded-xl bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800">系统预置题库或现有表单使用的类目不能直接改名。停用只影响新表单选择，不会改动历史表单。</p>}
          <button type="submit" disabled={busy} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">{editingId ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}{busy ? '保存中…' : editingId ? '保存修改' : '创建类目'}</button>
        </form>
      </div>
    </div>
  </main>;
}
