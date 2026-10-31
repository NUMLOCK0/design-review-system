# 品牌设计 Skills 接入

生图工作台的品牌模式沿用系统已有的设计 Skill 目录与任务链路。管理员和客服可在品牌项目的对话区域点击“添加设计 Skills”，最多选择 5 项。新项目发送需求时使用所选项；已有方案修改选择后，可点击“应用到当前方案”，或随下一条消息应用。管理员仍可在设计 Skill 管理页面修改或停用这些条目。

| 内置 Skill | 来源 | 作用 |
| --- | --- | --- |
| Logo 概念与矢量设计 | [logo-design-skill](https://github.com/kaankiziltug/logo-design-skill) | 概念筛选、矢量构造和检查清单 |
| 品牌识别系统设计 | [brand-identity-skill](https://github.com/fatihaydost/brand-identity-skill) | 将标志、字体、颜色和应用组织为同一系统 |
| Logo 风格化概念提示词 | [base-logo-generator](https://github.com/SanbaoAI/logo-generator-skill/tree/main/skills/base-logo-generator) | 标志构造和图像提示词 |
| 吉祥物与角色标志设计 | [mascot-logo-generator](https://github.com/SanbaoAI/logo-generator-skill/tree/main/skills/mascot-logo-generator) | 从角色特征提炼原创标志 |
| Logo 配色与品牌应用 | [logo-colorway-generator](https://github.com/SanbaoAI/logo-generator-skill/tree/main/skills/logo-colorway-generator) | 保持标志结构并规划配色和应用 |
| Logo 多方向提案与评审 | [logo-design-board](https://github.com/YangsonHung/awesome-agent-skills/tree/main/skills/en/logo-design-board) | 比较概念方向、适用场景和风险 |
| Logo 风格参数与提示词 | [logo-prompt-generator](https://github.com/amys94fr/logo-prompt-generator) | 按标志类型、形态、色彩及输出形式整理提示词 |

以上来源的代码仓库均标注 MIT；系统中的条目是面向当前设计 Agent 自行整理的指导，不包含第三方 Logo 素材，也不运行上游脚本。种子只在不存在时创建，保留管理员对已有条目的修改。所选 Skill 的指导进入对话上下文，并与生成任务关联；文本任务使用服务端读取的 Skill 快照，图片任务将标准附加到生成提示词。

上游项目提供的 SVG 审计、色觉模拟、字体许可检查、PDF 品牌手册等脚本没有接入。Skill 中的检查项是待执行的设计要求；未运行相关工具时不能声称已完成检查。实际生图仍依赖项目中配置的模型与服务，图像概念稿也不等同于可编辑矢量文件。
