import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { isOssConfigured, uploadBufferToOss } from '../config/oss-client.js';

export const uploadRouter = Router();

// 使用内存存储，以便直接将 Buffer 转发给 OSS 或写入本地磁盘
const memoryStorage = multer.memoryStorage();
const upload = multer({
  storage: memoryStorage,
  limits: { fileSize: 100 * 1024 * 1024 } // 支持最大 100MB 设计图或源文件
});

/**
 * 1. 通用文件上传 API (自动判断 OSS 或本地持久化)
 * 支持 form-data 传入 folder ('design-images' | 'source-files' | 'annotations')
 */
uploadRouter.post('/', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ code: 400, success: false, message: '请选择要上传的文件' });
    }

    const folder = (req.body.folder as string) || 'design-images';
    const originalName = req.file.originalname;

    // 方案 A：已配置阿里云 OSS 则直接上传到云端 Bucket
    if (isOssConfigured) {
      try {
        const result = await uploadBufferToOss(req.file.buffer, originalName, folder);
        return res.json({
          code: 200,
          success: true,
          message: '文件已成功上传至阿里云 OSS',
          data: {
            url: result.url,
            storageType: 'aliyun-oss',
            filename: originalName,
            size: req.file.size,
            mimetype: req.file.mimetype
          }
        });
      } catch (ossError: any) {
        console.error('⚠️ 阿里云 OSS 上传失败，自动降级为本地存储:', ossError);
      }
    }

    // 方案 B：本地文件系统存储回退
    const localUploadsDir = path.join(process.cwd(), 'uploads', folder);
    if (!fs.existsSync(localUploadsDir)) {
      fs.mkdirSync(localUploadsDir, { recursive: true });
    }

    const ext = path.extname(originalName);
    const uniqueFileName = `${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`;
    const targetFilePath = path.join(localUploadsDir, uniqueFileName);

    fs.writeFileSync(targetFilePath, req.file.buffer);

    const localFileUrl = `http://localhost:8080/uploads/${folder}/${uniqueFileName}`;

    return res.json({
      code: 200,
      success: true,
      message: '文件已保存至本地存储',
      data: {
        url: localFileUrl,
        storageType: 'local-disk',
        filename: originalName,
        size: req.file.size,
        mimetype: req.file.mimetype
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * 2. 获取 OSS 存储运行状态与配置
 */
uploadRouter.get('/status', (req, res) => {
  res.json({
    code: 200,
    success: true,
    data: {
      isOssConfigured,
      storageMode: isOssConfigured ? 'aliyun-oss' : 'local-disk',
      bucket: process.env.OSS_BUCKET || '未配置',
      region: process.env.OSS_REGION || 'oss-cn-hangzhou',
      maxUploadSize: '100MB',
      supportedMimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'application/zip', 'application/x-zip-compressed', 'image/vnd.adobe.photoshop']
    }
  });
});
