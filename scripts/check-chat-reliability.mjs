/** Integration check against the running API and a temporary order; cleans up its own rows. */
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

const serverRequire = createRequire(resolve('apps/server/package.json'));
const webRequire = createRequire(resolve('apps/web/package.json'));
serverRequire('dotenv').config({ path: resolve('apps/server/.env') });
const mysql = serverRequire('mysql2/promise');
const jwt = serverRequire('jsonwebtoken');
const { io } = webRequire('socket.io-client');
const base = process.env.CHAT_TEST_API_URL || 'http://localhost:8080';
if (!process.env.MYSQL_URL || !process.env.JWT_SECRET) throw new Error('缺少 MYSQL_URL 或 JWT_SECRET');
const pool = mysql.createPool({ uri: process.env.MYSQL_URL, connectTimeout: 30000 });
const id = `chat_test_${randomUUID()}`;
const sockets = [];

function assert(value, message) { if (!value) throw new Error(message); }
function token(user) { return jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, process.env.JWT_SECRET, { expiresIn: '5m' }); }
async function api(path, auth, options = {}) {
  const response = await fetch(`${base}/api/chat${path}`, {
    ...options,
    headers: { authorization: `Bearer ${auth}`, 'content-type': 'application/json', ...options.headers },
  });
  return { status: response.status, body: await response.json() };
}
async function connect(auth) {
  const ticketResponse = await api('/socket-ticket', auth, { method: 'POST' });
  assert(ticketResponse.status === 200, '获取连接凭证失败');
  const socket = io(base, { transports: ['websocket'], reconnection: false, timeout: 10000, auth: { ticket: ticketResponse.body.data.ticket } });
  sockets.push(socket);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Socket.IO 连接超时')), 12000);
    socket.once('connect', () => { clearTimeout(timer); resolve(); });
    socket.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
  });
  return socket;
}

try {
  const [users] = await pool.query("SELECT id, email, name, role FROM users WHERE email IN ('advertiser01@cozi.com', 'designer01@cozi.com', 'customer_service01@cozi.com', 'customer_service02@cozi.com')");
  const advertiser = users.find((user) => user.role === 'advertiser');
  const designer = users.find((user) => user.role === 'designer');
  const service = users.find((user) => user.role === 'customer_service');
  const nextService = users.find((user) => user.role === 'customer_service' && user.id !== service?.id);
  assert(advertiser && designer && service && nextService, '测试账号不存在');
  await pool.query(`INSERT INTO design_orders
    (id, order_no, title, category, platform, budget, status, creator_id, creator_name, claimed_by_id, claimed_by_name, created_at)
    VALUES (?, ?, '聊天可靠性临时检查', 'test', 'test', 1, 'claimed', ?, ?, ?, ?, ?)`,
    [id, id, advertiser.id, advertiser.name, designer.id, designer.name, new Date().toISOString()]);
  const senderToken = token(advertiser);
  const recipientToken = token(designer);
  const serviceToken = token(service);
  const nextServiceToken = token(nextService);
  const sender = await connect(senderToken);
  const recipient = await connect(recipientToken);
  const clientMessageId = randomUUID();
  const event = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('接收方未收到实时通知')), 45000);
    recipient.once('chat:message', (message) => { clearTimeout(timer); resolve(message); });
  });
  const ack = await new Promise((resolve, reject) => sender.timeout(45000).emit('chat:send',
    { orderId: id, clientMessageId, body: '可靠性检查 A' },
    (error, result) => error ? reject(error) : resolve(result)));
  assert(ack.ok && ack.message.seq === 1, '发送确认失败');
  assert((await event).id === ack.message.id, '实时消息与落库消息不一致');
  const duplicate = await api(`/orders/${id}/messages`, senderToken, { method: 'POST', body: JSON.stringify({ clientMessageId, body: '可靠性检查 A' }) });
  assert(duplicate.status === 200 && duplicate.body.data.id === ack.message.id, '重试未返回原消息');
  const [count] = await pool.query('SELECT COUNT(*) AS n FROM chat_messages WHERE order_id=?', [id]);
  assert(count[0].n === 1, '重复写入了消息');
  recipient.disconnect();
  const second = await api(`/orders/${id}/messages`, senderToken, { method: 'POST', body: JSON.stringify({ clientMessageId: randomUUID(), body: '可靠性检查 B' }) });
  assert(second.status === 201 && second.body.data.seq === 2, '断线期间消息保存失败');
  const history = await api(`/orders/${id}/messages?afterSeq=1`, recipientToken);
  assert(history.status === 200 && history.body.data.messages.length === 1 && history.body.data.messages[0].id === second.body.data.id, '断线补拉失败');
  const list = await api('/conversations', senderToken);
  assert(list.status === 200 && list.body.data.some((item) => item.orderId === id), '订单会话列表缺少当前订单');
  const order = await api(`/orders/${id}`, recipientToken);
  assert(order.status === 200 && order.body.data.orderNo === id && order.body.data.creatorName === advertiser.name, '订单协作摘要无效');
  const serviceList = await api('/conversations', serviceToken);
  assert(serviceList.status === 200 && serviceList.body.data.some((item) => item.orderId === id), '客服会话列表缺少当前订单');
  const workCardBody = 'COZI_CHAT_CARD_V1:' + JSON.stringify({ kind: 'work_card', templateId: 'revision', title: '临时改稿卡', fields: [{ label: '修改点', value: '放大标题' }], attachments: [] });
  const workCard = await api(`/orders/${id}/messages`, serviceToken, { method: 'POST', body: JSON.stringify({ clientMessageId: randomUUID(), body: workCardBody }) });
  assert(workCard.status === 201, '客服协作卡片发送失败');
  const workCardHistory = await api(`/orders/${id}/messages?afterSeq=2`, recipientToken);
  assert(workCardHistory.status === 200 && workCardHistory.body.data.messages.some((item) => item.id === workCard.body.data.id), '设计师无法查看客服卡片');
  const snapshotBody = 'COZI_CHAT_CARD_V1:' + JSON.stringify({ kind: 'work_card', templateId: 'contract_snapshot', title: '临时需求快照', fields: [{ label: '范围', value: '一张主图' }], attachments: [] });
  const snapshot = await api(`/orders/${id}/messages`, serviceToken, { method: 'POST', body: JSON.stringify({ clientMessageId: randomUUID(), body: snapshotBody }) });
  assert(snapshot.status === 201, '客服生成需求快照失败');
  const ackBody = 'COZI_CHAT_CARD_V1:' + JSON.stringify({ kind: 'snapshot_ack', snapshotMessageId: snapshot.body.data.id, decision: 'confirmed', note: '' });
  const acknowledgement = await api(`/orders/${id}/messages`, senderToken, { method: 'POST', body: JSON.stringify({ clientMessageId: randomUUID(), body: ackBody }) });
  assert(acknowledgement.status === 201, '品牌方确认需求快照失败');
  const repeatAck = await api(`/orders/${id}/messages`, senderToken, { method: 'POST', body: JSON.stringify({ clientMessageId: randomUUID(), body: ackBody }) });
  assert(repeatAck.status === 409, '重复确认同一快照应被拒绝');
  const prefix = 'COZI_CHAT_CARD_V1:';
  const proposalBody = prefix + JSON.stringify({ kind: 'proposal', title: '临时测试方案', optionA: '清新', optionB: '质感', detailA: '清晰的商品信息', detailB: '更强的品牌质感' });
  const wrongProposal = await api(`/orders/${id}/messages`, senderToken, { method: 'POST', body: JSON.stringify({ clientMessageId: randomUUID(), body: proposalBody }) });
  assert(wrongProposal.status === 403, '品牌方不应代替设计师提交方案');
  const proposal = await api(`/orders/${id}/messages`, recipientToken, { method: 'POST', body: JSON.stringify({ clientMessageId: randomUUID(), body: proposalBody }) });
  assert(proposal.status === 201, '设计师提交方案失败');
  const decisionBody = prefix + JSON.stringify({ kind: 'decision', proposalMessageId: proposal.body.data.id, option: 'A', note: '选择清新方案' });
  const decision = await api(`/orders/${id}/messages`, senderToken, { method: 'POST', body: JSON.stringify({ clientMessageId: randomUUID(), body: decisionBody }) });
  assert(decision.status === 201, '品牌方选择方案失败');
  const repeatedDecision = await api(`/orders/${id}/messages`, senderToken, { method: 'POST', body: JSON.stringify({ clientMessageId: randomUUID(), body: decisionBody }) });
  assert(repeatedDecision.status === 409, '重复选择方案应被拒绝');
  const reviewBody = prefix + JSON.stringify({ kind: 'requirement_review', decision: 'confirmed', note: '' });
  const review = await api(`/orders/${id}/messages`, recipientToken, { method: 'POST', body: JSON.stringify({ clientMessageId: randomUUID(), body: reviewBody }) });
  assert(review.status === 201, '设计师确认需求失败');
  const recallBody = prefix + JSON.stringify({ kind: 'recall', targetMessageId: ack.message.id });
  const recall = await api(`/orders/${id}/messages`, senderToken, { method: 'POST', body: JSON.stringify({ clientMessageId: randomUUID(), body: recallBody }) });
  assert(recall.status === 201, '发送者撤回消息失败');
  const repeatedRecall = await api(`/orders/${id}/messages`, senderToken, { method: 'POST', body: JSON.stringify({ clientMessageId: randomUUID(), body: recallBody }) });
  assert(repeatedRecall.status === 409, '重复撤回应被拒绝');
  const transfer = await api(`/orders/${id}/transfer`, serviceToken, { method: 'POST', body: JSON.stringify({ toServiceId: nextService.id, note: '集成检查交接' }) });
  assert(transfer.status === 200 && transfer.body.data.assignedServiceId === nextService.id, '客服转接失败');
  const oldServiceMessage = await api(`/orders/${id}/messages`, serviceToken, { method: 'POST', body: JSON.stringify({ clientMessageId: randomUUID(), body: '转出客服不应继续发送' }) });
  assert(oldServiceMessage.status === 403, '转出客服仍能发送消息');
  const nextServiceMessage = await api(`/orders/${id}/messages`, nextServiceToken, { method: 'POST', body: JSON.stringify({ clientMessageId: randomUUID(), body: '接手客服可以继续接待' }) });
  assert(nextServiceMessage.status === 201, '接手客服无法发送消息');
  const transfers = await api(`/orders/${id}/transfers`, serviceToken);
  assert(transfers.status === 200 && transfers.body.data[0]?.toServiceName === nextService.name, '转接记录未保存');
  console.log('聊天检查通过：落库确认、实时接收、去重、断线补拉、客服会话与卡片、需求确认、消息撤回、权限与客服转接。');
} finally {
  sockets.forEach((socket) => socket.disconnect());
  try {
    await pool.query("DELETE FROM service_conversation_transfers WHERE conversation_type='order' AND conversation_id=?", [id]);
    await pool.query("DELETE FROM service_conversation_assignments WHERE conversation_type='order' AND conversation_id=?", [id]);
    await pool.query('DELETE FROM chat_messages WHERE order_id=?', [id]);
    await pool.query('DELETE FROM chat_conversations WHERE order_id=?', [id]);
    await pool.query('DELETE FROM design_orders WHERE id=?', [id]);
  } finally { await pool.end(); }
}
