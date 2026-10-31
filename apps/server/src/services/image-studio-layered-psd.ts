import sharp from 'sharp';
import { readPsd, writePsdBuffer, type Layer } from 'ag-psd';
import { z } from 'zod';

const position = { name: z.string().min(1).max(100), left: z.number().int().min(0).max(4095), top: z.number().int().min(0).max(4095) };
export const layeredPsdSchema = z.object({ width: z.number().int().min(1).max(4096), height: z.number().int().min(1).max(4096),
  layers: z.array(z.discriminatedUnion('kind', [
    z.object({ ...position, kind: z.literal('image'), assetId: z.string().min(1).max(64), width: z.number().int().min(1).max(4096), height: z.number().int().min(1).max(4096) }).strict(),
    z.object({ ...position, kind: z.literal('text'), text: z.string().min(1).max(500), font: z.enum(['Arial', 'Microsoft YaHei', 'Noto Sans CJK SC']).default('Arial'), fontSize: z.number().int().min(8).max(300), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).strict(),
  ])).min(1).max(16),
}).strict().superRefine((spec, ctx) => {
  if (spec.width * spec.height > 8_388_608) ctx.addIssue({ code: 'custom', message: 'PSD 画布不超过 8 百万像素' });
  for (const layer of spec.layers) if (layer.left >= spec.width || layer.top >= spec.height || (layer.kind === 'image' && (layer.left + layer.width > spec.width || layer.top + layer.height > spec.height))) ctx.addIssue({ code: 'custom', message: '图层超出画布范围' });
});
const escapeXml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!));

/** layers are supplied bottom-to-top. No image segmentation is implied. */
export async function composeLayeredPsd(raw: z.infer<typeof layeredPsdSchema>, readAsset: (id: string) => Promise<Buffer>) {
  const spec = layeredPsdSchema.parse(raw); const children: Layer[] = []; const composites: sharp.OverlayOptions[] = [];
  let decodedPixels = 0;
  for (const layer of spec.layers) {
    let png: Buffer; let width: number; let height: number;
    if (layer.kind === 'image') {
      const input = await readAsset(layer.assetId);
      if (input.length > 20 * 1024 * 1024) throw new Error('单个图层素材超过 20 MB');
      width = layer.width; height = layer.height;
      png = await sharp(input, { limitInputPixels: 40_000_000 }).rotate().resize(width, height, { fit: 'contain', background: '#00000000' }).png().toBuffer();
    } else {
      width = spec.width - layer.left; height = spec.height - layer.top;
      const text = layer.text.split('\n').map((line, i) => `<tspan x="0" y="${layer.fontSize + i * layer.fontSize * 1.3}">${escapeXml(line)}</tspan>`).join('');
      png = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text font-family="${layer.font}" font-size="${layer.fontSize}" fill="${layer.color}">${text}</text></svg>`)).png().toBuffer();
    }
    decodedPixels += width * height;
    if (decodedPixels > 32_000_000) throw new Error('PSD 图层解码像素过多，请减少图层或分辨率');
    const pixel = await sharp(png).ensureAlpha().raw().toBuffer();
    const child: Layer = { name: layer.name, left: layer.left, top: layer.top, imageData: { width, height, data: new Uint8ClampedArray(pixel) } };
    if (layer.kind === 'text') child.text = { text: layer.text, transform: [1, 0, 0, 1, layer.left, layer.top + layer.fontSize], style: {
      font: { name: layer.font }, fontSize: layer.fontSize, fillColor: { r: parseInt(layer.color.slice(1, 3), 16), g: parseInt(layer.color.slice(3, 5), 16), b: parseInt(layer.color.slice(5, 7), 16) },
    } };
    children.unshift(child); composites.push({ input: png, left: layer.left, top: layer.top });
  }
  const composite = await sharp({ create: { width: spec.width, height: spec.height, channels: 4, background: '#00000000' } }).composite(composites).raw().toBuffer();
  const buffer = writePsdBuffer({ width: spec.width, height: spec.height, children, imageData: { width: spec.width, height: spec.height, data: new Uint8ClampedArray(composite) } }, { generateThumbnail: false });
  const checked = readPsd(buffer, { skipLayerImageData: true, skipCompositeImageData: true, skipThumbnail: true });
  if (checked.width !== spec.width || checked.height !== spec.height || checked.children?.length !== spec.layers.length) throw new Error('PSD 结构校验失败');
  return buffer;
}
