import { traceCanvasImage } from "./vectorize-core";

self.onmessage = (event: MessageEvent<{ width: number; height: number; data: Uint8ClampedArray; colors?: number; pathomit?: number; blur?: number }>) => {
    try { self.postMessage({ svg: traceCanvasImage(event.data) }); }
    catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "图片转换失败", code: (error as { code?: string })?.code }); }
};
