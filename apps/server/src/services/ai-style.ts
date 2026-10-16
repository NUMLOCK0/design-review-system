import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import type { AuthUserPayload } from '../middleware/auth.middleware.js';
import { getObjectFromOss } from '../config/oss-client.js';
import { findMediaAsset } from '../config/persistence.js';
import { protectedAssets } from '../utils/media-protection.js';
import { getChatOrder, getConversationAssignment, parseCard, requireChatDatabase } from './chat.js';
import { getDefaultEnabledAiConfig, getEnabledAiModelProfileCredentials, openAiChatCompletionsEndpoint } from './ai-config.js';
import { fetchAiJson } from './ai-call-log.js';

type ConversationType = 'order' | 'intake';
type Direction = { id: string; name: string; mood: string; colors: Array<{ role: string; hex: string }> };
type StyleResult = { summary: string; styles: Direction[]; model: string };

const fail = (message: string, status: number): never => { throw Object.assign(new Error(message), { status }); };
const imageId = (url: string) => /\/api\/upload\/(?:previews|assets)\/([a-zA-Z0-9_-]+)(?:$|[?#])/.exec(url)?.[1] || '';
const validHex = (value: string) => /^#[0-9a-fA-F]{6}$/.test(value);

async function conversationData(type: ConversationType, id: string, user: AuthUserPayload) {
  const database = requireChatDatabase();
  if (type === 'order') {
    const order = await getChatOrder(id, user);
    if (user.role === 'customer_service') {
      const assignment = await getConversationAssignment('order', id);
      if (assignment.assignedServiceId && assignment.assignedServiceId !== user.id) fail('会话已转交给其他客服', 403);
    }
    const [rows]: any = await database.query('SELECT id,seq,sender_id AS senderId,sender_name AS senderName,body,created_at AS createdAt FROM chat_messages WHERE order_id=? ORDER BY seq DESC LIMIT 200', [id]);
    return { title: order.title, requirements: order.requirements || '', rows: rows.reverse() };
  }

  const serviceAccess = ['customer_service', 'admin'].includes(user.role);
  const [sessions]: any = await database.query(`SELECT s.id,s.title,s.creator_id AS creatorId,s.guest_id AS guestId,a.assigned_service_id AS assignedServiceId
    FROM intake_sessions s LEFT JOIN service_conversation_assignments a ON a.conversation_type='intake' AND a.conversation_id=s.id
    WHERE s.id=? AND s.status='open' AND (${serviceAccess ? '1=1' : '(s.creator_id=? OR s.guest_id=?)'}) LIMIT 1`, serviceAccess ? [id] : [id, user.id, user.id]);
  const session = sessions[0];
  if (!session) fail('会话不存在或无权访问', 404);
  if (user.role === 'customer_service' && session.assignedServiceId && session.assignedServiceId !== user.id) fail('会话已转交给其他客服', 403);
  const [rows]: any = await database.query('SELECT id,seq,sender_id AS senderId,sender_name AS senderName,body,created_at AS createdAt FROM intake_messages WHERE session_id=? ORDER BY seq DESC LIMIT 200', [id]);
  return { title: session.title, requirements: '', rows: rows.reverse() };
}

function cardText(body: string, forms: Map<string, any>) {
  let card: any = null;
  try { card = parseCard(body); } catch { return ''; }
  if (!card) return body.trim().slice(0, 1200);
  if (card.kind === 'work_card') return `协作卡片「${card.title}」：${card.fields.map((field: any) => `${field.label}：${field.value}${field.options?.length ? `（选项：${field.options.join('、')}）` : ''}`).join('；')}`;
  if (card.kind === 'form_answers') {
    const form = forms.get(card.formMessageId);
    return `品牌方提交表单：${(card.answers || []).map((answer: any) => `${form?.fields?.[answer.fieldIndex]?.label || `问题${answer.fieldIndex + 1}`}：${answer.value}`).join('；')}`;
  }
  if (card.kind === 'choice_answer') return `品牌方选择「${card.optionLabel}」${card.note ? `，补充：${card.note}` : ''}`;
  if (card.kind === 'choice') return `风格/需求选项「${card.title}」：${card.prompt}；${card.options.map((option: any) => option.label).join('、')}`;
  if (card.kind === 'proposal') return `方案提案「${card.title}」：A ${card.optionA}（${card.detailA}）；B ${card.optionB}（${card.detailB}）`;
  if (card.kind === 'decision') return `品牌方选择方案 ${card.option}${card.note ? `：${card.note}` : ''}`;
  if (card.kind === 'requirement_review') return `需求反馈：${card.decision}${card.note ? `，${card.note}` : ''}`;
  return '';
}

async function imageForModel(id: string) {
  const asset = protectedAssets.get(id) || await findMediaAsset(id);
  if (!asset || asset.kind !== 'image' || !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(asset.mimetype)) throw Object.assign(new Error('参考图不存在或不是支持的图片格式'), { status: 400 });
  let source: Buffer;
  if (asset.ossOriginalKey) source = (await getObjectFromOss(asset.ossOriginalKey)).content as Buffer;
  else if (asset.localOriginalPath) source = await readFile(asset.localOriginalPath);
  else throw Object.assign(new Error('参考图存储记录不完整'), { status: 404 });
  if (source.byteLength > 20 * 1024 * 1024) fail(`参考图「${asset.filename}」超过 20 MB，无法用于风格分析`, 413);
  const compressed = await sharp(source).rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 76, mozjpeg: true }).toBuffer();
  return { name: asset.filename, content: `data:image/jpeg;base64,${compressed.toString('base64')}` };
}

export async function generateAiStyleDirections(input: {
  conversationType: ConversationType;
  conversationId: string;
  description: string;
  referenceImageIds: string[];
  modelProfileId?: string;
}, user: AuthUserPayload): Promise<StyleResult> {
  if (!['customer_service', 'admin'].includes(user.role)) fail('只有客服可以生成视觉风格提案', 403);
  const activeConfig = input.modelProfileId ? await getEnabledAiModelProfileCredentials(input.modelProfileId, ['text', 'vision']) : await getDefaultEnabledAiConfig();
  if (!activeConfig) throw Object.assign(new Error(input.modelProfileId ? '所选图文理解模型不存在、未启用或能力不匹配' : 'AI 风格生成服务尚未配置，请在管理后台启用模型配置'), { status: input.modelProfileId ? 409 : 503 });
  const { baseUrl, apiKey, model } = activeConfig;

  const context = await conversationData(input.conversationType, input.conversationId, user);
  const rows = context.rows as Array<{ id: string; senderName: string; body: string }>;
  const forms = new Map<string, any>();
  for (const row of rows) { try { const card = parseCard(row.body); if (card?.kind === 'work_card') forms.set(row.id, card); } catch { /* Ignore malformed historical cards. */ } }
  const transcript = rows.map(row => {
    const text = cardText(row.body, forms);
    return text ? `${row.senderName}：${text}` : '';
  }).filter(Boolean).join('\n').slice(-24000);
  if (!transcript && !context.requirements && !input.description.trim()) fail('聊天记录、订单需求或补充说明至少需要一项', 400);

  const historyImageIds = new Set<string>();
  for (const row of rows) {
    // Support image URLs stored directly in older/imported chat messages as well as card attachments.
    for (const match of String(row.body).matchAll(/\/api\/upload\/(?:previews|assets)\/([a-zA-Z0-9_-]+)/g)) {
      if (match[1]) historyImageIds.add(match[1]);
    }
    try {
      const card: any = parseCard(row.body);
      for (const attachment of card?.attachments || []) { const id = imageId(String(attachment.url || '')); if (id) historyImageIds.add(id); }
      if (card?.kind === 'work_card') for (const attachment of card.attachments || []) { const id = imageId(String(attachment.url || '')); if (id) historyImageIds.add(id); }
    } catch { /* Ignore malformed historical cards. */ }
  }
  const imageIds = [...new Set(input.referenceImageIds)].slice(0, 6);
  const imageAssets = await Promise.all(imageIds.map(async id => {
    const asset = protectedAssets.get(id) || await findMediaAsset(id);
    if (!asset || (asset.ownerId !== user.id && !historyImageIds.has(id))) fail('你只能选择自己上传或当前会话中的参考图', 403);
    return imageForModel(id);
  }));
  const requestText = [
    `会话：${context.title}`,
    context.requirements ? `订单原始需求：\n${context.requirements}` : '',
    `聊天记录：\n${transcript || '暂无文字消息'}`,
    input.description.trim() ? `客服补充说明：\n${input.description.trim()}` : '',
    `参考图：${imageAssets.length ? imageAssets.map(image => image.name).join('、') : '当前无上传参考图'}`,
    '请综合以上信息，只依据明确内容定制色彩方向，不要臆造品牌信息。主题之间要有明显区别，避免相近色重复。',
  ].filter(Boolean).join('\n\n');
  const endpoint = openAiChatCompletionsEndpoint(baseUrl);
  const userContent: Array<Record<string, unknown>> = [{ type: 'text', text: requestText }, ...imageAssets.map(image => ({ type: 'image_url', image_url: { url: image.content, detail: 'high' } }))];
  const { response, data: result } = await fetchAiJson(endpoint, {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0.75, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: '你是资深品牌视觉设计师。根据用户聊天记录、订单需求和参考图生成正好 8 种有明显差异的配色风格提案。只返回 JSON：{"summary":"不超过120字的需求识别摘要","styles":[{"id":"style_1","name":"不超过16字的风格名","mood":"不超过24字的氛围描述","colors":[{"role":"主色","hex":"#112233"},{"role":"辅助色","hex":"#112233"},{"role":"背景色","hex":"#112233"},{"role":"点缀色","hex":"#112233"}]}]}。styles 必须正好 8 项，id 从 style_1 到 style_8，colors 正好 4 个；颜色必须是可用的六位 HEX。' },
      { role: 'user', content: userContent },
    ] }),
  }, 60000, { source: 'ai_style', operation: 'style_directions', model, configId: activeConfig.id,
    profileId: input.modelProfileId, referenceId: input.conversationId, apiKey });
  const raw = result?.choices?.[0]?.message?.content;
  const text = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map((part: any) => part?.text || '').join('') : '';
  if (!response.ok || !text) fail('AI 风格生成失败，请检查模型服务配置后重试', 502);
  let parsed: any;
  try { parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { fail('AI 返回内容无法解析，请重新生成', 502); }
  if (!parsed || typeof parsed.summary !== 'string' || !Array.isArray(parsed.styles) || parsed.styles.length !== 8) fail('AI 未返回完整的 8 种风格，请重新生成', 502);
  const styles = parsed.styles.map((style: any, index: number) => {
    if (typeof style?.name !== 'string' || typeof style?.mood !== 'string' || !Array.isArray(style.colors) || style.colors.length !== 4 || style.colors.some((color: any) => typeof color?.role !== 'string' || !validHex(color?.hex))) fail('AI 返回的配色格式不完整，请重新生成', 502);
    return { id: `style_${index + 1}`, name: style.name.slice(0, 20), mood: style.mood.slice(0, 40), colors: style.colors.map((color: any) => ({ role: String(color.role).slice(0, 12), hex: String(color.hex).toUpperCase() })) };
  });
  return { summary: String(parsed.summary).slice(0, 240), styles, model };
}
