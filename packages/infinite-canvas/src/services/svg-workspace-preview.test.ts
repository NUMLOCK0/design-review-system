import assert from 'node:assert/strict';
import test from 'node:test';
import { rasterizeSvgForWorkspace } from './image-storage';

test('SVG 在工作台上传前转换为 PNG 预览并限制尺寸', async () => {
    const previous = { window: globalThis.window, document: globalThis.document, Image: globalThis.Image };
    let width = 0, height = 0, drawn = false;
    Object.assign(globalThis, {
        window: { setTimeout, clearTimeout },
        Image: class {
            naturalWidth = 8000; naturalHeight = 4000;
            onload: (() => void) | null = null; onerror: (() => void) | null = null;
            set src(_value: string) { queueMicrotask(() => this.onload?.()); }
        },
        document: { createElement: () => ({
            set width(value: number) { width = value; }, get width() { return width; },
            set height(value: number) { height = value; }, get height() { return height; },
            getContext: () => ({ drawImage: () => { drawn = true; } }),
            toBlob: (callback: (blob: Blob) => void, mime: string) => callback(new Blob(['preview'], { type: mime })),
        }) },
    });
    try {
        const result = await rasterizeSvgForWorkspace(new Blob(['<svg></svg>'], { type: 'image/svg+xml' }));
        assert.equal(result.type, 'image/png');
        assert.equal(width, 4096);
        assert.equal(height, 2048);
        assert.equal(drawn, true);
    } finally { Object.assign(globalThis, previous); }
});
