export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("请填写 API Base URL。");
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("API Base URL 格式不正确，请填写完整的 https:// 地址。");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("中转站地址必须使用 http 或 https。");
  if (parsed.username || parsed.password) throw new Error("请把 API Key 填在单独的密钥栏，不要放进 URL。");
  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/+$/, "");
}

function redact(value: string, secret: string): string {
  return secret ? value.split(secret).join("[已隐藏]") : value;
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "此临时演示仅在开发环境启用。" }, { status: 404 });
  try {
    const body = await request.json();
    const baseUrl = normalizeBaseUrl(body.baseUrl);
    const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
    const model = typeof body.visionModel === "string" ? body.visionModel.trim() : "";
    if (!apiKey) return Response.json({ error: "请填写 API Key。" }, { status: 400 });
    if (!model) return Response.json({ error: "请填写视觉模型名称。" }, { status: 400 });

    const started = Date.now();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 30_000);
    let upstream: Response;
    let protocol = "Responses API";
    try {
      upstream = await fetch(`${baseUrl}/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, input: "Reply with the single word OK." }),
        cache: "no-store",
        signal: abort.signal,
      });
      if (upstream.status === 404) {
        const responsesDetail = redact((await upstream.text()).slice(0, 500), apiKey);
        protocol = "Chat Completions fallback";
        upstream = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with the single word OK." }] }),
          cache: "no-store",
          signal: abort.signal,
        });
        if (!upstream.ok) {
          const detail = redact((await upstream.text()).slice(0, 700), apiKey);
          return Response.json({ error: `Responses API 返回 404${responsesDetail ? `：${responsesDetail}` : ""}；Chat Completions 回退也返回 ${upstream.status}${detail ? `：${detail}` : ""}` }, { status: 502 });
        }
      }
    } catch (error) {
      if (abort.signal.aborted) throw new Error("连接超时（30 秒）。请检查中转站地址和网络。");
      throw error;
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok) {
      const detail = redact((await upstream.text()).slice(0, 1000), apiKey);
      return Response.json({ error: `${protocol} 返回 ${upstream.status}${detail ? `：${detail}` : ""}` }, { status: 502 });
    }
    const result = await upstream.json().catch(() => ({}));
    return Response.json({ ok: true, model: result.model || model, protocol, elapsedMs: Date.now() - started });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "连接测试失败。" }, { status: 400 });
  }
}
