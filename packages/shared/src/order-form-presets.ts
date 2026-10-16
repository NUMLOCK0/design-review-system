/** Business form starters adapted from the supplied chat demo. Demo sample answers are deliberately omitted. */
import { createFormField, type FormField, type FormTemplate } from './form-config';

export interface OrderFormPreset {
  id: string; name: string; tag: string; category: string; description: string;
  sections: Array<{ title: string; fields: Array<{ key: string; label: string; kind: 'text' | 'textarea' | 'select'; required?: boolean; placeholder?: string; options?: string[]; presets?: string[] }> }>;
}

export const ORDER_FORM_PRESETS: OrderFormPreset[] = [
  {
    "id": "tpl_1",
    "name": "电商主图设计",
    "tag": "全新主图/车图",
    "category": "电商视觉",
    "description": "全新制作商品主图，用于电商搜索展示、店铺首页，重点突出产品主体与核心卖点。",
    "sections": [
      {
        "title": "场景与目标定位",
        "fields": [
          {
            "key": "scene",
            "label": "使用场景",
            "kind": "select",
            "required": true,
            "options": [
              "淘宝",
              "天猫",
              "京东",
              "抖音电商",
              "拼多多",
              "快手电商",
              "得物"
            ]
          },
          {
            "key": "goal",
            "label": "设计目标",
            "kind": "select",
            "required": true,
            "options": [
              "提升点击率 (高CTR转化)",
              "突出产品质感与高级感",
              "突出促销活动与价格冲击",
              "场景代入强化痛点"
            ]
          },
          {
            "key": "subject",
            "label": "画面主体",
            "kind": "select",
            "required": true,
            "options": [
              "产品单独展示 (干净聚焦)",
              "产品 + 使用场景 (生活代入)",
              "产品 + 人物模特 (信任背书)"
            ]
          }
        ]
      },
      {
        "title": "卖点与必须展示元素",
        "fields": [
          {
            "key": "selling_points",
            "label": "核心卖点 (最多3条)",
            "kind": "textarea",
            "required": true,
            "placeholder": "每行1条核心卖点，最多3条：\n1. 0糖0脂0卡，天然果汁添加\n2. 低温冷萃锁鲜，现磨原叶原香\n3. 首发限时立减20元"
          },
          {
            "key": "must_show_elements",
            "label": "必须展示元素",
            "kind": "text",
            "placeholder": "如：产品图、品牌LOGO、活动价、卖点标签、赠品信息"
          }
        ]
      },
      {
        "title": "硬性约束与风格要求",
        "fields": [
          {
            "key": "hard_constraints",
            "label": "硬性约束 (违规包改)",
            "kind": "textarea",
            "required": true
          },
          {
            "key": "style",
            "label": "风格要求",
            "kind": "select",
            "options": [
              "简约高级 (留白通透)",
              "干净清晰 (白底/纯色质感)",
              "促销热闹 (大促冲击氛围)",
              "质感实拍 (真实光影漫反射)"
            ],
            "presets": [
              "简约高级",
              "干净清晰",
              "促销热闹",
              "质感实拍"
            ]
          },
          {
            "key": "forbidden_effects",
            "label": "禁止效果 (避坑黑名单)",
            "kind": "text",
            "placeholder": "填写不想要的样式，如：粗大红黄渐变字、满屏牛皮癣贴纸"
          }
        ]
      },
      {
        "title": "交付规格与源文件",
        "fields": [
          {
            "key": "deliverable_spec",
            "label": "交付规格",
            "kind": "text",
            "required": true
          }
        ]
      }
    ]
  },
  {
    "id": "tpl_2",
    "name": "电商详情页设计",
    "tag": "整页深度营销",
    "category": "电商视觉",
    "description": "整页详情页排版，用于消费者浏览、建立信任、促进下单，属于复杂结构化设计。",
    "sections": [
      {
        "title": "平台与总体规模",
        "fields": [
          {
            "key": "platform",
            "label": "使用平台",
            "kind": "select",
            "required": true,
            "options": [
              "天猫/淘宝无线端 (750px宽)",
              "京东移动端 (750px宽)",
              "拼多多移动端 (750px宽)",
              "全网多平台通用版 (750px+800px)"
            ]
          },
          {
            "key": "goal",
            "label": "设计目标",
            "kind": "select",
            "required": true,
            "options": [
              "讲清卖点，打消疑虑",
              "提升全链路转化率",
              "建立高端品牌信任",
              "深度场景种草代入"
            ]
          },
          {
            "key": "screen_count",
            "label": "详情总屏数 (必填数字)",
            "kind": "select",
            "required": true,
            "options": [
              "6 屏 (轻量敏捷版)",
              "8 屏 (标准电商版)",
              "10 屏 (深度营销版)",
              "12-16 屏 (KA品牌旗舰版)"
            ]
          }
        ]
      },
      {
        "title": "页面结构大纲 (固定模板)",
        "fields": [
          {
            "key": "structure_outline",
            "label": "楼层结构规划",
            "kind": "textarea",
            "required": true
          },
          {
            "key": "selling_priority",
            "label": "核心卖点优先级 (按重要程度排序)",
            "kind": "textarea"
          }
        ]
      },
      {
        "title": "品牌规范与交付要求",
        "fields": [
          {
            "key": "brand_norms",
            "label": "品牌硬性规范",
            "kind": "textarea",
            "required": true
          },
          {
            "key": "forbidden_styles",
            "label": "禁止风格",
            "kind": "text"
          },
          {
            "key": "deliverables",
            "label": "交付要求",
            "kind": "text"
          }
        ]
      }
    ]
  },
  {
    "id": "tpl_3",
    "name": "直通车/信息流广告图",
    "tag": "付费高点击投放",
    "category": "电商视觉",
    "description": "付费投放图，核心目标：高点击率、强卖点、强引导。",
    "sections": [
      {
        "title": "投放平台与目标",
        "fields": [
          {
            "key": "platform",
            "label": "投放平台",
            "kind": "select",
            "required": true,
            "options": [
              "抖音巨量千川",
              "小红书聚光投放",
              "天猫直通车/引力魔方",
              "快手磁力金牛",
              "腾讯广告广点通"
            ]
          },
          {
            "key": "goal",
            "label": "投放目标",
            "kind": "select",
            "required": true,
            "options": [
              "拉高点击率 (CTR)",
              "促进加购成交 (ROI)",
              "引流加粉与店铺沉淀"
            ]
          }
        ]
      },
      {
        "title": "卖点与引导文案",
        "fields": [
          {
            "key": "core_points",
            "label": "核心广告卖点 (1-2条)",
            "kind": "textarea",
            "required": true
          },
          {
            "key": "cta_btn",
            "label": "引导按钮文案",
            "kind": "text",
            "required": true
          }
        ]
      },
      {
        "title": "画面要求与禁止项",
        "fields": [
          {
            "key": "visual_req",
            "label": "画面要求",
            "kind": "textarea",
            "required": true
          },
          {
            "key": "forbidden_items",
            "label": "禁止项",
            "kind": "text"
          }
        ]
      }
    ]
  },
  {
    "id": "tpl_4",
    "name": "活动/品牌海报设计",
    "tag": "KV视觉/大促海报",
    "category": "电商视觉",
    "description": "用于线上大促活动主视觉或线下宣传，层级分明，气氛烘托到位。",
    "sections": [
      {
        "title": "主题与时间规划",
        "fields": [
          {
            "key": "theme",
            "label": "海报主题 (必填)",
            "kind": "text",
            "required": true
          },
          {
            "key": "activity_time",
            "label": "活动时间",
            "kind": "text"
          },
          {
            "key": "subject_type",
            "label": "画面主体",
            "kind": "select",
            "options": [
              "产品为主 (高清立体精修)",
              "人物模特为主 (自然亲切)",
              "纯氛围/3D视觉场景"
            ]
          }
        ]
      },
      {
        "title": "文案层级规划",
        "fields": [
          {
            "key": "text_hierarchy",
            "label": "文案层级 (主/副/辅)",
            "kind": "textarea",
            "required": true
          },
          {
            "key": "focus_content",
            "label": "重点突出内容",
            "kind": "text"
          }
        ]
      },
      {
        "title": "硬性约束与风格",
        "fields": [
          {
            "key": "hard_rules",
            "label": "硬性约束",
            "kind": "textarea",
            "required": true
          },
          {
            "key": "style_and_ban",
            "label": "风格偏好与禁止效果",
            "kind": "text"
          }
        ]
      }
    ]
  },
  {
    "id": "tpl_5",
    "name": "小红书/公众号配图",
    "tag": "爆款新媒体图文",
    "category": "新媒体运营",
    "description": "新媒体平台种草笔记封面与配图排版，讲究自然、高级与生活化。",
    "sections": [
      {
        "title": "主题与氛围基调",
        "fields": [
          {
            "key": "note_theme",
            "label": "笔记主题 (必填)",
            "kind": "text",
            "required": true
          },
          {
            "key": "atmosphere",
            "label": "整体氛围",
            "kind": "select",
            "required": true,
            "options": [
              "治愈温馨",
              "高级极简",
              "干净清晰",
              "生活化真实感",
              "强种草安利"
            ]
          }
        ]
      },
      {
        "title": "文案与排版要求",
        "fields": [
          {
            "key": "must_show_text",
            "label": "必须展示文案",
            "kind": "textarea",
            "required": true
          },
          {
            "key": "layout_pref",
            "label": "排版偏好",
            "kind": "select",
            "options": [
              "极简留白大字",
              "满版沉浸种草",
              "图文穿插小清新卡片",
              "左右对比拼图"
            ]
          }
        ]
      },
      {
        "title": "小红书专属红线",
        "fields": [
          {
            "key": "redline_xhs",
            "label": "小红书专属约束",
            "kind": "text",
            "required": true
          }
        ]
      }
    ]
  },
  {
    "id": "tpl_6",
    "name": "短视频封面图",
    "tag": "高抓眼球爆款封面",
    "category": "新媒体运营",
    "description": "抖音/快手/视频号短视频第一帧或专属封面，手机端快速刷屏时瞬间留住注意力。",
    "sections": [
      {
        "title": "视频主题与主标",
        "fields": [
          {
            "key": "video_theme",
            "label": "视频内容主题 (必填)",
            "kind": "text",
            "required": true
          },
          {
            "key": "cover_key_text",
            "label": "封面核心文字",
            "kind": "text",
            "required": true
          }
        ]
      },
      {
        "title": "画面与避让红线",
        "fields": [
          {
            "key": "visual_req",
            "label": "画面要求",
            "kind": "textarea",
            "required": true
          },
          {
            "key": "constraints",
            "label": "排版约束 (严禁遮挡)",
            "kind": "text",
            "required": true
          }
        ]
      }
    ]
  },
  {
    "id": "tpl_7",
    "name": "原图文字创意重排版",
    "tag": "平台最高优先级痛点",
    "category": "排版升级",
    "description": "已有精美原图底板，对画面文案做高阶艺术重构，坚决保护原图主体与光影。",
    "sections": [
      {
        "title": "底图与使用场景",
        "fields": [
          {
            "key": "raw_image_upload",
            "label": "底图上传 (必填)",
            "kind": "select",
            "required": true,
            "options": [
              "已在卡片上传高清原图底板",
              "原图在聊天中发送，需高保真提取"
            ]
          },
          {
            "key": "scene",
            "label": "使用场景",
            "kind": "select",
            "required": true,
            "options": [
              "短片封面",
              "视频片头",
              "图文封面",
              "品牌视觉KV海报"
            ]
          },
          {
            "key": "design_goal",
            "label": "设计目的",
            "kind": "select",
            "required": true,
            "options": [
              "氛围感强化",
              "故事感与电影感",
              "高级杂志排版感",
              "商业质感升级"
            ]
          }
        ]
      },
      {
        "title": "硬性禁区 (必填红线)",
        "fields": [
          {
            "key": "hard_forbidden_zones",
            "label": "硬性禁区 (绝对禁止放字)",
            "kind": "textarea",
            "required": true
          }
        ]
      },
      {
        "title": "文字层级与排版规则",
        "fields": [
          {
            "key": "text_hierarchy",
            "label": "文字层级 (固定模板)",
            "kind": "textarea",
            "required": true
          },
          {
            "key": "text_rules",
            "label": "文字规则",
            "kind": "text"
          },
          {
            "key": "font_pref",
            "label": "字体偏好与禁止效果",
            "kind": "textarea"
          }
        ]
      }
    ]
  },
  {
    "id": "tpl_8",
    "name": "原图仅替换文字 (简易改字)",
    "tag": "无损一比一替换",
    "category": "排版升级",
    "description": "原图版式、字体、质感完全保持不变，只做字样无损替换。",
    "sections": [
      {
        "title": "改字对照与规则",
        "fields": [
          {
            "key": "orig_text",
            "label": "原有文字内容 (待替换)",
            "kind": "text",
            "required": true
          },
          {
            "key": "new_text",
            "label": "新替换文字内容 (替换为)",
            "kind": "text",
            "required": true
          },
          {
            "key": "fixed_rules",
            "label": "固定规则 (严格执行)",
            "kind": "textarea",
            "required": true
          }
        ]
      }
    ]
  },
  {
    "id": "tpl_9",
    "name": "图片精修/调色/合成",
    "tag": "高精度修图合成",
    "category": "摄影修图",
    "description": "对拍摄原片进行高阶去瑕疵、光影塑造、质感重构或背景合成。",
    "sections": [
      {
        "title": "精修项目勾选",
        "fields": [
          {
            "key": "retouch_items",
            "label": "精修项目",
            "kind": "select",
            "required": true,
            "options": [
              "全套精修 (抠图+调色+光影重塑+去瑕疵+换背景)",
              "产品高阶质感精修 (金属/玻璃透通光影)",
              "人像高级质感修图 (保留皮肤纹理)",
              "快速白底抠图去杂色"
            ]
          }
        ]
      },
      {
        "title": "保留与禁止区域",
        "fields": [
          {
            "key": "preserve_req",
            "label": "必须保留要求",
            "kind": "text",
            "required": true
          },
          {
            "key": "forbidden_modify",
            "label": "禁止修改区域",
            "kind": "text"
          }
        ]
      }
    ]
  },
  {
    "id": "tpl_10",
    "name": "LOGO设计",
    "tag": "品牌主标识",
    "category": "品牌与标识",
    "description": "从0构建品牌主视觉标识，包含图形、标准字与多场景应用规范。",
    "sections": [
      {
        "title": "品牌基础信息",
        "fields": [
          {
            "key": "brand_name",
            "label": "品牌名称 / 英文名称 (必填)",
            "kind": "text",
            "required": true
          },
          {
            "key": "industry",
            "label": "所属行业",
            "kind": "select",
            "required": true,
            "options": [
              "新茶饮/健康饮品",
              "美妆个护",
              "数码科技",
              "餐饮连锁",
              "企业服务SaaS",
              "文化文创"
            ]
          },
          {
            "key": "usage_scene",
            "label": "使用场景",
            "kind": "text"
          }
        ]
      },
      {
        "title": "寓意与风格偏好",
        "fields": [
          {
            "key": "brand_meaning",
            "label": "品牌寓意 / 想要表达的感觉",
            "kind": "textarea",
            "required": true
          },
          {
            "key": "style_pref",
            "label": "风格偏好",
            "kind": "select",
            "options": [
              "极简几何图形标",
              "纯文字艺术设计标",
              "超级符号/IP萌宠标",
              "东方雅致国潮印章标"
            ]
          },
          {
            "key": "taboo_elements",
            "label": "避讳元素 / 禁止样式",
            "kind": "text"
          },
          {
            "key": "deliverable_versions",
            "label": "交付版本规范",
            "kind": "text"
          }
        ]
      }
    ]
  },
  {
    "id": "tpl_11",
    "name": "包装设计",
    "tag": "实体生产打样",
    "category": "实体与印刷",
    "description": "用于工厂印刷打样与实体商品外包装，附带严格刀模展开规范。",
    "sections": [
      {
        "title": "尺寸与材质规范",
        "fields": [
          {
            "key": "product_dim",
            "label": "产品名称 / 规格尺寸 (必填)",
            "kind": "text",
            "required": true
          },
          {
            "key": "pack_material",
            "label": "包装材质",
            "kind": "select",
            "required": true,
            "options": [
              "350g 高阶触感纸",
              "白卡纸覆哑膜",
              "金银卡纸逆向UV",
              "瓦楞纸快递礼盒",
              "透明PET塑料瓶贴"
            ]
          },
          {
            "key": "brand_colors",
            "label": "品牌色规范",
            "kind": "text"
          }
        ]
      },
      {
        "title": "必须印刷信息与红线",
        "fields": [
          {
            "key": "must_print_info",
            "label": "必须印刷信息",
            "kind": "textarea",
            "required": true
          },
          {
            "key": "forbidden_content",
            "label": "禁止设计内容",
            "kind": "text"
          }
        ]
      }
    ]
  },
  {
    "id": "tpl_12",
    "name": "PPT美化",
    "tag": "商业演示文稿",
    "category": "办公与商务",
    "description": "将密集文字转化为逻辑图示、高阶图表与大厂商业汇报视觉。",
    "sections": [
      {
        "title": "页数与场景",
        "fields": [
          {
            "key": "page_count",
            "label": "PPT页数 (必填)",
            "kind": "text",
            "required": true
          },
          {
            "key": "purpose",
            "label": "使用场景",
            "kind": "select",
            "required": true,
            "options": [
              "商业融资计划书 (BP路演)",
              "品牌新品招商会",
              "年度述职与经营汇报",
              "客户解决方案提案"
            ]
          },
          {
            "key": "use_original_master",
            "label": "是否沿用原有母版",
            "kind": "select",
            "options": [
              "全新定制高端母版",
              "沿用公司原有母版，仅美化排版",
              "基于大厂发布会极简模板重构"
            ]
          }
        ]
      },
      {
        "title": "风格与禁止项",
        "fields": [
          {
            "key": "style_req",
            "label": "整体风格要求",
            "kind": "text",
            "required": true
          },
          {
            "key": "forbidden_effects",
            "label": "禁止效果",
            "kind": "text"
          }
        ]
      }
    ]
  },
  {
    "id": "tpl_13",
    "name": "电商首页/活动承接页",
    "tag": "全店动线大促",
    "category": "电商视觉",
    "description": "天猫/京东店铺整店首页及大促落地承接页，全屏氛围营造与导流转化。",
    "sections": [
      {
        "title": "活动主题与时间",
        "fields": [
          {
            "key": "act_theme",
            "label": "活动主题 (必填)",
            "kind": "text",
            "required": true
          },
          {
            "key": "act_time",
            "label": "活动时间",
            "kind": "text"
          },
          {
            "key": "module_count",
            "label": "页面模块数量",
            "kind": "text"
          }
        ]
      },
      {
        "title": "楼层大纲与主推商品",
        "fields": [
          {
            "key": "structure_outline",
            "label": "页面结构大纲",
            "kind": "textarea",
            "required": true
          },
          {
            "key": "main_goods",
            "label": "主推商品 / 福利模块",
            "kind": "text"
          }
        ]
      },
      {
        "title": "品牌规范约束",
        "fields": [
          {
            "key": "brand_rules",
            "label": "品牌规范约束",
            "kind": "textarea",
            "required": true
          }
        ]
      }
    ]
  }
];

export function createOrderPresetDraft(preset: OrderFormPreset): FormTemplate {
  const now = new Date().toISOString();
  const fields: FormField[] = [];
  for (const section of preset.sections) {
    fields.push({ ...createFormField('section', fields.length + 1), key: `section_${fields.length + 1}`, label: section.title, width: 100 });
    for (const entry of section.fields) {
      fields.push({ ...createFormField(entry.kind, fields.length + 1), key: entry.key, label: entry.label, required: entry.required, placeholder: entry.placeholder, width: entry.kind === 'textarea' || entry.label.includes('大纲') ? 100 : 50, ...(entry.options ? { options: entry.options.map((option) => ({ label: option, value: option })) } : {}), ...(entry.presets ? { presets: entry.presets } : {}) });
    }
  }
  return { id: '', name: preset.name, description: preset.description, target: 'order', category: preset.category, tag: preset.tag, presetId: preset.id, mobileStyle: 'comfortable', fields, version: 0, publishedVersion: 0, status: 'draft', createdAt: now, updatedAt: now };
}
