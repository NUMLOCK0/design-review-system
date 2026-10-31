/** Mirror the worker's supported image inputs while excluding analysis-only assets. */
export function isUsableGenerationReference(asset: { kind?: unknown; role?: unknown; mimeType?: unknown }): boolean {
  return ['image', 'reference', 'generated'].includes(String(asset.kind))
    && !['competitor', 'chat_screenshot'].includes(String(asset.role))
    && /^image\/(png|jpe?g|webp|gif)$/i.test(String(asset.mimeType || ''));
}

/** mysql2 returns JSON columns as native arrays; other callers may provide JSON text. */
export function readGenerationReferenceAssetIds(value: unknown): string[] {
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed.trim() || '[]'); }
    catch {
      throw Object.assign(new Error('生图任务的参考素材数据格式无效，请重新提交任务'), { code: 'IMAGE_STUDIO_REFERENCE_INVALID' });
    }
  }
  if (parsed == null) return [];
  if (!Array.isArray(parsed) || parsed.length > 12
    || parsed.some((id) => typeof id !== 'string' || !id.trim() || id.length > 64)) {
    throw Object.assign(new Error('生图任务的参考素材列表无效，请重新提交任务'), { code: 'IMAGE_STUDIO_REFERENCE_INVALID' });
  }
  return [...parsed];
}
