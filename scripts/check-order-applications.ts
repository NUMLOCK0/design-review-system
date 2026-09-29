import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { dbPool } from '../apps/server/src/config/database.js';
import { designOrderFromRow, persistDesignOrder } from '../apps/server/src/config/persistence.js';
import { calculateOrderSettlement } from '../apps/server/src/utils/order-finance.js';
import type { AuthUserPayload } from '../apps/server/src/middleware/auth.middleware.js';
import type { DesignOrder } from '../packages/shared/src/index.js';

// Isolated, short-lived database records; never sends test events to the group robot.
process.env.WECHAT_WORK_WEBHOOK_URL = '';
const prefix = `application_check_${randomUUID().slice(0, 8)}`;
const brand: AuthUserPayload = { id: `${prefix}_brand`, name: '申请流程检查品牌', email: `${prefix}@example.invalid`, role: 'advertiser' };
const designers = [1, 2].map((index): AuthUserPayload => ({ id: `${prefix}_d${index}`, name: `流程检查设计师${index}`, email: `${prefix}_d${index}@example.invalid`, role: 'designer' }));
const orderIds: string[] = [];
const now = new Date().toISOString();
async function createOrder(suffix: string) {
  const order: DesignOrder = { id: `${prefix}_${suffix}`, orderNo: `${prefix}_${suffix}`, title: '接单申请事务检查', category: '主图设计', platform: 'tmall', budget: 1000, platformCommissionRate: 0.15, designerPayout: 895, deadline: new Date(Date.now() + 86400000).toISOString(), urgency: 'normal', requirements: '检查使用', status: 'open', publicationStatus: 'published', paymentStatus: 'deposit_paid', depositRate: 0.3, depositAmount: 300, balanceAmount: 700, creatorId: brand.id, creatorName: brand.name, createdAt: now };
  orderIds.push(order.id);
  const connection = await dbPool!.getConnection();
  try { await persistDesignOrder(order, connection); } finally { connection.release(); }
  return order;
}
async function rejectAction(run: () => Promise<unknown>, status: number) {
  await assert.rejects(run, (error: any) => error.status === status);
}
async function main() {
  process.env.NODE_ENV = 'test';
  const { submitOrderApplication, handleOrderApplication, cancelOrderWithApplications, returnAssignedOrderTask, listOrderApplications } = await import('../apps/server/src/services/order-applications.js');
  const { settlePaidOrderIncome } = await import('../apps/server/src/services/order-wallet-income.js');
  assert.ok(dbPool, '需要已迁移的本地 MySQL');
  try {
    for (const user of [brand, ...designers]) await dbPool.query('INSERT INTO users (id,name,email,role,is_active) VALUES (?,?,?,?,TRUE)', [user.id, user.name, user.email, user.role]);
    for (const user of designers) {
      await dbPool.query('INSERT INTO user_roles (user_id,role,created_at) VALUES (?,?,?)', [user.id, user.role, now]);
      await dbPool.query(`INSERT INTO designer_profiles (user_id,categories,platforms,styles,public_status,profile_completed,availability_status,max_active_orders,updated_at) VALUES (?,'["主图设计"]','["tmall"]','[]','published',TRUE,'available',3,?)`, [user.id, now]);
      await dbPool.query(`INSERT INTO designer_portfolios (id,designer_id,title,cover_url,image_urls,status,created_at) VALUES (?,?,'检查作品','/application-check.png','["/application-check.png"]','published',?)`, [`${user.id}_work`, user.id, now]);
    }
    const order = await createOrder('approve');
    await rejectAction(() => submitOrderApplication(order.id, designers[0], { extraAmount: '-1' }), 400);
    await rejectAction(() => submitOrderApplication(order.id, designers[0], { extraAmount: '0.001' }), 400);
    await rejectAction(() => submitOrderApplication(order.id, designers[0], { extraAmount: 200 }), 400);
    const first = await submitOrderApplication(order.id, designers[0], { extraAmount: 200, message: '增加精修工作' });
    const second = await submitOrderApplication(order.id, designers[1], {});
    const [before]: any = await dbPool.query('SELECT status,task_id,budget FROM design_orders WHERE id=?', [order.id]);
    assert.equal(before[0].status, 'open'); assert.equal(before[0].task_id, null); assert.equal(Number(before[0].budget), 1000);
    await rejectAction(() => submitOrderApplication(order.id, designers[0], {}), 409);
    await rejectAction(() => listOrderApplications({ ...brand, id: `${prefix}_outsider` }, order.id), 403);
    await rejectAction(() => handleOrderApplication(first.id, { ...brand, id: `${prefix}_outsider` }, 'approve', { version: 1 }), 403);
    await handleOrderApplication(first.id, designers[0], 'update', { version: first.version, extraAmount: 200, message: '确认加价200元' });
    await rejectAction(() => handleOrderApplication(first.id, brand, 'approve', { version: first.version }), 409);
    await rejectAction(() => handleOrderApplication(first.id, designers[1], 'withdraw', { version: 2 }), 403);
    const results = await Promise.allSettled([
      handleOrderApplication(first.id, brand, 'approve', { version: 2 }),
      handleOrderApplication(second.id, brand, 'approve', { version: second.version }),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    const [after]: any = await dbPool.query('SELECT * FROM design_orders WHERE id=?', [order.id]);
    const approved = designOrderFromRow(after[0]);
    const chosenFirst = approved.acceptedApplicationId === first.id;
    assert.equal(approved.status, 'claimed'); assert.equal(approved.depositAmount, 300);
    assert.equal(approved.budget, chosenFirst ? 1200 : 1000);
    assert.equal(approved.balanceAmount, chosenFirst ? 900 : 700);
    assert.equal(approved.designerPayout, chosenFirst ? 1065 : 895);
    const [taskRows]: any = await dbPool.query('SELECT * FROM review_tasks WHERE order_id=?', [order.id]);
    assert.equal(taskRows.length, 1);
    const repeat = await handleOrderApplication(approved.acceptedApplicationId!, brand, 'approve', { version: 1 });
    assert.equal(repeat.taskId, approved.taskId);
    const [states]: any = await dbPool.query('SELECT status FROM order_applications WHERE order_id=?', [order.id]);
    assert.deepEqual(states.map((row: any) => row.status).sort(), ['approved', 'closed']);

    // Verify the price increase survives a database reload and reaches the wallet exactly once.
    const pricedOrder = await createOrder('priced');
    const pricedApplication = await submitOrderApplication(pricedOrder.id, designers[0], { extraAmount: 200, message: '加价检查' });
    const priced = await handleOrderApplication(pricedApplication.id, brand, 'approve', { version: 1 });
    const [pricedRows]: any = await dbPool.query('SELECT * FROM design_orders WHERE id=?', [pricedOrder.id]);
    const persistedPrice = designOrderFromRow(pricedRows[0]);
    assert.equal(persistedPrice.budget, 1200); assert.equal(persistedPrice.depositAmount, 300); assert.equal(persistedPrice.balanceAmount, 900); assert.equal(persistedPrice.designerPayout, 1065);
    const [beforeWallet]: any = await dbPool.query('SELECT * FROM designer_wallets WHERE designer_id=?', [designers[0].id]);
    const oldAvailable = Number(beforeWallet[0].available_balance);
    await dbPool.query("UPDATE design_orders SET payment_status='paid' WHERE id=?", [pricedOrder.id]);
    await settlePaidOrderIncome(pricedOrder.id); await settlePaidOrderIncome(pricedOrder.id);
    const [afterWallet]: any = await dbPool.query('SELECT * FROM designer_wallets WHERE designer_id=?', [designers[0].id]);
    assert.equal(Number(afterWallet[0].available_balance), oldAvailable + 1065);
    await rejectAction(() => returnAssignedOrderTask(priced.taskId!, designers[0]), 409);
    const returnOrder = await createOrder('return');
    const returnApplication = await submitOrderApplication(returnOrder.id, designers[1], { extraAmount: 100, message: '退单检查' });
    const returned = await handleOrderApplication(returnApplication.id, brand, 'approve', { version: 1 });
    await returnAssignedOrderTask(returned.taskId!, designers[1]);
    const [returnRows]: any = await dbPool.query('SELECT * FROM design_orders WHERE id=?', [returnOrder.id]);
    const restored = designOrderFromRow(returnRows[0]);
    assert.equal(restored.budget, 1000); assert.equal(restored.depositAmount, 300); assert.equal(restored.balanceAmount, 700); assert.equal(restored.acceptedApplicationId, undefined); assert.equal(restored.taskId, undefined);

    const cancelled = await createOrder('cancel');
    const cancelledApplication = await submitOrderApplication(cancelled.id, designers[0], {});
    await cancelOrderWithApplications(cancelled.id, brand);
    await rejectAction(() => handleOrderApplication(cancelledApplication.id, brand, 'approve', { version: 1 }), 409);
    const [closed]: any = await dbPool.query('SELECT status FROM order_applications WHERE id=?', [cancelledApplication.id]);
    assert.equal(closed[0].status, 'closed');
    const rejectedOrder = await createOrder('reject');
    const rejectedApplication = await submitOrderApplication(rejectedOrder.id, designers[0], {});
    await rejectAction(() => handleOrderApplication(rejectedApplication.id, brand, 'reject', { version: 1, comment: '' }), 400);
    await handleOrderApplication(rejectedApplication.id, brand, 'reject', { version: 1, comment: '作品风格不匹配' });
    const withdrawalOrder = await createOrder('withdraw');
    const withdrawn = await submitOrderApplication(withdrawalOrder.id, designers[1], {});
    await handleOrderApplication(withdrawn.id, designers[1], 'withdraw', { version: 1 });

    const invitationOrder = await createOrder('invite');
    const invitationId = `${prefix}_invite`;
    await dbPool.query(`INSERT INTO order_invitations (id,order_id,inviter_id,inviter_name,designer_id,designer_name,status,expires_at,created_at) VALUES (?,?,?,?,?,?,'sent',?,?)`, [invitationId, invitationOrder.id, brand.id, brand.name, designers[0].id, designers[0].name, new Date(Date.now()+86400000).toISOString(), now]);
    await submitOrderApplication(invitationOrder.id, designers[0], { extraAmount: 100, message: '邀请报价' }, invitationId);
    const [invited]: any = await dbPool.query('SELECT task_id,status FROM design_orders WHERE id=?', [invitationOrder.id]);
    assert.equal(invited[0].task_id, null); assert.equal(invited[0].status, 'open');
    assert.equal(calculateOrderSettlement(1200, 0.15, 0.3, 300).designerPayout, 1065);
    if (process.argv.includes('--http')) {
      const { default: jwt } = await import('../apps/server/node_modules/jsonwebtoken/index.js');
      const { JWT_SECRET } = await import('../apps/server/src/middleware/auth.middleware.js');
      const http = (user: AuthUserPayload, endpoint: string, method = 'GET', body?: unknown) => fetch(`http://127.0.0.1:8080/api${endpoint}`, {
        method, headers: { Authorization: `Bearer ${jwt.sign(user, JWT_SECRET, { expiresIn: '5m' })}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
      });
      const mine = await http(designers[0], '/order-applications/mine');
      assert.equal(mine.status, 200); assert.ok((await mine.json()).data.some((item: any) => item.orderId === invitationOrder.id));
      assert.equal((await http(brand, `/design-orders/${invitationOrder.id}/applications`)).status, 200);
      assert.equal((await http(designers[0], `/design-orders/${invitationOrder.id}/applications`)).status, 403);
      assert.equal((await http(brand, `/design-orders/${invitationOrder.id}/applications`, 'POST', {})).status, 403);
      assert.equal((await http(designers[0], `/design-orders/${invitationOrder.id}/claim`, 'POST', {})).status, 409);
      assert.equal((await http(designers[0], '/review-tasks', 'POST', { orderId: invitationOrder.id, isDraft: true })).status, 403);
      console.log('通过：真实 HTTP 路由认证、申请隔离、品牌方审批权限及旧接单/提审接口防绕过。');
    }
    console.log('通过：申请不建任务、资格与权限、金额校验、报价版本、并发唯一接单、重复审批、取消关闭、拒绝撤回、邀请申请、定金尾款计算、钱包幂等结算及退单恢复。');
  } finally {
    const users = [brand, ...designers].map((user) => user.id);
    for (const id of orderIds) {
      await dbPool!.query('DELETE FROM review_tasks WHERE order_id=?', [id]);
      await dbPool!.query('DELETE FROM order_invitations WHERE order_id=?', [id]);
      await dbPool!.query('DELETE FROM order_applications WHERE order_id=?', [id]);
      await dbPool!.query('DELETE FROM design_orders WHERE id=?', [id]);
    }
    for (const id of users) {
      await dbPool!.query('DELETE FROM site_messages WHERE recipient_id=?', [id]);
      await dbPool!.query('DELETE FROM designer_portfolios WHERE designer_id=?', [id]);
      await dbPool!.query('DELETE FROM designer_wallets WHERE designer_id=?', [id]);
      await dbPool!.query('DELETE FROM designer_profiles WHERE user_id=?', [id]);
      await dbPool!.query('DELETE FROM user_roles WHERE user_id=?', [id]);
      await dbPool!.query('DELETE FROM users WHERE id=?', [id]);
    }
    await dbPool!.end();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
