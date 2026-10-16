export type ImageStudioPlatform = 'taobao' | 'jd' | 'pdd' | 'douyin' | 'other';
export type ImageStudioCategory = 'unspecified' | 'home_appliance' | 'apparel' | 'food' | 'beauty' | 'digital' | 'other';
export type RuleConfidence = 'verified' | 'suggested' | 'pending';

export type PlatformOutputPreset = {
  key: 'main' | 'long_main' | 'white_background' | 'sku' | 'detail';
  label: string;
  enabledByDefault: boolean;
  aspectRatio: string;
  width: number;
  height: number;
  count: number;
  aspectConfidence: RuleConfidence;
  sizeConfidence: RuleConfidence;
  countConfidence: RuleConfidence;
  note: string;
};
export type PlatformOutputSpec = PlatformOutputPreset & { enabled: boolean; customizedFields?: string[] };
export type PlatformRuleReference = { label: string; url: string; evidence: 'official_text' | 'official_index' | 'verification_entry' | 'historical_index' };

export type PlatformSpecs = {
  platform: ImageStudioPlatform;
  category: ImageStudioCategory;
  platformTemplate: string;
  profileVersion: string;
  outputs: PlatformOutputSpec[];
  contentRules: string;
  references: PlatformRuleReference[];
};

export const imageStudioPlatforms: Array<{ value: ImageStudioPlatform; label: string }> = [
  { value: 'taobao', label: '淘宝 / 天猫' },
  { value: 'jd', label: '京东' },
  { value: 'pdd', label: '拼多多' },
  { value: 'douyin', label: '抖音电商' },
  { value: 'other', label: '其他平台' },
];

export const imageStudioCategories: Array<{ value: ImageStudioCategory; label: string }> = [
  { value: 'unspecified', label: '暂不指定' },
  { value: 'home_appliance', label: '家居家电' },
  { value: 'apparel', label: '服装鞋包' },
  { value: 'food', label: '食品饮料' },
  { value: 'beauty', label: '美妆个护' },
  { value: 'digital', label: '数码配件' },
  { value: 'other', label: '其他类目' },
];

const output = (preset: PlatformOutputPreset): PlatformOutputPreset => preset;

const baseOutputs: Record<ImageStudioPlatform, PlatformOutputPreset[]> = {
  taobao: [
    output({ key: 'main', label: '方形主图组', enabledByDefault: true, aspectRatio: '1:1', width: 800, height: 800, count: 5, aspectConfidence: 'verified', sizeConfidence: 'suggested', countConfidence: 'pending', note: '淘宝 / 天猫主图栏位按类目区分 1:1 与 3:4；像素和张数仍按发布页核对。' }),
    output({ key: 'long_main', label: '3:4 长主图组', enabledByDefault: false, aspectRatio: '3:4', width: 750, height: 1000, count: 5, aspectConfidence: 'verified', sizeConfidence: 'suggested', countConfidence: 'pending', note: '3:4 栏位只接受 3:4；像素和张数是工作台建议。' }),
    output({ key: 'white_background', label: '白底素材', enabledByDefault: false, aspectRatio: '1:1', width: 800, height: 800, count: 1, aspectConfidence: 'suggested', sizeConfidence: 'suggested', countConfidence: 'suggested', note: '白底图栏位与位置随类目和发布入口确认。' }),
    output({ key: 'sku', label: 'SKU 规格图', enabledByDefault: false, aspectRatio: '1:1', width: 800, height: 800, count: 1, aspectConfidence: 'suggested', sizeConfidence: 'suggested', countConfidence: 'suggested', note: '按实际颜色、型号或套装规格制作。' }),
    output({ key: 'detail', label: '详情页模块', enabledByDefault: true, aspectRatio: 'custom', width: 750, height: 1000, count: 6, aspectConfidence: 'pending', sizeConfidence: 'suggested', countConfidence: 'suggested', note: '按详情模块切片；上传限制待按类目确认。' }),
  ],
  jd: [
    output({ key: 'main', label: '方形主图组', enabledByDefault: true, aspectRatio: '1:1', width: 800, height: 800, count: 5, aspectConfidence: 'suggested', sizeConfidence: 'suggested', countConfidence: 'pending', note: '渠道与类目规则待核验；方图为工作台建议。' }),
    output({ key: 'long_main', label: '长主图素材', enabledByDefault: false, aspectRatio: '3:4', width: 750, height: 1000, count: 1, aspectConfidence: 'pending', sizeConfidence: 'suggested', countConfidence: 'pending', note: '仅在当前店铺和类目发布入口支持时启用。' }),
    output({ key: 'white_background', label: '白底素材', enabledByDefault: false, aspectRatio: '1:1', width: 800, height: 800, count: 1, aspectConfidence: 'suggested', sizeConfidence: 'suggested', countConfidence: 'pending', note: '是否作为首图及白底要求按 POP / 自营渠道核验。' }),
    output({ key: 'sku', label: 'SKU 规格图', enabledByDefault: false, aspectRatio: '1:1', width: 800, height: 800, count: 1, aspectConfidence: 'suggested', sizeConfidence: 'suggested', countConfidence: 'pending', note: '像素、张数和款式映射待按渠道核验。' }),
    output({ key: 'detail', label: '详情页模块', enabledByDefault: true, aspectRatio: 'custom', width: 750, height: 1000, count: 6, aspectConfidence: 'pending', sizeConfidence: 'suggested', countConfidence: 'suggested', note: '宽度为制作模板建议；PC / 移动端要求待核验。' }),
  ],
  pdd: [
    output({ key: 'main', label: '商品轮播图组', enabledByDefault: true, aspectRatio: '1:1', width: 800, height: 800, count: 5, aspectConfidence: 'suggested', sizeConfidence: 'suggested', countConfidence: 'pending', note: '官方当前比例、像素、体积和张数待后台核验。' }),
    output({ key: 'white_background', label: '白底素材', enabledByDefault: false, aspectRatio: '1:1', width: 800, height: 800, count: 1, aspectConfidence: 'suggested', sizeConfidence: 'suggested', countConfidence: 'pending', note: '单独导出；背景、文字和主体要求待按类目核验。' }),
    output({ key: 'sku', label: 'SKU 规格图', enabledByDefault: false, aspectRatio: '1:1', width: 800, height: 800, count: 1, aspectConfidence: 'suggested', sizeConfidence: 'suggested', countConfidence: 'pending', note: '按真实销售规格制作，上传限制待核验。' }),
    output({ key: 'detail', label: '详情页模块', enabledByDefault: true, aspectRatio: 'custom', width: 750, height: 1000, count: 6, aspectConfidence: 'pending', sizeConfidence: 'suggested', countConfidence: 'suggested', note: '按模块切片；上传限制待按类目核验。' }),
    output({ key: 'long_main', label: '活动 / 长图素材', enabledByDefault: false, aspectRatio: 'custom', width: 750, height: 352, count: 1, aspectConfidence: 'pending', sizeConfidence: 'pending', countConfidence: 'pending', note: '活动模板各自独立；请先选活动入口并核对尺寸。' }),
  ],
  douyin: [
    output({ key: 'main', label: '商品主图组', enabledByDefault: true, aspectRatio: '1:1', width: 800, height: 800, count: 5, aspectConfidence: 'suggested', sizeConfidence: 'suggested', countConfidence: 'pending', note: '部分已查类目建议至少 600×600；抖店通用与类目规则应同时核对。' }),
    output({ key: 'long_main', label: '3:4 主图素材', enabledByDefault: false, aspectRatio: '3:4', width: 750, height: 1000, count: 1, aspectConfidence: 'suggested', sizeConfidence: 'suggested', countConfidence: 'pending', note: '按类目发布入口核验后启用。' }),
    output({ key: 'white_background', label: '白底素材', enabledByDefault: false, aspectRatio: '1:1', width: 800, height: 800, count: 1, aspectConfidence: 'suggested', sizeConfidence: 'suggested', countConfidence: 'pending', note: '是否要求白底与首图位置按类目核验。' }),
    output({ key: 'sku', label: 'SKU 规格图', enabledByDefault: false, aspectRatio: '1:1', width: 800, height: 800, count: 1, aspectConfidence: 'suggested', sizeConfidence: 'suggested', countConfidence: 'pending', note: '款式、颜色、件数应与实际销售规格一致。' }),
    output({ key: 'detail', label: '详情页模块', enabledByDefault: true, aspectRatio: 'custom', width: 750, height: 1000, count: 6, aspectConfidence: 'pending', sizeConfidence: 'suggested', countConfidence: 'suggested', note: '详情图规格需按商品类目和当前发布页确认。' }),
  ],
  other: [
    output({ key: 'main', label: '方形主图组', enabledByDefault: true, aspectRatio: '1:1', width: 800, height: 800, count: 5, aspectConfidence: 'pending', sizeConfidence: 'suggested', countConfidence: 'pending', note: '通用工作台建议，请补充目标平台规则。' }),
    output({ key: 'detail', label: '详情页模块', enabledByDefault: true, aspectRatio: 'custom', width: 750, height: 1000, count: 6, aspectConfidence: 'pending', sizeConfidence: 'suggested', countConfidence: 'suggested', note: '通用工作台建议，请补充目标平台规则。' }),
    output({ key: 'white_background', label: '白底素材', enabledByDefault: false, aspectRatio: '1:1', width: 800, height: 800, count: 1, aspectConfidence: 'pending', sizeConfidence: 'suggested', countConfidence: 'pending', note: '通用工作台建议，请补充目标平台规则。' }),
    output({ key: 'sku', label: 'SKU 规格图', enabledByDefault: false, aspectRatio: '1:1', width: 800, height: 800, count: 1, aspectConfidence: 'pending', sizeConfidence: 'suggested', countConfidence: 'pending', note: '按实际销售规格制作，并核对平台要求。' }),
  ],
};

const platformReferences: Record<ImageStudioPlatform, PlatformRuleReference[]> = {
  taobao: [
    { label: 'T1 淘宝开放平台《商品接口调整通知》', url: 'https://open.fliggy.com/support/announcementDetail.htm?id=25721&source=search', evidence: 'official_text' },
    { label: 'T2 阿里官方文档 taobao.item.img.upload（含历史提示冲突）', url: 'https://jaq-doc.alibaba.com/docs/api.htm?apiId=23', evidence: 'official_text' },
  ],
  jd: [
    { label: 'J1 京东商家帮助中心《京东开放平台信息发布规范》入口', url: 'https://help.jd.com/Vender/viewQuestion-852-2742.html', evidence: 'verification_entry' },
    { label: 'J2 京东国际历史规则（不作为国内默认规则）', url: 'https://jdw-rule.jd.hk/detail?ruleId=611152382293839872', evidence: 'historical_index' },
    { label: 'J3 京东开放平台方图转长图能力公告', url: 'https://jos.jd.com/platformdetail?itemId=2282&listId=0', evidence: 'official_index' },
  ],
  pdd: [
    { label: 'P1 拼多多开放平台《商品发布说明》待核验入口', url: 'https://open.pinduoduo.com/application/document/browse?idStr=EF2DB30A2A9C8FD7', evidence: 'verification_entry' },
    { label: 'P2 拼多多白底图要求待核验入口', url: 'https://mai.pinduoduo.com/autopage/116_static_7/index.html', evidence: 'verification_entry' },
  ],
  douyin: [
    { label: 'D1 抖音电商《商品信息发布规范》', url: 'https://school.jinritemai.com/doudian/web/articlev0/101800?btm_ppre=a4977.b6444.c0.d0&btm_pre=a4977.b31122.c0.d0&btm_show_id=ccee63d4-d5c3-47c7-9915-254d6f46ed94', evidence: 'official_index' },
    { label: 'D2 抖音电商《家居家电行业管理规范》', url: 'https://school.jinritemai.com/doudian/web/article/110207?biz_from=rule_center_entry_new&btm_ppre=a0.b0.c0.d0&btm_pre=a4977.b4369.c0.d0&btm_show_id=3f2fa233-444b-4e87-a5c4-0277499c4be4', evidence: 'official_index' },
    { label: 'D3 抖音电商《服装鞋包行业管理规范》', url: 'https://school.jinritemai.com/doudian/web/articlev0/105091?btm_ppre=a4977.b5856.c0.d0&btm_pre=a4977.b31122.c0.d0&btm_show_id=2d0684b6-6334-4623-8115-608ada35493e', evidence: 'official_index' },
  ],
  other: [],
};

export function createPlatformSpecs(platformValue: string | null | undefined, categoryValue: string | null | undefined = 'unspecified', enabledKeys?: string[]): PlatformSpecs {
  const platform = (imageStudioPlatforms.find((item) => item.value === platformValue || item.label === platformValue)?.value || 'other') as ImageStudioPlatform;
  const category = (imageStudioCategories.some((item) => item.value === categoryValue) ? categoryValue : 'unspecified') as ImageStudioCategory;
  const selected = new Set(enabledKeys);
  const outputs = baseOutputs[platform].map((item) => ({
    ...item,
    enabled: enabledKeys ? selected.has(item.key) : item.enabledByDefault,
  }));
  const douyinCategoryNote = platform === 'douyin' && category === 'home_appliance'
    ? '已查到的家居家电类目条文提到主图至少 5 张、建议 1:1；适用商品需在第 3 张展示 3C 标识、第 4 张展示能效标识。现有条文需商家后台复核，标识只能使用真实素材。'
    : platform === 'douyin' && category === 'apparel'
      ? '已查到的服装鞋包类目条文提到主图至少 600×600、建议 1:1；内衣等子类目另有要求。现有条文需商家后台复核。'
      : '';
  const platformTemplate = imageStudioPlatforms.find((item) => item.value === platform)?.label || '其他平台';
  return {
    platform,
    category,
    platformTemplate,
    profileVersion: '2026-10-15.1',
    outputs,
    references: platformReferences[platform],
    contentRules: [
      platform === 'douyin' ? '主图要与实际售卖商品、颜色、规格和数量一致；主图文字要求按类目发布页核对。' : '',
      douyinCategoryNote,
      '平台限制未核实时仅采用可编辑制作建议，不进行强制拦截。商品事实、标签和认证仅使用已确认素材。',
    ].filter(Boolean).join('\n'),
  };
}

export const confidenceLabels: Record<RuleConfidence, string> = {
  verified: '已核实规则',
  suggested: '制作建议',
  pending: '待核验',
};

