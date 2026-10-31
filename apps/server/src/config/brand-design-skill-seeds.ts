import type { DesignSkillInput, DesignSkillQuestion, DesignSkillSource } from '@design-review/shared';

type Seed = DesignSkillInput & { id: string; source: DesignSkillSource };

function question(id: string, label: string, prompt: string, kind: DesignSkillQuestion['kind'] = 'textarea', options?: string[]): DesignSkillQuestion {
  return { id, key: id, label, prompt, kind, required: false, priority: 70, ...(options ? { options } : {}) };
}

export const designReferenceSkillSeed: Seed = {
    id: 'builtin_design_reference_research', name: '联网设计参考调研', category: 'brand_identity',
    description: '搜索公开 Logo 与品牌设计案例，引导用户选择参考，提取视觉特征并形成原创方向。',
    instructions: '启用后，结合本项目行业、设计目标和视觉需求，使用 searchDesignReferences 搜索公开设计参考，展示实际返回的图片及来源供用户选择；搜索词只包含必要的公开设计关键词，不包含客户私密资料。搜索失败或无结果时如实告知并允许重试，不得虚构案例、来源或已完成的搜索。用户选择参考后，只依据实际读取的图片提取图形语言、色彩、构图和气质；未读取成功的图片不能声称分析过。归纳可借鉴的通用视觉原则并结合品牌提出原创方向，不复制原标志、文字或独特图形。用户未确认方向时不自动开始生成。',
    completionCriteria: '实际展示搜索结果或明确说明失败；记录来源和用户选择；在成功读取图片时归纳可借鉴特征并提出原创设计方向。',
    source: { name: '工作台内置', url: '', license: '本系统原创', note: '使用工作台实际配置的参考图搜索服务和图片理解模型。' },
    questions: [question('reference_research_scope', '参考方向', '希望寻找什么行业、风格或应用场景的案例？不确定时可由 Agent 根据当前需求推荐。'), question('reference_research_avoid', '希望避免的方向', '有没有不喜欢的颜色、构图、图形或竞品？')],
  };

// Adapted for the studio's prompt-based Skill runtime; upstream scripts and reference logos are not bundled.
export const brandDesignSkillSeeds: Seed[] = [
  {
    id: 'builtin_logo_concept_vector_workflow', name: 'Logo 概念与矢量设计', category: 'brand_identity',
    description: '从品牌简报、概念筛选到单色与小尺寸检查，规划可编辑 Logo 矢量稿。',
    instructions: '围绕品牌业务、受众、定位和使用场景提炼品牌关键词，分析已知品类惯例与需避开的雷同；构思多个不同隐喻和标志类型，再比较并提出 2–3 个差异明确的方向。描述形状、负空间、比例、字标与配色，先考虑黑白、反白和小尺寸识别。安排独立的可编辑 SVG 矢量稿任务，优先路径与基础形状，不能把嵌入位图的 SVG 当作矢量稿。列出 16/32px、单色、反白、间距和相似性检查；未实际运行或未查看结果的检查只能标记待验证，不能声称通过。',
    completionCriteria: '方向有独立概念与构造说明；区分概念图和可编辑 SVG；列出需要实际执行的小尺寸、单色及相似性检查。',
    source: { name: 'kaankiziltug/logo-design-skill', url: 'https://github.com/kaankiziltug/logo-design-skill', license: 'MIT', note: '按本系统的规划与提示词运行方式整理工作流；未集成上游脚本或第三方 Logo 素材。' },
    questions: [question('logo_brief', '品牌定位与受众', '品牌提供什么、面向谁、希望被如何记住？'), question('logo_mark_type', '标志类型', '倾向哪一种标志结构？', 'select', ['图形标', '文字标', '字母组合', '徽章', '吉祥物', '图形与文字组合', '由设计方案推荐']), question('logo_usage', '主要使用场景', '例如头像、App 图标、包装或门头，以及必须保留或避免的元素。')],
  },
  {
    id: 'builtin_brand_identity_system_workflow', name: '品牌识别系统设计', category: 'brand_identity',
    description: '围绕同一个品牌概念规划 Logo、字体、配色、应用物料和品牌规范。',
    instructions: '分别确认 Logo、字体与配色是新建、更新、沿用还是不需要；保留用户指定的已有资产。每个方案用一句核心视觉机制串起标志、字体、配色与应用，至少在造型、语气或色彩等两个维度区分方向；说明与用户提供的竞品参考的差异，不虚构竞品事实。为所需场景提出颜色、字体与组合规范。将对比度、色觉差异、字体许可、文字覆盖和 16/32px 表现列为待实际检查项；只有真实测量后才能报告结果。',
    completionCriteria: '每个方向的标志、字体和颜色有共同概念；既有资产的保留条件清晰；品牌规范和需要实际验证的项目明确。',
    source: { name: 'fatihaydost/brand-identity-skill', url: 'https://github.com/fatihaydost/brand-identity-skill', license: 'MIT', note: '借鉴品牌系统联动与质量检查方法；未集成上游测量、PDF 或字体脚本。' },
    questions: [question('identity_scope', '本次设计范围', 'Logo、字体、颜色分别需要新建、更新还是保留？'), question('identity_traits', '品牌气质', '给出 3–5 个个性关键词及不希望呈现的感觉。'), question('identity_surfaces', '品牌应用', '优先需要哪些应用场景与交付物？')],
  },
  {
    id: 'builtin_logo_prompt_direction', name: 'Logo 风格化概念提示词', category: 'brand_identity',
    description: '为原创 Logo 概念生成结构化提示词，区分独立标志与品牌展示板。',
    instructions: '先提炼品牌定位和原创符号隐喻，给出不同概念方向；将标志类型、形态、负空间、线条、字体气质、配色、构图、用途和禁止项分开描述。根据本次要求明确输出独立标志、透明素材、头像或品牌展示板；没有明确要求时不要强制生成展示板或固定黑白配色。视觉参考只提取构图或造型原则，不复制现有标志。图像模型结果是概念图；准确字标和可编辑矢量稿需要单独制作与核验。',
    completionCriteria: '提示词包含具体概念、风格、构图、颜色和输出形式，且与用户指定的使用场景一致。',
    source: { name: 'SanbaoAI/logo-generator-skill · base-logo-generator', url: 'https://github.com/SanbaoAI/logo-generator-skill/tree/main/skills/base-logo-generator', license: 'MIT', note: '按本系统任务模型改写为可复用的设计指导；未运行上游 Skill 或绑定特定生图模型。' },
    questions: [question('prompt_logo_type', '标志形式', '希望生成独立符号、字标、组合标志，还是展示板？', 'select', ['独立图形标志', '文字标志', '图文组合', '品牌展示板', '由设计方案推荐']), question('prompt_style', '风格与禁区', '例如几何、复古、线性、自然、活泼；说明不希望出现的表现。'), question('prompt_symbol', '品牌记忆点', '有什么特征、意象或品牌故事可以转化为原创符号？')],
  },
  {
    id: 'builtin_logo_mascot_prompt', name: '吉祥物与角色标志设计', category: 'brand_identity',
    description: '从动物、角色或物体的识别特征出发，设计简洁、可延展的吉祥物标志。',
    instructions: '根据品牌和受众确定原创角色来源，提炼耳朵、轮廓、尾巴、表情或其他最有辨识度的特征，提出 2–3 条造型路线；说明保留和省略哪些细节、轮廓与负空间如何表达、缩小后如何识别。按用途选择单独符号或展示板，颜色与气质由品牌需求决定；不复制已有角色或受保护的标志外形。图像生成结果是概念稿，可编辑矢量需另行制作。',
    completionCriteria: '角色特征与品牌关联清晰，有可比较的原创轮廓方向，并说明小尺寸和应用方式。',
    source: { name: 'SanbaoAI/logo-generator-skill · mascot-logo-generator', url: 'https://github.com/SanbaoAI/logo-generator-skill/tree/main/skills/mascot-logo-generator', license: 'MIT', note: '借鉴识别特征提取方法，未包含上游图片或角色素材。' },
    questions: [question('mascot_source', '角色或动物来源', '希望从什么动物、角色、物体或自然形态出发？'), question('mascot_personality', '角色气质', '例如友善、可靠、调皮、安静；有哪些必须避免的特征？'), question('mascot_usage', '应用场景', '用于头像、包装、贴纸或其他什么位置？')],
  },
  {
    id: 'builtin_logo_colorway_system', name: 'Logo 配色与品牌应用', category: 'brand_identity',
    description: '在保留既有标志结构的前提下，规划多组品牌配色与应用场景。',
    instructions: '明确既有标志、字标和需要保留的颜色；除用户要求外，不改变标志轮廓、字样或核心构图。提出 2–4 个适合品牌和应用媒介的配色方向，每组给出主色、辅助色、背景色、对比色及有效 HEX 值，并说明黑白和反白方案。按用户所需选择包装、头像、网页或其他应用，不默认生成整页展示板。对比度、色觉差异和印刷效果须实际检查后再报告，不能仅根据提示词声称通过。',
    completionCriteria: '保留原标志结构；每组配色有明确色值、用途和单色方案；待验证的应用限制可见。',
    source: { name: 'SanbaoAI/logo-generator-skill · logo-colorway-generator', url: 'https://github.com/SanbaoAI/logo-generator-skill/tree/main/skills/logo-colorway-generator', license: 'MIT', note: '借鉴保留标志结构、配色方案和场景延展的方法。' },
    questions: [question('colorway_asset', '现有 Logo 与保留要求', '请提供现有 Logo，说明哪些颜色、字标或图形必须保留。', 'image'), question('colorway_mood', '配色倾向', '希望颜色传达什么气质，有哪些禁用颜色？'), question('colorway_use', '优先应用', '颜色主要用于网页、包装、社交头像还是其他场景？')],
  },
  {
    id: 'builtin_logo_direction_critique', name: 'Logo 多方向提案与评审', category: 'brand_identity',
    description: '从品牌策略出发生成可比较的标志方向，并列出优点、风险和验证方法。',
    instructions: '根据品牌核心承诺、受众、使用位置和限制，提出 2–3 个明显不同的 Logo 方向；逐个写明策略、标志类型、图形构造、字体、配色、单色表现与原创概念提示词。对每个方向比较识别性、相关性、小尺寸可读性和实际应用风险，并说明如何验证；未执行的测量与相似性检查标为待验证。借鉴公开的设计原则，不冒充设计师，也不复制现有标志。',
    completionCriteria: '方向之间具有可比较的构造与策略差异；每个方向包含适用场景、风险和待验证项。',
    source: { name: 'YangsonHung/awesome-agent-skills · logo-design-board', url: 'https://github.com/YangsonHung/awesome-agent-skills/tree/main/skills/en/logo-design-board', license: 'MIT', note: '借鉴概念方向、评审和交付说明的结构，未复制第三方设计作品。' },
    questions: [question('board_brand_promise', '品牌核心承诺', '品牌希望让用户记住什么价值？'), question('board_reference', '竞品与参考', '有哪些竞品或视觉参考？请说明喜欢与不喜欢的具体特征。'), question('board_requirements', '使用及限制', '在哪些场景使用，有哪些必须保留或避免的内容？')],
  },
  {
    id: 'builtin_logo_style_prompt_builder', name: 'Logo 风格参数与提示词', category: 'brand_identity',
    description: '组合标志形式、造型风格、色彩、字体和输出要求，形成可用于生图的提示词。',
    instructions: '根据需求组合标志形式、核心意象、几何或有机形态、线条与负空间、风格气质、色彩、字体、构图、应用和禁止项，形成清晰的图像提示词。风格可包括极简几何、包豪斯、复古徽章、线性、负空间、自然有机或活泼角色，但应根据品牌调整，避免仅堆砌形容词和行业刻板配色。精确品牌文字逐字保留；如文字难以准确呈现，建议单独排版。默认请求单个标志，用户要求展示板时再添加应用展示。',
    completionCriteria: '提示词包含品牌相关的概念、可见形态、风格、色彩、用途及明确输出形式。',
    source: { name: 'amys94fr/logo-prompt-generator', url: 'https://github.com/amys94fr/logo-prompt-generator', license: 'MIT', note: '借鉴品牌、类型、风格、配色和技术要求的提示词结构；本系统使用自己的提示词执行流程。' },
    questions: [question('style_family', '风格方向', '选择或描述喜欢的视觉风格。', 'select', ['极简几何', '包豪斯', '复古徽章', '线性图形', '负空间', '自然有机', '活泼角色', '其他 / 自定义']), question('style_palette', '配色与字体', '是否有指定色值、字体气质或禁止颜色？'), question('style_output', '输出形式', '希望生成单独标志还是带应用示例的品牌展示板？', 'select', ['单独标志', '品牌展示板', '两者都需要'])],
  },
];
