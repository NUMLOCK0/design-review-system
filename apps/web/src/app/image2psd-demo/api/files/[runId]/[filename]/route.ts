import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_FILES = new Set(["output.psd", "output.preview.png", "elements_contact_sheet.png", "assets.zip", "plan.json"]);

export async function GET(_request: Request, context: { params: Promise<{ runId: string; filename: string }> }) {
  if (process.env.NODE_ENV === "production") return new Response("Not found", { status: 404 });
  const { runId, filename } = await context.params;
  const layerFile = /^(background|asset-[1-4]|text-[1-8])\.png$/.test(filename);
  if (!/^[0-9a-f-]{36}$/i.test(runId) || (!ALLOWED_FILES.has(filename) && !layerFile)) return new Response("Not found", { status: 404 });

  const cwd = process.cwd();
  const webRoot = path.basename(cwd).toLowerCase() === "web" ? cwd : path.join(cwd, "apps", "web");
  const workspaceRoot = path.resolve(webRoot, "../..");
  const filePath = path.join(workspaceRoot, ".cache", "image2psd-demo", runId, ...(layerFile ? ["layers", filename] : [filename]));
  try {
    const bytes = await readFile(filePath);
    const contentType = filename.endsWith(".psd") ? "image/vnd.adobe.photoshop" : filename.endsWith(".zip") ? "application/zip" : filename.endsWith(".json") ? "application/json; charset=utf-8" : "image/png";
    const disposition = /\.(psd|zip|json)$/.test(filename) || new URL(_request.url).searchParams.get("download") === "1" ? `attachment; filename="${filename}"` : "inline";
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": disposition,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Result file not found", { status: 404 });
  }
}
