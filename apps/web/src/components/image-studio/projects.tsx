'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FolderPlus, Image as ImageIcon, Loader2, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createPlatformSpecs, imageStudioCategories, imageStudioPlatforms, type ImageStudioCategory, type ImageStudioPlatform } from '@/lib/image-studio-platform-specs';

type Project = { id: string; name: string; platform: string | null; status: string; version: number; updatedAt: string };
type Result<T> = { success: boolean; data: T; message?: string };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(path, options);
  const body = await response.json() as Result<T>;
  if (!response.ok || !body.success) throw new Error(body.message || '请求失败');
  return body.data;
}

export function ImageStudioProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<ImageStudioPlatform>('taobao');
  const [category, setCategory] = useState<ImageStudioCategory>('unspecified');
  const [categoryDetail, setCategoryDetail] = useState('');
  const [channel, setChannel] = useState('');
  const [outputKeys, setOutputKeys] = useState<string[]>(['main', 'detail']);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    try { const result = await request<{ items: Project[] }>('/image-studio/projects'); setProjects(result.items); }
    catch (error) { toast.error(error instanceof Error ? error.message : '项目加载失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const projectName = name.trim();
    if (!projectName || saving) return;
    setSaving(true);
    try {
      const platformSpecs = createPlatformSpecs(platform, category, outputKeys);
      const created = await request<Project>('/image-studio/projects', { method: 'POST', body: JSON.stringify({
        name: projectName, platform, workflow: { productCategory: category, specs: { ...platformSpecs, categoryDetail: categoryDetail.trim(), channel: channel.trim() } },
      }) });
      window.location.assign(`/service/image-studio/${created.id}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : '创建项目失败'); }
    finally { setSaving(false); }
  };

  const openCreateDialog = () => {
    setName('');
    setPlatform('taobao');
    setCategory('unspecified');
    setCategoryDetail('');
    setChannel('');
    setOutputKeys(['main', 'detail']);
    setCreateOpen(true);
  };

  const updateCreateDialog = (open: boolean) => {
    if (saving) return;
    setCreateOpen(open);
    if (!open) {
      setName('');
      setPlatform('taobao');
      setCategory('unspecified');
      setCategoryDetail('');
      setChannel('');
      setOutputKeys(['main', 'detail']);
    }
  };

  const changePlatform = (value: ImageStudioPlatform) => {
    setPlatform(value);
    setOutputKeys(createPlatformSpecs(value, category).outputs.filter((item) => item.enabled).map((item) => item.key));
  };
  const projectOutputs = createPlatformSpecs(platform, category).outputs;

  return <main className="min-h-screen bg-[#f6f7fb] text-slate-900">
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <header className="flex flex-col gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="flex items-center gap-2 text-sm font-semibold text-indigo-700"><Sparkles className="h-4 w-4" />生图工作台</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">商品视觉创作</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">从商品素材、创作方向到分镜与生成结果，所有项目和记录由工作台安全保存。</p>
        </div>
        <Button type="button" onClick={openCreateDialog} className="h-11 w-full shrink-0 rounded-xl bg-indigo-600 px-5 text-white shadow-sm hover:bg-indigo-700 sm:w-auto"><Plus className="h-4 w-4" />新建项目</Button>
      </header>

      <div className="mt-7">
        <section>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">最近项目</h2><span className="text-xs text-slate-400">{projects.length} 个项目</span></div>
          {loading ? <div className="flex min-h-48 items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div> : projects.length === 0 ?
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-14 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><ImageIcon className="h-7 w-7" /></div><p className="mt-4 font-semibold">还没有创作项目</p><p className="mt-1 text-sm text-slate-500">先创建项目，再整理素材、策划创意并生成图片。</p><Button type="button" onClick={openCreateDialog} className="mt-5 h-10 rounded-xl bg-indigo-600 px-4 text-white hover:bg-indigo-700"><Plus className="h-4 w-4" />创建第一个项目</Button></div> :
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{projects.map((project) => <Link key={project.id} href={`/service/image-studio/${project.id}`} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md">
              <div className="flex items-start justify-between"><div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700"><ImageIcon className="h-4 w-4" /></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500">{imageStudioPlatforms.find((item) => item.value === project.platform)?.label || project.platform || '未指定平台'}</span></div>
              <h3 className="mt-4 truncate font-semibold group-hover:text-indigo-700">{project.name}</h3><p className="mt-1 text-xs text-slate-400">更新于 {new Date(project.updatedAt).toLocaleString()}</p>
              <div className="mt-4 flex items-center gap-1 text-xs font-medium text-indigo-700">打开工作台 <span aria-hidden>→</span></div>
            </Link>)}</div>}
        </section>
      </div>
    </div>

    <Dialog open={createOpen} onOpenChange={updateCreateDialog}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-hidden rounded-3xl border-slate-200 bg-white p-0 shadow-2xl max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:rounded-t-3xl max-sm:max-h-[90dvh]">
        <form onSubmit={create} className="flex max-h-[inherit] flex-col">
          <DialogHeader className="border-b border-slate-100 px-5 pb-4 pt-5 pr-14 text-left sm:px-6 sm:pb-5 sm:pt-6">
            <div className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><FolderPlus className="h-5 w-5" /></div><div><DialogTitle className="text-base font-semibold">创建创作项目</DialogTitle><DialogDescription className="mt-1 text-xs leading-5">为商品视觉策划建立独立的素材、方案与生成记录。</DialogDescription></div></div>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
            <label htmlFor="image-studio-project-name" className="block text-sm font-medium text-slate-700">项目名称 <span className="text-rose-500">*</span>
              <Input id="image-studio-project-name" autoFocus required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：春季新品详情页" className="mt-2 h-11 rounded-xl px-3" />
              <span className="mt-1.5 flex justify-between text-[11px] font-normal text-slate-400"><span>建议使用商品名或本次创作目标。</span><span>{name.length}/160</span></span>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label htmlFor="image-studio-project-platform" className="block text-sm font-medium text-slate-700">发布平台
                <select id="image-studio-project-platform" value={platform} onChange={(event) => changePlatform(event.target.value as ImageStudioPlatform)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">{imageStudioPlatforms.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
              </label>
              <label htmlFor="image-studio-project-category" className="block text-sm font-medium text-slate-700">商品类目
                <select id="image-studio-project-category" value={category} onChange={(event) => setCategory(event.target.value as ImageStudioCategory)} className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100">{imageStudioCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
              </label>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label htmlFor="image-studio-project-channel" className="block text-sm font-medium text-slate-700">店铺 / 经营渠道（选填）
                <Input id="image-studio-project-channel" maxLength={120} value={channel} onChange={(event) => setChannel(event.target.value)} placeholder="如京东 POP、自营；未知可留空" className="mt-2 h-11 rounded-xl px-3" />
              </label>
              <label htmlFor="image-studio-project-category-detail" className="block text-sm font-medium text-slate-700">细分类目（选填）
                <Input id="image-studio-project-category-detail" maxLength={120} value={categoryDetail} onChange={(event) => setCategoryDetail(event.target.value)} placeholder="尽量填写发布页中的具体类目" className="mt-2 h-11 rounded-xl px-3" />
              </label>
            </div>
            <fieldset>
              <legend className="text-sm font-medium text-slate-700">本项目需要制作</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">{projectOutputs.map((item) => <label key={item.key} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-700">
                <input type="checkbox" checked={outputKeys.includes(item.key)} onChange={(event) => setOutputKeys((current) => event.target.checked ? [...new Set([...current, item.key])] : current.filter((key) => key !== item.key))} className="mt-0.5 h-4 w-4 accent-indigo-600" />
                <span><span className="block font-semibold">{item.label}</span><span className="mt-0.5 block text-[11px] text-slate-500">建议 {item.width}×{item.height} · {item.count}{item.key === 'detail' ? ' 个模块' : ' 张'}</span></span>
              </label>)}</div>
              {outputKeys.length === 0 && <p className="mt-2 text-xs text-rose-600">至少选择一种图片用途。</p>}
              <p className="mt-2 text-[11px] leading-5 text-slate-500">这些是可编辑的制作预设。规则状态和适用类目会在规格设置中显示，待核验项不会用于强制拦截。</p>
            </fieldset>
            <div className="rounded-xl bg-slate-50 p-3.5 text-xs leading-5 text-slate-500"><Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-indigo-600" />创建后进入项目工作台，可继续上传商品图片、整理创意方向和提交生成任务。</div>
          </div>
          <DialogFooter className="border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" disabled={saving} onClick={() => updateCreateDialog(false)} className="h-10 rounded-xl px-5">取消</Button>
            <Button type="submit" disabled={saving || !name.trim() || outputKeys.length === 0} aria-busy={saving} className="h-10 rounded-xl bg-indigo-600 px-5 text-white hover:bg-indigo-700">{saving ? <><Loader2 className="h-4 w-4 animate-spin" />正在创建…</> : <><Plus className="h-4 w-4" />创建并进入项目</>}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </main>;
}
