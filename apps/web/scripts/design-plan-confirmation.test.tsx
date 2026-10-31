import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DesignPlanAgent, type DesignPlan, type SavedPlan } from '../src/components/image-studio/design-plan-agent';
import { WorkbenchTaskMessages } from '../src/components/image-studio/workbench-task-messages';

const direction = (id: string) => ({ id, name: `方向 ${id}`, concept: '原创几何形态', positioning: '', audience: '', keywords: [],
  palette: [], typography: '', imagery: '', rationale: '', deliverables: [] });
const plan: DesignPlan = { summary: '品牌设计方案', brief: { brandName: '测试', productOrService: '', positioning: '', targetAudience: '', marketAndChannel: '', businessGoal: '', knownFacts: [], constraints: [], factsToConfirm: [] },
  questions: [{ id: 'color', label: '主色', prompt: '需要什么主色？', required: true, answerType: 'text', options: [] }],
  recommendedSkills: [], directions: [direction('a'), direction('b')], nextSteps: [], selectedDirectionId: null,
  taskGraph: [{ id: 'logo', title: '生成 Logo', kind: 'image_generation', reason: '', dependsOn: [], skillIds: [], inputs: [], outputs: [], reviewPolicy: 'confirm' }] };
const saved = (overrides: Partial<SavedPlan> = {}): SavedPlan => ({ version: 1, mode: 'brand', status: 'needs_review', inputBrief: '品牌设计', answers: {}, selectedSkillIds: [], plan, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...overrides });
const buttons = (html: string) => [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map((match) => match[0]);
function renderCard(snapshot: SavedPlan, options: { messages?: any[]; startAllReason?: string } = {}) {
  return renderToStaticMarkup(<DesignPlanAgent project={{ id: 'p', name: '测试', version: 1, platform: null, workflow: {} }} savedPlan={snapshot}
    conversations={[]} sourceConversationId="" onSourceConversationChange={() => {}} onProjectSaved={() => {}}
    variant="conversation" mode="brand" messages={options.messages || []} onStartAll={() => {}} startAllReason={options.startAllReason} />);
}

test('the current draft exposes direction selection and requires a direction and answers before confirmation', () => {
  const html = renderCard(saved());
  assert.match(html, /选择一个视觉方向/);
  assert.match(html, /方向 a/);
  assert.match(html, /主色/);
  assert.match(buttons(html).find((button) => button.includes('确认方案')) || '', /\sdisabled(?:=|[ >])/);

  const complete = renderCard(saved({ plan: { ...plan, selectedDirectionId: 'a' }, answers: { color: '深绿' } }));
  assert.doesNotMatch(buttons(complete).find((button) => button.includes('确认方案')) || '', /\sdisabled(?:=|[ >])/);
});

test('the newest saved version stays actionable when conversation history has an older snapshot', () => {
  const approved = saved({ version: 2, status: 'approved', plan: { ...plan, selectedDirectionId: 'a' }, answers: { color: '深绿' } });
  const html = renderCard(approved, { messages: [{ id: 'old', role: 'assistant', text: '旧方案', planSnapshot: saved() }] });
  assert.match(html, /v2/);
  assert.doesNotMatch(html, /确认方案<\/button>/);
  assert.doesNotMatch(buttons(html).find((button) => button.includes('开始制作')) || '', /\sdisabled(?:=|[ >])/);

  const unavailable = renderCard(approved, { startAllReason: '先选择图片生成模型' });
  assert.match(buttons(unavailable).find((button) => button.includes('开始制作')) || '', /\sdisabled(?:=|[ >])/);
  assert.match(unavailable, /先选择图片生成模型/);
});

test('the approved task plan exposes blocked steps so users can continue after manual review', () => {
  const html = renderToStaticMarkup(<WorkbenchTaskMessages tasks={[{ id: 'manual', title: '确认品牌资料', kindLabel: '人工确认', reason: '', outputs: [], skills: [], dependencies: [], status: 'blocked', statusLabel: '待处理', actionLabel: '开始', disabled: false }]}
    reviews={[]} canvasReady onExecute={() => {}} onFocus={() => {}} onReviewChange={() => {}} onStartAll={() => {}} startAllDisabled={false} startAllBusy={false} />);
  assert.match(html, /确认品牌资料/);
  assert.match(html, /开始：确认品牌资料/);
});
