import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  createOssObjectKey,
  getObjectFromOss,
  getSignedOssUrl,
  getSignedOssUploadUrl,
  getSignedOssProcessUrl,
  headOssObject,
  isOssConfigured,
  uploadBufferToOss
} from '../config/oss-client.js';
import {
  createAssetId,
  createWatermarkedPreview,
  ensureMediaDirectories,
  PRIVATE_UPLOADS_DIR,
  protectedAssets,
  PUBLIC_PREVIEWS_DIR
} from '../utils/media-protection.js';
import { findMediaAsset, findPendingOssUpload, persistMediaAsset, persistPendingOssUpload, removePendingOssUpload } from '../config/persistence.js';

export const uploadRouter = Router();

const memoryStorage = multer.memoryStorage();
const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

const allowedFolders = new Set(['design-images', 'reference-samples', 'annotations', 'source-files', 'order-materials', 'order-reference-images', 'customer-service-qrcodes', 'designer-portfolio']);
const imageMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const imageExtensions = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const sourceExtensions = new Set(['.zip', '.rar', '.7z', '.psd', '.ai', '.eps', '.c4d', '.blend', '.pdf']);
const sourceMimeTypes = new Set(['application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed', 'application/octet-stream', 'application/pdf', 'image/vnd.adobe.photoshop']);
const imageOnlyFolders = new Set(['design-images', 'reference-samples', 'annotations', 'order-reference-images', 'customer-service-qrcodes', 'designer-portfolio']);
const maxUploadSize = 100 * 1024 * 1024;

type PendingOssUpload = {
  ownerId: string;
  objectKey: string;
  filename: string;
  mimetype: string;
  size: number;
  expiresAt: number;
};

const pendingOssUploads = new Map<string, PendingOssUpload>();

ensureMediaDirectories();

function isImageUpload(mimetype: string) {
  return imageMimeTypes.has(mimetype);
}

function shouldWatermark(value: string) {
  return value === 'design-images' || value.split('/').includes('design-images');
}

function isAllowedUpload(folder: string, filename: string, mimetype: string) {
  const extension = path.extname(filename).toLowerCase();
  if (imageOnlyFolders.has(folder)) return imageMimeTypes.has(mimetype) && imageExtensions.has(extension);
  if (folder === 'order-materials' && imageMimeTypes.has(mimetype) && imageExtensions.has(extension)) return true;
  return sourceMimeTypes.has(mimetype) && sourceExtensions.has(extension);
}

function protectedAssetUrl(assetId: string) {
  return `/api/upload/assets/${assetId}`;
}

function imageAssetUrl(assetId: string) {
  return `/api/upload/previews/${assetId}`;
}

function createOssWatermarkProcess() {
  const text = Buffer.from('COZI REVIEW · 仅限审核', 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `image/watermark,text_${text},type_d3F5LXplbmhlaQ,color_111827,size_32,rotate_24,fill_1,padx_80,pady_60,t_58`;
}

/**
 * 图片上传安全边界：
 * 1. 原图只落私有目录/私有 OSS；
 * 2. OSS 模式由 OSS 图片处理服务在查看时动态生成带水印预览，业务数据只保存稳定资源地址；
 *    服务端不代理 OSS 图片内容，本地模式使用 Sharp 兜底；
 * 3. 源文件只能通过登录后的受控下载接口读取；
 * 4. 不信任客户端传入的任意存储目录。
 */
uploadRouter.post('/', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ code: 400, success: false, message: '请选择要上传的文件' });
    }

    const requestedFolder = String(req.body.folder || 'design-images');
    if (!allowedFolders.has(requestedFolder)) {
      return res.status(400).json({ code: 400, success: false, message: '不支持的文件目录' });
    }
    if (!isAllowedUpload(requestedFolder, req.file.originalname, req.file.mimetype)) {
      return res.status(400).json({ code: 400, success: false, message: '当前目录不支持该文件类型' });
    }

    const folder = requestedFolder;
    const assetId = createAssetId();
    const originalName = req.file.originalname;
    const isImage = isImageUpload(req.file.mimetype);
    // OSS 模式不再经过服务器 Sharp，只有本地存储兜底时才生成预览 Buffer。
    const previewBuffer = !isOssConfigured && isImage && shouldWatermark(requestedFolder)
      ? await createWatermarkedPreview(req.file.buffer, 'COZI REVIEW · 仅限审核')
      : null;
    let localOriginalPath: string | undefined;
    let ossOriginalKey: string | undefined;
    let storageType: 'aliyun-oss' | 'local-disk';
    let ossPreviewKey: string | undefined;

    if (isOssConfigured) {
      const originalResult = await uploadBufferToOss(req.file.buffer, originalName, `private/${folder}`);
      ossOriginalKey = originalResult.name;
      storageType = 'aliyun-oss';

    } else {
      const privateFolder = path.join(PRIVATE_UPLOADS_DIR, folder);
      fs.mkdirSync(privateFolder, { recursive: true });
      const extension = path.extname(originalName).toLowerCase() || '.bin';
      localOriginalPath = path.join(privateFolder, `${assetId}${extension}`);
      fs.writeFileSync(localOriginalPath, req.file.buffer);
      storageType = 'local-disk';

      if (previewBuffer) {
        fs.writeFileSync(path.join(PUBLIC_PREVIEWS_DIR, `${assetId}.webp`), previewBuffer);
      }
    }

    const asset = {
      id: assetId,
      ownerId: req.user!.id,
      kind: isImage ? 'image' : 'source-file',
      filename: originalName,
      mimetype: req.file.mimetype,
      size: req.file.size,
      localOriginalPath,
      ossOriginalKey,
      ossPreviewKey
    } as const;
    protectedAssets.set(assetId, asset);
    await persistMediaAsset(asset);

    return res.json({
      code: 200,
      success: true,
      message: isImage && shouldWatermark(folder) ? '图片已生成带水印预览并安全保存' : '文件已安全保存',
      data: {
        // 只返回稳定的资源地址，禁止把 OSS 临时签名参数写入业务数据。
        url: isImage ? imageAssetUrl(assetId) : protectedAssetUrl(assetId),
        assetId,
        storageType,
        watermarked: isImage && shouldWatermark(folder),
        filename: originalName,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (err) {
    next(err);
  }
});

// 为浏览器直传 OSS 生成一次性上传凭证，后端不接收文件内容。
uploadRouter.post('/presign', authenticate, async (req, res, next) => {
  try {
    if (!isOssConfigured) {
      return res.status(409).json({ code: 409, success: false, message: '当前未配置 OSS 直传，请使用本地上传模式' });
    }

    const filename = String(req.body.filename || '').trim();
    const folder = String(req.body.folder || 'design-images');
    const mimetype = String(req.body.contentType || 'application/octet-stream');
    const size = Number(req.body.size);
    if (!filename || !Number.isFinite(size) || size <= 0 || size > maxUploadSize) {
      return res.status(400).json({ code: 400, success: false, message: '文件名或文件大小无效，单文件不能超过 100MB' });
    }
    if (!allowedFolders.has(folder)) {
      return res.status(400).json({ code: 400, success: false, message: '不支持的文件目录' });
    }
    if (!isAllowedUpload(folder, filename, mimetype)) {
      return res.status(400).json({ code: 400, success: false, message: '当前目录不支持该文件类型' });
    }

    for (const [pendingAssetId, pendingUpload] of pendingOssUploads) {
      if (pendingUpload.expiresAt < Date.now()) pendingOssUploads.delete(pendingAssetId);
    }
    const assetId = createAssetId();
    const objectKey = createOssObjectKey(filename, `private/${folder}`, assetId);
    const expiresIn = 300;
    const uploadUrl = getSignedOssUploadUrl(objectKey, mimetype, expiresIn);
    const pendingUpload = { ownerId: req.user!.id, objectKey, filename, mimetype, size, expiresAt: Date.now() + expiresIn * 1000 };
    await persistPendingOssUpload({ assetId, ...pendingUpload });
    pendingOssUploads.set(assetId, pendingUpload);

    return res.json({ code: 200, success: true, data: { assetId, objectKey, uploadUrl, contentType: mimetype, expiresIn } });
  } catch (err) {
    next(err);
  }
});

// OSS 直传成功后只登记元数据，后端不再接收或转发文件二进制。
uploadRouter.post('/complete', authenticate, async (req, res, next) => {
  try {
    const assetId = String(req.body.assetId || '');
    const pending = pendingOssUploads.get(assetId) || await findPendingOssUpload(assetId);
    if (!pending || pending.ownerId !== req.user!.id) {
      return res.status(400).json({ code: 400, success: false, message: '上传任务不存在或无权确认' });
    }
    if (pending.expiresAt < Date.now()) {
      pendingOssUploads.delete(assetId);
      await removePendingOssUpload(assetId);
      return res.status(410).json({ code: 410, success: false, message: '上传凭证已过期，请重新上传' });
    }

    const object = await headOssObject(pending.objectKey);
    // ali-oss 当前版本的 head 结果可能把 meta 返回为 null，实际响应头在 res.headers 中。
    const objectHeaders = {
      ...((object.res?.headers || {}) as Record<string, string | number>),
      ...((object.meta || {}) as Record<string, string | number>)
    };
    const actualSize = Number(objectHeaders['content-length'] ?? objectHeaders['Content-Length']);
    if (!Number.isFinite(actualSize) || actualSize !== pending.size) {
      return res.status(400).json({ code: 400, success: false, message: 'OSS 文件校验失败，请重新上传' });
    }

    const isImage = isImageUpload(pending.mimetype);
    const asset = {
      id: assetId,
      ownerId: pending.ownerId,
      kind: isImage ? 'image' : 'source-file',
      filename: pending.filename,
      mimetype: pending.mimetype,
      size: pending.size,
      ossOriginalKey: pending.objectKey
    } as const;
    protectedAssets.set(assetId, asset);
    await persistMediaAsset(asset);
    pendingOssUploads.delete(assetId);
    await removePendingOssUpload(assetId);

    return res.json({
      code: 200,
      success: true,
      message: isImage && shouldWatermark(pending.objectKey) ? '图片已直传 OSS 并生成带水印预览' : '文件已直传 OSS',
      data: {
        // 只返回稳定的资源地址，查看时由受保护的预览接口生成临时 OSS 地址。
        url: isImage ? imageAssetUrl(assetId) : protectedAssetUrl(assetId),
        assetId,
        storageType: 'aliyun-oss',
        watermarked: isImage && shouldWatermark(pending.objectKey),
        filename: pending.filename,
        size: pending.size,
        mimetype: pending.mimetype
      }
    });
  } catch (err) {
    next(err);
  }
});

// 图片查看地址保持稳定，只有实际查看时才校验登录态并生成临时 OSS 地址。
uploadRouter.get('/previews/:assetId', authenticate, async (req, res, next) => {
  try {
    const assetId = String(req.params.assetId);
    const asset = protectedAssets.get(assetId) || await findMediaAsset(assetId);
    if (!asset || asset.kind !== 'image') {
      return res.status(404).json({ code: 404, success: false, message: '预览不存在或已失效' });
    }
    protectedAssets.set(asset.id, asset);
    res.setHeader('Cache-Control', 'private, no-store');
    if (asset.ossOriginalKey) {
      return res.redirect(302, shouldWatermark(asset.ossOriginalKey) ? getSignedOssProcessUrl(asset.ossOriginalKey, createOssWatermarkProcess(), 300) : getSignedOssUrl(asset.ossOriginalKey, 300));
    }
    if (asset.localOriginalPath) {
      const localPreviewPath = path.join(PUBLIC_PREVIEWS_DIR, `${assetId}.webp`);
      const previewPath = fs.existsSync(localPreviewPath) ? localPreviewPath : asset.localOriginalPath;
      res.setHeader('Content-Type', fs.existsSync(localPreviewPath) ? 'image/webp' : asset.mimetype);
      res.setHeader('Content-Disposition', 'inline');
      return res.sendFile(previewPath);
    }
    return res.status(404).json({ code: 404, success: false, message: '预览存储记录不完整' });
  } catch (err) {
    next(err);
  }
});

// 原图/源文件不提供公开静态地址，只允许文件拥有者或审核/管理员下载。
uploadRouter.get('/assets/:assetId', authenticate, async (req, res, next) => {
  try {
    const assetId = String(req.params.assetId);
    const asset = protectedAssets.get(assetId) || await findMediaAsset(assetId);
    if (!asset) {
      return res.status(404).json({ code: 404, success: false, message: '文件不存在或已失效' });
    }
    protectedAssets.set(asset.id, asset);
    const { tasks } = await import('./review-tasks.js');
    const acceptedTask = tasks.find((task) => task.acceptedAt && (task.sourceFileUrl?.endsWith(`/assets/${assetId}`) || task.groups?.some((group) => group.images.some((image) => image.originalAssetId === assetId))));
    let canDownloadAcceptedDelivery = false;
    if (acceptedTask?.orderId && req.user!.role === 'advertiser') {
      const { designOrders } = await import('./design-orders.js');
      const order = designOrders.find((item) => item.id === acceptedTask.orderId);
      canDownloadAcceptedDelivery = Boolean(order && order.paymentStatus === 'paid' && (order.creatorId === req.user!.id || (req.user!.organizationId && order.organizationId === req.user!.organizationId)));
    }
    if (asset.kind === 'image' && !canDownloadAcceptedDelivery) {
      return res.status(403).json({ code: 403, success: false, message: '原图仅在品牌方确认验收后向订单所属品牌方开放下载' });
    }
    if (asset.ownerId !== req.user!.id && req.user!.role !== 'admin' && req.user!.role !== 'customer_service' && !canDownloadAcceptedDelivery) {
      return res.status(403).json({ code: 403, success: false, message: '无权读取该文件' });
    }

    res.setHeader('Content-Type', asset.mimetype);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(asset.filename)}"`);
    if (asset.localOriginalPath) {
      return res.sendFile(asset.localOriginalPath);
    }
    if (asset.ossOriginalKey) {
      const result = await getObjectFromOss(asset.ossOriginalKey);
      return res.send(result.content);
    }
    return res.status(404).json({ code: 404, success: false, message: '文件存储记录不完整' });
  } catch (err) {
    next(err);
  }
});

uploadRouter.get('/status', (req, res) => {
  res.json({
    code: 200,
    success: true,
    data: {
      isOssConfigured,
      storageMode: isOssConfigured ? 'aliyun-oss' : 'local-disk',
      bucket: process.env.OSS_BUCKET || '未配置',
      region: process.env.OSS_REGION || 'oss-cn-guangzhou',
      maxUploadSize: '100MB',
      supportedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/zip', 'application/x-zip-compressed', 'image/vnd.adobe.photoshop']
    }
  });
});
