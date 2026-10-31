# 双模式生图 Demo 使用说明

入口：http://127.0.0.1:3000/image2psd-demo

## 两种模式

默认不勾选 **PSD 模式**：填写设计需求，直接调用图像生成接口，输出 PNG。上传参考图时改用图片编辑接口；普通模式不调用规划模型、不导出 PSD。

勾选 **PSD 模式**：

1. 规划模型生成背景描述、素材清单、归一化位置和文字布局。
2. 图像模型分别生成背景和 1～4 个独立透明素材；后续素材使用已有合成画面作为光照与风格参考。
3. 本地根据文案逐行排版，生成预览，并为每行写入原生 PSD 文字数据。
4. 导出 PSD，通过 ag-psd 与 psd-tools 回读验证，提供成品 PNG、PSD、素材 ZIP 和图层计划 JSON。

文案留空时不添加文字。图片素材为像素层，文字为原生文字层；不包含 Logo 自动矢量化。字体默认微软雅黑，文案过长会缩小字号；缩小到 12px 仍无法容纳时明确报错。

右上角显示任务日志。桌面宽屏常驻，窄屏通过固定的“任务日志”按钮展开；日志计数代表已完成步骤，不是模型内部推理百分比。可停止进行中的任务。

## 中转站配置

- 沿用旧 Demo 的 Base URL、图像模型和规划模型设置。
- API Key 只在当前页面内存及当前任务进程环境中使用，不写入浏览器存储或产物。
- Base URL 通常形如 `https://relay.example/v1`，不要填到 `/images/generations` 等具体接口。
- 无参考图的直接出图使用 `/images/generations`；参考图和 PSD 素材使用 `/images/edits`。
- PSD 规划先调用 `/responses`，404/405 时回退 `/chat/completions`。
- 连接测试只测规划文字接口，不能证明生图、图片编辑和透明输出均可用。
- PSD 素材要求真实 Alpha 通道。若模型忽略透明背景或接口不支持该参数，任务报错；不会把不透明图片当作透明素材继续输出。

接口实现参照 [OpenAI 图像生成文档](https://developers.openai.com/api/docs/guides/image-generation)。第三方中转站仍需实际验证兼容性，不自动替换用户填写的模型。

## 环境与产物

复用之前 Demo 的本地环境：

- Python：默认 `D:\image-psd-lab\.venv\Scripts\python.exe`，可通过 `GPT_IMAGE2_PYTHON` 指定。
- Python 依赖：Pillow、numpy、requests、psd-tools。
- PSD 写入依赖：复用 `D:\image-psd-lab\design-to-psd\node_modules` 下的 ag-psd、pngjs；可通过 `PSD_NODE_ROOT` 指定另一个包含这些依赖的项目根目录。
- 字体可通过 `GENERATION_FONT_PATH`、`GENERATION_FONT_NAME` 指定文件与对应 PostScript 名称。
- 每次任务保存到 `.cache/image2psd-demo/<runId>/`。凭证不进入目录；输入参考图、生成图和图层计划会保存。
- 临时 Demo 保持仅开发环境启用。生产部署需另外设计任务队列、身份授权、文件保留周期与资源配额。

旧图片拆层页面保留在 `/image2psd-demo/legacy`；其他项目对比保留在 `/image2psd-demo/projects`。

## 验证

网页中可勾选“离线模拟”验证文件链路。模拟图是固定示意，不代表设计需求已被模型理解，也不代表实际生图质量。

实现过程中用离线模拟确认双模式下载、PSD 图层与文字回读、ZIP 文件和合成预览，并用本地模拟接口检查中转站的主要响应路径。没有使用真实 API Key 付费生成，也没有在 Photoshop GUI 中验证字体重排。模拟图仅验证文件与接口流程，不代表模型生成效果。

类型检查命令：

```powershell
pnpm --filter @design-review/web exec tsc --noEmit --incremental false
```
