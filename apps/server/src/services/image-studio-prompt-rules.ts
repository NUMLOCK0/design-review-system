export const SINGLE_LOGO_RULE = '最终出图要求：本次只生成一张独立图片，画面中只展示一个完整的 Logo 方案。禁止多个候选方案、重复标志、九宫格、拼贴、对比图或品牌展示板。任何多个方向的规划只用于分别出图，不得排在同一张图中。';
const SYMBOL_ONLY_RULE = '最终文字要求：只生成图形，不绘制品牌名、字母、数字、标语、模拟文字或水印；文字将在后续单独排版。';

export function appendSingleLogoRule(prompt: string, enabled: boolean) {
  const symbolOnly = prompt.includes('本图只生成一个独立的 Logo 图形，不要任何文字');
  const rules = [enabled ? SINGLE_LOGO_RULE : '', symbolOnly ? SYMBOL_ONLY_RULE : ''].filter(Boolean).join('\n');
  if (!rules) return prompt.slice(0, 32_000);
  return `${prompt.slice(0, 32_000 - rules.length - 2)}\n\n${rules}`;
}
