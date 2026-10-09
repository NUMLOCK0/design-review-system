import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { dbPool } from '../apps/server/src/config/database.js';

async function main() {
if (!dbPool) throw new Error('需要 MYSQL_URL 执行会话集成检查');
const marker = randomUUID().slice(0, 8);
const password = `Intake-${randomUUID()}`;
const users = [
  { id: `qa_service_${marker}`, role: 'customer_service', email: `qa.service.${marker}@example.invalid`, name: '测试客服' },
  { id: `qa_brand_${marker}`, role: 'advertiser', email: `qa.brand.${marker}@example.invalid`, name: '测试品牌方' },
  { id: `qa_other_${marker}`, role: 'advertiser', email: `qa.other.${marker}@example.invalid`, name: '其他品牌方' },
];
const base = process.env.INTAKE_QA_URL || 'http://127.0.0.1:8080/api';
const request = async (path: string, method = 'GET', body?: unknown, token?: string) => {
  const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() as any };
};
const expect = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
let sessionId = '';
try {
  const hash = await bcrypt.hash(password, 10);
  for (const user of users) {
    await dbPool.query('INSERT INTO users (id,name,email,password_hash,role,is_active) VALUES (?,?,?,?,?,TRUE)', [user.id, user.name, user.email, hash, user.role]);
    await dbPool.query('INSERT INTO user_roles (user_id,role) VALUES (?,?)', [user.id, user.role]);
  }
  const tokens: string[] = [];
  for (const user of users) {
    const login = await request('/auth/login', 'POST', { identifier: user.email, password, role: user.role === 'customer_service' ? 'staff' : 'advertiser' });
    expect(login.status === 200 && login.body.data?.token, '测试账号登录失败');
    tokens.push(login.body.data.token);
  }
  const created = await request('/intake-sessions', 'POST', { title: '测试分享会话' }, tokens[0]);
  expect(created.status === 201, `创建会话失败：${created.status}`);
  sessionId = created.body.data.id;
  const invitation = await request(`/intake-sessions/${sessionId}/invite`, 'POST', {}, tokens[0]);
  expect(invitation.status === 200 && invitation.body.data.path.includes('/pages/invite/join?token='), '小程序邀请路径无效');
  const token = invitation.body.data.token;
  const rotated = await request(`/intake-sessions/${sessionId}/invite`, 'POST', {}, tokens[0]);
  expect(rotated.status === 200 && rotated.body.data.token !== token, '重新生成邀请失败');
  const expired = await request('/intake-sessions/join', 'POST', { token }, tokens[1]);
  expect(expired.status === 410, '旧邀请应失效');
  const activeToken = rotated.body.data.token;
  const badCode = await request(`/intake-sessions/${sessionId}/invite-code`, 'POST', { token }, tokens[0]);
  expect(badCode.status === 410, '旧邀请不能生成小程序码');
  const blocked = await request(`/intake-sessions/${sessionId}`, 'GET', undefined, tokens[1]);
  expect(blocked.status === 404, '加入前不能访问会话');
  const joined = await request('/intake-sessions/join', 'POST', { token: activeToken }, tokens[1]);
  expect(joined.status === 200 && joined.body.data.id === sessionId, '邀请加入失败');
  const joinedAgain = await request('/intake-sessions/join', 'POST', { token: activeToken }, tokens[1]);
  expect(joinedAgain.status === 200, '同一成员重复打开邀请应幂等');
  const rejected = await request('/intake-sessions/join', 'POST', { token: activeToken }, tokens[2]);
  expect(rejected.status === 409, '第二位接收者不能加入');
  const outsiderRead = await request(`/intake-sessions/${sessionId}/messages`, 'GET', undefined, tokens[2]);
  expect(outsiderRead.status === 404, '非成员不能读取消息');
  const messageId = randomUUID();
  const sent = await request(`/intake-sessions/${sessionId}/messages`, 'POST', { clientMessageId: messageId, body: '您好，请介绍一下这次的设计需求。' }, tokens[0]);
  expect(sent.status === 201 && sent.body.data.seq === 1, '客服发消息失败');
  const retry = await request(`/intake-sessions/${sessionId}/messages`, 'POST', { clientMessageId: messageId, body: '您好，请介绍一下这次的设计需求。' }, tokens[0]);
  expect(retry.status === 200 && retry.body.data.id === sent.body.data.id, '消息重试应幂等');
  const received = await request(`/intake-sessions/${sessionId}/messages`, 'GET', undefined, tokens[1]);
  expect(received.status === 200 && received.body.data.messages.length === 1, '品牌方收消息失败');
  const invalid = await request(`/intake-sessions/${sessionId}/messages`, 'POST', { clientMessageId: randomUUID(), body: '' }, tokens[1]);
  expect(invalid.status === 400, '空消息应拒绝');
  console.log('✅ 邀请会话：创建、分享路径、加入/重复打开、独占、权限、消息幂等与校验通过');
} finally {
  if (sessionId) { await dbPool.query('DELETE FROM intake_messages WHERE session_id=?', [sessionId]); await dbPool.query('DELETE FROM intake_sessions WHERE id=?', [sessionId]); }
  for (const user of users) { await dbPool.query('DELETE FROM user_roles WHERE user_id=?', [user.id]); await dbPool.query('DELETE FROM users WHERE id=?', [user.id]); }
  await dbPool.end();
}

}
void main();
