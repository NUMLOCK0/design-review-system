import { getImageBlob } from "@infinite-canvas/services/image-storage";
import type { CanvasNodeData } from "@infinite-canvas/types/canvas";
import { VECTORIZE_MAX_EDGE } from "./vectorize-constants";

const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export async function vectorizeCanvasImage(node: CanvasNodeData, fetchProtected: (url: string) => Promise<Response>): Promise<{ svg: string; simplified: boolean }> {
    const storageKey = node.metadata?.storageKey || "";
    const studioId = node.metadata?.imageStudioAssetId || /^studio-image-asset:([\w-]+)$/.exec(storageKey)?.[1];
    const workspaceId = /^image:oss:(asset_[a-f0-9]{32})$/i.exec(storageKey)?.[1];
    let blob = workspaceId ? await getImageBlob(storageKey).catch(() => null) : null;
    if (!blob) {
        const url = studioId ? `/api/image-studio/assets/${encodeURIComponent(studioId)}/download`
            : workspaceId ? `/api/image-studio/workspace-images/${encodeURIComponent(workspaceId)}/content`
                : node.metadata?.content || "";
        if (!url) throw new Error("图片尚未加载，请稍后重试");
        const response = url.startsWith("/api/") ? await fetchProtected(url) : await fetch(url, { credentials: "same-origin" });
        if (!response.ok) throw new Error("无法读取原图，请检查图片是否仍然可用");
        const length = Number(response.headers.get("content-length") || 0);
        if (length > MAX_SOURCE_BYTES) throw new Error("图片超过 25 MB，请压缩后重试");
        blob = await response.blob();
    }
    if (blob.size > MAX_SOURCE_BYTES || !/^image\/(png|jpe?g|webp|gif)$/i.test(blob.type.split(";")[0])) throw new Error("请选择 25 MB 以内的 PNG、JPEG、WebP 或 GIF 图片");
    let bitmap: ImageBitmap;
    try { bitmap = await createImageBitmap(blob); }
    catch { throw new Error("图片无法解码，请换一张图片重试"); }
    try {
        if (!bitmap.width || !bitmap.height) throw new Error("图片尺寸无效");
        const levels = [{ edge: VECTORIZE_MAX_EDGE, colors: 6, pathomit: 24, blur: 2 }, { edge: 320, colors: 4, pathomit: 24, blur: 2 }, { edge: 192, colors: 3, pathomit: 32, blur: 2 }];
        for (let index = 0; index < levels.length; index++) {
            const level = levels[index];
            const ratio = Math.min(1, level.edge / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
            canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (!context) throw new Error("浏览器无法处理图片");
            context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            try { return { svg: await traceInWorker(context.getImageData(0, 0, canvas.width, canvas.height), level), simplified: index > 0 }; }
            catch (error) { if ((error as { code?: string })?.code !== "VECTORIZE_TOO_COMPLEX" || index === levels.length - 1) throw error; }
        }
        throw new Error("图片转换失败，请重试");
    } finally { bitmap.close(); }
}

function traceInWorker(image: ImageData, options: { colors: number; pathomit: number; blur: number }): Promise<string> {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL("./vectorize-worker.ts", import.meta.url), { type: "module" });
        const timeout = window.setTimeout(() => finish(new Error("图片转换超时，请尝试更简洁的 Logo")), 60_000);
        const finish = (error?: Error, svg?: string) => {
            window.clearTimeout(timeout);
            worker.terminate();
            if (error) reject(error); else resolve(svg!);
        };
        worker.onerror = () => finish(new Error("图片转换失败，请刷新后重试"));
        worker.onmessage = (event: MessageEvent<{ svg?: string; error?: string; code?: string }>) => {
            if (event.data.error || !event.data.svg) finish(Object.assign(new Error(event.data.error || "未生成 SVG"), { code: event.data.code }));
            else finish(undefined, event.data.svg);
        };
        worker.postMessage({ width: image.width, height: image.height, data: image.data, ...options }, [image.data.buffer]);
    });
}
