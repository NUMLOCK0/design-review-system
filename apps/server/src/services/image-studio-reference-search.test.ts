import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { DESIGN_REFERENCE_SKILL_ID, isDesignReferenceSearchConfigured, normalizeDesignReferences, normalizeSearxngReferences, readPublicReferenceImage, shouldSearchDesignReferences } from './image-studio-reference-search.js';

test('normalizes SearXNG images and retains actual source URLs', () => {
  const items = normalizeSearxngReferences({ results: [{ img_src: 'https://example.org/a.png', url: 'https://example.org/case', title: 'A logo', content: '<b>simple</b>' }, { url: 'https://example.org/not-an-image' }] });
  assert.equal(items.length, 1); assert.equal(items[0].sourceUrl, 'https://example.org/case');
  assert.equal(items[0].licenseStatus, 'unknown');
});

test('detects missing or blank search configuration', () => {
  const previous = process.env.TAVILY_API_KEY;
  try {
    delete process.env.TAVILY_API_KEY;
    assert.equal(isDesignReferenceSearchConfigured(), false);
    process.env.TAVILY_API_KEY = '  ';
    assert.equal(isDesignReferenceSearchConfigured(), false);
    process.env.TAVILY_API_KEY = 'test-key';
    assert.equal(isDesignReferenceSearchConfigured(), true);
  } finally {
    if (previous === undefined) delete process.env.TAVILY_API_KEY;
    else process.env.TAVILY_API_KEY = previous;
  }
});

test('search skill triggers once and explicit requests can search again', () => {
  assert.equal(shouldSearchDesignReferences('帮我设计品牌', [DESIGN_REFERENCE_SKILL_ID], false, false), true);
  assert.equal(shouldSearchDesignReferences('继续调整配色', [DESIGN_REFERENCE_SKILL_ID], true, false), false);
  assert.equal(shouldSearchDesignReferences('再搜索参考图', [DESIGN_REFERENCE_SKILL_ID], true, false), true);
  assert.equal(shouldSearchDesignReferences('分析我选中的参考图', [DESIGN_REFERENCE_SKILL_ID], false, true), false);
  assert.equal(shouldSearchDesignReferences('帮我设计品牌', [], false, false), false);
});

test('normalizes image search results without inventing source pages', () => {
  const results = normalizeDesignReferences({ images: [
    { url: 'https://example.org/a.jpg', description: 'A design', source_url: 'https://example.org/post' },
    'https://example.org/b.jpg', 'https://example.org/b.jpg', 'http://example.org/c.jpg', 'https://user:secret@example.org/a.jpg',
  ] });
  assert.equal(results.length, 2);
  assert.equal(results[0].sourceUrl, 'https://example.org/post');
  assert.equal(results[1].sourceUrl, undefined);
  assert.equal(results[0].licenseStatus, 'unknown');
});

test('rejects unsafe image addresses before downloading', async () => {
  for (const url of ['http://localhost/a.jpg', 'https://127.0.0.1/a.jpg', 'https://user:pass@example.org/a.jpg', 'https://example.org:8443/a.jpg']) {
    await assert.rejects(readPublicReferenceImage(url));
  }
});
