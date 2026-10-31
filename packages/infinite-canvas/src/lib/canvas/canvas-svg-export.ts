import saveAs from "file-saver";
import { CanvasNodeType, type CanvasNodeData } from "@infinite-canvas/types/canvas";
import { createZip } from "@infinite-canvas/lib/zip";
import { getImageBlob } from "@infinite-canvas/services/image-storage";

export function isCanvasSvgNode(node: CanvasNodeData): boolean {
    return node.type === CanvasNodeType.Image && (["generated-svg", "vectorized-svg"].includes(node.metadata?.artifactType || "")
        || Boolean(node.metadata?.svgSource) || /^data:image\/svg\+xml/i.test(node.metadata?.content || ""));
}

/** The raster preview is separate from the original editable SVG source. */
export function getCanvasSvgExport(node: CanvasNodeData): { filename: string; source: string } | null {
    if (node.type !== CanvasNodeType.Image) return null;
    let source = typeof node.metadata?.svgSource === "string" ? node.metadata.svgSource : "";
    if (!source && node.metadata?.content) {
        const match = /^data:image\/svg\+xml(?:;charset=[^;,]+)?(;base64)?,([\s\S]*)$/i.exec(node.metadata.content);
        if (match) try {
            source = match[1] ? new TextDecoder().decode(Uint8Array.from(atob(match[2]), (character) => character.charCodeAt(0))) : decodeURIComponent(match[2]);
        } catch { return null; }
    }
    source = source.trim();
    if (!/^<svg(?:\s|>)/i.test(source) || !/<\/svg>\s*$/i.test(source)) return null;
    const title = (node.title || `canvas-image-${node.id}`).replace(/[\\/:*?"<>|\x00-\x1f]/g, "_").replace(/\.svg$/i, "").replace(/[.\s]+$/g, "").slice(0, 120);
    return { filename: `${title || `canvas-image-${node.id}`}.svg`, source };
}

export function downloadCanvasSvg(node: CanvasNodeData): boolean {
    const svg = getCanvasSvgExport(node);
    if (!svg) return false;
    saveAs(new Blob([svg.source], { type: "image/svg+xml;charset=utf-8" }), svg.filename);
    return true;
}

export async function createLogoAssetArchive(node: CanvasNodeData, loadImage: typeof getImageBlob = getImageBlob): Promise<Blob> {
    const editable = getCanvasSvgExport(node);
    const outline = node.metadata?.svgOutlineSource;
    const storageKey = node.metadata?.storageKey;
    if (!editable || !outline || !/^<svg(?:\s|>)/i.test(outline) || !/<\/svg>\s*$/i.test(outline)) throw new Error("可编辑或转曲 SVG 不可用");
    const preview = storageKey ? await loadImage(storageKey) : null;
    if (!preview || preview.type !== 'image/png') throw new Error("PNG 预览不可用，请刷新后重试");
    const typography = node.metadata?.logoTypography;
    const manifest = { version: 1, title: node.title || 'Logo', typography: typography || null,
        notes: ['SVG 可编辑版包含文字，目标设备未安装对应字体时可能发生替换。', 'SVG 转曲版将新增文字转换为路径。', 'PNG 保留画布预览的背景与尺寸，不保证背景透明。', '原图中已有文字保留在图形内。'],
        fontLicense: typography?.font === 'Noto Sans SC' ? 'SIL Open Font License 1.1；字体文件未包含在本资产包中。' : null };
    return createZip([{ name: 'logo-editable.svg', data: editable.source }, { name: 'logo-outlined.svg', data: outline }, { name: 'logo-preview.png', data: preview }, { name: 'asset-info.json', data: JSON.stringify(manifest, null, 2) }]);
}

export async function downloadLogoAssetArchive(node: CanvasNodeData) {
    const zip = await createLogoAssetArchive(node);
    const title = (node.title || 'logo').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/[.\s]+$/g, '').slice(0, 120) || 'logo';
    saveAs(zip, `${title}-assets.zip`);
}
