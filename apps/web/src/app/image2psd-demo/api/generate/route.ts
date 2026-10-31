import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 1200;

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "演示仅在开发环境启用。" }, { status: 404 });
  let config;
  let source: File | null = null;
  let apiKey = "";
  let baseUrl = "";
  try {
    const form = await request.formData();
    const mode = String(form.get("mode") || "normal");
    const prompt = String(form.get("prompt") || "").trim();
    const mock = form.get("mock") === "true";
    const imageSize = String(form.get("imageSize") || "1024x1024").replace(/^auto$/, "1024x1024");
    const quality = String(form.get("quality") || "high");
    const maxAssets = Number(form.get("maxAssets") || 2);
    const copy = String(form.get("copy") || "");
    const copyLines = copy.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const visionModel = String(form.get("visionModel") || "").trim();
    const imageModel = String(form.get("imageModel") || "").trim();
    apiKey = String(form.get("apiKey") || "").trim();
    if (!["normal", "psd"].includes(mode)) throw new Error("生成模式无效。");
    if (!prompt || prompt.length > 6000) throw new Error("请填写 1～6000 字的设计需求。");
    if (copy.length > 1400 || copyLines.length > 8 || copyLines.some(line => line.length > 160)) throw new Error("最多 8 行文案，每行不超过 160 字。");
    if (!["1024x1024", "1024x1536", "1536x1024"].includes(imageSize)) throw new Error("画布尺寸无效。");
    if (!["low", "medium", "high"].includes(quality)) throw new Error("图片质量无效。");
    if (!Number.isInteger(maxAssets) || maxAssets < 1 || maxAssets > 4) throw new Error("独立素材数量需为 1～4。");
    if (!mock) {
      if (!apiKey || !imageModel || (mode === "psd" && !visionModel)) throw new Error("请填写 API Key、图像模型，以及 PSD 模式需要的规划模型。");
      let url: URL;
      try { url = new URL(String(form.get("baseUrl") || "").trim()); }
      catch { throw new Error("请填写有效的 API Base URL。"); }
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
        throw new Error("Base URL 应为 http/https 地址，不能包含账号、查询参数或片段。");
      baseUrl = url.toString().replace(/\/+$/, "");
    }
    const uploaded = form.get("source");
    if (uploaded instanceof File && uploaded.size) {
      if (!["image/png", "image/jpeg", "image/webp"].includes(uploaded.type) || uploaded.size > 20 * 1024 * 1024)
        throw new Error("参考图仅支持 PNG/JPG/WebP，最大 20 MB。");
      source = uploaded;
    }
    config = { mode, prompt, mock, imageSize, quality, maxAssets, copyLines, visionModel, imageModel };
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "参数错误。" }, { status: 400 });
  }
  const cwd = process.cwd();
  const webRoot = path.basename(cwd).toLowerCase() === "web" ? cwd : path.join(cwd, "apps", "web");
  const workspace = path.resolve(webRoot, "../..");
  const lab = path.resolve(workspace, "../image-psd-lab");
  const bundledPython = path.join(lab, ".venv", "Scripts", "python.exe");
  const python = process.env.GPT_IMAGE2_PYTHON || (existsSync(bundledPython) ? bundledPython : "python");
  const runId = randomUUID();
  const root = path.join(workspace, ".cache", "image2psd-demo", runId);
  try {
    await mkdir(root, { recursive: true });
    if (source) await writeFile(path.join(root, "source.png"), Buffer.from(await source.arrayBuffer()));
  } catch {
    return Response.json({ error: "无法保存生成任务文件。" }, { status: 500 });
  }
  const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
  for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy", "GENERATION_FONT_PATH", "GENERATION_FONT_NAME"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  Object.assign(env, { PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8", GENERATION_BASE_URL: baseUrl,
    GENERATION_API_KEY: apiKey, GENERATION_NODE: process.execPath,
    PSD_NODE_ROOT: process.env.PSD_NODE_ROOT || path.join(lab, "design-to-psd") });
  let cancel = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let child: ReturnType<typeof spawn> | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let result: Record<string, unknown> | undefined;
      let failed = false;
      let buffer = "";
      const decoder = new StringDecoder("utf8");
      const redact = (message: string) => (apiKey ? message.split(apiKey).join("[已隐藏]") : message).slice(0, 1500);
      const send = (payload: unknown) => {
        if (closed) return;
        try { controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`)); }
        catch { stop(); }
      };
      const stop = () => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        clearInterval(heartbeat);
        request.signal.removeEventListener("abort", stop);
        child?.kill();
        try { controller.close(); } catch { /* Reader already disconnected. */ }
      };
      cancel = stop;
      request.signal.addEventListener("abort", stop, { once: true });
      if (request.signal.aborted) { stop(); return; }
      const line = (text: string) => {
        if (!text.trim() || closed) return;
        try {
          const value = JSON.parse(text);
          if (value.type === "result") result = value.output;
          else if (value.type === "progress") send({ ...value, message: redact(String(value.message)) });
          else if (value.type === "error") { failed = true; send({ type: "error", message: redact(String(value.message)) }); }
        } catch {
          failed = true;
          send({ type: "error", message: "运行器返回了无效数据，任务未完成。" });
        }
      };
      try {
        child = spawn(python, [path.join(webRoot, "scripts", "run_generation_demo.py"), root],
          { cwd: webRoot, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, shell: false });
        child.stdin?.on("error", () => {});
        child.stdin?.end(JSON.stringify(config));
        child.stdout?.on("data", (chunk: Buffer) => {
          buffer += decoder.write(chunk);
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const item of lines) line(item);
        });
        // Drain stderr without exposing upstream payloads or local credentials.
        child.stderr?.on("data", () => {});
        child.on("error", () => { send({ type: "error", message: "无法启动 Python，请检查 GPT_IMAGE2_PYTHON 配置。" }); stop(); });
        child.on("close", code => {
          if (closed) return;
          line(buffer + decoder.end());
          if (!failed && code === 0 && result) {
            const fileUrl = (name: string) => `/image2psd-demo/api/files/${runId}/${name}`;
            const psd = config.mode === "psd";
            const layers = Array.isArray(result.layers) ? result.layers.map((layer: Record<string, unknown>) => ({
              name: layer.name, type: layer.type, left: layer.left, top: layer.top,
              previewUrl: fileUrl(path.basename(String(layer.file))),
              text: layer.text,
            })) : [];
            send({ type: "complete", output: { ...result, layers, runId, previewUrl: fileUrl("output.preview.png"),
              downloadUrl: fileUrl(psd ? "output.psd" : "output.preview.png"),
              ...(psd ? { bundleUrl: fileUrl("assets.zip"), planUrl: fileUrl("plan.json") } : {}) } });
          } else if (!failed) send({ type: "error", message: "任务未完成，请检查 Python 依赖与模型服务。" });
          stop();
        });
        timer = setTimeout(() => { send({ type: "error", message: "任务超过 20 分钟，已停止。请减少素材数量或检查中转站。" }); stop(); }, 20 * 60_000);
        heartbeat = setInterval(() => send({ type: "heartbeat" }), 15_000);
      } catch {
        send({ type: "error", message: "生成任务启动失败。" });
        stop();
      }
    },
    cancel() { cancel(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
