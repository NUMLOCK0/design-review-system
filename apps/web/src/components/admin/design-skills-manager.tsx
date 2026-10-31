'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DesignSkillDetailDialog } from '@/components/admin/design-skill-detail-dialog';
import { fetchWithAuth, getCurrentUser } from '@/lib/auth';
import type { DesignSkill, DesignSkillCategory, DesignSkillInput, DesignSkillQuestion, DesignSkillQuestionKind } from '@design-review/shared';
import { Bot, Check, CircleHelp, Eye, LoaderCircle, Plus, Search, Sparkles, ToggleLeft, ToggleRight, WandSparkles } from 'lucide-react';
import { toast } from 'sonner';

type SkillRecord = DesignSkill & { canEdit: boolean };
type DraftQuestion = Omit<DesignSkillQuestion, 'options'> & { optionsText: string };
type SkillDraft = Omit<DesignSkillInput, 'questions'> & { questions: DraftQuestion[] };
type ApiResult<T> = { success: boolean; message?: string; data?: T };

const categoryOptions: Array<{ value: DesignSkillCategory; label: string }> = [
  { value: 'brand_identity', label: '品牌视觉' }, { value: 'ecommerce', label: '电商设计' },
  { value: 'social_media', label: '社媒营销' }, { value: 'packaging', label: '包装设计' },
  { value: 'design_review', label: '设计审稿/修改' }, { value: 'other', label: '其他' },
];
const kindOptions: Array<{ value: DesignSkillQuestionKind; label: string }> = [
  { value: 'text', label: '单行文本' }, { value: 'textarea', label: '多行文本' }, { value: 'number', label: '数字' },
  { value: 'select', label: '下拉单选' }, { value: 'radio', label: '单选' }, { value: 'checkbox', label: '多选' },
  { value: 'date', label: '日期' }, { value: 'image', label: '图片上传' }, { value: 'file', label: '文件上传' },
];

function newQuestion(index: number): DraftQuestion {
  return { id: `question_${Date.now()}_${index}`, key: `requirement_${index}`, label: '', prompt: '', kind: 'textarea', required: true, priority: 50, placeholder: '', optionsText: '' };
}
function toDraft(skill?: DesignSkill | null): SkillDraft {
  if (!skill) return { name: '', category: 'ecommerce', description: '', instructions: '', completionCriteria: '', questions: [newQuestion(1)] };
  return { name: skill.name, category: skill.category, description: skill.description, instructions: skill.instructions,
    completionCriteria: skill.completionCriteria, questions: skill.questions.map((question) => ({ ...question, optionsText: (question.options || []).join('\n') })) };
}
function toPayload(draft: SkillDraft): DesignSkillInput {
  return { name: draft.name.trim(), category: draft.category, description: draft.description.trim(), instructions: draft.instructions.trim(),
    completionCriteria: draft.completionCriteria.trim(), questions: draft.questions.map(({ optionsText, ...question }) => ({
      ...question, label: question.label.trim(), key: question.key.trim(), prompt: question.prompt.trim(),
      options: optionsText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
    })) };
}

export function DesignSkillsManager() {
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selected, setSelected] = useState<SkillRecord | null>(null);
  const [detailSkill, setDetailSkill] = useState<SkillRecord | null>(null);
  const [draft, setDraft] = useState<SkillDraft | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userName, setUserName] = useState('客服');

  const load = async () => {
    setLoading(true);
    try {
      const response = await fetchWithAuth('/design-skills');
      const result = await response.json() as ApiResult<SkillRecord[]>;
      if (!response.ok || !result.success) throw new Error(result.message || '加载 Skills 失败');
      setSkills(result.data || []);
    } catch (error) { toast.error(error instanceof Error ? error.message : '加载 Skills 失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const user = getCurrentUser();
    setIsAdmin(user?.role === 'admin');
    setUserName(user?.name || '客服');
    void load();
  }, []);

  const visibleSkills = useMemo(() => skills.filter((skill) => {
    const matchesCategory = !categoryFilter || skill.category === categoryFilter;
    const query = search.trim().toLocaleLowerCase();
    const matchesQuery = !query || `${skill.name} ${skill.description} ${skill.instructions}`.toLocaleLowerCase().includes(query);
    return matchesCategory && matchesQuery;
  }), [skills, categoryFilter, search]);

  const startCreate = () => { setSelected(null); setDraft(toDraft()); setIsOpen(true); };
  const startEdit = (skill: SkillRecord) => { setDetailSkill(null); setSelected(skill); setDraft(toDraft(skill)); setIsOpen(true); };
  const closeDialog = (open: boolean) => { if (!saving) { setIsOpen(open); if (!open) { setSelected(null); setDraft(null); } } };
  const patchDraft = (patch: Partial<SkillDraft>) => setDraft((current) => current ? { ...current, ...patch } : current);
  const patchQuestion = (id: string, patch: Partial<DraftQuestion>) => setDraft((current) => current ? {
    ...current, questions: current.questions.map((question) => question.id === id ? { ...question, ...patch } : question),
  } : current);
  const addQuestion = () => setDraft((current) => {
    if (!current) return current;
    const nextIndex = current.questions.reduce((max, question) => {
      const match = question.key.match(/^requirement_(\d+)$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
    return { ...current, questions: [...current.questions, newQuestion(nextIndex)] };
  });
  const removeQuestion = (id: string) => setDraft((current) => current ? { ...current, questions: current.questions.filter((question) => question.id !== id) } : current);

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    try {
      const response = await fetchWithAuth(selected ? `/design-skills/${encodeURIComponent(selected.id)}` : '/design-skills', {
        method: selected ? 'PUT' : 'POST', body: JSON.stringify(toPayload(draft)),
      });
      const result = await response.json() as ApiResult<SkillRecord>;
      if (!response.ok || !result.success) throw new Error(result.message || '保存 Skill 失败');
      toast.success(selected ? 'Skill 已更新，客服端共享配置已同步' : 'Skill 已创建并共享给所有客服');
      setIsOpen(false); setSelected(null); setDraft(null);
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : '保存 Skill 失败'); }
    finally { setSaving(false); }
  };

  const toggleEnabled = async (skill: SkillRecord) => {
    try {
      const response = await fetchWithAuth(`/design-skills/${encodeURIComponent(skill.id)}/enabled`, {
        method: 'PUT', body: JSON.stringify({ enabled: !skill.isEnabled }),
      });
      const result = await response.json() as ApiResult<SkillRecord[]>;
      if (!response.ok || !result.success) throw new Error(result.message || '更新启用状态失败');
      setSkills(result.data || []);
      toast.success(skill.isEnabled ? 'Skill 已停用' : 'Skill 已启用');
    } catch (error) { toast.error(error instanceof Error ? error.message : '更新启用状态失败'); }
  };

  return <div className="mx-auto max-w-7xl space-y-5 p-3 sm:p-6 lg:p-8">
    <div className="overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-violet-50 p-5 shadow-sm sm:p-7">
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-center">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200"><WandSparkles className="h-5 w-5" /></div>
          <div><h1 className="text-xl font-bold text-slate-900">设计需求 Skills</h1><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-600">按设计场景配置 AI 识别指引、需求字段和完成标准。客服新增后立即共享给所有客服，管理员可统一管理启停。</p></div>
        </div>
        <Button onClick={startCreate} className="h-10 shrink-0 rounded-xl bg-indigo-600 text-xs hover:bg-indigo-700"><Plus className="mr-1.5 h-4 w-4" />新增 Skill</Button>
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <label className="flex min-h-10 flex-1 items-center gap-2 rounded-xl border border-white bg-white/85 px-3 shadow-sm"><Search className="h-4 w-4 text-slate-400" /><input aria-label="搜索 Skill" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索名称、说明或识别指引" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>
        <select aria-label="按设计类型筛选" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} className="h-10 rounded-xl border border-white bg-white/90 px-3 text-xs text-slate-700 shadow-sm"><option value="">全部设计类型</option>{categoryOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
      </div>
    </div>

    <div className="flex items-center justify-between px-1"><p className="text-xs font-semibold text-slate-600">共享 Skills <span className="ml-1 text-slate-400">{visibleSkills.length}</span></p><Button type="button" variant="ghost" onClick={() => void load()} disabled={loading} className="h-8 rounded-lg px-2 text-xs text-slate-500"><LoaderCircle className={`mr-1 h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />刷新</Button></div>
    {loading ? <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center text-xs text-slate-400">正在加载共享 Skills…</div>
      : visibleSkills.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-12 text-center"><Bot className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-3 text-sm font-semibold text-slate-600">{search || categoryFilter ? '没有匹配的 Skill' : '还没有设计需求 Skill'}</p><p className="mt-1 text-xs text-slate-400">先创建一个场景模板，配置 AI 要识别的信息和需要询问的问题。</p>{!search && !categoryFilter && <Button onClick={startCreate} variant="outline" className="mt-4 h-9 rounded-xl text-xs"><Plus className="mr-1 h-4 w-4" />创建第一个 Skill</Button>}</div>
      : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visibleSkills.map((skill) => {
        const category = categoryOptions.find((item) => item.value === skill.category)?.label || '其他';
        return <Card key={skill.id} className={`overflow-hidden rounded-2xl border-white/80 bg-white/85 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${!skill.isEnabled ? 'opacity-65' : ''}`}>
          <CardContent className="p-5">
            <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-600"><Sparkles className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate text-sm font-bold text-slate-900">{skill.name}</h2><Badge variant="outline" className="border-indigo-100 bg-indigo-50 text-[10px] text-indigo-700">{category}</Badge></div><p className="mt-1 line-clamp-2 min-h-9 text-[11px] leading-5 text-slate-500">{skill.description}</p></div></div>
            <div className="mt-4 flex flex-wrap gap-1.5">{skill.questions.slice(0, 3).map((question) => <span key={question.id} className="max-w-full truncate rounded-lg bg-slate-50 px-2 py-1 text-[10px] text-slate-600">{question.label || question.key}{question.required ? ' · 必填' : ''}</span>)}{skill.questions.length > 3 && <span className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] text-slate-400">+{skill.questions.length - 3}</span>}</div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] text-slate-400"><span>由 {skill.createdByName || '客服'} 创建</span><span>v{skill.version} · {skill.questions.length} 个问题</span></div>
            <div className="mt-3 flex items-center justify-between gap-2"><Badge variant="outline" className={skill.isEnabled ? 'border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700' : 'border-slate-200 bg-slate-100 text-[10px] text-slate-500'}>{skill.isEnabled ? '已启用' : '已停用'}</Badge><div className="flex gap-2">{isAdmin && <Button type="button" variant="ghost" onClick={() => void toggleEnabled(skill)} className="h-8 rounded-lg px-2 text-[11px] text-slate-500">{skill.isEnabled ? <><ToggleRight className="mr-1 h-4 w-4 text-emerald-600" />停用</> : <><ToggleLeft className="mr-1 h-4 w-4" />启用</>}</Button>}<Button type="button" variant="outline" onClick={() => setDetailSkill(skill)} className="h-8 rounded-lg px-3 text-[11px]"><Eye className="mr-1 h-3.5 w-3.5" />查看详情</Button></div></div>
          </CardContent>
        </Card>;
      })}</div>}

    <div className="flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-[11px] leading-5 text-blue-800"><CircleHelp className="mt-0.5 h-4 w-4 shrink-0" /><p>Skill 配置由服务端统一保存。客服新增的模板所有客服都能查看和使用；客服仅能编辑自己创建的模板，管理员可以编辑任意模板并启用或停用。</p></div>

    <DesignSkillDetailDialog
      skill={detailSkill}
      onOpenChange={(open) => { if (!open) setDetailSkill(null); }}
      onEdit={startEdit}
    />

    <Dialog open={isOpen} onOpenChange={closeDialog}>
      <DialogContent showCloseButton={!saving} className="flex max-h-[92dvh] max-w-4xl flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:rounded-2xl">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4 pr-14 text-left sm:px-6"><DialogTitle className="text-base">{selected ? '编辑设计 Skill' : '新增设计 Skill'}</DialogTitle><DialogDescription className="text-xs">配置场景说明、AI 识别指引，以及品牌方需要回答的结构化问题。</DialogDescription></DialogHeader>
        {draft && <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
            <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-xs font-semibold text-slate-700">Skill 名称<Input required maxLength={100} value={draft.name} onChange={(event) => patchDraft({ name: event.target.value })} placeholder="例如：电商主图需求收集" className="rounded-xl" /></label><label className="space-y-1.5 text-xs font-semibold text-slate-700">设计类型<select value={draft.category} onChange={(event) => patchDraft({ category: event.target.value as DesignSkillCategory })} className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-normal">{categoryOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></div>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-700">用途说明<Textarea required maxLength={500} value={draft.description} onChange={(event) => patchDraft({ description: event.target.value })} placeholder="说明什么类型的设计需求应该使用此 Skill" className="min-h-16 rounded-xl text-xs" /></label>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-700">AI 识别与追问指引 <span className="font-normal text-slate-400">（可选）</span><Textarea maxLength={8000} value={draft.instructions} onChange={(event) => patchDraft({ instructions: event.target.value })} placeholder="例如：优先从聊天和参考图识别商品、风格和渠道；不要重复询问已明确的信息；不要推测品牌事实。" className="min-h-24 rounded-xl text-xs leading-5" /></label>
            <label className="block space-y-1.5 text-xs font-semibold text-slate-700">完成标准 <span className="font-normal text-slate-400">（可选）</span><Textarea maxLength={2000} value={draft.completionCriteria} onChange={(event) => patchDraft({ completionCriteria: event.target.value })} placeholder="说明收集到哪些关键信息后，需求可以提交客服确认" className="min-h-16 rounded-xl text-xs" /></label>

            <div className="space-y-3 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3 sm:p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-xs font-bold text-slate-800">需求问题配置</h3><p className="mt-1 text-[10px] text-slate-500">AI 根据已识别信息跳过已回答项，再将缺失问题组合成聊天表单。</p></div><Button type="button" variant="outline" onClick={addQuestion} className="h-8 rounded-lg border-indigo-200 bg-white px-2.5 text-[10px] text-indigo-700"><Plus className="mr-1 h-3.5 w-3.5" />添加问题</Button></div>
              {draft.questions.map((question, index) => <section key={question.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between"><p className="text-[11px] font-bold text-slate-700">问题 {index + 1}</p><button type="button" disabled={draft.questions.length <= 1} onClick={() => removeQuestion(question.id)} className="text-[10px] text-rose-500 disabled:cursor-not-allowed disabled:text-slate-300">移除</button></div>
                <div className="grid gap-3 sm:grid-cols-[1fr_1fr_160px]">
                  <label className="space-y-1 text-[10px] font-semibold text-slate-600">字段标签<Input required maxLength={100} value={question.label} onChange={(event) => patchQuestion(question.id, { label: event.target.value })} placeholder="例如：目标平台" className="h-9 rounded-lg text-xs" /></label>
                  <label className="space-y-1 text-[10px] font-semibold text-slate-600">字段 Key<Input required maxLength={64} pattern="[a-z][a-z0-9_]*" value={question.key} onChange={(event) => patchQuestion(question.id, { key: event.target.value })} placeholder="target_platform" className="h-9 rounded-lg font-mono text-xs" /></label>
                  <label className="space-y-1 text-[10px] font-semibold text-slate-600">回答组件<select value={question.kind} onChange={(event) => patchQuestion(question.id, { kind: event.target.value as DesignSkillQuestionKind })} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-normal">{kindOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
                </div>
                <label className="block space-y-1 text-[10px] font-semibold text-slate-600">问题说明 / AI 追问语境<Textarea maxLength={500} value={question.prompt} onChange={(event) => patchQuestion(question.id, { prompt: event.target.value })} placeholder="描述希望向品牌方确认的具体信息" className="min-h-14 rounded-lg text-xs" /></label>
                <div className="grid gap-3 sm:grid-cols-[1fr_140px_100px]">
                  <label className="space-y-1 text-[10px] font-semibold text-slate-600">填写提示<Input maxLength={200} value={question.placeholder || ''} onChange={(event) => patchQuestion(question.id, { placeholder: event.target.value })} placeholder="显示在回答输入框中" className="h-9 rounded-lg text-xs" /></label>
                  <label className="space-y-1 text-[10px] font-semibold text-slate-600">追问优先级（1–100）<Input type="number" min={1} max={100} value={question.priority} onChange={(event) => patchQuestion(question.id, { priority: Number(event.target.value) || 1 })} className="h-9 rounded-lg text-xs" /></label>
                  <label className="flex min-h-9 items-center gap-2 self-end rounded-lg border border-slate-200 px-2 text-[10px] font-semibold text-slate-600"><input type="checkbox" checked={question.required} onChange={(event) => patchQuestion(question.id, { required: event.target.checked })} className="h-4 w-4 accent-indigo-600" />必须确认</label>
                </div>
                {['select', 'radio', 'checkbox'].includes(question.kind) && <label className="block space-y-1 text-[10px] font-semibold text-slate-600">选项 <span className="font-normal text-slate-400">（每行一个）</span><Textarea value={question.optionsText} onChange={(event) => patchQuestion(question.id, { optionsText: event.target.value })} placeholder={'淘宝\n抖音\n小红书'} className="min-h-16 rounded-lg text-xs" /></label>}
              </section>)}
            </div>
            <p className="rounded-xl bg-slate-50 p-3 text-[10px] leading-5 text-slate-500">由 {selected?.createdByName || userName} 创建。客服创建的 Skill 会立即共享；管理员可以在列表中统一停用或重新启用。</p>
          </div>
          <DialogFooter className="shrink-0 border-t border-slate-100 bg-white px-5 py-3 sm:px-6"><Button type="button" variant="outline" disabled={saving} onClick={() => closeDialog(false)} className="h-9 rounded-xl text-xs">取消</Button><Button type="submit" disabled={saving || !draft.questions.length} className="h-9 rounded-xl bg-indigo-600 text-xs hover:bg-indigo-700">{saving ? <><LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />保存中</> : <><Check className="mr-1.5 h-3.5 w-3.5" />{selected ? '保存修改' : '创建并共享'}</>}</Button></DialogFooter>
        </form>}
      </DialogContent>
    </Dialog>
  </div>;
}
