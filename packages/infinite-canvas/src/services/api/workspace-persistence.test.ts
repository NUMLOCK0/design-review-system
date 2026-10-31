import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { uploadLegacyMedia } from './workspace-persistence';

test('replaces temporary previews with canonical OSS URLs and migrates inline references', async () => {
    let uploads = 0;
    const deps = {
        getImageBlob: async () => null,
        getMediaBlob: async () => null,
        uploadImage: async () => { uploads++; return { url: '/api/upload/previews/asset_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', storageKey: 'image:oss:asset_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', mimeType: 'image/png', width: 1, height: 1, bytes: 1 }; },
        uploadMediaFile: async () => { throw new Error('unexpected video upload'); },
    };
    const project = { nodes: [{ type: 'image', metadata: { storageKey: 'image:oss:asset_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', content: 'blob:preview-existing', references: ['data:image/png;base64,c29tZXRoaW5n'] } }] };
    const result = await uploadLegacyMedia(project, deps) as typeof project;
    assert.equal(result.nodes[0].metadata.content, '/api/upload/previews/asset_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    assert.equal(result.nodes[0].metadata.references[0], 'image:oss:asset_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    assert.equal(project.nodes[0].metadata.content, 'blob:preview-existing');
    assert.equal(uploads, 1);
});

test('reuses owned studio image and reports unresolved temporary media', async () => {
    const deps = { getImageBlob: async () => null, getMediaBlob: async () => null,
        uploadImage: async () => { throw new Error('unexpected upload'); }, uploadMediaFile: async () => { throw new Error('unexpected upload'); } };
    const result = await uploadLegacyMedia({ type: 'image', metadata: { storageKey: 'studio-image-asset:test-asset', content: 'blob:studio-image' } }, deps) as any;
    assert.equal(result.metadata.content, '/api/image-studio/assets/test-asset/preview');
    await assert.rejects(uploadLegacyMedia({ type: 'audio', metadata: { content: 'blob:unsupported-audio' } }, deps), /无法保存临时素材/);
});

test('inline SVG node preview retains its OSS ownership key and PNG MIME after upload', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
    const project = { nodes: [{ id: 'svg-job-result', type: 'image', metadata: {
        content: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, mimeType: 'image/svg+xml', svgSource: svg,
    } }] };
    let uploads = 0;
    const result = await uploadLegacyMedia(project, { getImageBlob: async () => null, getMediaBlob: async () => null,
        uploadImage: async () => { uploads++; return { storageKey: 'image:oss:asset_cccccccccccccccccccccccccccccccc', url: '/api/upload/previews/asset_cccccccccccccccccccccccccccccccc', mimeType: 'image/png', width: 10, height: 10, bytes: 1 }; },
        uploadMediaFile: async () => { throw new Error('unexpected video upload'); },
    }) as any;
    assert.equal(result.nodes[0].metadata.storageKey, 'image:oss:asset_cccccccccccccccccccccccccccccccc');
    assert.equal(result.nodes[0].metadata.content, '/api/upload/previews/asset_cccccccccccccccccccccccccccccccc');
    assert.equal(result.nodes[0].metadata.mimeType, 'image/png');
    assert.equal(result.nodes[0].metadata.svgSource, svg);
    assert.equal(uploads, 1);
    assert.equal(project.nodes[0].metadata.mimeType, 'image/svg+xml', 'Do not mutate the live SVG source node');
});
