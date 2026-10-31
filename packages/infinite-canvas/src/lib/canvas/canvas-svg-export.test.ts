import assert from "node:assert/strict";
import test from "node:test";
import { createCanvasNodesArchive, createCanvasProjectsArchive } from "./canvas-export";
import { createLogoAssetArchive, getCanvasSvgExport } from "./canvas-svg-export";
import { readZip } from "../zip";
import { CanvasNodeType, type CanvasNodeData } from "../../types/canvas";
import type { CanvasProject } from "../../stores/canvas/use-canvas-store";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0 L100 100"/><text x="5" y="15">品牌</text></svg>';
const vector: CanvasNodeData = { id: "svg-1", type: CanvasNodeType.Image, title: "品牌/Logo.svg", position: { x: 0, y: 0 }, width: 100, height: 100,
    metadata: { artifactType: "generated-svg", svgSource: svg, content: "/api/upload/previews/example", storageKey: "image:oss:asset_example", mimeType: "image/png" } };

test("品牌资产包保留可编辑版、转曲版、预览和字体信息", async () => {
    const outline = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>';
    const node = { ...vector, metadata: { ...vector.metadata, svgOutlineSource: outline, logoTypography: { text: '品牌', font: 'Noto Sans SC', fontVersion: '5.3.1', weight: 400, color: '#000000', size: 32, spacing: 0 } } };
    const archive = await createLogoAssetArchive(node, async () => new Blob(['preview'], { type: 'image/png' }));
    const files = await readZip(archive);
    assert.deepEqual([...files.keys()].sort(), ['asset-info.json', 'logo-editable.svg', 'logo-outlined.svg', 'logo-preview.png']);
    assert.equal(await files.get('logo-editable.svg')?.text(), svg);
    assert.equal(await files.get('logo-outlined.svg')?.text(), outline);
    assert.equal(JSON.parse(await files.get('asset-info.json')!.text()).typography.text, '品牌');
    await assert.rejects(createLogoAssetArchive(node, async () => null), /PNG 预览不可用/);
});

test("PNG 预览的 SVG 节点导出原始矢量源码和安全文件名", () => {
    assert.deepEqual(getCanvasSvgExport(vector), { filename: "品牌_Logo.svg", source: svg });
    assert.equal(getCanvasSvgExport({ ...vector, metadata: { ...vector.metadata, svgSource: "not svg" } }), null);
});

test("批量导出优先保留 SVG 源码，重名作品各自保存", async () => {
    const zip = await createCanvasNodesArchive([vector, { ...vector, id: "svg-2" }]);
    const files = await readZip(zip);
    assert.deepEqual([...files.keys()].sort(), ["品牌_Logo-1.svg", "品牌_Logo.svg"]);
    assert.equal(await files.get("品牌_Logo.svg")?.text(), svg);
    assert.equal(await files.get("品牌_Logo-1.svg")?.text(), svg);
});

test("SVG 源码缺失时不会将 PNG 预览冒充矢量文件", async () => {
    const broken = { ...vector, metadata: { ...vector.metadata, svgSource: undefined } };
    await assert.rejects(createCanvasNodesArchive([broken]), /SVG 源码不可用/);
    await assert.rejects(createCanvasNodesArchive([{ ...broken, metadata: { ...broken.metadata, artifactType: "vectorized-svg" } }]), /SVG 源码不可用/);
});

test("旧版内联 SVG 也能原样导出，包括含中文的 base64 数据", async () => {
    for (const content of [`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`]) {
        const legacy = { ...vector, metadata: { artifactType: "generated-svg", content } };
        const files = await readZip(await createCanvasNodesArchive([legacy]));
        assert.equal(await files.get("品牌_Logo.svg")?.text(), svg);
    }
});

test("整个画布导出同时包含独立的 SVG 文件与项目数据", async () => {
    const project = { id: "project-1", nodes: [{ ...vector, metadata: { ...vector.metadata, storageKey: undefined } }] } as CanvasProject;
    const files = await readZip(await createCanvasProjectsArchive([project]));
    assert.ok(files.has("projects.json"));
    assert.equal(await files.get("projects/project-1/vectors/svg-1.svg")?.text(), svg);
});
