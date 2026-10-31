'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, FolderPlus, Image as ImageIcon, Layers, Loader2, Plus, SlidersHorizontal, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { fetchWithAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { createPlatformSpecs, imageStudioCategories, imageStudioPlatforms, type ImageStudioCategory, type ImageStudioPlatform } from '@/lib/image-studio-platform-specs';
import { ImageStudioModelSelector } from '@/components/image-studio/model-selector';
import { readStudioModelPreference, resolveStudioModels, saveStudioModelPreference, type StudioModelProfile, type StudioModelSelection } from '@/lib/image-studio-models';

type Project = { id: string; name: string; platform: string | null; status: string; version: number; updatedAt: string; workflow?: Record<string, any> };
type Result<T> = { success: boolean; data: T; message?: string };

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetchWithAuth(path, options);
  const body = await response.json() as Result<T>;
  if (!response.ok || !body.success) throw new Error(body.message || '请求失败');
  return body.data;
}

export function ImageStudioProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [creationMode, setCreationMode] = useState<'brand' | 'product'>('brand');
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState<ImageStudioPlatform>('taobao');
  const [category, setCategory] = useState<ImageStudioCategory>('unspecified');
  const [categoryDetail, setCategoryDetail] = useState('');
  const [channel, setChannel] = useState('');
  const [outputKeys, setOutputKeys] = useState<string[]>(['main', 'detail']);
  const [brandName, setBrandName] = useState('');
  const [brandBusiness, setBrandBusiness] = useState('');
  const [brandAudience, setBrandAudience] = useState('');
  const [brandStage, setBrandStage] = useState<'new' | 'refresh'>('new');
  const [brandOutputs, setBrandOutputs] = useState<string[]>(['logo', 'brand-kit', 'social']);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [profiles, setProfiles] = useState<StudioModelProfile[]>([]);
  const [modelSelection, setModelSelection] = useState<StudioModelSelection | null>(null);
  const [modelsLoading, setModelsLoading] = useState(true);
  const [modelsError, setModelsError] = useState('');
  const selectedModels = resolveStudioModels(profiles, modelSelection);

  useEffect(() => { setModelSelection(readStudioModelPreference()); }, []);
  const changeModelSelection = (selection: StudioModelSelection) => {
    setModelSelection(selection);
    saveStudioModelPreference(selection);
  };

  const load = async () => {
    try { const result = await request<{ items: Project[] }>('/image-studio/projects'); setProjects(result.items); }
    catch (error) { toast.error(error instanceof Error ? error.message : '项目加载失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    let cancelled = false;
    void request<StudioModelProfile[]>('/image-studio/model-profiles').then((items) => {
      if (!cancelled) setProfiles(items);
    }).catch((error) => { if (!cancelled) setModelsError(error instanceof Error ? error.message : '模型加载失败，请刷新后重试'); })
      .finally(() => { if (!cancelled) setModelsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const projectName = name.trim();
    if (!projectName || saving || modelsLoading) return;
    setSaving(true);
    try {
      const workflow = creationMode === 'brand'
        ? {
          modelProfiles: selectedModels,
          workbench: { designMode: 'brand' },
          brandSetup: {
            brandName: brandName.trim() || projectName,
            business: brandBusiness.trim(), audience: brandAudience.trim(), stage: brandStage,
            deliverables: brandOutputs,
          },
        }
        : (() => {
          const platformSpecs = createPlatformSpecs(platform, category, outputKeys);
          return { productCategory: category, modelProfiles: selectedModels, workbench: { designMode: 'product' }, specs: { ...platformSpecs, categoryDetail: categoryDetail.trim(), channel: channel.trim() } };
        })();
      const created = await request<Project>('/image-studio/projects', { method: 'POST', body: JSON.stringify({
        name: projectName, platform: creationMode === 'brand' ? null : platform, workflow,
      }) });
      window.location.assign(`/service/image-studio/${created.id}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : '创建项目失败'); }
    finally { setSaving(false); }
  };

  const openCreateDialog = () => {
    setCreationMode('brand');
    setName('');
    setPlatform('taobao');
    setCategory('unspecified');
    setCategoryDetail('');
    setChannel('');
    setOutputKeys(['main', 'detail']);
    setBrandName('');
    setBrandBusiness('');
    setBrandAudience('');
    setBrandStage('new');
    setBrandOutputs(['logo', 'brand-kit', 'social']);
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
      setBrandName('');
      setBrandBusiness('');
      setBrandAudience('');
      setBrandStage('new');
      setBrandOutputs(['logo', 'brand-kit', 'social']);
    }
  };

  const changePlatform = (value: ImageStudioPlatform) => {
    setPlatform(value);
    setOutputKeys(createPlatformSpecs(value, category).outputs.filter((item) => item.enabled).map((item) => item.key));
  };
  const projectOutputs = createPlatformSpecs(platform, category).outputs;
  const brandOutputChoices = [
    { id: 'logo', label: 'Logo 设计（SVG 矢量交付）', hint: '概念方向、可编辑 SVG 源文件及透明 PNG' },
    { id: 'brand-kit', label: '品牌规范', hint: '颜色、字体与图形语言' },
    { id: 'social', label: '社媒物料', hint: '头像、封面与宣传图' },
    { id: 'packaging', label: '包装视觉', hint: '包装正面与应用效果' },
  ];

  return <main className="min-h-screen bg-[#f6f7fb] text-slate-900">
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
      <header className="flex flex-col gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div><div className="flex items-center gap-2 text-sm font-semibold text-indigo-700"><Sparkles className="h-4 w-4" />生图工作台</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">品牌与商品创作</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">从品牌定位与视觉识别，到商品套图和应用物料，在同一工作台完成策划、生成与审稿。</p>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
          <Button asChild variant="outline" className="h-11 w-full rounded-xl border-indigo-200 px-5 text-indigo-700 hover:bg-indigo-50 sm:w-auto"><Link href="/service/image-studio/workspace/canvas"><Layers className="h-4 w-4" />无限画布</Link></Button>
          <Button type="button" onClick={openCreateDialog} className="h-11 w-full rounded-xl bg-indigo-600 px-5 text-white shadow-sm hover:bg-indigo-700 sm:w-auto"><Plus className="h-4 w-4" />新建项目</Button>
        </div>
      </header>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5" aria-label="新项目模型选择">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal className="size-4 text-slate-500" />创作模型</h2><p className="text-xs text-slate-400">用于新项目，进入工作台后可调整</p></div>
        <ImageStudioModelSelector profiles={profiles} value={selectedModels} onChange={changeModelSelection} loading={modelsLoading} />
        {modelsError && <p role="alert" className="mt-3 text-xs text-rose-600">{modelsError}</p>}
        {!modelsLoading && !modelsError && !profiles.length && <p className="mt-3 text-xs text-amber-700">暂无可用模型，请联系管理员添加并启用模型。</p>}
      </section>

      <div className="mt-7">
        <section>
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">最近项目</h2><span className="text-xs text-slate-400">{projects.length} 个项目</span></div>
          {loading ? <div className="flex min-h-48 items-center justify-center text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div> : projects.length === 0 ?
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-14 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><ImageIcon className="h-7 w-7" /></div><p className="mt-4 font-semibold">还没有创作项目</p><p className="mt-1 text-sm text-slate-500">创建品牌识别项目或商品套图项目，Agent 会按类型安排后续步骤。</p><Button type="button" onClick={openCreateDialog} className="mt-5 h-10 rounded-xl bg-indigo-600 px-4 text-white hover:bg-indigo-700"><Plus className="h-4 w-4" />创建第一个项目</Button></div> :
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{projects.map((project) => <Link key={project.id} href={`/service/image-studio/${project.id}`} className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md">
              <div className="flex items-start justify-between"><div className="rounded-xl bg-indigo-50 p-2.5 text-indigo-700"><ImageIcon className="h-4 w-4" /></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] text-slate-500">{project.workflow?.workbench?.designMode === 'brand' ? '品牌设计' : imageStudioPlatforms.find((item) => item.value === project.platform)?.label || project.platform || '未指定平台'}</span></div>
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
            <div className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-700"><FolderPlus className="h-5 w-5" /></div><div><DialogTitle className="text-base font-semibold">创建创作项目</DialogTitle><DialogDescription className="mt-1 text-xs leading-5">先选择创作目标，工作台会按对应流程准备 Agent 和画布。</DialogDescription></div></div>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
            <fieldset>
              <legend className="text-sm font-medium text-slate-700">这次要创作什么？</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button type="button" aria-pressed={creationMode === 'brand'} onClick={() => setCreationMode('brand')} className={`rounded-xl border p-3 text-left transition ${creationMode === 'brand' ? 'border-violet-400 bg-violet-50 ring-1 ring-violet-100' : 'border-slate-200 hover:border-violet-200'}`}><span className="flex items-center gap-2 text-xs font-semibold text-slate-800"><Sparkles className="size-4 text-violet-600" />品牌设计</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">从定位、视觉方向到品牌资产</span></button>
                <button type="button" aria-pressed={creationMode === 'product'} onClick={() => setCreationMode('product')} className={`rounded-xl border p-3 text-left transition ${creationMode === 'product' ? 'border-indigo-400 bg-indigo-50 ring-1 ring-indigo-100' : 'border-slate-200 hover:border-indigo-200'}`}><span className="flex items-center gap-2 text-xs font-semibold text-slate-800"><ImageIcon className="size-4 text-indigo-600" />商品套图</span><span className="mt-1 block text-[10px] leading-4 text-slate-500">围绕商品图策划电商素材</span></button>
              </div>
            </fieldset>
            <label htmlFor="image-studio-project-name" className="block text-sm font-medium text-slate-700">项目名称 <span className="text-rose-500">*</span>
              <Input id="image-studio-project-name" autoFocus required maxLength={160} value={name} onChange={(event) => setName(event.target.value)} placeholder={creationMode === 'brand' ? '例如：山野茶品牌升级' : '例如：春季新品商品套图'} className="mt-2 h-11 rounded-xl px-3" />
              <span className="mt-1.5 flex justify-between text-[11px] font-normal text-slate-400"><span>{creationMode === 'brand' ? '项目名称默认作为品牌名称，也可以单独填写。' : '建议使用商品名或本次创作目标。'}</span><span>{name.length}/160</span></span>
            </label>
            {creationMode === 'brand' ? <>
              <label htmlFor="image-studio-brand-name" className="block text-sm font-medium text-slate-700">品牌名称（选填）
                <Input id="image-studio-brand-name" maxLength={120} value={brandName} onChange={(event) => setBrandName(event.target.value)} placeholder={name || '默认使用项目名称'} className="mt-2 h-11 rounded-xl px-3" />
              </label>
              <label htmlFor="image-studio-brand-business" className="block text-sm font-medium text-slate-700">品牌做什么？（选填）
                <Input id="image-studio-brand-business" maxLength={200} value={brandBusiness} onChange={(event) => setBrandBusiness(event.target.value)} placeholder="例如：面向通勤人群的精品茶饮" className="mt-2 h-11 rounded-xl px-3" />
              </label>
              <fieldset>
                <legend className="text-sm font-medium text-slate-700">创作起点</legend>
                <div className="mt-2 grid grid-cols-2 gap-2"><button type="button" aria-pressed={brandStage === 'new'} onClick={() => setBrandStage('new')} className={`h-10 rounded-xl border px-3 text-xs font-medium ${brandStage === 'new' ? 'border-violet-400 bg-violet-50 text-violet-800' : 'border-slate-200 text-slate-600'}`}>从零建立</button><button type="button" aria-pressed={brandStage === 'refresh'} onClick={() => setBrandStage('refresh')} className={`h-10 rounded-xl border px-3 text-xs font-medium ${brandStage === 'refresh' ? 'border-violet-400 bg-violet-50 text-violet-800' : 'border-slate-200 text-slate-600'}`}>升级现有品牌</button></div>
              </fieldset>
              <label htmlFor="image-studio-brand-audience" className="block text-sm font-medium text-slate-700">主要面向谁？（选填）
                <Input id="image-studio-brand-audience" maxLength={180} value={brandAudience} onChange={(event) => setBrandAudience(event.target.value)} placeholder="不确定可以留空，交给 Agent 推荐" className="mt-2 h-11 rounded-xl px-3" />
              </label>
              <fieldset>
                <legend className="text-sm font-medium text-slate-700">希望先做哪些内容？</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">{brandOutputChoices.map((item) => <label key={item.id} className="flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border border-slate-200 px-3 py-2.5 text-xs text-slate-700"><input type="checkbox" checked={brandOutputs.includes(item.id)} onChange={(event) => setBrandOutputs((current) => event.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))} className="mt-0.5 h-4 w-4 accent-violet-600" /><span><span className="block font-semibold">{item.label}</span><span className="mt-0.5 block text-[11px] text-slate-500">{item.hint}</span></span></label>)}</div>
                {!brandOutputs.length && <p className="mt-2 text-xs text-rose-600">至少选一项，Agent 才能安排制作计划。</p>}
              </fieldset>
              <div className="rounded-xl bg-violet-50 p-3.5 text-xs leading-5 text-violet-800"><Sparkles className="mr-1.5 inline h-3.5 w-3.5" />创建后，Agent 会先整理品牌定位并推荐视觉方向。Logo 按“概念确认 → 可编辑 SVG 矢量稿 → 文件校验与交付”推进；PNG 仅作为预览和使用副本。</div>
            </> : <>
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
            </>}
            <details className="group rounded-xl border border-slate-200 bg-slate-50/60" aria-label="本项目使用的模型"><summary className="flex cursor-pointer list-none items-center gap-2 px-3.5 py-3 text-xs font-semibold text-slate-700 [&::-webkit-details-marker]:hidden"><SlidersHorizontal className="size-3.5 shrink-0 text-slate-500" /><span className="shrink-0">创作模型</span><span className="ml-auto min-w-0 truncate text-[11px] font-normal text-slate-400">{profiles.find((profile) => profile.id === selectedModels.imageProfileId)?.name || '选择模型'}</span><ChevronDown className="size-3.5 shrink-0 text-slate-400 transition group-open:rotate-180" /></summary><div className="border-t border-slate-200/70 p-3"><ImageStudioModelSelector profiles={profiles} value={selectedModels} onChange={changeModelSelection} loading={modelsLoading} disabled={saving} stacked />{modelsError && <p role="alert" className="mt-2 text-xs text-rose-600">{modelsError}</p>}</div></details>
            {creationMode === 'product' && <div className="rounded-xl bg-slate-50 p-3.5 text-xs leading-5 text-slate-500"><Sparkles className="mr-1.5 inline h-3.5 w-3.5 text-indigo-600" />创建后进入项目工作台，上传商品图片后由 Agent 规划套图并安排生成。</div>}
          </div>
          <DialogFooter className="border-t border-slate-100 bg-white px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" disabled={saving} onClick={() => updateCreateDialog(false)} className="h-10 rounded-xl px-5">取消</Button>
            <Button type="submit" disabled={saving || modelsLoading || !name.trim() || (creationMode === 'brand' ? !brandOutputs.length : !outputKeys.length)} aria-busy={saving} className="h-10 rounded-xl bg-indigo-600 px-5 text-white hover:bg-indigo-700">{saving ? <><Loader2 className="h-4 w-4 animate-spin" />正在创建…</> : <><Plus className="h-4 w-4" />创建并进入项目</>}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </main>;
}
