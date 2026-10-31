import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import * as fontkit from 'fontkit';

type FontSubset = { file: string; ranges: Array<[number, number]> };
let subsets: FontSubset[] | undefined;
const fontCache = new Map<string, any>();
const fontDirectory = dirname(require.resolve('@fontsource/noto-sans-sc'));
const invalid = (message: string) => Object.assign(new Error(message), { status: 400 });

function getSubsets() {
  if (subsets) return subsets;
  const css = readFileSync(join(fontDirectory, '400.css'), 'utf8');
  subsets = [...css.matchAll(/@font-face\s*\{([^}]+)\}/g)].flatMap((match) => {
    const file = /url\(\.\/files\/([^\)]+\.woff2)\)/.exec(match[1])?.[1];
    const range = /unicode-range:\s*([^;]+)/.exec(match[1])?.[1];
    if (!file || !range || !/^[\w.-]+$/.test(file)) return [];
    const ranges: Array<[number, number]> = range.split(',').map((part) => {
      const [start, end] = part.trim().replace(/^U\+/i, '').split('-');
      return [parseInt(start, 16), parseInt(end || start, 16)];
    });
    return [{ file, ranges }];
  });
  return subsets;
}

function fontForCharacter(character: string, weight: number) {
  const point = character.codePointAt(0)!;
  const subset = getSubsets().find((item) => item.ranges.some(([min, max]) => point >= min && point <= max));
  if (!subset) throw invalid(`当前字体不支持字符：${character}`);
  const file = subset.file.replace('-400-normal.woff2', `-${weight}-normal.woff2`);
  const cacheKey = file;
  let font = fontCache.get(cacheKey);
  if (!font) {
    font = fontkit.openSync(join(fontDirectory, 'files', file));
    fontCache.set(cacheKey, font);
  }
  if (!font.hasGlyphForCodePoint(point)) throw invalid(`当前字体不支持字符：${character}`);
  return { file, font };
}

function escapeText(value: string) { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
const number = (value: number) => Number(value.toFixed(6));

/** Composes text beneath the complete image; it never removes existing lettering. */
export function composeLogoTypography(input: { svg: string; width: number; height: number; text: string; weight: number; color: string; size: number; spacing: number }) {
  const text = input.text.normalize('NFC').trim();
  if (!text || [...text].length > 40 || /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]/u.test(text)) throw invalid('品牌名称须为 1 至 40 个可见字符');
  if (!/^#[0-9a-f]{6}$/i.test(input.color) || ![400, 700].includes(input.weight) || !Number.isFinite(input.size) || input.size < 24 || input.size > 180 || !Number.isFinite(input.spacing) || input.spacing < 0 || input.spacing > 20) throw invalid('文字样式参数无效');
  if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || input.width < 1 || input.height < 1 || input.width > 1024 || input.height > 1024) throw invalid('图片尺寸无效');
  if (!/^<svg\b/i.test(input.svg) || !/<\/svg>\s*$/i.test(input.svg) || /<!|<\s*(?:script|image|foreignObject)\b|\bon\w+\s*=|\b(?:href|src)\s*=/i.test(input.svg)) throw invalid('源矢量内容不受支持');
  const characters = [...text];
  const glyphs = characters.map((character) => ({ character, ...fontForCharacter(character, input.weight) }));
  const runs: Array<{ font: any; text: string; file: string }> = [];
  for (const item of glyphs) { const last = runs[runs.length - 1]; if (last?.file === item.file) last.text += item.character; else runs.push({ font: item.font, file: item.file, text: item.character }); }
  const shaped = runs.map((run) => ({ font: run.font, layout: run.font.layout(run.text) }));
  const units = shaped.reduce((sum, run) => sum + run.layout.positions.reduce((total: number, pos: any) => total + pos.xAdvance / run.font.unitsPerEm, 0), 0);
  const requestedWidth = units * input.size + Math.max(0, characters.length - 1) * input.spacing;
  const scale = Math.min(1, input.width * 0.9 / Math.max(1, requestedWidth));
  const size = input.size * scale; const spacing = input.spacing * scale;
  const width = units * size + Math.max(0, characters.length - 1) * spacing;
  const x = (input.width - width) / 2; const baseline = input.height + size * 1.25;
  const canvasHeight = Math.ceil(input.height + size * 1.65);
  let cursor = x; const paths: string[] = []; let glyphIndex = 0;
  for (const run of shaped) for (let i = 0; i < run.layout.glyphs.length; i++) {
    const glyph = run.layout.glyphs[i]; const position = run.layout.positions[i]; const factor = size / run.font.unitsPerEm;
    const d = glyph.path.toSVG();
    if (d) paths.push(`<path d="${d}" transform="translate(${number(cursor + position.xOffset * factor)} ${number(baseline - position.yOffset * factor)}) scale(${number(factor)} ${number(-factor)})"/>`);
    cursor += position.xAdvance * factor + (++glyphIndex < characters.length ? spacing : 0);
  }
  const root = `<svg xmlns="http://www.w3.org/2000/svg" width="${input.width}" height="${canvasHeight}" viewBox="0 0 ${input.width} ${canvasHeight}">`;
  const image = input.svg.replace(/^<svg\b/i, `<svg x="0" y="0"`);
  const editable = `${root}${image}<text x="${number(x)}" y="${number(baseline)}" font-family="Noto Sans SC, sans-serif" font-weight="${input.weight}" font-size="${number(size)}" letter-spacing="${number(spacing)}" fill="${input.color}">${escapeText(text)}</text></svg>`;
  const outlined = `${root}${image}<g fill="${input.color}" aria-label="${escapeText(text).replace(/"/g, '&quot;')}">${paths.join('')}</g></svg>`;
  return { editable, outlined, width: input.width, height: canvasHeight, font: 'Noto Sans SC', fontVersion: '5.3.1', text, size: number(size), weight: input.weight, color: input.color, spacing: number(spacing) };
}
