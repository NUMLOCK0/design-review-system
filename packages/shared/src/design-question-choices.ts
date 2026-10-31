export type DesignChoiceQuestion = {
  id: string; label: string; prompt: string; answerType: 'text' | 'textarea' | 'select'; options: string[]; recommendation?: string;
};

export const isOtherDesignChoice = (value: string) => /^(?:其他|其它|other)(?:$|[\s（(：:，,/／])/i.test(value.trim());

export function cleanDesignChoices(values: string[]) {
  return [...new Set(values.map((value) => value.trim().slice(0, 100)).filter((value) => value && !isOtherDesignChoice(value)))];
}

// Compatibility for old forms, or a model that still fails to supply choices after one repair.
function fallbackChoices(question: DesignChoiceQuestion, mode: 'brand' | 'product') {
  const topic = `${question.label} ${question.prompt}`;
  if (/数量|几张|张数|多少张/.test(topic)) return ['1 张核心图', '3 张独立方向图', '6 张独立探索图'];
  if (/平台|渠道|投放|使用场景/.test(topic)) return mode === 'product'
    ? ['淘宝/天猫', '京东', '拼多多', '抖音电商'] : ['线上电商与社交媒体', '线下门店与包装', '线上线下统一使用'];
  if (/人群|受众|面向谁|客户群/.test(topic)) return ['追求品质与设计感的年轻消费者', '注重实用与性价比的家庭用户', '偏好专业品质的高要求用户'];
  if (/配色|颜色|色彩|主色/.test(topic)) return ['温暖柔和的暖色系', '清爽克制的冷色系', '简洁黑白，增加少量强调色'];
  if (/交付|物料|设计范围|需要设计什么/.test(topic)) return ['先制作独立 Logo', 'Logo 与基础配色、字体规范', 'Logo、品牌规范与应用物料'];
  if (/补充|调整|修改|还需|完善/.test(topic)) return ['补充视觉风格与品牌气质', '调整配色、字体或图形偏好', '补充交付图片数量与使用场景'];
  if (/风格|气质|感觉|定位|视觉/.test(topic)) return ['简约几何，干净利落', '亲和圆润，可爱但不幼稚', '现代字标，克制有品质', '先探索几种不同风格再选择'];
  return ['突出产品价值与实用性', '突出亲和体验与情绪感受', '突出专业品质与可信赖感'];
}

export function normalizeDesignChoiceQuestion<T extends DesignChoiceQuestion>(question: T, mode: 'brand' | 'product' = 'brand'):
  Omit<T, 'answerType' | 'options' | 'recommendation'> & { answerType: 'select'; options: string[]; recommendation?: string } {
  const recommendation = question.recommendation?.trim().slice(0, 100);
  const supplied = cleanDesignChoices([...(recommendation ? [recommendation] : []), ...(question.options || [])]);
  const options = (supplied.length >= 2 ? supplied : cleanDesignChoices([...supplied, ...fallbackChoices(question, mode)])).slice(0, 5);
  return { ...question, answerType: 'select' as const, options,
    recommendation: recommendation && options.includes(recommendation) ? recommendation : undefined };
}
