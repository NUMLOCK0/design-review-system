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

  const ext = path.extname(filename);
  const baseName = path.basename(filename, ext).replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '_');
  const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const objectKey = `${folderName}/${datePrefix}/${Date.now()}_${baseName}${ext}`;

  const result = await ossClient.put(objectKey, fileBuffer, {
    headers: {
      // 原图与带水印预览都保持私有，只能通过服务端权限校验后生成签名地址读取。
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

export async function getObjectFromOss(objectKey: string) {
  if (!ossClient) {
    throw new Error('OSS 客户端未配置或未就绪');
  }
  return ossClient.get(objectKey);
}

export { ossClient };
