export const studioAgents = {
  investigation: { name: '需求访谈师', capability: 'text_or_vision', kinds: [] },
  brief: { name: '图片鉴定师', capability: 'text_or_vision', kinds: ['analysis'] },
  style: { name: '风格探索 Agent', capability: 'text', kinds: ['direction'] },
  visual: { name: '视觉方案师', capability: 'text', kinds: ['storyboard'] },
  copy: { name: '卖点与文案师', capability: 'text', kinds: ['copywriting'] },
  prompt: { name: '提示词工程师', capability: 'text', kinds: ['prompting'] },
  image: { name: '生图 Agent', capability: 'image', kinds: ['image_generation'] },
  review: { name: '质检复核官', capability: 'vision', kinds: ['review'] },
  research: { name: '参考调研 Agent', capability: 'search', kinds: ['research'] },
  vector: { name: 'SVG Agent', capability: 'text', kinds: ['svg_generation'] },
  delivery: { name: '交付 Agent', capability: 'export', kinds: ['delivery'] },
  manual: { name: '人工确认', capability: 'manual', kinds: ['manual'] },
} as const;
export const studioAgentInstructions: Record<keyof typeof studioAgents, string> = {
  investigation: '整理客户明确需求和待确认项，不能替客户确认推断。',
  brief: '仅依据实际提供的商品图片和已确认资料描述商品可见特征；区分观察与推测，不杜撰参数、功效、材质、认证或包装文字。',
  style: '将已确认需求转为清楚可执行的差异化视觉方向，并遵守平台与品牌约束。',
  visual: '负责单张画面的叙事、构图、主体层级、场景与留白，逐项对应已确认图片清单。',
  copy: '根据可核实资料提炼卖点和图中文字；所有未核验功效、参数和认证标为待确认，不得编造爆款、排名或效果承诺。',
  prompt: '将确认的商品特征、视觉方向和单图用途转为一图一提示词，锁定商品外观，一张图只表达一个指定交付项。',
  image: '依照逐图提示词和真实商品参考图生成图片，保持商品外观一致，不把多张交付拼成一张。',
  review: '只核对实际生成图片中的商品一致性、构图、文字可读性与已确认要求，逐项引用可见依据；审查结果不代表客户验收。',
  research: '仅整理公开来源能支持的市场和竞品线索，保存真实来源，不把其内容当作客户商品事实。',
  vector: '输出可编辑、可校验的原生 SVG 矢量稿，不以嵌入位图冒充矢量。',
  delivery: '整理本次已完成的交付资产与状态，不声称未执行的人工验收或版权核查已完成。',
  manual: '等待用户确认后继续。',
};
export function studioAgentForTask(kind: string) {
  return Object.entries(studioAgents).find(([, agent]) => (agent.kinds as readonly string[]).includes(kind))?.[0] || null;
}
