import { fetchWithAuth } from '@/lib/auth';

export interface UploadedFileData {
  url: string;
  assetId: string;
  storageType: 'aliyun-oss' | 'local-disk';
  watermarked: boolean;
  filename: string;
  size: number;
  mimetype: string;
}

async function parseResponse(response: Response) {
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.success) {
    throw new Error(result?.message || '文件上传失败');
  }
  return result;
}

/** OSS 已配置时浏览器直传；未配置时保留本地开发上传兜底。 */
export async function uploadFile(file: File, folder: string): Promise<UploadedFileData> {
  const contentType = file.type || 'application/octet-stream';
  const presignResponse = await fetchWithAuth('/upload/presign', {
    method: 'POST',
    body: JSON.stringify({ filename: file.name, folder, contentType, size: file.size })
  });

  if (presignResponse.status === 409) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    const fallbackResponse = await fetchWithAuth('/upload', { method: 'POST', body: formData });
    return (await parseResponse(fallbackResponse)).data as UploadedFileData;
  }

  const presign = await parseResponse(presignResponse);
  const uploadResponse = await fetch(presign.data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': presign.data.contentType },
    body: file
  });
  if (!uploadResponse.ok) {
    throw new Error(`OSS 上传失败（${uploadResponse.status}）`);
  }

  const completeResponse = await fetchWithAuth('/upload/complete', {
    method: 'POST',
    body: JSON.stringify({ assetId: presign.data.assetId })
  });
  return (await parseResponse(completeResponse)).data as UploadedFileData;
}
