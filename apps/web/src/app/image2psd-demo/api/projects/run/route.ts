import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
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
  const labRoot = path.resolve(process.env.PSD_LAB_ROOT || path.join(workspaceRoot, "..", "image-psd-lab"));
  const python = process.env.PSD_LAB_PYTHON || path.join(labRoot, ".venv", "Scripts", "python.exe");
  const wrapper = path.join(webRoot, "scripts", "run_psd_project_demo.py");
  const runRoot = path.join(workspaceRoot, ".cache", "image2psd-demo");
  return { webRoot, workspaceRoot, labRoot, python, wrapper, runRoot };
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

function integer(value: FormDataEntryValue | null, fallback: number, min: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(`参数需为 ${min} 到 ${max} 的整数。`);
  return parsed;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "此临时演示仅在开发环境启用。" }, { status: 404 });

  let form: FormData;
  let source: File;
  let mode: string;
  let colors = 8;
  let title = "";
  let titleX = 50;
  let titleY = 18;
  let titleSize = 64;
  let titleColor = "#ffffff";
  let extractSubject = false;
  let x0 = 22;
  let y0 = 24;
  let x1 = 78;
  let y1 = 78;
  let mask = "foreground";
  let ignoreColor = "";
  try {
    form = await request.formData();
    const value = form.get("source");
    if (!(value instanceof File)) throw new Error("请先上传一张图片。");
    source = value;
    if (!IMAGE_EXTENSIONS[source.type]) throw new Error("仅支持 PNG、JPG 和 WebP 图片。");
    if (source.size <= 0 || source.size > MAX_FILE_BYTES) throw new Error("图片不能为空，且不能超过 20 MB。");
    mode = String(form.get("mode") || "");
    if (mode !== "design-to-psd" && mode !== "bggg-creator-image2psd") throw new Error("请选择有效的拆层项目。");
    if (mode === "bggg-creator-image2psd") {
      colors = integer(form.get("colors"), 8, 2, 24);
      ignoreColor = String(form.get("ignoreColor") || "").trim();
      if (ignoreColor && !/^#[0-9a-f]{6}$/i.test(ignoreColor)) throw new Error("背景忽略色请使用 #RRGGBB 格式。");
    } else {
      title = String(form.get("title") || "").replace(/[|\r\n]/g, " ").trim().slice(0, 100);
      titleX = integer(form.get("titleX"), 50, 0, 100);
      titleY = integer(form.get("titleY"), 18, 0, 100);
      titleSize = integer(form.get("titleSize"), 64, 8, 240);
      titleColor = String(form.get("titleColor") || "#ffffff");
      if (!/^#[0-9a-f]{6}$/i.test(titleColor)) throw new Error("标题颜色无效。");
      extractSubject = form.get("extractSubject") === "true";
      x0 = integer(form.get("x0"), 22, 0, 99);
      y0 = integer(form.get("y0"), 24, 0, 99);
      x1 = integer(form.get("x1"), 78, 1, 100);
      y1 = integer(form.get("y1"), 78, 1, 100);
      mask = String(form.get("mask") || "foreground");
      if (!["foreground", "ellipse", "soft-rect", "rect"].includes(mask)) throw new Error("主体遮罩类型无效。");
      if (extractSubject && (x1 <= x0 || y1 <= y0)) throw new Error("主体框的右下角坐标必须大于左上角坐标。");
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "请求参数不正确。" }, { status: 400 });
  }

  const { labRoot, python, wrapper, runRoot } = locations();
  const designRoot = path.join(labRoot, "design-to-psd");
  const bgggRoot = path.join(labRoot, "bggg-skills", "bggg-creator-image2psd");
  const projectRoot = mode === "design-to-psd" ? designRoot : bgggRoot;
  if (!existsSync(wrapper)) return Response.json({ error: "演示运行器缺失：apps/web/scripts/run_psd_project_demo.py。" }, { status: 500 });
  if (!existsSync(python)) return Response.json({ error: `找不到 Python 环境：${python}。可通过 PSD_LAB_PYTHON 配置。` }, { status: 500 });
  if (!existsSync(projectRoot)) return Response.json({ error: `找不到项目目录：${projectRoot}。可通过 PSD_LAB_ROOT 配置项目根目录。` }, { status: 500 });

  const runId = randomUUID();
  const projectDir = path.join(runRoot, runId);
  const sourcePath = path.join(projectDir, `source${IMAGE_EXTENSIONS[source.type]}`);
  try {
    await mkdir(projectDir, { recursive: true });
    await writeFile(sourcePath, Buffer.from(await source.arrayBuffer()));
  } catch {
    return Response.json({ error: "无法在 .cache/image2psd-demo 中写入临时文件。" }, { status: 500 });
  }

  const args = [wrapper, "--mode", mode, "--source", sourcePath, "--project-dir", projectDir, "--project-root", projectRoot];
  if (mode === "bggg-creator-image2psd") {
    args.push("--colors", String(colors));
    if (ignoreColor) args.push("--ignore-color", ignoreColor);
  } else {
    args.push("--title", title, "--title-x", String(titleX), "--title-y", String(titleY), "--title-size", String(titleSize), "--title-color", titleColor);
    args.push("--extract-subject", String(extractSubject), "--x0", String(x0), "--y0", String(y0), "--x1", String(x1), "--y1", String(y1), "--mask", mask);
  }

  const childEnv: NodeJS.ProcessEnv = {
    NODE_ENV: process.env.NODE_ENV,
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
    PYTHONUNBUFFERED: "1",
    PYTHONIOENCODING: "utf-8",
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let settled = false;
      let stdout = "";
      let stderr = "";
      let stderrBuffer = "";
      const close = () => {
        if (settled) return;
        settled = true;
        controller.close();
      };

      event(controller, { type: "progress", message: `已选择 ${mode}，正在启动本地处理脚本。` });
      let child: ReturnType<typeof spawn>;
      try {
        child = spawn(python, args, { cwd: projectRoot, env: childEnv, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, shell: false });
      } catch (error) {
        event(controller, { type: "error", message: `无法启动 Python：${error instanceof Error ? error.message : "未知错误"}` });
        close();
        return;
      }

      const timeout = setTimeout(() => {
        child.kill();
        if (!settled) {
          event(controller, { type: "error", message: "任务运行超过 10 分钟，已停止。" });
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
          if (line.startsWith("PSD_PROJECT_PROGRESS ")) {
            const progress = parseJsonObject(line.slice("PSD_PROJECT_PROGRESS ".length));
            if (progress && typeof progress.message === "string") event(controller, { type: "progress", message: progress.message });
          } else if (line.trim()) {
            stderr += `${line}\n`;
          }
        }
      });
      child.on("error", (error) => {
        clearTimeout(timeout);
        if (settled) return;
        event(controller, { type: "error", message: `运行项目失败：${error.message}` });
        close();
      });
      child.on("close", (code) => {
        clearTimeout(timeout);
        if (settled) return;
        stderr += stderrBuffer;
        if (code !== 0) {
          const finalLine = stderr.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] || `处理脚本退出，状态码 ${code}`;
          event(controller, { type: "error", message: finalLine.slice(0, 1500) });
          close();
          return;
        }
        const result = parseJsonObject(stdout.trim());
        if (!result) {
          event(controller, { type: "error", message: "处理脚本没有返回有效结果。" });
          close();
          return;
        }
        event(controller, {
          type: "complete",
          output: {
            runId,
            engine: mode,
            downloadUrl: `/image2psd-demo/api/files/${runId}/output.psd`,
            previewUrl: `/image2psd-demo/api/files/${runId}/output.preview.png`,
            width: Number(result.width) || undefined,
            height: Number(result.height) || undefined,
            layerCount: Number(result.layer_count) || (Array.isArray(result.layers) ? result.layers.length : undefined),
            layers: Array.isArray(result.layers) ? result.layers.map((layer: any) => ({ name: String(layer?.name || "未命名图层"), visible: layer?.visible !== false })) : [],
          },
        });
        close();
      });
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
