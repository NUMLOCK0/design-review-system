import type { AuthUserPayload } from '../middleware/auth.middleware.js';
import { getChatOrder, requireChatDatabase } from './chat.js';

export type ConversationKind = 'order' | 'intake';

export async function getChatUnreadSummary(user: AuthUserPayload) {
  const pool = requireChatDatabase();
  const [orderRows]: any = await pool.query(`
    SELECT m.order_id AS conversationId, COUNT(*) AS unreadCount
      FROM chat_messages m
      JOIN design_orders o ON o.id=m.order_id
      LEFT JOIN chat_read_cursors r ON r.user_id=? AND r.conversation_type='order' AND r.conversation_id=m.order_id
     WHERE (o.creator_id=? OR o.claimed_by_id=?) AND m.sender_id<>? AND m.seq>COALESCE(r.last_read_seq, 0)
     GROUP BY m.order_id`, [user.id, user.id, user.id, user.id]);
  const [intakeRows]: any = await pool.query(`
    SELECT m.session_id AS conversationId, COUNT(*) AS unreadCount
      FROM intake_messages m
      JOIN intake_sessions s ON s.id=m.session_id
      LEFT JOIN chat_read_cursors r ON r.user_id=? AND r.conversation_type='intake' AND r.conversation_id=m.session_id
     WHERE (s.creator_id=? OR s.guest_id=?) AND m.sender_id<>? AND m.seq>COALESCE(r.last_read_seq, 0)
     GROUP BY m.session_id`, [user.id, user.id, user.id, user.id]);
  const conversations = [
    ...orderRows.map((row: any) => ({ kind: 'order' as const, conversationId: String(row.conversationId), unreadCount: Number(row.unreadCount) })),
    ...intakeRows.map((row: any) => ({ kind: 'intake' as const, conversationId: String(row.conversationId), unreadCount: Number(row.unreadCount) })),
  ];
  return { unreadCount: conversations.reduce((total, item) => total + item.unreadCount, 0), conversations };
}

export async function markChatRead(user: AuthUserPayload, kind: ConversationKind, conversationId: string, lastReadSeq: number) {
  const pool = requireChatDatabase();
  let latestSeq = 0;
  if (kind === 'order') {
    await getChatOrder(conversationId, user);
    const [rows]: any = await pool.query('SELECT last_seq FROM chat_conversations WHERE order_id=? LIMIT 1', [conversationId]);
    latestSeq = Number(rows[0]?.last_seq || 0);
  } else {
    const [rows]: any = await pool.query('SELECT last_seq FROM intake_sessions WHERE id=? AND (creator_id=? OR guest_id=?) LIMIT 1', [conversationId, user.id, user.id]);
    if (!rows[0]) throw Object.assign(new Error('会话不存在或无权访问'), { status: 404 });
    latestSeq = Number(rows[0].last_seq || 0);
  }
  const acceptedSeq = Math.min(lastReadSeq, latestSeq);
  await pool.query(`INSERT INTO chat_read_cursors (user_id, conversation_type, conversation_id, last_read_seq)
    VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE last_read_seq=GREATEST(last_read_seq, VALUES(last_read_seq))`,
  [user.id, kind, conversationId, acceptedSeq]);
  return { kind, conversationId, lastReadSeq: acceptedSeq };
}
