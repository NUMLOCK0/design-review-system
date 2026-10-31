// Use the PSD dependencies already installed for the original design-to-psd demo.
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const dependencyRoot = process.env.PSD_NODE_ROOT;
if (!dependencyRoot) throw new Error("未配置 PSD_NODE_ROOT。");
const dependency = createRequire(path.join(dependencyRoot, "package.json"));
const { PNG } = dependency("pngjs");
const { writePsdBuffer, readPsd } = dependency("ag-psd");
const root = path.resolve(process.argv[2]);
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
function readImage(file) {
  const png = PNG.sync.read(fs.readFileSync(path.join(root, file)));
  return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
}
const children = manifest.layers.map((spec) => {
  const layer = { name: spec.name, left: spec.left, top: spec.top, imageData: readImage(spec.file) };
  if (spec.text) {
    const text = spec.text;
    const style = { font: { name: text.font }, fontSize: text.fontSize,
      fillColor: { r: text.color[0], g: text.color[1], b: text.color[2] }, fillFlag: true };
    layer.text = {
      text: text.value, transform: [1, 0, 0, 1, text.x, text.baseline],
      shapeType: "point", orientation: "horizontal", antiAlias: "smooth",
      style, paragraphStyle: { justification: "left" },
    };
  }
  return layer;
});
const bytes = writePsdBuffer({ width: manifest.width, height: manifest.height,
  imageData: readImage("output.preview.png"), children }, { generateThumbnail: false });
fs.writeFileSync(path.join(root, "output.psd"), bytes);
const reread = readPsd(bytes, { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
if (reread.children.length !== children.length) throw new Error("PSD 图层数量回读不一致。");
for (let i = 0; i < children.length; i++) {
  if (children[i].text && reread.children[i].text?.text !== children[i].text.text)
    throw new Error("PSD 原生文字回读不一致。");
}
console.log(JSON.stringify({ layerCount: children.length, nativeTextCount: children.filter(x => x.text).length }));
