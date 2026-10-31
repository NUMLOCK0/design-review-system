import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import https from 'node:https';
import sharp from 'sharp';
import { z } from 'zod';
import { fetchAiJson } from './ai-call-log.js';

export const designReferenceSchema = z.object({
  id: z.string(), imageUrl: z.string(), title: z.string(), sourceUrl: z.string().optional(),
  description: z.string(), licenseStatus: z.literal('unknown'),
});
export type DesignReference = z.infer<typeof designReferenceSchema>;
export const DESIGN_REFERENCE_SKILL_ID = 'builtin_design_reference_research';

export function isDesignReferenceSearchConfigured() {
  return referenceSearchProvider() === 'searxng' ? Boolean(String(process.env.SEARXNG_BASE_URL || '').trim()) : Boolean(String(process.env.TAVILY_API_KEY || '').trim());
}

function referenceSearchProvider() {
  if (process.env.DESIGN_REFERENCE_PROVIDER === 'tavily') return 'tavily';
  return process.env.DESIGN_REFERENCE_PROVIDER === 'searxng' || (!process.env.TAVILY_API_KEY?.trim() && process.env.SEARXNG_BASE_URL?.trim()) ? 'searxng' : 'tavily';
}

export function normalizeSearxngReferences(data: any) {
  const items = Array.isArray(data?.results) ? data.results : [];
  return normalizeDesignReferences({ images: items.map((item: any) => ({ url: item.img_src, source_url: item.url, description: [item.title, item.content].filter((v) => typeof v === 'string').join(' — ') })) });
}

export function shouldSearchDesignReferences(text: string, skillIds: string[], hasPreviousSearch: boolean, hasSelection: boolean) {
  const explicit = /(?:搜索|搜一下|查找|找一些|找一下|找些|找一组|联网|再找|找找).{0,24}(?:参考|案例|图片|风格)|(?:参考图|设计案例).{0,18}(?:搜索|查找|找一下)/.test(text);
  return !hasSelection && (explicit || (skillIds.includes(DESIGN_REFERENCE_SKILL_ID) && !hasPreviousSearch));
}

function httpsUrl(value: unknown) {
  try { const u = new URL(String(value)); return u.protocol === 'https:' && !u.username && !u.password && (!u.port || u.port === '443') ? u.toString() : ''; } catch { return ''; }
}
function safeText(value: unknown, limit: number) {
  return typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : '';
}
export function normalizeDesignReferences(data: any): DesignReference[] {
  const images = Array.isArray(data?.images) ? data.images : [];
  const seen = new Set<string>();
  return images.flatMap((item: any) => {
    const imageUrl = httpsUrl(typeof item === 'string' ? item : item?.url);
    if (!imageUrl || seen.has(imageUrl)) return [];
    seen.add(imageUrl);
    const description = safeText(item?.description, 400);
    // Only associate a page when the provider explicitly supplies one for this image.
    const sourceUrl = httpsUrl(item?.source_url || item?.sourceUrl);
    return [{ id: createHash('sha256').update(imageUrl).digest('hex').slice(0, 24), imageUrl,
      title: description.slice(0, 80) || '公开设计参考', description, ...(sourceUrl ? { sourceUrl } : {}), licenseStatus: 'unknown' as const }];
  }).slice(0, 12);
}

export async function searchDesignReferences(query: string, projectId: string) {
  if (referenceSearchProvider() === 'searxng') {
    const base = new URL(String(process.env.SEARXNG_BASE_URL || ''));
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) throw new Error('SearXNG 配置地址无效');
    const endpoint = new URL('search', base.href.replace(/\/?$/, '/'));
    endpoint.searchParams.set('q', query.slice(0, 240)); endpoint.searchParams.set('format', 'json'); endpoint.searchParams.set('categories', 'images'); endpoint.searchParams.set('safesearch', '1');
    const { response, data } = await fetchAiJson(endpoint.toString(), { method: 'GET', headers: { Accept: 'application/json' }, redirect: 'error' }, 25_000, { source: 'image_studio_research', operation: 'design_reference_search', model: 'searxng-search', referenceId: projectId });
    if (!response.ok || !Array.isArray(data?.results)) throw new Error('SearXNG 搜索失败，请检查实例是否启用了 JSON 格式和图片搜索');
    return normalizeSearxngReferences(data);
  }
  const apiKey = String(process.env.TAVILY_API_KEY || '').trim();
  if (!apiKey) throw new Error('请先在服务端配置 TAVILY_API_KEY，才能搜索设计参考图。');
  const { response, data } = await fetchAiJson('https://api.tavily.com/search', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: query.slice(0, 240), topic: 'general', search_depth: 'basic', max_results: 8, include_images: true, include_image_descriptions: true }),
  }, 25_000, { source: 'image_studio_research', operation: 'design_reference_search', model: 'tavily-search', referenceId: projectId, apiKey });
  if (!response.ok || data?.error || data?.success === false) throw new Error('参考图搜索失败，请检查搜索服务配置或稍后重试。');
  return normalizeDesignReferences(data);
}

// Resolve and pin a public IPv4 address; reject redirects and bound response size.
function publicIPv4(address: string) {
  const a = address.split('.').map(Number);
  return a.length === 4 && a.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    && a[0] !== 0 && a[0] !== 10 && a[0] !== 127 && a[0] < 224
    && !(a[0] === 169 && a[1] === 254) && !(a[0] === 172 && a[1] >= 16 && a[1] <= 31)
    && !(a[0] === 192 && (a[1] === 168 || a[1] === 0)) && !(a[0] === 100 && a[1] >= 64 && a[1] <= 127)
    && !(a[0] === 198 && (a[1] === 18 || a[1] === 19));
}
export async function readPublicReferenceImage(imageUrl: string) {
  const safe = httpsUrl(imageUrl);
  if (!safe) throw new Error('参考图地址不可用');
  const url = new URL(safe);
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some((entry) => !publicIPv4(entry.address))) throw new Error('参考图地址不可用');
  const buffer = await new Promise<Buffer>((resolve, reject) => {
    const request = https.request({ hostname: url.hostname, port: 443, path: `${url.pathname}${url.search}`, servername: url.hostname,
      timeout: 8000, lookup: (_host, _opts, cb) => cb(null, addresses[0].address, 4), headers: { Accept: 'image/jpeg,image/png,image/webp' } }, (response) => {
      if (response.statusCode !== 200 || !/^image\/(jpeg|png|webp)(;|$)/i.test(String(response.headers['content-type'] || ''))) { response.resume(); reject(new Error('参考图无法读取')); return; }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 4 * 1024 * 1024) request.destroy(new Error('参考图过大')); else chunks.push(Buffer.from(chunk)); });
      response.on('error', reject); response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.on('timeout', () => request.destroy(new Error('参考图读取超时'))); request.on('error', reject); request.end();
  });
  const image = await sharp(buffer, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#fff' }).jpeg({ quality: 75 }).toBuffer();
  return { mediaType: 'image/jpeg', data: image.toString('base64') };
}
