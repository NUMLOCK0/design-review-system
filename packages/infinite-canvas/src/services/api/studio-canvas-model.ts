import { decodeChannelModel, studioImageOptions, type AiConfig } from '@infinite-canvas/stores/use-config-store';
import { imageToDataUrl, uploadImage } from '@infinite-canvas/services/image-storage';
import type { ReferenceImage } from '@infinite-canvas/types/image';
import type { AiTextMessage } from './image';

function profileId(config: AiConfig) {
    const channel = decodeChannelModel(config.model)?.channelId || '';
    if (!config.studioProjectId || !channel.startsWith('studio-')) throw new Error('请选择后台启用的模型');
    return channel.slice('studio-'.length);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = typeof window === 'undefined' ? null : localStorage.getItem('auth_token');
    const response = await fetch(`/api/image-studio${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers } });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.success) throw new Error(body?.message || `后台请求失败（${response.status}）`);
    return body.data as T;
}

export async function requestStudioText(config: AiConfig, messages: AiTextMessage[], signal?: AbortSignal) {
    const hasImages = messages.some((message) => Array.isArray(message.content) && message.content.some((part) => part.type === 'image_url'));
    if (hasImages && !config.studioVisionModel) throw new Error('请在创作模型中选择后台启用的图片理解模型');
    const selectedProfile = profileId(hasImages ? { ...config, model: config.studioVisionModel! } : config);
    const result = await request<{ text: string }>(`/projects/${encodeURIComponent(config.studioProjectId!)}/canvas/text`, { method: 'POST', signal,
        body: JSON.stringify({ modelProfileId: selectedProfile, messages }) });
    return result.text;
}

export async function requestStudioImage(config: AiConfig, prompt: string, references: ReferenceImage[], signal?: AbortSignal) {
    const projectId = encodeURIComponent(config.studioProjectId!);
    const referenceAssetIds: string[] = [];
    for (const reference of references.slice(0, 12)) {
        const existing = /^studio-image-asset:([\w-]+)$/.exec(reference.storageKey || '');
        if (existing) { referenceAssetIds.push(existing[1]); continue; }
        // Register a copy as a project reference, preserving any existing product role.
        const dataUrl = await imageToDataUrl(reference, { signal });
        const image = await uploadImage(dataUrl, { signal });
        const mediaId = /^image:oss:(asset_[a-f0-9]{32})$/i.exec(image.storageKey || '')?.[1];
        if (!mediaId) throw new Error('参考图片尚未保存，请重新上传');
        const asset = await request<{ id: string }>(`/projects/${projectId}/assets`, { method: 'POST', signal, body: JSON.stringify({ mediaAssetId: mediaId, role: 'other' }) });
        referenceAssetIds.push(asset.id);
    }
    const { sizes, qualities } = studioImageOptions(config);
    const size = sizes.includes(config.size) ? config.size : sizes[0];
    const quality = qualities.includes(config.quality) ? config.quality : qualities[0];
    const job = await request<{ id: string }>(`/projects/${projectId}/jobs`, { method: 'POST', signal,
        headers: { 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ modelProfileId: profileId(config), context: { source: 'canvas' }, generations: [{ slotKey: crypto.randomUUID(), prompt, referenceAssetIds, parameters: { size, quality } }] }) });
    const cancel = () => { void request(`/jobs/${encodeURIComponent(job.id)}/cancel`, { method: 'POST', body: '{}' }).catch(() => undefined); };
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    try {
        while (!signal?.aborted) {
            const state = await request<{ status: string; error?: { message: string }; generations?: Array<{ status: string; outputAssetId?: string; error?: { message: string } }> }>(`/jobs/${encodeURIComponent(job.id)}`, { signal });
            const generation = state.generations?.[0];
            if (generation?.status === 'completed' && generation.outputAssetId) {
                const token = typeof window === 'undefined' ? null : localStorage.getItem('auth_token');
                const response = await fetch(`/api/image-studio/assets/${encodeURIComponent(generation.outputAssetId)}/preview`, { credentials: 'include', signal, ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}) });
                if (!response.ok) throw new Error('生成成功，但无法读取图片');
                const blob = await response.blob();
                return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('图片读取失败')); reader.readAsDataURL(blob); });
            }
            if (['failed', 'partial', 'cancelled'].includes(state.status)) throw new Error(generation?.error?.message || state.error?.message || '图片生成失败');
            await new Promise<void>((resolve, reject) => {
                const onAbort = () => { clearTimeout(timer); reject(new DOMException('已取消', 'AbortError')); };
                const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, 2000);
                signal?.addEventListener('abort', onAbort, { once: true });
                if (signal?.aborted) onAbort();
            });
        }
        throw new DOMException('已取消', 'AbortError');
    } finally { signal?.removeEventListener('abort', cancel); }
}
