import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
};

function locations() {
  const cwd = process.cwd();
  const webRoot = path.basename(cwd).toLowerCase() === "web" ? cwd : path.join(cwd, "apps", "web");
  const workspaceRoot = path.resolve(webRoot, "../..");
  const skillRoot = path.resolve(
    process.env.GPT_IMAGE2_PSD_SKILL_DIR || path.join(workspaceRoot, "..", "image-psd-lab", "gpt-image2-layered-psd"),
  );
  const bundledPython = path.resolve(workspaceRoot, "..", "image-psd-lab", ".venv", "Scripts", "python.exe");
  const python = process.env.GPT_IMAGE2_PYTHON || (existsSync(bundledPython) ? bundledPython : "python");
  const wrapper = path.join(webRoot, "scripts", "run_image2_psd_demo.py");
  const runRoot = path.join(workspaceRoot, ".cache", "image2psd-demo");
  return { webRoot, workspaceRoot, skillRoot, python, wrapper, runRoot };
}

function normalizeBaseUrl(value: FormDataEntryValue | null): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("请填写 API Base URL。");
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("API Base URL 格式不正确，请填写完整的 https:// 地址。");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("中转站地址必须使用 http 或 https。");
  if (parsed.username || parsed.password) throw new Error("请把 API Key 填在单独的密钥栏，不要放进 URL。");
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/+$/, "");
}

function safeError(value: string, apiKey: string): string {
  const clean = apiKey ? value.split(apiKey).join("[已隐藏]") : value;
  return clean.replace(/Bearer\s+[^\s"']+/gi, "Bearer [已隐藏]").slice(0, 1500);
}

function event(controller: ReadableStreamDefaultController<Uint8Array>, payload: unknown) {
  controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`));
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "此临时演示仅在开发环境启用。" }, { status: 404 });

  let file: File;
  let apiKey = "";
  let baseUrl = "";
  let visionModel = "";
  let imageModel = "";
  let imageSize = "auto";
  let quality = "high";
  let maxLayers = 12;
  let allImageCalls = false;
  let mock = false;
  try {
    const form = await request.formData();
    const value = form.get("source");
    if (!(value instanceof File)) throw new Error("请上传一张图片。");
    file = value;
    if (!IMAGE_EXTENSIONS[file.type]) throw new Error("仅支持 PNG、JPG 和 WebP 图片。");
    if (file.size <= 0 || file.size > MAX_FILE_BYTES) throw new Error("图片不能为空，且不能超过 20 MB。");
    mock = form.get("mock") === "true";
    baseUrl = mock ? "http://127.0.0.1/mock" : normalizeBaseUrl(form.get("baseUrl"));
    apiKey = typeof form.get("apiKey") === "string" ? String(form.get("apiKey")).trim() : "";
    visionModel = String(form.get("visionModel") || "").trim();
    imageModel = String(form.get("imageModel") || "").trim();
    imageSize = String(form.get("imageSize") || "auto");
    quality = String(form.get("quality") || "high");
    maxLayers = Number(form.get("maxLayers") || 12);
    allImageCalls = form.get("allImageCalls") === "true";
    if (!mock && !apiKey) throw new Error("请填写 API Key，或开启离线模拟。");
    if (!mock && (!visionModel || !imageModel)) throw new Error("请填写视觉模型和图像模型名称。");
    if (!/^\d+$/.test(String(maxLayers)) || maxLayers < 1 || maxLayers > 24) throw new Error("最多图层数需在 1 到 24 之间。");
    if (!["auto", "1024x1024", "1024x1536", "1536x1024"].includes(imageSize)) throw new Error("图片尺寸选项无效。");
    if (!["low", "medium", "high"].includes(quality)) throw new Error("图片质量选项无效。");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "请求参数不正确。" }, { status: 400 });
  }

  const { skillRoot, python, wrapper, runRoot } = locations();
  if (!existsSync(wrapper)) return Response.json({ error: "演示运行器缺失：apps/web/scripts/run_image2_psd_demo.py。" }, { status: 500 });
  if (!existsSync(path.join(skillRoot, "scripts", "run_image2_psd.py"))) {
    return Response.json({ error: `找不到 gpt-image2-layered-psd 项目：${skillRoot}。请设置 GPT_IMAGE2_PSD_SKILL_DIR。` }, { status: 500 });
  }
  const runId = randomUUID();
  const projectDir = path.join(runRoot, runId);
  const sourcePath = path.join(projectDir, `source${IMAGE_EXTENSIONS[file.type]}`);
  try {
    await mkdir(projectDir, { recursive: true });
    await writeFile(sourcePath, Buffer.from(await file.arrayBuffer()));
  } catch {
    return Response.json({ error: "无法在项目 .cache/image2psd-demo 中写入临时文件。" }, { status: 500 });
  }

  const args = [
    wrapper,
    "--source", sourcePath,
    "--slug", `demo_${runId.slice(0, 8)}`,
    "--date", new Date().toISOString().slice(0, 10).replaceAll("-", ""),
    "--project-dir", projectDir,
    "--image-model", imageModel || "gpt-image-2",
    "--vision-model", visionModel || "gpt-5.2",
    "--image-size", imageSize,
    "--quality", quality,
    "--max-layers", String(maxLayers),
  ];
  if (allImageCalls) args.push("--no-local-simple-layers");
  if (mock) args.push("--mock-openai");

  const childEnv: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    HTTP_PROXY: process.env.HTTP_PROXY,
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    NO_PROXY: process.env.NO_PROXY,
    http_proxy: process.env.http_proxy,
    https_proxy: process.env.https_proxy,
    no_proxy: process.env.no_proxy,
    GPT_IMAGE2_PSD_SKILL_DIR: skillRoot,
    GPT_IMAGE2_BASE_URL: baseUrl,
    OPENAI_BASE_URL: baseUrl,
    GPT_IMAGE2_API_KEY: apiKey,
    IMAGE2_MODEL: imageModel || "gpt-image-2",
    IMAGE2_VISION_MODEL: visionModel || "gpt-5.2",
    PYTHONUNBUFFERED: "1",
    PYTHONIOENCODING: "utf-8",
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let settled = false;
      let stdout = "";
      let stderr = "";
      let stderrBuffer = "";
      let child: ReturnType<typeof spawn>;
      const close = () => {
        if (settled) return;
        settled = true;
        controller.close();
      };

      event(controller, { type: "progress", message: mock ? "离线结构测试已启动。" : "正在启动本地分层脚本。" });
      try {
        child = spawn(python, args, {
          cwd: skillRoot,
          env: childEnv,
          stdio: ["ignore", "pipe", "pipe"],
          windowsHide: true,
          shell: false,
        });
      } catch (error) {
        event(controller, { type: "error", message: `无法启动 Python：${error instanceof Error ? error.message : "未知错误"}` });
        close();
        return;
      }

      const timeout = setTimeout(() => {
        child.kill();
        if (!settled) {
          event(controller, { type: "error", message: "任务运行超过 10 分钟，已停止。请减少图层数量或检查中转站响应。" });
          close();
        }
      }, 10 * 60 * 1000);

      child.stdout?.on("data", (chunk: Buffer) => { if (!settled) stdout += chunk.toString("utf8"); });
      child.stderr?.on("data", (chunk: Buffer) => {
        if (settled) return;
        stderrBuffer += chunk.toString("utf8");
        const lines = stderrBuffer.split(/\r?\n/);
        stderrBuffer = lines.pop() || "";
        for (const line of lines) {
          if (line.startsWith("IMAGE2PSD_PROGRESS ")) {
            const progress = parseJsonObject(line.slice("IMAGE2PSD_PROGRESS ".length));
            if (progress && typeof progress.message === "string") event(controller, { type: "progress", message: progress.message });
          } else {
            stderr += `${line}\n`;
          }
        }
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        if (settled) return;
        event(controller, { type: "error", message: `启动分层脚本失败：${safeError(error.message, apiKey)}` });
        close();
      });
      child.on("close", async (code) => {
        clearTimeout(timeout);
        if (settled) return;
        stderr += stderrBuffer;
        if (code !== 0) {
          const finalLine = stderr.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || `Python 进程退出，状态码 ${code}`;
          event(controller, { type: "error", message: safeError(finalLine, apiKey) });
          close();
          return;
        }

        try {
          const result = parseJsonObject(stdout.trim());
          if (!result) throw new Error("分层脚本没有返回有效结果。");
          const analysis = parseJsonObject(await readFile(path.join(projectDir, "analysis", "analysis.json"), "utf8"));
          const validation = parseJsonObject(await readFile(path.join(projectDir, "validation_report.json"), "utf8"));
          const layers = Array.isArray(analysis?.layers) ? analysis.layers.map((layer: any) => ({
            name: String(layer?.name || "未命名图层"),
            type: String(layer?.type || "element"),
            bbox: Array.isArray(layer?.bbox) ? layer.bbox.map(Number) : undefined,
          })) : [];
          const dimensions = analysis?.canvas as { width?: number; height?: number } | undefined;
          const output: RunOutputPayload = {
            runId,
            downloadUrl: `/image2psd-demo/api/files/${runId}/output.psd`,
            previewUrl: `/image2psd-demo/api/files/${runId}/output.preview.png`,
            contactSheetUrl: `/image2psd-demo/api/files/${runId}/elements_contact_sheet.png`,
            layers,
            status: String(validation?.status || result.status || "ok"),
            errors: Array.isArray(validation?.errors) ? validation.errors.map(String) : [],
            width: Number(dimensions?.width) || undefined,
            height: Number(dimensions?.height) || undefined,
          };
          event(controller, { type: "complete", output });
          close();
        } catch (error) {
          event(controller, { type: "error", message: error instanceof Error ? error.message : "读取 PSD 结果失败。" });
          close();
        }
      });

      request.signal.addEventListener("abort", () => {
        clearTimeout(timeout);
        child.kill();
        if (!settled) close();
      }, { once: true });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

type RunOutputPayload = {
  runId: string;
  downloadUrl: string;
  previewUrl: string;
  contactSheetUrl: string;
  layers: Array<{ name: string; type: string; bbox?: number[] }>;
  status: string;
  errors: string[];
  width?: number;
  height?: number;
};
