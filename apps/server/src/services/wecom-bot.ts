import type { SiteMessageType } from '@design-review/shared';

const recentMessages = new Map<string, number>();

function escapeMarkdown(value: string) {
  return value.replace(/[\\`*_{}\[\]()#+\-.!|>]/g, '\\$&');
}

function messageHeading(type: SiteMessageType, title: string) {
  if (type === 'order') return `🧾 订单消息｜${title}`;
  if (type === 'review') return `📋 作品审核｜${title}`;
  if (type === 'dispute') return `⚠️ 订单纠纷｜${title}`;
  if (type === 'announcement') return `📢 平台公告｜${title}`;
  if (title.includes('提现')) return `💰 提现消息｜${title}`;
  return `🔔 平台通知｜${title}`;
}

export function pushWecomMessage(input: {
  type: SiteMessageType;
  title: string;
  content: string;
  link?: string;
  createdAt: string;
}) {
  const webhookUrl = String(process.env.WECHAT_WORK_WEBHOOK_URL || '').trim();
  if (!webhookUrl) return;

  const dedupeKey = `${input.type}\n${input.title}\n${input.content}`;
  const now = Date.now();
  for (const [key, timestamp] of recentMessages) {
    if (now - timestamp > 3000) recentMessages.delete(key);
  }
  if (now - (recentMessages.get(dedupeKey) || 0) < 3000) return;
  recentMessages.set(dedupeKey, now);

  const heading = messageHeading(input.type, escapeMarkdown(input.title));
  let content = [
    `### ${heading}`,
    `> ${escapeMarkdown(input.content)}`,
    `> 时间：${escapeMarkdown(new Date(input.createdAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }))}`,
    input.link ? `> 页面：${escapeMarkdown(input.link)}` : '',
  ].filter(Boolean).join('\n');
  while (Buffer.byteLength(content, 'utf8') > 4000) {
    content = [...content].slice(0, -50).join('') + '\n...(内容已截断)';
  }

  void fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ msgtype: 'markdown', markdown: { content } }),
    signal: AbortSignal.timeout(5000),
  }).then(async (response) => {
    const result = await response.json().catch(() => ({})) as { errcode?: number; errmsg?: string };
    if (!response.ok || result.errcode) {
      console.error('[WeCom] 群机器人消息发送失败:', result.errmsg || response.statusText);
    }
  }).catch((error: unknown) => {
    console.error('[WeCom] 群机器人消息发送失败:', error instanceof Error ? error.message : '网络请求异常');
  });
}
