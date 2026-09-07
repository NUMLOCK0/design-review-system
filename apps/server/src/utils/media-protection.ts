import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

export const PRIVATE_UPLOADS_DIR = path.join(process.cwd(), 'private-uploads');
export const PUBLIC_PREVIEWS_DIR = path.join(process.cwd(), 'uploads', 'previews');

export type ProtectedAsset = {
  id: string;
  ownerId: string;
  kind: 'image' | 'source-file';
  filename: string;
  mimetype: string;
  size: number;
  localOriginalPath?: string;
  ossOriginalKey?: string;
  ossPreviewKey?: string;
};

export const protectedAssets = new Map<string, ProtectedAsset>();

export function createAssetId() {
  return `asset_${crypto.randomBytes(16).toString('hex')}`;
}

function escapeXml(value: string) {
  const entities: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' };
  return value.replace(/[<>&'\"]/g, (char) => entities[char] || char);
}

export async function createWatermarkedPreview(buffer: Buffer, text: string) {
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width || 1200;
  const height = metadata.height || 900;
  const fontSize = Math.max(22, Math.round(width / 28));
  const watermark = escapeXml(text);
  const svg = Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <pattern id="watermark" width="${fontSize * 12}" height="${fontSize * 6}" patternUnits="userSpaceOnUse" patternTransform="rotate(-24)">
          <text x="0" y="${fontSize}" fill="#ffffff" fill-opacity="0.42" font-size="${fontSize}" font-family="Arial, Microsoft YaHei, sans-serif" font-weight="700">${watermark}</text>
          <text x="0" y="${fontSize * 4}" fill="#111827" fill-opacity="0.22" font-size="${fontSize}" font-family="Arial, Microsoft YaHei, sans-serif" font-weight="700">${watermark}</text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#watermark)" />
    </svg>
  `);

  return sharp(buffer)
    .composite([{ input: svg, blend: 'over' }])
    .webp({ quality: 88 })
    .toBuffer();
}

export function ensureMediaDirectories() {
  fs.mkdirSync(PRIVATE_UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(PUBLIC_PREVIEWS_DIR, { recursive: true });
}
