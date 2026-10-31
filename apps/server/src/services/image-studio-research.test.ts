import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeMarketResearchSources, searchProductResearchSources } from './image-studio-research.js';

test('market research accepts only unique HTTPS sources and bounds result fields', () => {
  const sources = normalizeMarketResearchSources({ results: [
    { title: '  Product   trend ', url: 'https://example.com/a', content: 'Public summary', score: 0.92, published_date: '2026-10-01' },
    { title: 'Duplicate', url: 'https://example.com/a', content: 'duplicate' },
    { title: 'Insecure', url: 'http://example.com/b', content: 'must be skipped' },
    { title: 'Bad URL', url: 'javascript:alert(1)', content: 'must be skipped' },
    { title: 'Another source', url: 'https://example.org/c', content: `Contact 13800138000 ${'x'.repeat(1000)}` },
  ] });

  assert.equal(sources.length, 2);
  assert.equal(sources[0].title, 'Product trend');
  assert.equal(sources[0].score, 0.92);
  assert.equal(sources[1].excerpt.startsWith('Contact [手机号]'), true);
  assert.ok(sources[1].excerpt.length <= 900);
});

test('market research limits results to six and drops entries without a title or safe URL', () => {
  const sources = normalizeMarketResearchSources({ results: [
    { title: '', url: 'https://example.com/empty-title' },
    ...Array.from({ length: 8 }, (_, index) => ({ title: `Source ${index + 1}`, url: `https://example.com/${index + 1}` })),
  ] });
  assert.equal(sources.length, 6);
  assert.equal(sources.at(-1)?.title, 'Source 6');
});

test('product research uses configured SearXNG, preserves sources, and degrades on failure', async () => {
  const previous = { ...process.env };
  try {
    process.env.DESIGN_REFERENCE_PROVIDER = 'searxng';
    process.env.SEARXNG_BASE_URL = 'https://search.example.test/';
    let requested = '';
    const fetcher = (async (url: string) => {
      requested = url;
      return { response: { ok: true }, data: { results: [{ title: '商品案例', url: 'https://example.com/product', content: '公开资料' }, { title: 'unsafe', url: 'https://name:password@example.com/' }] } };
    }) as any;
    const result = await searchProductResearchSources('宠物零食 京东 商品', 'project', fetcher);
    assert.equal(result.status, 'complete');
    assert.equal(new URL(requested).searchParams.get('q'), '宠物零食 京东 商品');
    assert.deepEqual(result.sources.map((source) => source.url), ['https://example.com/product']);
    const failed = await searchProductResearchSources('宠物零食', 'project', (async () => { throw new Error('offline'); }) as any);
    assert.equal(failed.status, 'failed');
    delete process.env.SEARXNG_BASE_URL;
    assert.equal((await searchProductResearchSources('宠物零食', 'project', fetcher)).status, 'not_configured');
  } finally {
    for (const key of ['DESIGN_REFERENCE_PROVIDER', 'SEARXNG_BASE_URL', 'TAVILY_API_KEY']) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
  }
});
