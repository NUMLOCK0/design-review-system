import { aiResponseError, fetchAiJson, sanitizeAiError } from './ai-call-log.js';

export type ProviderModel = { id: string; ownedBy?: string };

export function aiModelsEndpoint(baseUrl: string) {
  const url = new URL(baseUrl.trim());
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
    || url.username || url.password || url.search || url.hash) throw new Error('请输入有效的服务商 API 地址');
  let path = url.pathname.replace(/\/+$/, '');
  path = path.replace(/\/(?:chat\/completions|images\/(?:generations|edits))$/i, '');
  if (!/\/models$/i.test(path)) path += /\/v\d+(?:beta\d*)?$/i.test(path) ? '/models' : '/v1/models';
  url.pathname = path;
  return url.toString();
}

export function parseProviderModels(payload: unknown): ProviderModel[] {
  const body = payload as { data?: unknown; models?: unknown } | null;
  const rows = Array.isArray(payload) ? payload : Array.isArray(body?.data) ? body.data : Array.isArray(body?.models) ? body.models : null;
  if (!rows) throw new Error('服务商未返回有效的模型列表，可手动添加模型');
  const models = new Map<string, ProviderModel>();
  for (const row of rows) {
    const rawId = typeof row === 'string' ? row : row?.id;
    if (typeof rawId !== 'string') continue;
    const id = rawId.trim();
    if (!id || id.length > 128 || /[\u0000-\u001f\u007f]/.test(id)) continue;
    const ownedBy = typeof row?.owned_by === 'string' ? row.owned_by.trim().slice(0, 100) : undefined;
    if (!models.has(id)) models.set(id, { id, ...(ownedBy ? { ownedBy } : {}) });
    if (models.size >= 2000) break;
  }
  return [...models.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function fetchAiModelCatalog(input: { baseUrl: string; apiKey: string; configId?: string }) {
  try {
    const { response, data } = await fetchAiJson(aiModelsEndpoint(input.baseUrl), {
      method: 'GET', redirect: 'error', headers: { Authorization: `Bearer ${input.apiKey}`, Accept: 'application/json' },
    }, 20_000, { source: 'admin_model_settings', operation: 'model_discovery', configId: input.configId, apiKey: input.apiKey });
    const error = aiResponseError(response.status, data);
    if (error) throw new Error(`获取模型失败（HTTP ${response.status}）：${error.message}`);
    return parseProviderModels(data);
  } catch (error) {
    const message = error instanceof Error && error.name === 'TimeoutError' ? '获取模型超时，请检查服务地址后重试'
      : sanitizeAiError(error, input.apiKey) || '无法获取模型，请检查服务地址和 API Key';
    throw Object.assign(new Error(message), { status: 502, code: 'AI_MODELS_DISCOVERY_FAILED' });
  }
}
