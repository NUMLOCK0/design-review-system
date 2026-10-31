import { createCanvasNode } from '@infinite-canvas/lib/canvas/canvas-node-factory';
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from '@infinite-canvas/types/canvas';
import type { DesignTask, SavedPlan } from './design-plan-agent';

export const promptNodeId = (planVersion: number, slotKey: string) => `studio-prompt-${planVersion}-${slotKey}`;
export const imageNodeId = (planVersion: number, slotKey: string) => `studio-image-${planVersion}-${slotKey}`;

type CanvasTaskStates = Record<string, { status?: string; error?: string }>;
export function imageTaskWaitMessage(planVersion: number, task: DesignTask, tasks: DesignTask[], states: CanvasTaskStates) {
  const state = states[`${planVersion}:${task.id}`];
  if (state?.status === 'failed') return `生图任务失败：${state.error || '请在后台制作计划中查看原因并重试'}`;
  if (state?.status === 'completed') return '图片已生成，正在加载结果';
  if (state?.status === 'queued' || state?.status === 'running') return '生图任务已提交，等待模型返回';
  const visited = new Set<string>();
  const blockers: DesignTask[] = [];
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const dependency = tasks.find((item) => item.id === id);
    if (!dependency || states[`${planVersion}:${id}`]?.status === 'completed') return;
    blockers.push(dependency);
    dependency.dependsOn.forEach(visit);
  };
  task.dependsOn.forEach(visit);
  const confirmation = blockers.find((item) => ['waiting_user', 'blocked'].includes(states[`${planVersion}:${item.id}`]?.status || ''));
  if (confirmation) return `等待确认：${confirmation.title}。请在“后台制作计划”确认后继续。`;
  const failed = blockers.find((item) => states[`${planVersion}:${item.id}`]?.status === 'failed');
  if (failed) return `前置任务失败：${failed.title}。请在后台查看原因并重试。`;
  if (blockers.length) return `等待前置任务：${blockers[blockers.length - 1].title}`;
  if (state?.status === 'blocked' || state?.status === 'waiting_user') return '等待确认，请在后台制作计划中继续';
  return '等待调度生成';
}

const logoPattern = /logo|标志|标识|副形|图形标|字母标|字标/i;
const applicationPattern = /名片|包装|海报|网页|门头|样机|应用物料|展示板|vi手册/i;
export function isLogoConceptSlot(task: DesignTask, deliverable: string, plan: SavedPlan) {
  if (plan.mode !== 'brand' || applicationPattern.test(deliverable)) return false;
  return logoPattern.test(deliverable) || (logoPattern.test(task.title) && !applicationPattern.test(task.title));
}

function requestedImageCount(text: string) {
  const match = text.match(/(\d+|[一二两三四五六七八])\s*张/i) || text.match(/(\d+|[一二两三四五六七八])\s*(?:款|个|种|组)(?:不同|独立)?\s*(?:logo|标志|标识|副形|方案|方向|概念|图|设计)/i);
  if (!match) return 0;
  return Number(match[1]) || ({ 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8 } as Record<string, number>)[match[1]] || 0;
}

export function taskSlots(task: DesignTask, plan: SavedPlan) {
  if (/^product_images_\d+(?:_x)*$/.test(task.id) && task.outputs.length) return task.outputs.map((deliverable, index) => ({ slotKey: `${task.id}-${index + 1}`, deliverable }));
  if (plan.plan.logoExploration?.taskId === task.id) return plan.plan.logoExploration.candidates.map((candidate, index) => ({
    slotKey: `${task.id}-${index + 1}`, deliverable: `Logo 候选 ${index + 1} · ${candidate.name}`,
  }));
  const direction = plan.plan.directions.find((item) => item.id === plan.plan.selectedDirectionId);
  const explicitCount = requestedImageCount(task.outputs.join(' '));
  const count = Math.max(1, Math.min(8, explicitCount || task.outputs.length || direction?.deliverables.length || (plan.mode === 'brand' ? 2 : 4)));
  const groupedDeliverable = explicitCount && task.outputs.length === 1
    ? task.outputs[0].replace(/(\d+|[一二两三四五六七八])\s*(?:张|款|个|种|组)(?:不同|独立)?\s*/i, '').trim() : '';
  return Array.from({ length: count }, (_, index) => ({
    slotKey: `${task.id}-${index + 1}`,
    deliverable: groupedDeliverable ? `${groupedDeliverable} · 方案 ${index + 1}` : task.outputs[index] || direction?.deliverables[index] || `画面 ${index + 1}`,
  }));
}

export function createPlanCanvasNodes(plan: SavedPlan, tasks: DesignTask[], existing: CanvasNodeData[], origin: { x: number; y: number }, productionStarted = false, taskStates: CanvasTaskStates = {}, options: { logoSymbolOnly?: boolean } = {}) {
  const nodes: CanvasNodeData[] = [];
  const connections: CanvasConnection[] = [];
  const ids = new Set(existing.map((node) => node.id));
  if (!productionStarted || plan.status !== 'approved') return { nodes, connections };
  const direction = plan.plan.directions.find((item) => item.id === plan.plan.selectedDirectionId);
  {
    let row = 0;
    for (const task of tasks.filter((item) => item.kind === 'image_generation')) {
      for (const slot of taskSlots(task, plan)) {
        const symbolOnly = options.logoSymbolOnly && isLogoConceptSlot(task, slot.deliverable, plan);
        const candidate = plan.plan.logoExploration?.taskId === task.id
          ? plan.plan.logoExploration.candidates.find((_, index) => slot.slotKey === `${task.id}-${index + 1}`) : undefined;
        const promptId = promptNodeId(plan.version, slot.slotKey);
        const imageId = imageNodeId(plan.version, slot.slotKey);
        if (!ids.has(promptId)) {
          const content = [`交付内容：${slot.deliverable}`, `设计任务：${task.title}`, task.reason && `画面要求：${task.reason}`,
            candidate ? `本款独立风格：${candidate.name}\n设计概念：${candidate.concept}\n图形表现：${candidate.imagery}\n字体：${candidate.typography}\n配色：${candidate.palette}` : direction?.imagery && `视觉表现：${direction.imagery}`,
            candidate ? `遵循品牌名称、定位和明确的设计约束；${plan.plan.logoExploration?.referenceAssetIds.length ? '以提供的 Logo 为参考，' : ''}按本方向独立探索。` : plan.mode === 'brand' ? '遵循已确认品牌方案，保持 Logo、色彩、字体和图形语言一致。' : '严格参考商品原图，保持商品形状、颜色、包装和品牌标识一致。',
            isLogoConceptSlot(task, slot.deliverable, plan) ? symbolOnly ? '本图只生成一个独立的 Logo 图形，不要任何文字、字母、数字、标语、水印或模拟文字。文字将在后续单独排版。画面使用干净的纯色背景，保留足够留白；不要九宫格、拼贴、多个标志、应用样机或展示板。' : '本图只呈现一个完整的 Logo 方案；图形与文字可组成同一个标志。不要九宫格、拼贴、对比图、多个候选标志、重复排列或品牌展示板。多个方案必须分别生成独立图片。' : '',
            symbolOnly ? '围绕已确认的品牌概念设计图形；品牌名称仅作概念参考，不要将其绘制在图片中。' : '请根据用途安排主体、构图、场景和留白，准确呈现已确认的文字，不虚构产品信息。',
          ].filter(Boolean).join('\n');
          const node = createCanvasNode(CanvasNodeType.Text, { x: origin.x, y: origin.y + row * 420 }, { content, status: 'success', artifactType: 'image-prompt', workbenchTaskId: task.id, workbenchSlotKey: slot.slotKey, workbenchPlanVersion: plan.version });
          nodes.push({ ...node, id: promptId, title: `${slot.deliverable} · 出图提示词` });
        }
        if (!ids.has(imageId)) {
          const prompt = existing.find((node) => node.id === promptId) || nodes.find((node) => node.id === promptId)!;
          const node = createCanvasNode(CanvasNodeType.Image, { x: prompt.position.x + prompt.width + 320, y: prompt.position.y + 160 }, {
            content: '', status: 'idle', generationType: 'generation', generationMode: 'image',
            artifactType: 'generated-image', workbenchTaskId: task.id, workbenchSlotKey: slot.slotKey, workbenchPlanVersion: plan.version,
            workbenchStatusMessage: imageTaskWaitMessage(plan.version, task, tasks, taskStates),
          });
          nodes.push({ ...node, id: imageId, title: slot.deliverable });
        }
        // Do not restore a connection the user deliberately removed from existing nodes.
        if (!ids.has(imageId) || !ids.has(promptId)) connections.push({ id: `link-${promptId}-${imageId}`, fromNodeId: promptId, toNodeId: imageId });
        row++;
      }
    }
  }
  return { nodes, connections };
}

export function readConnectedPrompt(plan: SavedPlan, slotKey: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
  const promptId = promptNodeId(plan.version, slotKey);
  const imageId = imageNodeId(plan.version, slotKey);
  const promptNode = nodes.find((node) => node.id === promptId && node.type === CanvasNodeType.Text);
  if (plan.status !== 'approved') throw new Error('请先确认设计方案，再开始制作');
  if (!promptNode || !nodes.some((node) => node.id === imageId && node.type === CanvasNodeType.Image) || !connections.some((link) => link.fromNodeId === promptId && link.toNodeId === imageId)) throw new Error(`画面 ${slotKey} 的提示词与生图节点未连接，请恢复连接后重试`);
  if (!promptNode.metadata?.content?.trim()) throw new Error(`画面 ${slotKey} 的提示词为空，请先填写`);
  if (promptNode.metadata.content.trim().startsWith('设计方案：')) return promptNode.metadata.content.trim();
  const brief = plan.plan.brief;
  const direction = plan.plan.directions.find((item) => item.id === plan.plan.selectedDirectionId);
  const context = [plan.plan.summary, `品牌/商品：${brief.brandName} ${brief.productOrService}`, `定位：${brief.positioning}`, `目标人群：${brief.targetAudience}`,
    `渠道：${brief.marketAndChannel}`, `目标：${brief.businessGoal}`, `已知信息：${brief.knownFacts.join('；')}`, `设计约束：${brief.constraints.join('；')}`,
    !plan.plan.logoExploration && direction && `已选方向：${direction.name}\n${direction.concept}\n配色：${direction.palette.map((color) => `${color.name} ${color.hex}`).join('、')}\n字体：${direction.typography}\n画面风格：${direction.imagery}`].filter(Boolean).join('\n');
  return `设计方案：\n${context}\n\n本张图片要求：\n${promptNode.metadata.content.trim()}`;
}
