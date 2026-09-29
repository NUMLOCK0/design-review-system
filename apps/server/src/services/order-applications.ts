import { writeOrderIncome } from './order-wallet-income.js';
import { designerWallets } from '../routes/wallet.js';
import type { PoolConnection } from 'mysql2/promise';
import type { DesignOrder, OrderApplication } from '@design-review/shared';
import type { AuthUserPayload } from '../middleware/auth.middleware.js';
import { dbPool } from '../config/database.js';
import { designOrderFromRow, persistDesignOrder, persistReviewTask } from '../config/persistence.js';
import { designOrders } from '../routes/design-orders.js';
import { tasks } from '../routes/review-tasks.js';
import { notifyUser } from '../routes/messages.js';
import { publicDesigner } from '../routes/designer-profiles.js';
import { calculateOrderSettlement } from '../utils/order-finance.js';
import { prepareClaimedOrder } from './prepare-claimed-order.js';

export class ApplicationError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
const fail = (message: string, status = 400): never => { throw new ApplicationError(message, status); };
const brandLink = (id: string) => `/advertiser/orders?orderId=${encodeURIComponent(id)}&tab=applications`;
const designerLink = '/applications';

export function canManageApplications(order: DesignOrder, user: AuthUserPayload) {
  return user.role === 'advertiser' && (order.creatorId === user.id ||
    (Boolean(user.isOrganizationAdmin) && Boolean(user.organizationId) && order.organizationId === user.organizationId));
}
function assertOpen(order: DesignOrder) {
  if (order.status !== 'open' || order.publicationStatus !== 'published' || order.paymentStatus !== 'deposit_paid' || order.claimedById || order.taskId)
    fail('订单已接单、下架或尚未支付定金，请刷新后重试', 409);
  if (new Date(order.deadline).getTime() <= Date.now()) fail('订单交付截止时间已过，无法申请或审批', 409);
}
async function transaction<T>(action: (connection: PoolConnection) => Promise<T>): Promise<T> {
  if (!dbPool) fail('数据库未连接，暂时无法处理接单申请', 503);
  const connection = await dbPool!.getConnection();
  try {
    await connection.beginTransaction();
    const result = await action(connection);
    await connection.commit();
    return result;
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); }
}
async function lockedOrder(connection: PoolConnection, id: string) {
  const [rows]: any = await connection.query('SELECT * FROM design_orders WHERE id=? FOR UPDATE', [id]);
  if (!rows[0]) fail('订单不存在', 404);
  return designOrderFromRow(rows[0]);
}
async function assertDesigner(connection: PoolConnection, id: string) {
  // Lock the designer too, so approvals for different orders cannot exceed their capacity.
  const [users]: any = await connection.query("SELECT id, name FROM users WHERE id=? AND role='designer' AND is_active=TRUE FOR UPDATE", [id]);
  if (!users[0]) fail('设计师账号不可用', 409);
  const [profiles]: any = await connection.query('SELECT * FROM designer_profiles WHERE user_id=? FOR UPDATE', [id]);
  const profile = profiles[0];
  const [works]: any = await connection.query("SELECT id FROM designer_portfolios WHERE designer_id=? AND status='published' AND TRIM(title)<>'' AND TRIM(cover_url)<>'' AND JSON_LENGTH(image_urls)>0 FOR UPDATE", [id]);
  if (!profile?.profile_completed || profile.public_status !== 'published' || !works.length)
    fail('请先完善并公开个人主页，至少提交一件审核通过的作品', 403);
  if (profile.availability_status === 'unavailable') fail('设计师已暂停接单', 409);
  const [active]: any = await connection.query("SELECT COUNT(*) AS count FROM design_orders WHERE claimed_by_id=? AND status IN ('claimed','in_progress','submitted')", [id]);
  if (Number(active[0].count) >= Number(profile.max_active_orders || 3)) fail('设计师当前接单数量已达上限', 409);
  return { name: users[0].name as string };
}
function validateQuote(body: any) {
  const raw = String(body.extraAmount ?? '0').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) > 99999999) fail('加价金额必须为非负金额，最多两位小数');
  const extraAmount = Number(raw);
  const message = String(body.message || '').trim();
  if (message.length > 2000 || (extraAmount > 0 && !message)) fail('加价时请说明原因，申请说明最多2000字');
  return { extraAmount, message };
}
function syncOrder(order: DesignOrder) {
  const index = designOrders.findIndex((item) => item.id === order.id);
  if (index >= 0) designOrders[index] = order;
}
function applicationFromRow(row: any): OrderApplication {
  const total = Number(row.quoted_total);
  const deposit = Number(row.deposit_amount || 0);
  const settlement = calculateOrderSettlement(total, Number(row.platform_commission_rate), Number(row.deposit_rate || 0.3), deposit);
  return {
    id: row.id, orderId: row.order_id, orderNo: row.order_no, orderTitle: row.order_title,
    designerId: row.designer_id, designerName: row.designer_name, invitationId: row.invitation_id || undefined,
    originalBudget: Number(row.original_budget), extraAmount: Number(row.extra_amount), quotedTotal: total,
    designerPayout: settlement.designerPayout, depositAmount: deposit, balanceAmount: settlement.balanceAmount,
    message: row.message, status: row.status, version: Number(row.version),
    reviewerId: row.reviewer_id || undefined, reviewComment: row.review_comment || undefined,
    reviewedAt: row.reviewed_at || undefined, taskId: row.task_id || undefined, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
const selectApplications = `SELECT a.*, o.order_no, o.title AS order_title, o.deposit_amount,
  o.deposit_rate, o.platform_commission_rate FROM order_applications a JOIN design_orders o ON o.id=a.order_id`;

export async function listOrderApplications(user: AuthUserPayload, orderId?: string) {
  if (!dbPool) fail('数据库未连接', 503);
  if (orderId) {
    const [orders]: any = await dbPool!.query('SELECT * FROM design_orders WHERE id=?', [orderId]);
    if (!orders[0] || !canManageApplications(designOrderFromRow(orders[0]), user)) fail('无权查看该订单的申请', 403);
  } else if (user.role !== 'designer') fail('无权查看设计师申请', 403);
  let [rows]: any = await dbPool!.query(`${selectApplications} WHERE ${orderId ? 'a.order_id' : 'a.designer_id'}=? ORDER BY a.created_at DESC`, [orderId || user.id]);
  for (const id of [...new Set<string>(rows.filter((row: any) => row.status === 'pending').map((row: any) => row.order_id))]) await closeUnavailableApplications(id);
  [rows] = await dbPool!.query(`${selectApplications} WHERE ${orderId ? 'a.order_id' : 'a.designer_id'}=? ORDER BY a.created_at DESC`, [orderId || user.id]);
  const applications = rows.map(applicationFromRow) as OrderApplication[];
  if (orderId) {
    const profiles = new Map<string, Awaited<ReturnType<typeof publicDesigner>>>();
    await Promise.all([...new Set(applications.map((item) => item.designerId))].map(async (id) => { profiles.set(id, await publicDesigner(id)); }));
    for (const item of applications) item.designer = profiles.get(item.designerId) || undefined;
  }
  return applications;
}

export async function submitOrderApplication(orderId: string, user: AuthUserPayload, body: any, invitationId?: string) {
  const result = await transaction(async (connection) => {
    const order = await lockedOrder(connection, orderId);
    assertOpen(order);
    if (order.creatorId === user.id) fail('不能申请自己发布的订单');
    const designer = await assertDesigner(connection, user.id);
    const quote = validateQuote(body);
    const [existing]: any = await connection.query('SELECT * FROM order_applications WHERE order_id=? AND designer_id=? FOR UPDATE', [order.id, user.id]);
    if (existing[0] && !['closed', 'withdrawn'].includes(existing[0].status)) fail('该订单已有申请，请在我的申请中查看或修改', 409);
    if (invitationId) {
      const [invites]: any = await connection.query('SELECT * FROM order_invitations WHERE id=? AND order_id=? AND designer_id=? FOR UPDATE', [invitationId, order.id, user.id]);
      if (!invites[0] || invites[0].status !== 'sent' || new Date(invites[0].expires_at).getTime() <= Date.now()) fail('邀请已失效', 409);
      await connection.query("UPDATE order_invitations SET status='accepted', responded_at=? WHERE id=?", [new Date().toISOString(), invitationId]);
    }
    const id = existing[0]?.id || `app_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const quotedTotal = Number((order.budget + quote.extraAmount).toFixed(2));
    if (quotedTotal > 9999999999.99) fail('最终报价超出允许范围');
    if (existing[0]) {
      await connection.query(`UPDATE order_applications SET designer_name=?,invitation_id=?,original_budget=?,extra_amount=?,quoted_total=?,message=?,portfolio_ids='[]',status='pending',version=version+1,reviewer_id=NULL,review_comment=NULL,reviewed_at=NULL,task_id=NULL,updated_at=? WHERE id=?`,
        [designer.name, invitationId || null, order.budget, quote.extraAmount, quotedTotal, quote.message, now, id]);
    } else await connection.query(`INSERT INTO order_applications
      (id,order_id,designer_id,designer_name,invitation_id,original_budget,extra_amount,quoted_total,message,portfolio_ids,status,version,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,'[]','pending',1,?,?)`,
    [id, order.id, user.id, designer.name, invitationId || null, order.budget, quote.extraAmount, quotedTotal, quote.message, now, now]);
    return { id, order };
  });
  await notifyUser(result.order.creatorId, { type: 'order', title: '收到接单申请', content: `${user.name}申请接取「${result.order.title}」，请查看作品与报价后确认。`, link: brandLink(orderId) });
  return (await listOrderApplications(user)).find((item) => item.id === result.id)!;
}

export async function handleOrderApplication(id: string, user: AuthUserPayload, action: 'update' | 'withdraw' | 'approve' | 'reject', body: any) {
  if (!dbPool) fail('数据库未连接', 503);
  const [found]: any = await dbPool!.query('SELECT order_id FROM order_applications WHERE id=?', [id]);
  if (!found[0]) fail('申请不存在', 404);
  const result = await transaction(async (connection) => {
    const order = await lockedOrder(connection, found[0].order_id);
    const [rows]: any = await connection.query('SELECT * FROM order_applications WHERE id=? FOR UPDATE', [id]);
    const application = rows[0];
    const isBrandAction = action === 'approve' || action === 'reject';
    if (isBrandAction ? !canManageApplications(order, user) : user.role !== 'designer' || application.designer_id !== user.id) fail('无权处理该申请', 403);
    if (action === 'approve' && application.status === 'approved' && order.acceptedApplicationId === id)
      return { order, task: undefined, closed: [] as any[], duplicate: true, wallet: undefined, designerId: application.designer_id };
    if (application.status !== 'pending') fail('该申请已经处理，请刷新', 409);
    if (!Number.isInteger(body.version) || Number(body.version) !== application.version) fail('申请或报价已更新，请刷新后重新确认', 409);
    if (action !== 'withdraw') assertOpen(order);
    const now = new Date().toISOString();
    let task;
    let wallet;
    let nextOrder = order;
    let closed: any[] = [];
    if (action === 'update') {
      await assertDesigner(connection, user.id);
      const quote = validateQuote(body);
      if (Number(application.original_budget) !== order.budget) fail('订单预算已变化，请重新查看订单', 409);
      if (order.budget + quote.extraAmount > 9999999999.99) fail('最终报价超出允许范围');
      await connection.query("UPDATE order_applications SET extra_amount=?,quoted_total=?,message=?,portfolio_ids='[]',version=version+1,updated_at=? WHERE id=?",
        [quote.extraAmount, Number((order.budget + quote.extraAmount).toFixed(2)), quote.message, now, id]);
    } else if (action === 'approve') {
      const designer = await assertDesigner(connection, application.designer_id);
      if (Number(application.original_budget) !== order.budget) fail('订单预算已变化，请重新确认报价', 409);
      nextOrder = { ...order, originalBudget: Number(application.original_budget), agreedExtraAmount: Number(application.extra_amount), acceptedApplicationId: id, budget: Number(application.quoted_total) };
      const settlement = calculateOrderSettlement(nextOrder.budget, nextOrder.platformCommissionRate, nextOrder.depositRate || 0.3, order.depositAmount);
      nextOrder.balanceAmount = settlement.balanceAmount;
      nextOrder.designerPayout = settlement.designerPayout;
      const prepared = prepareClaimedOrder(nextOrder, application.designer_id, designer.name);
      nextOrder = prepared.order;
      task = prepared.task;
      await persistDesignOrder(nextOrder, connection);
      await persistReviewTask(task, connection);
      wallet = await writeOrderIncome(connection, nextOrder, 'pending');
      await connection.query("UPDATE order_applications SET status='approved',reviewer_id=?,reviewed_at=?,task_id=?,version=version+1,updated_at=? WHERE id=?", [user.id, now, task.id, now, id]);
      const [others]: any = await connection.query("SELECT designer_id FROM order_applications WHERE order_id=? AND id<>? AND status='pending'", [order.id, id]);
      closed = others;
      await connection.query("UPDATE order_applications SET status='closed',review_comment='品牌方已选择其他设计师',version=version+1,updated_at=? WHERE order_id=? AND id<>? AND status='pending'", [now, order.id, id]);
      await connection.query("UPDATE order_invitations SET status='cancelled',responded_at=? WHERE order_id=? AND status IN ('queued','sent')", [now, order.id]);
    } else {
      const comment = action === 'reject' ? String(body.comment || '').trim() : '设计师撤回申请';
      if (action === 'reject' && (!comment || comment.length > 1000)) fail('请填写拒绝原因，最多1000字');
      await connection.query('UPDATE order_applications SET status=?,reviewer_id=?,review_comment=?,reviewed_at=?,version=version+1,updated_at=? WHERE id=?',
        [action === 'withdraw' ? 'withdrawn' : 'rejected', isBrandAction ? user.id : null, comment, now, now, id]);
    }
    return { order: nextOrder, task, closed, duplicate: false, wallet, designerId: application.designer_id };
  });
  if (result.duplicate) return { order: result.order, taskId: result.order.taskId };
  if (result.wallet) designerWallets[result.wallet.designerId] = result.wallet;
  if (result.task) { syncOrder(result.order); tasks.unshift(result.task); }
  if (action === 'approve' || action === 'reject') await notifyUser(result.designerId, {
    type: 'order', title: action === 'approve' ? '接单申请已通过' : '接单申请未通过',
    content: action === 'approve' ? `品牌方已确认「${result.order.title}」，最终总价 ¥${result.order.budget.toFixed(2)}，可以开始设计。` : `「${result.order.title}」申请未通过：${String(body.comment).trim()}`,
    link: action === 'approve' ? `/review-tasks?taskId=${encodeURIComponent(result.order.taskId!)}` : designerLink,
  });
  // The order message also invalidates other brand sessions after a decision.
  await notifyUser(result.order.creatorId, { type: 'order', title: action === 'update' ? '接单申请报价已更新' : action === 'withdraw' ? '接单申请已撤回' : '接单申请已处理', content: `「${result.order.title}」的接单申请已${({ update: '更新', withdraw: '撤回', approve: '通过', reject: '拒绝' })[action]}。`, link: brandLink(result.order.id) });
  for (const other of result.closed) await notifyUser(other.designer_id, { type: 'order', title: '接单申请已关闭', content: `「${result.order.title}」已确认其他设计师。`, link: designerLink });
  return { order: result.order, taskId: result.order.taskId };
}

export async function cancelOrderWithApplications(id: string, user: AuthUserPayload) {
  const result = await transaction(async (connection) => {
    const order = await lockedOrder(connection, id);
    if (!canManageApplications(order, user)) fail('无权取消该订单', 403);
    if (!['open', 'pending_service_review'].includes(order.status) || order.claimedById || order.taskId || order.publicationStatus === 'rejected') fail('当前订单不可关闭', 409);
    if (order.paymentStatus === 'deposit_pending' && order.depositOutTradeNo) fail('订单正在支付中，请稍后再关闭', 409);
    const depositPaid = ['deposit_paid', 'balance_pending', 'paid'].includes(order.paymentStatus || '');
    if (depositPaid && (order.status !== 'open' || !['published', 'pending_service_review'].includes(order.publicationStatus || ''))) fail('当前订单不可直接取消，请联系客服处理', 409);
    const now = new Date().toISOString();
    order.status = 'cancelled'; order.updatedAt = now;
    if (depositPaid && Number(order.depositAmount) > 0) order.depositRefundStatus = 'pending';
    await persistDesignOrder(order, connection);
    const [closed]: any = await connection.query("SELECT designer_id FROM order_applications WHERE order_id=? AND status='pending'", [id]);
    await connection.query("UPDATE order_applications SET status='closed',review_comment='订单已取消',version=version+1,updated_at=? WHERE order_id=? AND status='pending'", [now, id]);
    await connection.query("UPDATE order_invitations SET status='cancelled',responded_at=? WHERE order_id=? AND status IN ('queued','sent')", [now, id]);
    return { order, closed };
  });
  syncOrder(result.order);
  for (const other of result.closed) await notifyUser(other.designer_id, { type: 'order', title: '接单申请已关闭', content: `「${result.order.title}」已取消。`, link: designerLink });
  if (result.order.depositRefundStatus === 'pending') await notifyUser('u_rev_1', { type: 'order', title: '订单定金待原路退款', content: `请退还订单「${result.order.title}」定金 ¥${Number(result.order.depositAmount).toFixed(2)}。`, link: '/service/dashboard?tab=deposit_refund' });
  return result.order;
}

export async function returnAssignedOrderTask(id: string, user: AuthUserPayload) {
  if (!dbPool) fail('数据库未连接', 503);
  const [found]: any = await dbPool!.query('SELECT order_id FROM review_tasks WHERE id=?', [id]);
  if (!found[0]?.order_id) fail('任务不存在或未关联订单', 404);
  const result = await transaction(async (connection) => {
    const order = await lockedOrder(connection, found[0].order_id);
    const [rows]: any = await connection.query('SELECT * FROM review_tasks WHERE id=? FOR UPDATE', [id]);
    const row = rows[0];
    if (row.designer_id !== user.id || order.taskId !== id || order.claimedById !== user.id) fail('无权退回该任务', 403);
    if (!['draft', 'needs_revision'].includes(row.status) || order.paymentStatus === 'paid') fail('当前任务不可退回', 409);
    const task = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : row.payload_json;
    task.status = 'returned'; task.updatedAt = new Date().toISOString();
    const wallet = await writeOrderIncome(connection, order, 'failed');
    await persistReviewTask(task, connection);
    await connection.query("UPDATE order_applications SET status='closed',review_comment='设计师已退回任务',version=version+1,updated_at=? WHERE id=?", [task.updatedAt, order.acceptedApplicationId || '']);
    order.budget = order.originalBudget ?? order.budget;
    const settlement = calculateOrderSettlement(order.budget, order.platformCommissionRate, order.depositRate || 0.3, order.depositAmount);
    order.balanceAmount = settlement.balanceAmount; order.designerPayout = settlement.designerPayout;
    order.acceptedApplicationId = undefined; order.agreedExtraAmount = 0;
    order.status = 'open'; order.claimedById = undefined; order.claimedByName = undefined;
    order.claimedAt = undefined; order.taskId = undefined; order.updatedAt = task.updatedAt;
    await persistDesignOrder(order, connection);
    return { order, task, wallet };
  });
  syncOrder(result.order);
  const index = tasks.findIndex((task) => task.id === id);
  if (index >= 0) tasks[index] = result.task;
  designerWallets[result.wallet.designerId] = result.wallet;
  await notifyUser(result.order.creatorId, { type: 'order', title: '设计师已退回任务', content: `「${result.order.title}」已恢复原预算，可以重新选择设计师。`, link: brandLink(result.order.id) });
  return result.task;
}

async function closeUnavailableApplications(id: string) {
  const result = await transaction(async (connection) => {
    const order = await lockedOrder(connection, id);
    if (order.status === 'open' && order.publicationStatus === 'published' && order.paymentStatus === 'deposit_paid' && new Date(order.deadline).getTime() > Date.now()) return { order, closed: [] as any[] };
    const [closed]: any = await connection.query("SELECT designer_id FROM order_applications WHERE order_id=? AND status='pending' FOR UPDATE", [id]);
    await connection.query("UPDATE order_applications SET status='closed',review_comment='订单已关闭、下架或超过交付截止时间',version=version+1,updated_at=? WHERE order_id=? AND status='pending'", [new Date().toISOString(), id]);
    return { order, closed };
  });
  for (const item of result.closed) await notifyUser(item.designer_id, { type: 'order', title: '接单申请已关闭', content: `「${result.order.title}」已停止接单。`, link: designerLink });
}
