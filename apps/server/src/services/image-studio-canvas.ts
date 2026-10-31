import { dbPool } from '../config/database.js';
import type { AuthUserPayload } from '../middleware/auth.middleware.js';

export type CanvasProjectSnapshot = { id: string; title: string; [key: string]: unknown };
export type CanvasLibraryAsset = { id: string; kind: 'text' | 'image' | 'video'; [key: string]: unknown };

const parse = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

function pool() {
  if (!dbPool) throw Object.assign(new Error('生图工作台需要可用的 MySQL 数据库'), { status: 503, code: 'IMAGE_STUDIO_DATABASE_UNAVAILABLE' });
  return dbPool;
}

function fail(message: string, status = 400, code = 'IMAGE_STUDIO_CANVAS_INVALID'): never {
  throw Object.assign(new Error(message), { status, code });
}

function validateId(id: string) {
  if (!/^[\w-]{1,64}$/.test(id)) fail('画布资源 ID 无效');
}

function validateJsonSize(value: unknown, label: string, maximumBytes: number) {
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded, 'utf8') > maximumBytes) fail(`${label}数据过大，请先压缩或移除超大文本`, 413, 'IMAGE_STUDIO_CANVAS_PAYLOAD_TOO_LARGE');
  return encoded;
}

function collectStoredMediaIds(value: unknown, result: Array<{ kind: 'image' | 'video'; id: string }> = []) {
  if (!value || typeof value !== 'object') return result;
  if (!Array.isArray(value) && 'storageKey' in value && typeof value.storageKey === 'string') {
    const storageKey = value.storageKey;
    const match = /^(image|video):oss:(asset_[a-f0-9]{32})$/i.exec(storageKey);
    if (match) result.push({ kind: match[1].toLowerCase() as 'image' | 'video', id: match[2] });
    else if (storageKey.startsWith('image:') || storageKey.startsWith('video:')) fail('画布中的图片或视频尚未保存到 OSS，请重新上传后再保存', 409, 'IMAGE_STUDIO_CANVAS_MEDIA_NOT_IN_OSS');
  }
  if (Array.isArray(value)) value.forEach((item) => collectStoredMediaIds(item, result));
  else Object.values(value).forEach((item) => collectStoredMediaIds(item, result));
  return result;
}

function collectStudioAssetIds(value: unknown, result: string[] = []) {
  if (!value || typeof value !== 'object') return result;
  if (!Array.isArray(value) && 'storageKey' in value && typeof value.storageKey === 'string') {
    const match = /^studio-image-asset:([\w-]{1,64})$/.exec(value.storageKey);
    if (match) result.push(match[1]);
  }
  if (Array.isArray(value)) value.forEach((item) => collectStudioAssetIds(item, result));
  else Object.values(value).forEach((item) => collectStudioAssetIds(item, result));
  return result;
}

function assertNoInlineMedia(value: unknown) {
  if (typeof value === 'string') {
    if (value.startsWith('blob:') || value.startsWith('data:image/') || value.startsWith('data:video/')) fail('画布中仍包含浏览器临时图片或视频，请重新上传后再保存', 409, 'IMAGE_STUDIO_CANVAS_MEDIA_NOT_IN_OSS');
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) value.forEach(assertNoInlineMedia);
  else Object.values(value).forEach(assertNoInlineMedia);
}

export function assertRemoteMediaUsesOss(value: unknown, inheritedKind?: 'image' | 'video', fieldName?: string) {
  if (typeof value === 'string') {
    if (inheritedKind && (fieldName === 'content' || fieldName === 'dataUrl' || fieldName === 'url' || fieldName === 'references')
      && (/^https?:\/\//i.test(value) || value.startsWith('/api/upload/'))) {
      fail('图片和视频必须先上传到工作台 OSS，再保存画布', 409, 'IMAGE_STUDIO_CANVAS_MEDIA_NOT_IN_OSS');
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item) => assertRemoteMediaUsesOss(item, inheritedKind, fieldName));
    return;
  }

  const record = value as Record<string, unknown>;
  const mimeType = typeof record.mimeType === 'string' ? record.mimeType : '';
  const kind = record.kind === 'image' || record.type === 'image' || mimeType.startsWith('image/') ? 'image'
    : record.kind === 'video' || record.type === 'video' || mimeType.startsWith('video/') ? 'video' : inheritedKind;
  const storageKey = typeof record.storageKey === 'string' ? record.storageKey : '';
  const hasCanonicalKey = kind && new RegExp(`^${kind}:oss:asset_[a-f0-9]{32}$`, 'i').test(storageKey);
  for (const field of ['content', 'dataUrl', 'url']) {
    const candidate = record[field];
    if (kind && typeof candidate === 'string' && (/^https?:\/\//i.test(candidate) || candidate.startsWith('/api/upload/')) && !hasCanonicalKey) {
      fail('图片和视频必须先上传到工作台 OSS，再保存画布', 409, 'IMAGE_STUDIO_CANVAS_MEDIA_NOT_IN_OSS');
    }
    if (hasCanonicalKey && typeof candidate === 'string' && (/^https?:\/\//i.test(candidate) || candidate.startsWith('/api/upload/'))) {
      const id = storageKey.split(':')[2];
      const expected = kind === 'image' ? `/api/upload/previews/${id}` : `/api/upload/videos/${id}/stream`;
      if (candidate !== expected) fail('画布素材地址与 OSS 资源不匹配，请重新上传后再保存', 409, 'IMAGE_STUDIO_CANVAS_MEDIA_NOT_IN_OSS');
    }
  }
  Object.entries(record).forEach(([field, item]) => {
    // These fields were validated against this record's canonical key above.
    // Descending into them as unkeyed URLs would reject valid OSS-backed media.
    if (hasCanonicalKey && ['content', 'dataUrl', 'url'].includes(field) && typeof item === 'string') return;
    assertRemoteMediaUsesOss(item, kind, field);
  });
}

async function assertOwnedOssMedia(userId: string, mediaIds: Array<{ id: string; kind: 'image' | 'video' }>) {
  if (!mediaIds.length) return;
  const unique = [...new Map(mediaIds.map((item) => [item.id, item])).values()];
  const [rows]: any = await pool().query(`SELECT id,owner_id,mimetype,oss_original_key FROM media_assets WHERE id IN (${unique.map(() => '?').join(',')})`, unique.map((item) => item.id));
  const found = new Map((rows as any[]).map((row) => [String(row.id), row]));
  for (const media of unique) {
    const row: any = found.get(media.id);
    if (!row || String(row.owner_id) !== userId || !row.oss_original_key?.startsWith('private/canvas-workspace/')) fail('图片或视频 OSS 资源不存在或无权访问', 403, 'IMAGE_STUDIO_CANVAS_MEDIA_FORBIDDEN');
    if (media.kind === 'image' && !String(row.mimetype).startsWith('image/')) fail('画布图片资源类型不匹配');
    if (media.kind === 'video' && !String(row.mimetype).startsWith('video/')) fail('画布视频资源类型不匹配');
  }
}

async function assertOwnedStudioImages(userId: string, assetIds: string[]) {
  const unique = [...new Set(assetIds)];
  if (!unique.length) return;
  const [rows]: any = await pool().query(`SELECT id FROM image_studio_assets WHERE id IN (${unique.map(() => '?').join(',')})
    AND owner_id=? AND mime_type LIKE 'image/%' AND deleted_at IS NULL`, [...unique, userId]);
  if (rows.length !== unique.length) fail('生图工作台图片不存在或无权访问', 403, 'IMAGE_STUDIO_CANVAS_MEDIA_FORBIDDEN');
}

export async function listCanvasProjects(user: AuthUserPayload) {
  const [rows]: any = await pool().query(`SELECT id,title,project_json,version,created_at,updated_at FROM image_studio_canvas_projects
    WHERE owner_id=? AND deleted_at IS NULL ORDER BY updated_at DESC,id DESC`, [user.id]);
  return (rows as any[]).map((row) => ({
    project: parse<CanvasProjectSnapshot>(row.project_json, { id: String(row.id), title: String(row.title) }),
    version: Number(row.version),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }));
}

export async function createCanvasProject(user: AuthUserPayload, project: CanvasProjectSnapshot) {
  validateId(project.id);
  const encoded = validateJsonSize(project, '画布项目', 8 * 1024 * 1024);
  assertNoInlineMedia(project);
  assertRemoteMediaUsesOss(project);
  await assertOwnedOssMedia(user.id, collectStoredMediaIds(project));
  await assertOwnedStudioImages(user.id, collectStudioAssetIds(project));
  const database = pool();
  const [existing]: any = await database.query('SELECT owner_id,version,created_at,updated_at,deleted_at FROM image_studio_canvas_projects WHERE id=? LIMIT 1', [project.id]);
  if (existing[0]) {
    if (String(existing[0].owner_id) !== user.id) fail('画布项目 ID 已被占用', 409, 'IMAGE_STUDIO_CANVAS_PROJECT_CONFLICT');
    if (!existing[0].deleted_at) return (await listCanvasProjects(user)).find((item) => item.project.id === project.id) || null;
    const timestamp = new Date();
    const version = Number(existing[0].version) + 1;
    await database.query(`UPDATE image_studio_canvas_projects SET title=?,project_json=?,version=?,updated_at=?,deleted_at=NULL
      WHERE id=? AND owner_id=? AND deleted_at IS NOT NULL`, [project.title.slice(0, 160), encoded, version, timestamp, project.id, user.id]);
    return { project, version, createdAt: new Date(existing[0].created_at).toISOString(), updatedAt: timestamp.toISOString() };
  }
  const timestamp = new Date();
  try {
    await database.query(`INSERT INTO image_studio_canvas_projects (id,owner_id,title,project_json,version,created_at,updated_at)
      VALUES (?,?,?,?,1,?,?)`, [project.id, user.id, project.title.slice(0, 160), encoded, timestamp, timestamp]);
  } catch (error: any) {
    if (error?.code !== 'ER_DUP_ENTRY') throw error;
    const [rows]: any = await database.query('SELECT owner_id FROM image_studio_canvas_projects WHERE id=? LIMIT 1', [project.id]);
    if (String(rows[0]?.owner_id) !== user.id) fail('画布项目 ID 已被占用', 409, 'IMAGE_STUDIO_CANVAS_PROJECT_CONFLICT');
  }
  return { project, version: 1, createdAt: timestamp.toISOString(), updatedAt: timestamp.toISOString() };
}

export async function updateCanvasProject(user: AuthUserPayload, projectId: string, project: CanvasProjectSnapshot, version: number) {
  validateId(projectId);
  if (project.id !== projectId) fail('画布项目 ID 与请求路径不一致');
  const encoded = validateJsonSize(project, '画布项目', 8 * 1024 * 1024);
  assertNoInlineMedia(project);
  assertRemoteMediaUsesOss(project);
  await assertOwnedOssMedia(user.id, collectStoredMediaIds(project));
  await assertOwnedStudioImages(user.id, collectStudioAssetIds(project));
  const timestamp = new Date();
  const [result]: any = await pool().query(`UPDATE image_studio_canvas_projects SET title=?,project_json=?,version=version+1,updated_at=?
    WHERE id=? AND owner_id=? AND version=? AND deleted_at IS NULL`, [project.title.slice(0, 160), encoded, timestamp, projectId, user.id, version]);
  if (!result.affectedRows) {
    const [rows]: any = await pool().query('SELECT version FROM image_studio_canvas_projects WHERE id=? AND owner_id=? AND deleted_at IS NULL LIMIT 1', [projectId, user.id]);
    if (!rows[0]) fail('画布项目不存在或无权访问', 404, 'IMAGE_STUDIO_CANVAS_PROJECT_NOT_FOUND');
    fail('画布项目已在其他页面更新，请重新同步后再保存', 409, 'IMAGE_STUDIO_CANVAS_VERSION_CONFLICT');
  }
  return { project, version: version + 1, updatedAt: timestamp.toISOString() };
}

export async function deleteCanvasProject(user: AuthUserPayload, projectId: string) {
  validateId(projectId);
  const timestamp = new Date();
  const [result]: any = await pool().query(`UPDATE image_studio_canvas_projects SET deleted_at=?,updated_at=?,version=version+1
    WHERE id=? AND owner_id=? AND deleted_at IS NULL`, [timestamp, timestamp, projectId, user.id]);
  if (!result.affectedRows) fail('画布项目不存在或无权访问', 404, 'IMAGE_STUDIO_CANVAS_PROJECT_NOT_FOUND');
}

export async function listCanvasAssets(user: AuthUserPayload) {
  const [rows]: any = await pool().query(`SELECT id,asset_json,version,created_at,updated_at FROM image_studio_canvas_assets
    WHERE owner_id=? AND deleted_at IS NULL ORDER BY updated_at DESC,id`, [user.id]);
  return (rows as any[]).map((row) => ({ asset: parse<CanvasLibraryAsset>(row.asset_json, { id: String(row.id), kind: 'text' }), version: Number(row.version),
    createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() }));
}

export async function saveCanvasAssets(user: AuthUserPayload, assets: CanvasLibraryAsset[], deletedIds: string[] = []) {
  if (assets.length > 500 || deletedIds.length > 500) fail('一次最多同步 500 个素材');
  const mediaAssets = new Map<string, { id: string; kind: 'image' | 'video' }>();
  for (const asset of assets) {
    validateId(asset.id);
    if (!['text', 'image', 'video'].includes(asset.kind)) fail('素材类型无效');
    validateJsonSize(asset, '素材', 2 * 1024 * 1024);
    assertNoInlineMedia(asset);
    assertRemoteMediaUsesOss(asset);
    if (asset.kind === 'image' || asset.kind === 'video') {
      const ids = collectStoredMediaIds(asset);
      const matching = ids.find((item) => item.kind === asset.kind);
      if (!matching) fail('图片或视频素材必须先上传到 OSS', 409, 'IMAGE_STUDIO_CANVAS_MEDIA_NOT_IN_OSS');
      mediaAssets.set(matching.id, matching);
    }
  }
  await assertOwnedOssMedia(user.id, [...mediaAssets.values()]);

  const database = pool();
  const connection = await database.getConnection();
  const timestamp = new Date();
  try {
    await connection.beginTransaction();
    for (const asset of assets) {
      const mediaIds = collectStoredMediaIds(asset);
      const mediaAssetId = mediaIds.find((item) => item.kind === asset.kind)?.id || null;
      const encoded = JSON.stringify(asset);
      const [existing]: any = await connection.query('SELECT owner_id FROM image_studio_canvas_assets WHERE id=? FOR UPDATE', [asset.id]);
      if (existing[0] && String(existing[0].owner_id) !== user.id) fail('素材 ID 已被占用', 409, 'IMAGE_STUDIO_CANVAS_ASSET_CONFLICT');
      await connection.query(`INSERT INTO image_studio_canvas_assets (id,owner_id,media_asset_id,kind,asset_json,version,created_at,updated_at)
        VALUES (?,?,?,?,?,1,?,?) ON DUPLICATE KEY UPDATE media_asset_id=VALUES(media_asset_id),kind=VALUES(kind),asset_json=VALUES(asset_json),version=version+1,updated_at=VALUES(updated_at),deleted_at=NULL`,
      [asset.id, user.id, mediaAssetId, asset.kind, encoded, timestamp, timestamp]);
    }
    if (deletedIds.length) {
      deletedIds.forEach(validateId);
      await connection.query(`UPDATE image_studio_canvas_assets SET deleted_at=?,updated_at=?,version=version+1
        WHERE owner_id=? AND id IN (${deletedIds.map(() => '?').join(',')}) AND deleted_at IS NULL`, [timestamp, timestamp, user.id, ...deletedIds]);
    }
    await connection.commit();
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
  return { saved: assets.length, deleted: deletedIds.length, updatedAt: timestamp.toISOString() };
}
