import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultConfig, encodeChannelModel, resolveModelForCapability, studioImageOptions } from '@infinite-canvas/stores/use-config-store';
import { requestStudioImage, requestStudioText } from './studio-canvas-model';

test('工作台画布只使用后台当前选择的模型与模型选项', () => {
    const selected = encodeChannelModel('studio-profile-a', 'image-model');
    const config = { ...defaultConfig, studioProjectId: 'project-a', imageModel: selected, studioOptions: { 'profile-a': { sizes: ['1536x1024'], qualityLevels: ['high'] } } };
    assert.equal(resolveModelForCapability(config, 'default::gpt-image-2', 'image'), selected);
    assert.deepEqual(studioImageOptions({ ...config, model: selected }), { sizes: ['1536x1024'], qualities: ['high'] });
    assert.equal(resolveModelForCapability(config, undefined, 'video'), config.videoModel);
});

test('画布生图通过后台任务使用指定档案和支持的尺寸质量', async () => {
    const originalFetch = globalThis.fetch;
    const originalReader = globalThis.FileReader;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.FileReader = class {
        result: string | null = null;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        readAsDataURL() { this.result = 'data:image/png;base64,eA=='; this.onload?.(); }
    } as unknown as typeof FileReader;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        const path = String(url); calls.push({ url: path, init });
        if (path.endsWith('/jobs') && init?.method === 'POST') return Response.json({ success: true, data: { id: 'job-1' } });
        if (path.endsWith('/jobs/job-1')) return Response.json({ success: true, data: { status: 'completed', generations: [{ status: 'completed', outputAssetId: 'asset-1' }] } });
        if (path.endsWith('/assets/asset-1/preview')) return new Response(new Blob(['x'], { type: 'image/png' }));
        throw new Error(`unexpected ${path}`);
    }) as typeof fetch;
    try {
        const config = { ...defaultConfig, studioProjectId: 'project-a', model: encodeChannelModel('studio-profile-a', 'image-model'), studioOptions: { 'profile-a': { sizes: ['1536x1024'], qualityLevels: ['high'] } } };
        assert.equal(await requestStudioImage(config, '画一张图', []), 'data:image/png;base64,eA==');
        const body = JSON.parse(String(calls[0].init?.body));
        assert.equal(body.modelProfileId, 'profile-a');
        assert.deepEqual(body.generations[0].parameters, { size: '1536x1024', quality: 'high' });
        assert.deepEqual(calls.map((call) => call.url), ['/api/image-studio/projects/project-a/jobs', '/api/image-studio/jobs/job-1', '/api/image-studio/assets/asset-1/preview']);
    } finally { globalThis.fetch = originalFetch; globalThis.FileReader = originalReader; }
});

test('画布文本请求携带所选后台档案和项目，并使用登录会话', async () => {
    const original = globalThis.fetch;
    let captured: { url: string; init?: RequestInit } | undefined;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
        captured = { url: String(url), init };
        return new Response(JSON.stringify({ success: true, data: { text: '测试结果' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as typeof fetch;
    try {
        const config = { ...defaultConfig, studioProjectId: 'project-a', model: encodeChannelModel('studio-profile-a', 'model-a') };
        const result = await requestStudioText(config, [{ role: 'user', content: '你好' }]);
        assert.equal(result, '测试结果');
        assert.equal(captured?.url, '/api/image-studio/projects/project-a/canvas/text');
        assert.equal(captured?.init?.credentials, 'include');
        assert.equal(JSON.parse(String(captured?.init?.body)).modelProfileId, 'profile-a');
        await requestStudioText({ ...config, studioVisionModel: encodeChannelModel('studio-vision-a', 'vision-model') }, [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,eA==' } }] }]);
        assert.equal(JSON.parse(String(captured?.init?.body)).modelProfileId, 'vision-a');
    } finally { globalThis.fetch = original; }
});
