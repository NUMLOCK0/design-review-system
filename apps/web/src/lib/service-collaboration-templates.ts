export type WorkTemplate = { id: string; group: string; title: string; description: string; fields: Array<{ label: string; value: string }> };

const businessNames = ['电商主图', '电商详情页', '直通车 / 信息流', '海报设计', '小红书封面', '短视频封面', '原图文字重排版', '原图改字', '图片精修', 'LOGO 设计', '包装设计', 'PPT 美化', '首页 / 活动页'];

const businessFields = [
  ['商品 / SKU', '核心卖点', '平台与尺寸', '风格与参考', '交付数量'],
  ['商品 / SKU', '页面结构与楼层', '主推卖点', '平台与宽度', '交付格式'],
  ['投放平台', '投放目标', '引导文案', '图片尺寸', '禁用元素'],
  ['活动主题', '主视觉文案', '使用场景', '画面尺寸', '截止时间'],
  ['笔记主题', '封面标题', '目标人群', '尺寸比例', '参考风格'],
  ['视频主题', '封面文字', '平台与比例', '人物 / 产品素材', '参考风格'],
  ['原图范围', '新文案', '保留元素', '字体与排版要求', '输出尺寸'],
  ['原图范围', '待替换文字', '替换后文字', '字体要求', '交付格式'],
  ['修图对象', '瑕疵位置', '质感要求', '背景要求', '交付规格'],
  ['品牌名称', '品牌定位', '图形 / 字体偏好', '禁用元素', '交付文件'],
  ['产品 / 包装类型', '包装展开尺寸', '材质工艺', '法定标识', '印刷文件'],
  ['演示主题', '页数与结构', '品牌规范', '图表数据', '交付格式'],
  ['页面用途', '模块结构', '视觉主张', '适配端', '交付文件'],
];

const common = [{ label: '项目 / 订单', value: '' }, { label: '交付时间', value: '' }, { label: '补充说明', value: '' }];

export const SERVICE_WORK_TEMPLATES: WorkTemplate[] = [
  ...businessNames.map((name, index) => ({ id: `biz_${index + 1}`, group: '业务需求卡', title: name, description: '分项收集需求，支持增加 SKU、参考和交付项', fields: [...businessFields[index].map((label) => ({ label, value: '' })), ...common] })),
  ...businessNames.map((name, index) => ({ id: `std_${index + 1}`, group: '标准发单表单', title: `${name}标准发单`, description: '将需求整理为可追溯的标准订单填写卡', fields: [...businessFields[index].map((label) => ({ label, value: '' })), { label: '预算范围', value: '' }, { label: '源文件要求', value: '' }, { label: '验收标准', value: '' }] })),
  { id: 'revision', group: '专业协作卡', title: '精准改稿修订卡', description: '记录版本、级别与逐条修改点', fields: ['版本标记', '修改级别', '修改要点 1', '修改要点 2', '修改要点 3', '回传时间'].map((label) => ({ label, value: '' })) },
  { id: 'ab_review', group: '专业协作卡', title: 'A/B 方案评审卡', description: '并排记录方案特点与评审意见', fields: ['方案 A 名称', '方案 A 说明', '方案 B 名称', '方案 B 说明', '评审维度', '选定方案与理由'].map((label) => ({ label, value: '' })) },
  { id: 'urgent', group: '专业协作卡', title: '加急履约确认卡', description: '明确加急等级、截止时间与费用', fields: ['加急等级', '承诺交付时间', '服务保障', '加急费用', '双方确认说明'].map((label) => ({ label, value: '' })) },
  { id: 'compliance', group: '专业协作卡', title: '商用合规核验卡', description: '核对字体、图片、肖像和广告文案授权', fields: ['字体授权', '素材授权', '人物肖像授权', '广告文案核验', '待确认风险'].map((label) => ({ label, value: '' })) },
  { id: 'addon', group: '专业协作卡', title: '增项与预算变更卡', description: '明确新增工作与差价，正式价格仍以订单为准', fields: ['原定服务', '增补项目', '差价说明', '新增交付时间', '确认意见'].map((label) => ({ label, value: '' })) },
  { id: 'delivery', group: '专业协作卡', title: '终稿验收交接卡', description: '列出交付清单、链接与验收意见', fields: ['交付文件清单', '下载链接', '提取码', '源文件说明', '验收意见', '售后约定'].map((label) => ({ label, value: '' })) },
  { id: 'palette', group: '视觉辅助', title: '配色方案卡', description: '记录品牌色、辅助色与使用比例', fields: ['主色 HEX', '辅助色 HEX', '点缀色 HEX', '应用比例', '参考说明'].map((label) => ({ label, value: '' })) },
  { id: 'ab_test', group: '视觉辅助', title: 'A/B 盲评记录卡', description: '先记录匿名方案与评分，再公开偏好原因', fields: ['方案 1 描述', '方案 2 描述', '评审维度', '方案 1 评分', '方案 2 评分', '选定理由'].map((label) => ({ label, value: '' })) },
  { id: 'quality', group: '视觉辅助', title: '交付质量自检卡', description: '检查尺寸、文案、清晰度、授权和源文件', fields: ['尺寸与格式', '文案与错别字', '清晰度', '版权与授权', '源文件分层', '自检结论'].map((label) => ({ label, value: '' })) },
  { id: 'escrow', group: '视觉辅助', title: '款项与节点说明卡', description: '记录支付与交付节点，不发起真实收款', fields: ['合同金额', '定金比例', '尾款触发条件', '支付状态', '备注'].map((label) => ({ label, value: '' })) },
  { id: 'size_guide', group: '视觉辅助', title: '尺寸规范卡', description: '记录平台规格与安全区', fields: ['平台', '宽 × 高', '格式', '安全区', '文件大小上限'].map((label) => ({ label, value: '' })) },
  { id: 'source_guide', group: '视觉辅助', title: '源文件规范卡', description: '记录图层、命名、字体和打包要求', fields: ['文件格式', '图层要求', '命名规则', '字体处理', '打包清单'].map((label) => ({ label, value: '' })) },
  { id: 'case', group: '视觉辅助', title: '案例参考卡', description: '发送案例链接、风格标签与借鉴点', fields: ['案例名称', '案例链接', '风格标签', '可借鉴元素', '不采用元素'].map((label) => ({ label, value: '' })) },
  { id: 'style_matrix', group: '视觉辅助', title: '八方向风格灵感卡', description: '整理八个可编辑的创意方向', fields: Array.from({ length: 8 }, (_, index) => ({ label: `方向 ${index + 1}`, value: '' })) },
  { id: 'annotation', group: '视觉辅助', title: '视觉批注卡', description: '上传带标记图片并逐点描述', fields: ['图片版本', '批注 1', '批注 2', '批注 3', '总体修改意见'].map((label) => ({ label, value: '' })) },
];
