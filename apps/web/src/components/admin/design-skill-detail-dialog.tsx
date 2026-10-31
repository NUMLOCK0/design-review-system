'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { DesignSkill, DesignSkillCategory, DesignSkillQuestionKind } from '@design-review/shared';

export type DesignSkillDetailRecord = DesignSkill & { canEdit: boolean };

type DesignSkillDetailDialogProps = {
  skill: DesignSkillDetailRecord | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (skill: DesignSkillDetailRecord) => void;
};

const categoryLabels: Record<DesignSkillCategory, string> = {
  brand_identity: '品牌视觉',
  ecommerce: '电商设计',
  social_media: '社媒营销',
  packaging: '包装设计',
  design_review: '设计审稿/修改',
  other: '其他',
};

const questionKindLabels: Record<DesignSkillQuestionKind, string> = {
  text: '单行文本',
  textarea: '多行文本',
  number: '数字',
  select: '下拉单选',
  radio: '单选',
  checkbox: '多选',
  date: '日期',
  image: '图片上传',
  file: '文件上传',
};

export function DesignSkillDetailDialog({ skill, onOpenChange, onEdit }: DesignSkillDetailDialogProps) {
  return (
    <Dialog open={Boolean(skill)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] max-w-3xl flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:rounded-2xl">
        {skill && <>
          <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4 pr-14 text-left sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle className="text-base">{skill.name}</DialogTitle>
              <Badge variant="outline" className="border-indigo-100 bg-indigo-50 text-[10px] text-indigo-700">{categoryLabels[skill.category]}</Badge>
              <Badge variant="outline" className={skill.isEnabled ? 'border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700' : 'border-slate-200 bg-slate-100 text-[10px] text-slate-500'}>{skill.isEnabled ? '已启用' : '已停用'}</Badge>
            </div>
            <DialogDescription className="text-xs">v{skill.version} · {skill.questions.length} 个需求问题 · 由 {skill.createdByName || '客服'} 创建</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:px-6">
            <section>
              <h3 className="text-xs font-bold text-slate-800">用途说明</h3>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{skill.description}</p>
            </section>
            {skill.instructions && <section>
              <h3 className="text-xs font-bold text-slate-800">AI 识别与追问指引</h3>
              <p className="mt-1 whitespace-pre-wrap rounded-xl bg-indigo-50/60 p-3 text-xs leading-5 text-slate-600">{skill.instructions}</p>
            </section>}
            {skill.completionCriteria && <section>
              <h3 className="text-xs font-bold text-slate-800">完成标准</h3>
              <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-600">{skill.completionCriteria}</p>
            </section>}

            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold text-slate-800">需求问题配置</h3>
                <span className="text-[10px] text-slate-400">按追问优先级排序</span>
              </div>
              {[...skill.questions].sort((a, b) => b.priority - a.priority).map((question, index) => <article key={question.id} className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-slate-800">{index + 1}. {question.label}</span>
                  <Badge variant="outline" className="text-[10px] text-slate-500">{questionKindLabels[question.kind]}</Badge>
                  <Badge variant="outline" className={question.required ? 'border-rose-100 bg-rose-50 text-[10px] text-rose-600' : 'border-slate-100 bg-slate-50 text-[10px] text-slate-500'}>{question.required ? '必须确认' : '选填'}</Badge>
                  <span className="text-[10px] text-slate-400">优先级 {question.priority}</span>
                </div>
                {question.prompt && <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-slate-600">{question.prompt}</p>}
                {question.placeholder && <p className="mt-1 text-[10px] text-slate-400">填写提示：{question.placeholder}</p>}
                {!!question.options?.length && <div className="mt-2 flex flex-wrap gap-1.5">{question.options.map((option) => <span key={option} className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] text-slate-500">{option}</span>)}</div>}
              </article>)}
            </section>
          </div>

          <DialogFooter className="shrink-0 border-t border-slate-100 bg-white px-5 py-3 sm:px-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="h-9 rounded-xl text-xs">关闭</Button>
            {skill.canEdit && <Button type="button" onClick={() => onEdit(skill)} className="h-9 rounded-xl bg-indigo-600 text-xs hover:bg-indigo-700">编辑 Skill</Button>}
          </DialogFooter>
        </>}
      </DialogContent>
    </Dialog>
  );
}
