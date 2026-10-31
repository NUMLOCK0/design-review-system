/// <reference path="../../types/imagetracerjs.d.ts" />
import ImageTracer from "imagetracerjs";
import { VECTORIZE_MAX_EDGE, VECTORIZE_MAX_SVG_BYTES } from "./vectorize-constants";

type TraceColor = { r: number; g: number; b: number; a: number };

/** Sample the whole image so large uniform backgrounds do not hide Logo colors. */
export function buildTracePalette(data: Uint8ClampedArray, limit: number): TraceColor[] {
    const buckets = new Map<string, { r: number; g: number; b: number; a: number; count: number }>();
    for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        const r = alpha < 8 ? 0 : data[i]; const g = alpha < 8 ? 0 : data[i + 1]; const b = alpha < 8 ? 0 : data[i + 2];
        const key = [r, g, b, alpha].map((value) => Math.round(value / 32)).join(":");
        const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, a: 0, count: 0 };
        bucket.r += r; bucket.g += g; bucket.b += b; bucket.a += alpha; bucket.count++;
        buckets.set(key, bucket);
    }
    const palette: TraceColor[] = [];
    for (const bucket of [...buckets.values()].sort((a, b) => b.count - a.count)) {
        const color = { r: Math.round(bucket.r / bucket.count), g: Math.round(bucket.g / bucket.count), b: Math.round(bucket.b / bucket.count), a: Math.round(bucket.a / bucket.count) };
        if (palette.some((existing) => Math.abs(existing.r - color.r) + Math.abs(existing.g - color.g)
            + Math.abs(existing.b - color.b) + Math.abs(existing.a - color.a) * 2 < 55)) continue;
        palette.push(color);
        if (palette.length >= limit) break;
    }
    return palette;
}

/** Trace pixels into editable paths; never embed the bitmap in the SVG. */
export function traceCanvasImage(input: { width: number; height: number; data: Uint8ClampedArray; colors?: number; pathomit?: number; blur?: number }): string {
    const { width, height, data } = input;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
        || width > VECTORIZE_MAX_EDGE || height > VECTORIZE_MAX_EDGE || data.length !== width * height * 4) throw new Error("图片尺寸无效，无法转换");
    let visible = false; let opaque = true;
    for (let index = 3; index < data.length; index += 4) {
        if (data[index] > 0) visible = true;
        if (data[index] < 255) opaque = false;
    }
    if (!visible) throw new Error("图片完全透明，无法描摹");
    const colors = Math.max(2, Math.min(16, input.colors || 12));
    const palette = buildTracePalette(data, colors);
    const background = { ...palette[0] };
    const traced = ImageTracer.imagedataToSVG({ width, height, data }, {
        pal: palette, colorsampling: 2, numberofcolors: colors, colorquantcycles: 3, mincolorratio: 0,
        ltres: 1, qtres: 1, pathomit: input.pathomit || 4, rightangleenhance: true,
        blurradius: input.blur || 0, blurdelta: 32, strokewidth: 0, roundcoords: 1, viewbox: true, desc: false,
    });
    let svg = traced.replace(/^<svg\b/i, `<svg width="${width}" height="${height}"`);
    // The tracer can leave tiny gaps between paths; opaque images need an opaque backing.
    if (opaque) svg = svg.replace(/^(<svg\b[^>]*>)/i, `$1<rect width="${width}" height="${height}" fill="rgb(${background.r},${background.g},${background.b})"/>`);
    if (!/^<svg\b/i.test(svg) || !/<path\b/i.test(svg) || /<(?:image|script|foreignObject)\b/i.test(svg)) throw new Error("无法从图片中生成有效矢量路径");
    if (new TextEncoder().encode(svg).length > VECTORIZE_MAX_SVG_BYTES) throw Object.assign(new Error("图片细节过多，生成的矢量文件过大；请使用更简洁的 Logo 后重试"), { code: "VECTORIZE_TOO_COMPLEX" });
    return svg;
}
