import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth.middleware.js';
import {
  getObjectFromOss,
  getSignedOssUrl,
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
import { findMediaAsset, persistMediaAsset } from '../config/persistence.js';

export const uploadRouter = Router();

const memoryStorage = multer.memoryStorage();
const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 100 * 1024 * 1024 }
});

const allowedFolders = new Set(['design-images', 'reference-samples', 'annotations', 'source-files']);
const imageMimeTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const apiOrigin = process.env.PUBLIC_API_ORIGIN || `http://localhost:${process.env.PORT || 8080}`;

ensureMediaDirectories();

function isImageUpload(mimetype: string) {
  return imageMimeTypes.has(mimetype);
}

function protectedAssetUrl(assetId: string) {
  return `${apiOrigin}/api/upload/assets/${assetId}`;
}

/**
 * 图片上传安全边界：
 * 1. 原图只落私有目录/私有 OSS；
 * 2. 图片返回服务端生成的带水印预览图；
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

    const folder = requestedFolder;
    const assetId = createAssetId();
    const originalName = req.file.originalname;
    const isImage = isImageUpload(req.file.mimetype);
    const watermarkText = `COZI REVIEW · 仅限审核 · ${req.user?.name || '受控用户'}`;
    const previewBuffer = isImage ? await createWatermarkedPreview(req.file.buffer, watermarkText) : null;
    let url = protectedAssetUrl(assetId);
    let localOriginalPath: string | undefined;
    let ossOriginalKey: string | undefined;
    let storageType: 'aliyun-oss' | 'local-disk';
    let ossPreviewKey: string | undefined;

    if (isOssConfigured) {
      const originalResult = await uploadBufferToOss(req.file.buffer, originalName, `private/${folder}`);
      ossOriginalKey = originalResult.name;
      storageType = 'aliyun-oss';

      if (previewBuffer) {
        const previewResult = await uploadBufferToOss(previewBuffer, `${assetId}.webp`, `previews/${folder}`);
        ossPreviewKey = previewResult.name;
        url = `${apiOrigin}/api/upload/previews/${assetId}`;
      }
    } else {
      const privateFolder = path.join(PRIVATE_UPLOADS_DIR, folder);
      fs.mkdirSync(privateFolder, { recursive: true });
      const extension = path.extname(originalName).toLowerCase() || '.bin';
      localOriginalPath = path.join(privateFolder, `${assetId}${extension}`);
      fs.writeFileSync(localOriginalPath, req.file.buffer);
      storageType = 'local-disk';

      if (previewBuffer) {
        fs.writeFileSync(path.join(PUBLIC_PREVIEWS_DIR, `${assetId}.webp`), previewBuffer);
        url = `${apiOrigin}/uploads/previews/${assetId}.webp`;
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
      message: isImage ? '图片已生成带水印预览并安全保存' : '文件已安全保存',
      data: {
        url,
        assetId,
        storageType,
        watermarked: isImage,
        filename: originalName,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (err) {
    next(err);
  }
});

// OSS 预览地址动态签名，避免把 5 分钟签名地址持久化到任务数据中。
uploadRouter.get('/previews/:assetId', async (req, res, next) => {
  try {
    const assetId = String(req.params.assetId);
    const asset = protectedAssets.get(assetId) || await findMediaAsset(assetId);
    if (!asset || asset.kind !== 'image' || !asset.ossPreviewKey) {
      return res.status(404).json({ code: 404, success: false, message: '预览不存在或已失效' });
    }
    protectedAssets.set(asset.id, asset);
    return res.redirect(302, getSignedOssUrl(asset.ossPreviewKey, 300));
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
      canDownloadAcceptedDelivery = Boolean(order && (order.creatorId === req.user!.id || (req.user!.organizationId && order.organizationId === req.user!.organizationId)));
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
