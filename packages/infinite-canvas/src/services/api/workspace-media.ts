export type WorkspaceMediaKind = 'image' | 'video';

export type WorkspaceMediaUpload = {
    assetId: string;
    filename: string;
    size: number;
    mimetype: string;
    url: string;
};

type UploadOptions = { signal?: AbortSignal; filename?: string };

async function readResponse(response: Response) {
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) throw new Error(result?.message || `工作台素材上传失败（${response.status}）`);
    return result.data;
}

function extensionFor(kind: WorkspaceMediaKind, mimeType: string) {
    if (kind === 'video') {
        if (mimeType === 'video/webm') return 'webm';
        if (mimeType === 'video/quicktime') return 'mov';
        if (mimeType === 'video/x-m4v') return 'm4v';
        return 'mp4';
    }
    if (mimeType === 'image/jpeg') return 'jpg';
    if (mimeType === 'image/webp') return 'webp';
    if (mimeType === 'image/gif') return 'gif';
    return 'png';
}

/** Upload workspace media directly to private OSS; only the stable asset ID is stored in project data. */
export async function uploadWorkspaceMedia(blob: Blob, kind: WorkspaceMediaKind, options: UploadOptions = {}): Promise<WorkspaceMediaUpload> {
    if ((kind === 'image' && blob.type.startsWith('video/')) || (kind === 'video' && blob.type.startsWith('image/'))) {
        throw new Error(kind === 'image' ? '请选择有效的图片文件' : '请选择有效的视频文件');
    }
    const mimeType = blob.type.startsWith(`${kind}/`) ? blob.type : kind === 'video' ? 'video/mp4' : 'image/png';
    const filename = options.filename || `workspace-${kind}-${Date.now()}.${extensionFor(kind, mimeType)}`;
    const presign = await fetch('/api/upload/presign', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, folder: 'canvas-workspace', contentType: mimeType, size: blob.size }),
        signal: options.signal,
    });
    const ticket = await readResponse(presign);
    const put = await fetch(ticket.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': ticket.contentType },
        body: blob,
        signal: options.signal,
    });
    if (!put.ok) throw new Error(`OSS 上传失败（${put.status}）`);
    const completeResponse = await fetch('/api/upload/complete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId: ticket.assetId }),
        signal: options.signal,
    });
    const completed = await readResponse(completeResponse);
    if (completed.storageType !== 'aliyun-oss') throw new Error('工作台图片和视频必须保存到 OSS，请检查服务端 OSS 配置');
    return {
        assetId: completed.assetId,
        filename: completed.filename,
        size: completed.size,
        mimetype: completed.mimetype,
        url: kind === 'image' ? `/api/upload/previews/${encodeURIComponent(completed.assetId)}` : `/api/upload/videos/${encodeURIComponent(completed.assetId)}/stream`,
    };
}
