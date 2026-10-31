# AI 生成分层 PSD：开源项目调研与工作台选型报告

调研日期：2026-10-24  
面向场景：电商图片、品牌海报、Logo 与品牌设计生图工作台；支持对话、模型中转站、图层编辑与 PSD 交付。

## 1. 结论

**存在可用的开源组件和工作流，但本次没有核实到一个开箱即用、可自由商用、能从一句话稳定生成任意复杂设计，并同时保留原生文字、矢量与特效的完整开源系统。** 这不是对所有项目的穷尽判断，而是此次核查范围内的结论。

对当前工作台，建议优先采用“先规划图层 → 分别生成素材 → 程序排版 → 导出 PSD”。已有图片拆层作为辅助能力。这样可以从生产流程中保留结构，减少对事后识别的依赖；但仍需解决素材的光照、透视、位置与风格一致性。

| 需求 | 优先考察 | 选择理由 | 当前判断 |
| --- | --- | --- | --- |
| 生成时保留独立素材层 | LayerDiffuse + PSDC | 透明素材生成与 PSD 写入职责清晰 | 最适合做下一阶段工程验证，尚未在本机完成组合测试 |
| 把现有图片拆成 PSD | Qwen-Image-Layered | 已公开模型，官方应用包含 PSD 导出 | 值得作为语义拆层基线，输出以像素层为主 |
| 在 Photoshop 里直接生成与修改 | OpenLayer | ComfyUI 结果直接进入 Photoshop 图层 | 适合设计师交互测试，需要 Photoshop，项目仍为 Alpha |
| 研究文字直接生成分层设计 | OmniPSD | 明确研究 Text-to-PSD | 权重、导出链路和许可均有落地限制，先列研究候选 |
| 继续使用已配置的模型中转站 | 现有 API 调用流程 + 独立图层规划/导出 | 可以复用工作台连接配置与任务系统 | 是自研集成路线，不是已经验证的上游完整功能 |

项目能力依据：[LayerDiffuse ComfyUI 实现](https://github.com/huchenlei/ComfyUI-layerdiffuse)、[PSDC](https://github.com/glaseagle/PSDC)、[Qwen-Image-Layered](https://github.com/QwenLM/Qwen-Image-Layered)、[OpenLayer](https://github.com/MehranMarxian/OpenLayer)、[OmniPSD](https://github.com/showlab/OmniPSD)。优先级为本报告结合工作台需求做出的工程判断，不是统一质量测试排名。

## 2. 先明确“直出 PSD”指什么

| 类型 | 实际过程 | PSD 可编辑程度 |
| --- | --- | --- |
| 模型联合生成多层 | 模型一次或多次生成有关联的 RGBA 图像，再封装 PSD | 通常是可移动、可替换的像素层 |
| 先规划、逐层生成 | Agent 制定图层清单，生成背景/主体/装饰，程序合成 | 可同时包含像素素材、原生文字、蒙版与分组，取决于导出器 |
| 单图拆层 | 输入成品图，识别对象、分离主体、补全遮挡区域 | 拆层结果是推断，不等于恢复原始设计文件 |
| Photoshop 集成 | AI 生成素材，插件把结果放入正在编辑的文档 | 可使用 Photoshop 后续编辑，但生成图片本身仍是像素内容 |
| 仅 PSD 打包 | 将已有 PNG、蒙版、位置与文字信息写入 PSD | 不提高素材质量，也不自动获得语义理解 |

验收时必须区分：**能打开 PSD、图层可单独移动、文字可重新输入、Logo 可编辑路径**，这是四种不同能力。把文字图片放在单独图层，并不等于 Photoshop 原生文字；把 Logo 存成 PSD，也不等于得到 SVG/AI 矢量源文件。

## 3. 项目总览

“可用”表示已核实有相应代码或资源入口，不代表本次已在本机完成真实模型推理。

| 项目 | 类型与主要输出 | 发布情况 / PSD 环节 | 许可证核查 | 建议 |
| --- | --- | --- | --- | --- |
| [Qwen-Image-Layered](https://github.com/QwenLM/Qwen-Image-Layered) | 图片 → 多层 RGBA | 模型公开；官方应用导出 PSD/PPTX/ZIP | Apache-2.0；模型见官方模型卡 | 图片拆层首批基线 |
| [LayerDiffuse / ComfyUI-layerdiffuse](https://github.com/huchenlei/ComfyUI-layerdiffuse) | 透明前景、条件背景、前后景联合生成等 | 代码与工作流公开；需另接 PSD 导出器 | 插件 Apache-2.0；底模另核对 | 图层生成候选 |
| [PSDC](https://github.com/glaseagle/PSDC) | ComfyUI 图层、蒙版与原生 PSD 编辑 | 可保存 PSD；支持部分原生文字、调整层、效果和分组 | MIT | 重点验证的导出/编辑组件 |
| [OpenLayer](https://github.com/MehranMarxian/OpenLayer) | Photoshop + ComfyUI | 发布插件；生成结果进入 PS 图层，Unflatten 为实验功能 | 插件 MIT；PS 与模型另计 | 设计师交互方案 |
| [OmniPSD](https://github.com/showlab/OmniPSD) | Text-to-PSD / Image-to-PSD 研究 | 有训练、推理代码；所查入口保存 PNG，配套权重未完整核实 | CC BY-NC-SA 4.0 | 研究跟踪，暂不作商业基础 |
| [gpt-image2-layered-psd](https://github.com/JongLeePc/gpt-image2-layered-psd) | 图像 API 驱动的提取、重建与 PSD 组装 | 公开脚本/Skill；依赖外部模型服务 | 本地版本 MIT；API 条款独立 | 可复用现有接入工程 |
| [design-to-psd](https://github.com/weaiw/design-to-psd) | 布局重建、素材和文字组织、PSD 写入 | 公开代码；已有本地基础输出测试 | 本地版本 MIT | 适合受控排版，不是语义拆层模型 |
| [bggg-creator-image2psd](https://github.com/binggandata/bggg-skills/tree/main/bggg-creator-image2psd) | 素材组装、颜色分层等 | Skill/脚本公开；已有本地基础输出测试 | 所属仓库本地版本 MIT | 轻量组装参考，颜色层不等于对象层 |
| [DreamLayer](https://ll3rd.github.io/DreamLayer/) | 文本驱动多层生成研究 | 核查时项目页仍标记 Code Coming Soon | 未核实到可运行代码许可 | 研究观察，不列部署候选 |
| [PSDiffusion](https://github.com/dingbang777/PSDiffusion) | 透明分层图像生成研究 | README 中推理代码/预训练模型发布仍未勾选 | 仓库 MIT，不代表模型已发布 | 等待发布，不列可运行候选 |

许可证只描述已检查的仓库或文件，不能推导底模、字体、数据集、API 服务或 Photoshop 获得同样许可。OmniPSD 的限制来自其 [LICENCE 文件](https://github.com/showlab/OmniPSD/blob/main/LICENCE)，不是根据 GitHub 的自动标签猜测。

## 4. 值得重点评估的方案

### 4.1 Qwen-Image-Layered：已有图片拆层

**流程：** 输入成品图 → 模型预测多个 RGBA 图层 → 官方应用组装为 PSD。

官方仓库提供推理示例与 [Hugging Face 模型](https://huggingface.co/Qwen/Qwen-Image-Layered)。检查 [src/app.py](https://github.com/QwenLM/Qwen-Image-Layered/blob/main/src/app.py) 可见，导出函数逐张调用 `create_pixel_layer`，随后保存 PSD。因此导出的核心是像素图层，不能据此承诺文字能重新输入、图标能编辑矢量节点。

官方说明其主要训练目标是图片拆层；直接文字生成多层的能力有限，提示词也不能稳定指定每一层的具体语义。对于产品后方被遮住的区域，生成结果依然需要校验，尤其是包装标识、细小文字与透明材质。[官方说明](https://github.com/QwenLM/Qwen-Image-Layered)

**运行路径：** 独立 Python/PyTorch 环境 → 安装仓库要求的 Diffusers、Transformers 等依赖 → 下载对应 Layered 模型 → 运行推理或 Gradio 应用 → 导出并在 Photoshop 检查。

**适合工作台的定位：** “导入图片并拆层”，以及与现有拆层方案做同素材对照。不要将它作为文字、Logo 矢量恢复器。

### 4.2 LayerDiffuse + PSDC：生成图层后交付 PSD

这是一种需要集成的组合方案，两个项目分别承担生成和文档输出。

- [ComfyUI-layerdiffuse](https://github.com/huchenlei/ComfyUI-layerdiffuse) 提供透明前景生成、以背景为条件生成前景、以主体为条件生成背景等工作流。所查实现面向 SD1.5/SDXL；前景、背景、合成图联合生成的特定模式目前仅支持 SD1.5，不能概括成任意模型都能一次生成任意数量图层。
- [PSDC](https://github.com/glaseagle/PSDC) 接收图像和蒙版，保留图层结构并输出 PSD，也支持通过 JSON 操作部分原生文字、调整/填充层、效果和分组。它不是图像模型，JSON 本身也不会生成照片像素。

**建议连接流程：**

```text
需求与品牌规范
    ↓
画布、构图、图层清单与文字内容
    ↓
背景生成 → 带背景条件的主体/装饰生成
    ↓
RGBA 素材 + 坐标 + 蒙版 + 文字样式
    ↓
PSDC 合成与原生图层创建
    ↓
成品预览 PNG + 分层 PSD
```

**边界：** 透明边缘、前后景色彩和遮挡仍需检查；原生文字与特效支持也有操作范围。例如 PSDC 文档中原生层变换主要支持平移，部分缩放、旋转、裁切等操作会被拒绝，不能当作 Photoshop 完整替代。[LayerDiffuse 实现说明](https://github.com/huchenlei/ComfyUI-layerdiffuse)、[PSDC 操作契约](https://github.com/glaseagle/PSDC#native-psd-editing-contract)

**运行路径：** 独立 ComfyUI 环境 → 安装 LayerDiffuse 节点和匹配底模/权重 → 安装 PSDC → 导入生成工作流 → 将图像、蒙版和 PSD 路径连接 → 保存并回读验证。此组合尚未在本机实测，报告不提供虚构的耗时或成功率。

### 4.3 OpenLayer：直接在 Photoshop 中生成图层

这是 Photoshop 插件，连接本地 ComfyUI。生成、局部重绘、去背景等结果作为有名称和位置的图层写入当前文档；还提供实验性的 Unflatten 和可选 MCP 控制桥接。它适合设计师边操作边修正，与无人值守的 Web 后端是不同部署形态。[OpenLayer 仓库](https://github.com/MehranMarxian/OpenLayer)

**运行路径：** Photoshop 2024+ → 安装发布的 `.ccx` 插件 → 启动本地 ComfyUI → 配置相应模型 → 在面板生成并保存文档。项目说明当前为 Alpha，并以 12GB 显卡为目标；这是作者的环境说明，不是所有模型都能在 12GB 上运行的保证。插件开源不包含 Photoshop 授权。[安装与限制](https://github.com/MehranMarxian/OpenLayer#installation)

**适合工作台的定位：** 可选的 Photoshop 交付端；也适合快速体验“生成即图层”的操作方式。生成的像素素材仍不自动变成原生文字或矢量。

### 4.4 OmniPSD：方向最接近，但当前落地条件不足

论文与仓库提出 Text-to-PSD 和 Image-to-PSD。文本路线利用 FLUX-Dev LoRA 与 RGBA VAE，在 2×2 网格表达完整海报、内容层、背景和去文字海报等关系；图像路线采用提取与擦除的迭代方式。[项目说明](https://github.com/showlab/OmniPSD)

此次核查有三项关键发现：

1. [推理入口](https://github.com/showlab/OmniPSD/blob/main/inference/infer_psd_flux.py) 中 LoRA 和 RGBA VAE 仍需填写本地路径；输出扩展名为 `.png`，通过 `img.save` 保存。不能把该入口描述成运行后直接得到完整 PSD。
2. README 未给出完整配套权重下载入口；本次 Hugging Face 按项目名检索也未返回模型。只能判断“此次未核实到”，不能排除权重以其他名称或渠道提供。
3. 仓库采用 [CC BY-NC-SA 4.0](https://github.com/showlab/OmniPSD/blob/main/LICENCE)，包含非商业限制；底层模型还需分别核查许可。

**判断：** 可研究联合生成与训练方法，不建议作为当前商业工作台的首选依赖。进入测试前应先确认权重可获得性、实际 PSD 组装链路及适用授权；也不能从“文字层图像”推断存在 Photoshop 原生字体信息。

### 4.5 已测试的三个方案应该如何保留

| 方案 | 保留价值 | 对当前效果问题的解释 |
| --- | --- | --- |
| gpt-image2-layered-psd | API 调用、提取任务编排、素材组织与 PSD 交付 | 最终质量依赖外部模型和提示约束；开源脚本不是开源模型 |
| design-to-psd | 明确坐标下的布局重建与文字/素材组装 | 适合按设计计划构建，不会自动恢复任意图片的全部设计语义 |
| bggg-creator-image2psd | 简单素材组装与 PSD 写入参考 | 颜色聚类拆出来的是颜色区域，无法可靠等价于人物、商品或标题 |

依据：[gpt-image2-layered-psd](https://github.com/JongLeePc/gpt-image2-layered-psd)、[design-to-psd](https://github.com/weaiw/design-to-psd)、[bggg-creator-image2psd](https://github.com/binggandata/bggg-skills/tree/main/bggg-creator-image2psd)。

已有本地记录：后两条路径分别生成过 800×1000 的 4 层、8 层测试 PSD，并通过基础解析与下载检查。**这些记录证明文件链路可用，不证明复杂海报语义拆层准确，也不是 Photoshop 原生文字兼容性测试。** 本报告未重新运行这些测试。

## 5. 研究观察项目

- **DreamLayer**：关注多层之间的关系和文本驱动分层生成。此次读取的[官方项目页](https://ll3rd.github.io/DreamLayer/)仍标注代码即将开放；有论文或数据集不等于有可部署推理系统。
- **PSDiffusion**：所查 [README](https://github.com/dingbang777/PSDiffusion) 中推理代码、预训练权重发布项仍未完成。仓库许可证不能代替实际代码和模型发布。

两者都不应计入“现在 clone 后即可运行”的候选。后续若发布，应重新核对权重、推理入口、许可证和 PSD 导出实现。

## 6. 给生图工作台的实施建议

以下是建议的新架构，不是声称某一个项目已完整实现。

### 6.1 将设计结构作为主数据

每个项目先产生结构化设计计划，包含画布尺寸、图层顺序、位置、素材来源、透明度、文字内容和样式。最小图层清单可以是：

| 图层 | 内容来源 | 交付方式 |
| --- | --- | --- |
| 背景 | AI 生成或已有素材 | 像素层 |
| 商品/主体 | 用户原图、透明素材或参考生成 | 带蒙版的像素层，保护商品真实性 |
| 装饰 | AI 生成或预制图形 | 像素层或可支持的原生图形 |
| 主标题、副标题、价格 | 已确认文案 | 原生文字层，并提供渲染预览 |
| Logo | 用户提供的品牌素材或独立设计流程 | 保留原素材；PSD 内的路径/智能对象支持单独验证 |

对于品牌 Logo，额外提供 SVG 等矢量文件应是独立交付目标，不能用 PSD 扩展名替代。

### 6.2 模型路由按能力配置

模型中转站配置除 Base URL、模型名称外，还应记录实际接口能力：文字规划、图片理解、图片编辑、参考图、透明输出、蒙版输入。名称不能证明接口兼容；接入时用小请求检测接口与返回格式，再允许进入相应工作流。

生成图片的供应商可以替换，图层清单、坐标与 PSD 导出保持独立。若某接口只能返回不透明图片，可进入“生成 → 抠图 → 边缘检查”分支，同时把它与原生透明输出分开评估。

### 6.3 单层修改与日志

用户修改标题时，只重排文字；修改背景时保留主体，但重新检查边缘与光照；修改商品时只替换关联素材和必要的阴影。每层保存版本、引用、生成参数及依赖关系，以支持重试和回退。

右上角任务日志建议显示“生成背景”“生成主体”“检查透明边缘”“创建文字层”“导出 PSD”“回读验证”等实际阶段，以及耗时、重试与失败原因。模型未提供进度时显示运行中及已完成阶段，不伪造精确百分比。

### 6.4 导出与验证

优先验证 PSDC 是否满足原生文字与蒙版需求；现有轻量导出器可以继续用于纯像素层。若使用 [ag-psd](https://github.com/Agamnentzar/ag-psd)，应按其能力边界评估：文字写入和复合预览不是完整 Photoshop 渲染替代，不能仅凭成功序列化就判定交付合格。

交付包建议包含：`preview.png`、`design.psd`、透明素材目录、图层清单及可复现参数。验收需要真实打开 PSD，检查标题可编辑、透明边缘、图层顺序、字体替代和合成一致性。

## 7. 本机条件与测试计划

前序检查记录为 RTX 3080 Ti、12GB 显存；`D:\image-psd-lab\.venv` 的 Python 为 3.14.2，当时未安装 PyTorch、Diffusers、Transformers。此描述仅针对该虚拟环境，不代表全机未安装。

- **LayerDiffuse**：可以优先选匹配的 SD1.5/SDXL 工作流做本机小样测试，但是否适配 12GB 仍取决于底模、分辨率、批量和卸载策略。
- **Qwen-Image-Layered**：官方示例采用 CUDA/BF16。完整模型直接放入 GPU 与量化/CPU 卸载是不同配置；不能说 12GB 一定可跑，也不能笼统说绝对不能跑。先做可复现的云端基线，再验证本机优化更稳妥。
- **OmniPSD**：先解决权重与授权，再讨论显存与部署。
- **环境隔离**：按对应项目支持的 Python/PyTorch 组合新建环境，不直接改变当前 Demo 的依赖。模型文件大小不等于推理峰值显存。

之前发现的 Qwen Image 2.1 文件不能当作 Qwen-Image-Layered 权重；本报告未据此声称拆层模型已经就绪。

建议首轮准备 12 个固定案例：4 个电商主图、4 个品牌海报、4 个复杂透明/遮挡场景。每种路线使用相同需求与素材，记录以下指标：

| 指标 | 验证方法 |
| --- | --- |
| 图层语义 | 主体、背景、标题是否按计划独立；是否混入其他对象 |
| 透明质量 | 在黑、白、彩色底上检查毛边、白边、空洞与阴影 |
| 品牌准确性 | 检查商品外形、包装、Logo 和文案是否被改写 |
| 可编辑性 | 在 Photoshop 修改标题、移动主体、替换背景，再保存重开 |
| 视觉一致性 | 对照预览与 PSD 合成图；检查比例、透视、光照与遮挡 |
| 性能与成本 | 记录峰值显存、总耗时、API 成本、失败次数和人工修复时间 |

以上为拟议测试，尚未执行。当前没有足够证据给这些方案编造质量分数、每张耗时或生产成功率。

## 8. 推荐落地顺序

1. **先验证 PSD 交付质量。** 使用现成素材，测试 PSDC 的图层、蒙版、原生中文标题、分组与预览一致性，确认导出端能承担要求。
2. **再验证分层生成。** 连接 LayerDiffuse，或复用已有中转站生成素材；首版只做背景、主体、装饰、文字四类，允许人工纠正位置。
3. **增加语义拆层对照。** 独立部署 Qwen-Image-Layered，和已有两个 Demo 用相同图片比较，决定是否保留“成品图转 PSD”入口。
4. **按用户工作方式接入 Photoshop。** 如果设计师主要在 PS 中工作，再评估 OpenLayer；若主要在 Web 工作台操作，优先完善服务器端导出。
5. **跟踪研究候选。** OmniPSD、DreamLayer、PSDiffusion 等满足代码、权重、许可与导出条件后再进入选型。

## 9. 核查范围与版本记录

本次检查了官方 GitHub 仓库、README、关键推理/导出代码、模型页面和许可证；没有新下载大型权重，也没有运行新的 GPU 质量基准。作者展示与作者环境声明均不作为本机实测结果。早前 Demo 的基础验证与本次源码调研在报告中分开标注。

下列为调研时获取的仓库最新提交，便于以后复查；链接指向对应快照。后续项目可能更新，重新部署前应再核对。

| 仓库 | 核查时最新提交 |
| --- | --- |
| OmniPSD | [1bfeae9](https://github.com/showlab/OmniPSD/tree/1bfeae9cea6d01ad73b4538a7ff9c2eb10007f09) |
| Qwen-Image-Layered | [54c4fe4](https://github.com/QwenLM/Qwen-Image-Layered/tree/54c4fe47e76d745775e03fc66ee38457280ed9ea) |
| ComfyUI-layerdiffuse | [b4f6a9e](https://github.com/huchenlei/ComfyUI-layerdiffuse/tree/b4f6a9e024064a4489f774a8b91049ce0b606ea3) |
| PSDC | [0c5d103](https://github.com/glaseagle/PSDC/tree/0c5d103def439cb5b816a4dfd5916888c6c45d98) |
| OpenLayer | [28f9fec](https://github.com/MehranMarxian/OpenLayer/tree/28f9fecc6e69f80e64083555ba743bca8a561cae) |
| PSDiffusion | [2d13655](https://github.com/dingbang777/PSDiffusion/tree/2d13655dab0f2246cdc1dbc4c8019075cfd18800) |

原始网页和代码摘取保存在本地 `.cache/ai-psd-research-20261024`，便于追溯此次判断。报告中的选型顺序、工作台架构和测试计划是基于这些资料提出的建议，不属于上游项目的效果承诺。
