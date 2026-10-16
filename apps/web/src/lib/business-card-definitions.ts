export type BusinessCardDefinition = {
  id: `biz_${number}`;
  name: string;
  categoryId: string;
  tag: string;
  specification: string;
  materialLabel: string;
  materialHint: string;
  materialPlaceholder: string;
  notesLabel: string;
  notesPlaceholder: string;
  referenceLabel: string;
  referenceHint: string;
  redline: string;
};

export const BUSINESS_CARD_DEFINITIONS: BusinessCardDefinition[] = [
  {
    id: 'biz_1', name: '电商主图', categoryId: 'commerce', tag: '高频业务', specification: '1:1 方形主图 · 800 × 800 px',
    materialLabel: '商品素材原图', materialHint: '白底实拍图、产品抠图或商品多角度照片。', materialPlaceholder: '添加产品白底图或实拍图',
    notesLabel: '设计要点', notesPlaceholder: '说明画面重点、文案层级、构图和风格要求。', referenceLabel: '竞品参考', referenceHint: '添加竞品图片或链接，并说明想借鉴和需要避开的内容。',
    redline: '避免堆叠促销贴纸；产品抠图边缘保持干净，不出现毛边或白边。',
  },
  {
    id: 'biz_2', name: '电商详情页', categoryId: 'commerce', tag: '页面设计', specification: '手机端详情页 · 750 px 标准宽度',
    materialLabel: '产品原稿与资料', materialHint: '产品实拍图、参数表、卖点文案和售后说明。', materialPlaceholder: '添加产品素材或参数图片',
    notesLabel: '楼层规划与卖点', notesPlaceholder: '按楼层描述首屏、痛点、核心卖点、实拍参数、包装与售后。', referenceLabel: '详情页参考', referenceHint: '添加同行详情页截图或链接，说明参考的页面节奏。',
    redline: '参数与认证信息须以客户提供资料为准；长图切片高度和移动端可读性需提前确认。',
  },
  {
    id: 'biz_3', name: '直通车 / 信息流', categoryId: 'commerce', tag: '投放素材', specification: '平台投放图 · 800 × 800 px',
    materialLabel: '产品与场景素材', materialHint: '产品图片、使用前后对比或场景照片。', materialPlaceholder: '添加产品或场景素材',
    notesLabel: '转化要点', notesPlaceholder: '说明用户痛点、对比文案、行动按钮和投放目标。', referenceLabel: '高点击参考', referenceHint: '添加同类投放素材，说明想参考的视觉重点。',
    redline: '遵循投放平台的文字与素材规范；避免虚假、绝对化或无法证明的宣传用语。',
  },
  {
    id: 'biz_4', name: '海报设计', categoryId: 'content', tag: '活动视觉', specification: '线下印刷海报 · 易拉宝 80 × 200 cm',
    materialLabel: '主视觉素材', materialHint: '嘉宾肖像、主讲人照片、企业标识或活动素材。', materialPlaceholder: '添加高清人物或品牌素材',
    notesLabel: '主题与信息层级', notesPlaceholder: '填写活动主题、主视觉风格、时间地点、主办方和文案层级。', referenceLabel: '风格参考', referenceHint: '添加展会或活动海报参考，说明希望借鉴的排版与氛围。',
    redline: '印刷物料提前确认出血、色彩模式与分辨率；重要文字远离裁切边缘。',
  },
  {
    id: 'biz_5', name: '小红书封面', categoryId: 'content', tag: '社媒内容', specification: '竖版封面 · 3:4 / 1242 × 1660 px',
    materialLabel: '实拍图 / 原片', materialHint: '真实上手图、上身实穿图或商品对比图。', materialPlaceholder: '添加实拍图或测评原图',
    notesLabel: '封面表达要点', notesPlaceholder: '填写封面标题、目标人群、标签样式和希望呈现的博主风格。', referenceLabel: '笔记参考', referenceHint: '添加同类笔记封面，说明喜欢的标题排版或画面气质。',
    redline: '保持真实、自然的内容表达；避免与目标账号调性不符的硬广设计。',
  },
  {
    id: 'biz_6', name: '短视频封面', categoryId: 'content', tag: '视频内容', specification: '竖屏封面 · 9:16 / 1080 × 1920 px',
    materialLabel: '视频截帧 / 人物素材', materialHint: '视频关键帧、高清人物图或产品立绘。', materialPlaceholder: '添加视频截帧或人物素材',
    notesLabel: '标题与安全区', notesPlaceholder: '填写封面标题、字效要求，并说明平台按钮和描述区的避让范围。', referenceLabel: '视频封面参考', referenceHint: '添加同赛道封面图，说明想借鉴的构图或信息层级。',
    redline: '平台界面覆盖区域内不放置关键信息；标题需在手机缩略预览中清晰可读。',
  },
  {
    id: 'biz_7', name: '原图文字重排版', categoryId: 'image', tag: '常见改版', specification: '待重排图片 · 按原图比例',
    materialLabel: '现有图片 / 原稿', materialHint: '上传需要调整排版的旧图或原始设计稿。', materialPlaceholder: '添加待重排的旧图或原稿',
    notesLabel: '具体重排诉求', notesPlaceholder: '说明需要删除或新增的文案、标题重点和希望呈现的气质。', referenceLabel: '理想排版参考', referenceHint: '添加喜欢的参考图，说明要借鉴和避开的元素。',
    redline: '不随意拉伸字体；确认文字内容与商标信息，避免保留不需要的水印或促销信息。',
  },
  {
    id: 'biz_8', name: '原图改字', categoryId: 'image', tag: '文字修改', specification: '单图改字 · 按原图比例',
    materialLabel: '待修改原图', materialHint: '上传需要改字的高清原图，并指出文字位置。', materialPlaceholder: '添加需要修改文字的原图',
    notesLabel: '文字修改对照', notesPlaceholder: '按“原文字 → 新文字”填写，并补充字体、颜色和位置要求。', referenceLabel: '字体参考', referenceHint: '可添加字体样张或链接，说明需保持一致的字形细节。',
    redline: '核对原文和新文案；修补区域不应出现明显涂抹、错位或字体变形。',
  },
  {
    id: 'biz_9', name: '图片精修', categoryId: 'image', tag: '商品修图', specification: '单张精修 · 原始尺寸优先',
    materialLabel: '待修原片', materialHint: '上传相机原片、光影不均或带瑕疵的商品实拍图。', materialPlaceholder: '添加产品实拍原片',
    notesLabel: '精修重点', notesPlaceholder: '描述瑕疵位置、光影、透视、纹理和背景的处理要求。', referenceLabel: '质感参考', referenceHint: '添加希望对齐的材质与光影参考图。',
    redline: '保留商品真实结构与固有颜色；避免过度修饰造成失真。',
  },
  {
    id: 'biz_10', name: 'LOGO 设计', categoryId: 'brand', tag: '品牌设计', specification: '主标方案 · 矢量规范交付',
    materialLabel: '草图 / 旧标（选填）', materialHint: '可上传手绘草图、旧版标识或品牌图形构想。', materialPlaceholder: '添加品牌草图或旧版 LOGO',
    notesLabel: '品牌核心与寓意', notesPlaceholder: '填写品牌中英文名称、所属行业、定位与希望传达的气质。', referenceLabel: '品牌参考', referenceHint: '添加认可的品牌标识参考，说明可借鉴的视觉手法。',
    redline: '避免临摹现有商标；提前确认商用字体与标识授权，注明需要的矢量源文件。',
  },
  {
    id: 'biz_11', name: '包装设计', categoryId: 'brand', tag: '包装印刷', specification: '外包装纸盒 · 展开图与刀版',
    materialLabel: '印刷刀版图', materialHint: '提供印刷厂标准刀版，并注明尺寸、材质与出血要求。', materialPlaceholder: '添加刀版截图或包装参考图',
    notesLabel: '工艺与排版要求', notesPlaceholder: '说明盒型尺寸、材质、印刷工艺、标签和条码信息。', referenceLabel: '包装参考', referenceHint: '添加包装实拍或盒型参考，说明借鉴重点。',
    redline: '确认印刷出血和折线；条码、法定标识与关键信息避免压线或被裁切。',
  },
  {
    id: 'biz_12', name: 'PPT 美化', categoryId: 'presentation', tag: '演示设计', specification: '核心提案页 · 16:9 宽屏',
    materialLabel: '原 PPT 稿件 / 大纲', materialHint: '说明待美化的原稿内容，可通过聊天附件发送源文件。', materialPlaceholder: '添加页面截图或风格图片',
    notesLabel: '风格与配色', notesPlaceholder: '填写演示场景、主色调、字体规范和信息图表需求。', referenceLabel: '样板风格参考', referenceHint: '添加发布会或演示文稿截图，说明参考的视觉语言。',
    redline: '确保图表数据准确；确认字体授权与嵌入要求，动效以演示场景为准。',
  },
  {
    id: 'biz_13', name: '首页 / 活动页', categoryId: 'presentation', tag: '店铺页面', specification: 'PC + 无线端首页 / 活动页',
    materialLabel: '商品与文案规划', materialHint: '商品清单、活动机制、优惠信息和核心利益点。', materialPlaceholder: '添加页面规划或活动素材截图',
    notesLabel: '页面楼层动线', notesPlaceholder: '描述首屏、优惠区、主推商品、分类入口和互动模块。', referenceLabel: '页面参考', referenceHint: '添加品牌页面或活动页参考，说明希望借鉴的结构。',
    redline: '确认无线端适配与切片规范；页面资源控制在可接受范围内，避免影响加载。',
  },
];

export const BUSINESS_CARD_CATEGORIES = [
  { id: 'all', label: '全部业务', description: '浏览全部 13 类设计业务。' },
  { id: 'commerce', label: '电商与投放', description: '主图、详情页和投放素材。' },
  { id: 'content', label: '内容与营销', description: '海报、社媒封面和视频封面。' },
  { id: 'image', label: '图片处理', description: '排版调整、改字和精修。' },
  { id: 'brand', label: '品牌与包装', description: '品牌标识和商品包装。' },
  { id: 'presentation', label: '演示与页面', description: 'PPT、店铺首页和活动页面。' },
];
