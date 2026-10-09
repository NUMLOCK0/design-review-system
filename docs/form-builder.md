# 表单配置器

入口：管理员后台 `/admin/settings/forms`。Web 端使用 JSON Forms 3.8.0 的 React 绑定和自定义渲染器；拖拽交互使用 dnd-kit。服务端用 Zod 检查配置结构、AJV 检查生成的 JSON Schema。

设计器分两步：第一步设置用途、名称、说明、业务类目和标签，也可从业务模板预填；第二步从字段组件区拖入画布、拖动字段排序、配置属性并预览或发布。拖拽时显示浮层和落点，画布末尾有专用放置区；点击组件的 `+` 也能添加。新建、切换模板、导入配置和归档时的确认使用 UI 对话框，错误与操作结果使用页面提示组件。

## 配置模型

- `FormTemplate.fields` 是有序字段树；字段 `id` 用于编辑器，`key` 用于答案数据，发布后不应随意更改含义。
- `category`、`tag`、`presetId` 保存业务模板来源信息；模板库内置设计聊天 demo 的 13 个类目、分组和 75 个字段。示例品牌/订单答案不作为生产默认值。
- `buildFormSchema(fields)` 同时生成 JSON Schema（数据类型和校验）及 JSON Forms UI Schema（顺序、宽度、显隐）。
- `width` 可取 10–100 的整数百分比；画布与预览按 100 列布局，窄屏改为整行。
- `repeat` 生成 JSON Schema 数组，运行时支持增加/删除条目，可配置子字段和最小/最大条数。
- `condition` 使用 JSON Forms 规则。当前支持等于、不等于、不为空，引用同级顶层字段。
- 图片/文件字段保存上传后的 URL，复用系统上传 API，不把文件二进制写进表单配置。
- `presets` 是可点击的快捷填入标签；下拉框快捷项会匹配对应选项的完整值。

支持单行/多行文本、邮箱、手机、网址、数字、下拉单选、单选按钮、多选、开关、日期、时间、日期时间、图片、文件、分组标题、说明文字、分割线和可增删子表单。支持必填、默认值、选项、长度/数字范围、正则、条件显示、字段复制/删除/排序、JSON 导入/导出、实时预览、草稿和发布版本。

## 发布与接口

- `GET /api/form-templates`：管理员查看草稿和历史状态。
- `POST /api/form-templates`、`PUT /api/form-templates/:id`：管理员保存草稿。
- `POST /api/form-templates/:id/publish`：递增版本号并保存不可变快照。
- `DELETE /api/form-templates/:id`：归档，保留历史版本。
- `GET /api/form-templates/published?target=order&category=电商视觉`：已登录客户端按用途/业务类目获取当前发布版本；两个筛选参数均可省略。
- `GET /api/form-templates/published/:id?version=1`：获取指定历史版本。
- `POST /api/form-templates/published/:id/validate`：按发布快照校验答案，body 为 `{ "version": 1, "data": { ... } }`。

数据库有 `form_templates` 和 `form_template_versions` 两张表。未配置 MySQL 时使用进程内存，重启后丢失；生产环境需配置 MySQL。

## 发单与小程序接入

当前配置器独立于现有订单核心字段。订单金额、图片计价、交付时间和审核流仍由现有业务流程维护。下一步接入发单页时，应把选中的模板 ID、版本号和答案快照写入订单，服务端在创建订单事务中用该版本校验答案，并在订单详情展示该快照。

微信小程序不直接使用 Web DOM 渲染器。它读取相同的 `FormTemplate.fields`/JSON Schema，使用 uni-app 原生控件渲染，并在提交时调用同一版服务端校验。配置新增字段类型时，两端需要同步实现对应控件。

设计聊天 HTML demo 展示了「选择标准模板 → 分组填写 Brief → 发送会话卡片 → 锁定执行契约」的流程。当前设计器已承载模板选择、字段分组、双列布局、快捷选项和版本发布；会话卡片与契约锁定仍需在订单/聊天业务接入时，以已发布模板版本及答案快照实现。
