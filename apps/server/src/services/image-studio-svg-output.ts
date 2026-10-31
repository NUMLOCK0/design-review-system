import sharp from 'sharp';
export async function validateStudioSvg(value: unknown) {
  if (!value || typeof value !== 'object' || typeof (value as any).svg !== 'string') throw new Error('未返回 SVG 源码');
  const svg = (value as any).svg.trim();
  if (Buffer.byteLength(svg, 'utf8') > 80_000 || !/^<svg\b/i.test(svg) || !/<\/svg>\s*$/i.test(svg) || /<!|&#|\bon\w+\s*=|\b(?:href|src)\s*=|\bstyle\s*=|url\(\s*[^#]/i.test(svg)) throw new Error('SVG 包含不支持或不安全的内容');
  const allowed = new Set(['svg', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'g', 'defs', 'lineargradient', 'radialgradient', 'stop', 'text', 'tspan', 'title', 'desc', 'clippath']);
  for (const match of svg.matchAll(/<\/?([\w:.-]+)\b/g)) if (!allowed.has(match[1].toLowerCase())) throw new Error('SVG 只能包含基础矢量元素');
  const meta = await sharp(Buffer.from(svg), { limitInputPixels: 16_000_000 }).metadata();
  if (!meta.width || !meta.height || meta.width * meta.height > 16_000_000) throw new Error('SVG 尺寸无效或过大');
  return { ...(value as Record<string, unknown>), svg, validation: { parsed: true, containsEditableText: /<text\b/i.test(svg), trademarkCheck: 'not_checked', fontLicenseCheck: 'not_checked' } };
}
