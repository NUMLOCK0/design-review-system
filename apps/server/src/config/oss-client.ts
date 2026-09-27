import OSS from 'ali-oss';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const region = process.env.OSS_REGION || 'oss-cn-guangzhou';
const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
const bucket = process.env.OSS_BUCKET;
const endpoint = process.env.OSS_ENDPOINT || `${region}.aliyuncs.com`;
const customDomain = process.env.OSS_CUSTOM_DOMAIN;

let ossClient: OSS | null = null;

// 校验 OSS 配置是否有效（排除 placeholder 占位符）
export const isOssConfigured = Boolean(
  accessKeyId &&
  accessKeySecret &&
  bucket &&
  accessKeyId !== 'your_oss_access_key_id' &&
  accessKeySecret !== 'your_oss_access_key_secret' &&
  bucket !== 'your_oss_bucket_name'
);

export function createOssObjectKey(filename: string, folderName = 'design-images', prefix?: string) {
  const ext = path.extname(filename);
  const baseName = path.basename(filename, ext).replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
  const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const uniquePrefix = prefix || `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return `${folderName}/${datePrefix}/${uniquePrefix}_${baseName}${ext}`;
}

if (isOssConfigured) {
  try {
    ossClient = new OSS({
      region,
      accessKeyId: accessKeyId!,
      accessKeySecret: accessKeySecret!,
      bucket: bucket!,
      endpoint: endpoint || undefined,
      secure: true,
    });
    console.log(`✅ [Aliyun OSS] 阿里云对象存储已就绪 (Bucket: ${bucket}, Region: ${region})`);
  } catch (err) {
    console.error('❌ [Aliyun OSS] 初始化失败:', err);
  }
} else {
  console.log('ℹ️ [Storage] 未配置完整 OSS 密钥，文件上传将使用本地 /uploads 目录或 Mock 链接');
}

/**
 * 上传 Buffer 文件到阿里云 OSS
 * @param fileBuffer 文件二进制 Buffer
 * @param filename 原始文件名
 * @param folderName 目标 OSS 存储子目录 (例如 'design-images' | 'source-files')
 */
export async function uploadBufferToOss(
  fileBuffer: Buffer,
  filename: string,
  folderName: string = 'design-images'
): Promise<{ url: string; name: string; size: number }> {
  if (!ossClient) {
    throw new Error('OSS 客户端未配置或未就绪');
  }

  const objectKey = createOssObjectKey(filename, folderName);

  const result = await ossClient.put(objectKey, fileBuffer, {
    headers: {
      // OSS 对象保持私有，只能通过受控流程生成签名地址读取。
      'x-oss-object-acl': 'private'
    }
  });

  // 若配置了自定义加速 CDN 域名则优先使用，否则返回 OSS 标准直链
  let fileUrl = result.url;
  if (customDomain) {
    const cleanDomain = customDomain.replace(/\/+$/, '');
    fileUrl = `${cleanDomain}/${objectKey}`;
  }

  return {
    url: fileUrl,
    name: objectKey,
    size: fileBuffer.length
  };
}

export function getSignedOssUrl(objectKey: string, expires = 300) {
  if (!ossClient) {
    throw new Error('OSS 客户端未配置或未就绪');
  }
  return ossClient.signatureUrl(objectKey, { expires, method: 'GET' });
}

/** 为浏览器直传 OSS 生成仅限 PUT 的临时签名地址。 */
export function getSignedOssUploadUrl(objectKey: string, contentType: string, expires = 300) {
  if (!ossClient) {
    throw new Error('OSS 客户端未配置或未就绪');
  }
  return ossClient.signatureUrl(objectKey, {
    expires,
    method: 'PUT',
    'Content-Type': contentType
  });
}

export async function headOssObject(objectKey: string) {
  if (!ossClient) {
    throw new Error('OSS 客户端未配置或未就绪');
  }
  return ossClient.head(objectKey);
}

/** 为浏览器直传补齐 CORS 规则；只追加缺失规则，不覆盖 Bucket 现有配置。 */
export async function ensureOssCors() {
  if (!ossClient || !bucket) return;
  const origins = (process.env.OSS_CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (!origins.length) return;

  const rule = {
    allowedOrigin: origins,
    allowedMethod: ['PUT', 'GET', 'HEAD'],
    allowedHeader: ['*'],
    exposeHeader: ['ETag', 'x-oss-request-id'],
    maxAgeSeconds: '600'
  };

  try {
    const current = await ossClient.getBucketCORS(bucket);
    const hasDirectUploadRule = current.rules.some((currentRule) =>
      origins.every((origin) => Array.isArray(currentRule.allowedOrigin)
        ? currentRule.allowedOrigin.includes(origin)
        : currentRule.allowedOrigin === origin)
      && (Array.isArray(currentRule.allowedMethod)
        ? currentRule.allowedMethod.includes('PUT')
        : currentRule.allowedMethod === 'PUT')
    );
    if (!hasDirectUploadRule) {
      await ossClient.putBucketCORS(bucket, [...current.rules, rule]);
      console.log(`✅ [Aliyun OSS] 已补充浏览器直传 CORS 规则: ${origins.join(', ')}`);
    }
  } catch (err) {
    console.warn('⚠️ [Aliyun OSS] CORS 规则检查失败，请在 OSS Bucket 控制台手动放行前端域名:', err);
  }
}

/**
 * 为私有 OSS 图片生成带图片处理参数的临时地址。
 * 水印由 OSS 图片处理服务执行，服务器不需要下载、解码或重新编码原图。
 */
export function getSignedOssProcessUrl(objectKey: string, process: string, expires = 300) {
  if (!ossClient) {
    throw new Error('OSS 客户端未配置或未就绪');
  }
  return ossClient.signatureUrl(objectKey, { expires, method: 'GET', process });
}

export async function getObjectFromOss(objectKey: string) {
  if (!ossClient) {
    throw new Error('OSS 客户端未配置或未就绪');
  }
  return ossClient.get(objectKey);
}

export { ossClient };
