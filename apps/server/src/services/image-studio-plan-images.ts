import sharp from 'sharp';
import { getObjectFromOss } from '../config/oss-client.js';
import { listImageStudioAssets, loadProjectAssets } from './image-studio.js';
import type { AuthUserPayload } from '../middleware/auth.middleware.js';

const invalid = (message: string, code = 'IMAGE_STUDIO_ASSET_INVALID'): never => {
  throw Object.assign(new Error(message), { status: 400, code });
};

// Resolve only owned project assets, never client-provided URLs or preview URLs.
export async function readDesignPlanProductImages(projectId: string, user: AuthUserPayload, requestedIds?: string[], loaders = {
  list: listImageStudioAssets, assets: loadProjectAssets, object: getObjectFromOss,
}) {
  const ids = [...new Set<string>(requestedIds ?? (await loaders.list(projectId, user))
    .filter((asset: any) => asset.role === 'product' && asset.kind === 'image').map((asset: any) => String(asset.id)))];
  if (ids.length > 12) invalid('设计方案最多使用 12 张商品图，请减少商品图后重试', 'IMAGE_STUDIO_REFERENCE_LIMIT');
  if (!ids.length) return [];
  const rows = await loaders.assets(projectId, user.id, ids);
  if (rows.length !== ids.length || rows.some((row: any) => row.role !== 'product' || row.kind !== 'image')) invalid('商品图不存在、已删除或类型不正确');
  const images: Array<{ id: string; filename: string; mediaType: string; data: string }> = [];
  let sourceBytes = 0;
  let preparedBytes = 0;
  for (const id of ids) {
    const row = rows.find((asset: any) => String(asset.id) === id);
    if (!row) invalid('商品图不存在或无权访问');
    const object = await loaders.object(String(row.object_key));
    const original = Buffer.from(object.content as Buffer);
    sourceBytes += original.length;
    if (sourceBytes > 60 * 1024 * 1024) invalid('商品图总大小超过 60 MB，请压缩后重试', 'IMAGE_STUDIO_REFERENCE_SIZE_LIMIT');
    const image = sharp(original, { limitInputPixels: 100_000_000, failOn: 'error' }).rotate();
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || !['jpeg', 'png', 'webp', 'gif'].includes(String(metadata.format))) invalid('商品图不是有效的图片');
    // Planning only needs visual recognition. Keep the multimodal request compact so
    // a dozen high-resolution references cannot turn the synchronous plan call into a timeout.
    const resized = image.resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true });
    const buffer = await resized.flatten({ background: '#ffffff' }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
    preparedBytes += buffer.length;
    if (buffer.length > 3 * 1024 * 1024 || preparedBytes > 12 * 1024 * 1024) invalid('参考图片处理后仍过大，请减少图片数量或压缩图片后重试', 'IMAGE_STUDIO_REFERENCE_SIZE_LIMIT');
    images.push({ id, filename: String(row.filename), mediaType: 'image/jpeg', data: buffer.toString('base64') });
  }
  return images;
}

export function buildDesignPlanMessages(prompt: string, images: Array<{ mediaType: string; data: string }>) {
  return images.length ? [{ role: 'user' as const, content: [
    { type: 'text' as const, text: prompt },
    ...images.map((image) => ({ type: 'image' as const, image: `data:${image.mediaType};base64,${image.data}`, mimeType: image.mediaType })),
  ] }] : prompt;
}
