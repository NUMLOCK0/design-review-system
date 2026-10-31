export function isValidStudioMaterialType(asset: { kind: string; mimetype: string; size: number; ossOriginalKey?: string }, role: string) {
  if (role === 'report') return asset.kind === 'source-file' && asset.mimetype === 'application/pdf' && Boolean(asset.ossOriginalKey?.startsWith('private/image-studio/')) && asset.size > 0 && asset.size <= 25 * 1024 * 1024;
  return asset.kind === 'image';
}
export function hasPdfSignature(buffer: Buffer) {
  return buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'));
}
