import { Router } from 'express';
import crypto from 'crypto';
import type { DesignerProfile, OrderInvitation } from '@design-review/shared';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { dbPool } from '../config/database.js';
import { designOrders } from './design-orders.js';
import { notifyUser } from './messages.js';
import { tasks } from './review-tasks.js';
import { submitOrderApplication } from '../services/order-applications.js';

export const invitationsRouter = Router();
const memoryInvitations: OrderInvitation[] = [];
const fallbackProfiles: DesignerProfile[] = [];

const parseJson = <T,>(value: unknown, fallback: T): T => {
  if (!value) return fallback;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};
const canManage = (order: typeof designOrders[number], user: Express.Request['user']) => user?.role === 'admin' || order.creatorId === user?.id || (!!user?.organizationId && order.organizationId === user.organizationId && user.isOrganizationAdmin);
const activeStatuses = new Set(['queued', 'sent']);

async function invitationRows(where: string, params: unknown[]): Promise<OrderInvitation[]> {
  if (!dbPool) return memoryInvitations.filter((item) => where.includes('designer_id') ? item.designerId === params[0] : item.orderId === params[0]);
  const [rows]: any = await dbPool.query(`SELECT i.*, o.order_no, o.title AS order_title FROM order_invitations i JOIN design_orders o ON o.id = i.order_id WHERE ${where} ORDER BY i.created_at DESC`, params);
  return rows.map((row: any): OrderInvitation => ({
    id: row.id, orderId: row.order_id, orderNo: row.order_no, orderTitle: row.order_title, inviterId: row.inviter_id, inviterName: row.inviter_name,
    designerId: row.designer_id, designerName: row.designer_name, status: row.status, inviteMessage: row.invite_message || undefined,
    recommendationScore: row.recommendation_score ?? undefined, recommendationReasons: parseJson(row.recommendation_reasons, []),
    expiresAt: row.expires_at, sentAt: row.sent_at || undefined, respondedAt: row.responded_at || undefined, createdAt: row.created_at
  }));
}

async function expireInvitations() {
  const now = new Date().toISOString();
  if (dbPool) await dbPool.query(`UPDATE order_invitations SET status='expired', responded_at=? WHERE status IN ('queued','sent') AND expires_at < ?`, [now, now]);
  else memoryInvitations.filter((item) => activeStatuses.has(item.status) && item.expiresAt < now).forEach((item) => { item.status = 'expired'; item.respondedAt = now; });
}

async function profiles(orderId: string, keyword = '') {
  const order = designOrders.find((item) => item.id === orderId);
  if (!order) return [];
  const invited = new Set((await invitationRows('i.order_id = ?', [orderId])).filter((item) => activeStatuses.has(item.status)).map((item) => item.designerId));
  let result: DesignerProfile[] = fallbackProfiles;
  if (dbPool) {
    const [rows]: any = await dbPool.query(`SELECT u.id, u.name, u.avatar_url, p.categories, p.platforms, p.styles, p.min_budget, p.max_active_orders, p.availability_status, p.portfolio_urls, p.headline, p.bio, p.industries, p.years_experience, p.public_status, p.profile_completed
      FROM users u JOIN user_roles ur ON ur.user_id COLLATE utf8mb4_unicode_ci = u.id COLLATE utf8mb4_unicode_ci
      JOIN designer_profiles p ON p.user_id COLLATE utf8mb4_unicode_ci = u.id COLLATE utf8mb4_unicode_ci
      WHERE ur.role = 'designer' AND p.public_status = 'published' AND p.profile_completed = TRUE`);
    result = rows.map((row: any) => ({
      userId: row.id, name: row.name, avatarUrl: row.avatar_url || undefined, headline: row.headline || undefined, bio: row.bio || undefined, industries: parseJson(row.industries, []), yearsExperience: Number(row.years_experience || 0), publicStatus: row.public_status, profileCompleted: Boolean(row.profile_completed), categories: parseJson(row.categories, []), platforms: parseJson(row.platforms, []), styles: parseJson(row.styles, []),
      minBudget: Number(row.min_budget || 0), maxActiveOrders: Number(row.max_active_orders || 3), availabilityStatus: row.availability_status, portfolioUrls: parseJson(row.portfolio_urls, []), activeOrderCount: 0, qualityScore: 85, onTimeRate: 92
    }));
  }
  const query = keyword.trim().toLowerCase();
  return result.map((profile) => {
    const myTasks = (awaitedTasks(profile.userId));
    const activeOrderCount = myTasks.filter((task) => ['draft', 'pending', 'in_review', 'needs_revision'].includes(task.status)).length;
    const completed = myTasks.filter((task) => ['approved', 'archived'].includes(task.status));
    const qualityScore = completed.length ? Math.round((completed.filter((task) => task.rejectedCount === 0).length / completed.length) * 100) : 85;
    const onTimeRate = completed.length ? Math.round((completed.filter((task) => !task.completedAt || !order.deadline || new Date(task.completedAt) <= new Date(order.deadline)).length / completed.length) * 100) : 92;
    const categoryMatch = profile.categories.includes(order.category);
    const platformMatch = profile.platforms.includes(order.platform);
    const styleMatches = profile.styles.filter((style) => `${order.title} ${order.requirements}`.includes(style));
    const prior = myTasks.filter((task) => task.advertiserId === order.creatorId).length;
    const capacity = Math.max(0, profile.maxActiveOrders - activeOrderCount);
    const score = Math.max(0, Math.min(100, (categoryMatch ? 25 : 0) + (platformMatch ? 15 : 0) + Math.min(10, styleMatches.length * 5) + Math.round(qualityScore * .2) + Math.round(onTimeRate * .15) + Math.round(Math.min(1, capacity / Math.max(1, profile.maxActiveOrders)) * 10) + Math.min(5, prior * 2) - (profile.availabilityStatus === 'busy' ? 5 : 0)));
    const reasons = [categoryMatch && `擅长${order.category}`, platformMatch && `${order.platform === 'tmall' ? '天猫' : order.platform}项目经验匹配`, `历史质量分${qualityScore}`, `准时交付率${onTimeRate}%`, capacity > 0 && `当前可接${capacity}单`].filter(Boolean) as string[];
    return { ...profile, activeOrderCount, qualityScore, onTimeRate, recommendationScore: score, recommendationReasons: reasons };
  }).filter((profile) => profile.userId !== order.creatorId && profile.availabilityStatus !== 'unavailable' && profile.activeOrderCount < profile.maxActiveOrders && !invited.has(profile.userId) && (!profile.minBudget || order.budget >= profile.minBudget) && (!query || `${profile.name} ${profile.categories.join(' ')} ${profile.platforms.join(' ')} ${profile.styles.join(' ')}`.toLowerCase().includes(query))).sort((a, b) => (b.recommendationScore || 0) - (a.recommendationScore || 0));
}

function awaitedTasks(designerId: string) { return tasks.filter((task) => task.designerId === designerId); }

invitationsRouter.get('/design-orders/:id/recommended-designers', authenticate, requireRoles('advertiser', 'admin'), async (req, res, next) => {
  try {
    await expireInvitations();
    const order = designOrders.find((item) => item.id === req.params.id);
    if (!order) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
    if (!canManage(order, req.user)) return res.status(403).json({ code: 403, success: false, message: '无权邀请该订单的设计师' });
    if (order.status !== 'open' || order.publicationStatus !== 'published') return res.status(400).json({ code: 400, success: false, message: '只有已发布且开放接单的订单才能邀请设计师' });
    const list = await profiles(order.id, String(req.query.keyword || ''));
    return res.json({ code: 200, success: true, data: list.slice(0, Math.min(Number(req.query.limit) || 12, 30)), timestamp: Date.now() });
  } catch (error) { next(error); }
});

invitationsRouter.post('/design-orders/:id/invitations', authenticate, requireRoles('advertiser', 'admin'), async (req, res, next) => {
  try {
    await expireInvitations();
    const order = designOrders.find((item) => item.id === req.params.id);
    if (!order) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
    if (!canManage(order, req.user)) return res.status(403).json({ code: 403, success: false, message: '无权邀请该订单的设计师' });
    if (order.status !== 'open' || order.publicationStatus !== 'published') return res.status(400).json({ code: 400, success: false, message: '只有已发布且开放接单的订单才能邀请设计师' });
    const designerIds = [...new Set(Array.isArray(req.body?.designerIds) ? req.body.designerIds.map(String) : [])].slice(0, 5);
    if (!designerIds.length) return res.status(400).json({ code: 400, success: false, message: '请至少选择一位设计师' });
    const current = await invitationRows('i.order_id = ?', [order.id]);
    if (current.filter((item) => activeStatuses.has(item.status)).length + designerIds.length > 5) return res.status(400).json({ code: 400, success: false, message: '每个订单最多同时邀请5位设计师' });
    const recommended = await profiles(order.id);
    const selected = recommended.filter((profile) => designerIds.includes(profile.userId));
    if (selected.length !== designerIds.length) return res.status(400).json({ code: 400, success: false, message: '存在不可邀请或已邀请的设计师' });
    const now = new Date().toISOString();
    const status = order.publicationStatus === 'published' ? 'sent' : 'queued';
    const expiresAt = new Date(Date.now() + Math.min(Math.max(Number(req.body?.expiresInHours) || 72, 1), 168) * 3600000).toISOString();
    const created = selected.map((profile): OrderInvitation => ({ id: `inv_${crypto.randomUUID()}`, orderId: order.id, orderNo: order.orderNo, orderTitle: order.title, inviterId: req.user!.id, inviterName: req.user!.name, designerId: profile.userId, designerName: profile.name, status, inviteMessage: String(req.body?.message || '').slice(0, 500) || undefined, recommendationScore: profile.recommendationScore, recommendationReasons: profile.recommendationReasons, expiresAt, sentAt: status === 'sent' ? now : undefined, createdAt: now }));
    if (dbPool) for (const item of created) await dbPool.query(`INSERT INTO order_invitations (id, order_id, inviter_id, inviter_name, designer_id, designer_name, status, invite_message, recommendation_score, recommendation_reasons, expires_at, sent_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [item.id, item.orderId, item.inviterId, item.inviterName, item.designerId, item.designerName, item.status, item.inviteMessage || null, item.recommendationScore || null, JSON.stringify(item.recommendationReasons || []), item.expiresAt, item.sentAt || null, item.createdAt]);
    else memoryInvitations.unshift(...created);
    if (status === 'sent') created.forEach((item) => notifyUser(item.designerId, { type: 'order', title: '收到设计订单邀请', content: `${item.inviterName}邀请你参与「${order.title}」。`, link: '/invitations' }));
    return res.status(201).json({ code: 200, success: true, message: status === 'sent' ? '邀请已发送' : '订单审核通过后将自动发送邀请', data: created, timestamp: Date.now() });
  } catch (error: any) {
    if (error?.code === 'ER_DUP_ENTRY') return res.status(400).json({ code: 400, success: false, message: '请勿重复邀请同一设计师' });
    next(error);
  }
});

invitationsRouter.get('/design-orders/:id/invitations', authenticate, requireRoles('advertiser', 'admin'), async (req, res, next) => {
  try {
    await expireInvitations();
    const order = designOrders.find((item) => item.id === req.params.id);
    if (!order) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
    if (!canManage(order, req.user)) return res.status(403).json({ code: 403, success: false, message: '无权查看邀请' });
    res.json({ code: 200, success: true, data: await invitationRows('i.order_id = ?', [order.id]), timestamp: Date.now() });
  } catch (error) { next(error); }
});

invitationsRouter.get('/invitations/mine', authenticate, requireRoles('designer'), async (req, res, next) => {
  try { await expireInvitations(); res.json({ code: 200, success: true, data: await invitationRows('i.designer_id = ?', [req.user!.id]), timestamp: Date.now() }); } catch (error) { next(error); }
});

invitationsRouter.post('/invitations/:id/respond', authenticate, requireRoles('designer'), async (req, res, next) => {
  try {
    await expireInvitations();
    const action = req.body?.action;
    if (!['accept', 'decline'].includes(action)) return res.status(400).json({ code: 400, success: false, message: '操作必须为 accept 或 decline' });
    const list = await invitationRows('i.designer_id = ?', [req.user!.id]);
    const invitation = list.find((item) => item.id === req.params.id);
    if (!invitation || invitation.status !== 'sent') return res.status(400).json({ code: 400, success: false, message: '该邀请不可处理' });
    const now = new Date().toISOString();
    if (action === 'decline') {
      if (dbPool) await dbPool.query(`UPDATE order_invitations SET status='declined', responded_at=? WHERE id=? AND designer_id=? AND status='sent'`, [now, invitation.id, req.user!.id]);
      else { invitation.status = 'declined'; invitation.respondedAt = now; }
      notifyUser(invitation.inviterId, { type: 'order', title: '设计师婉拒了邀请', content: `${req.user!.name}婉拒了订单「${invitation.orderTitle}」的邀请。`, link: '/advertiser/orders' });
      return res.json({ code: 200, success: true, message: '已婉拒邀请', timestamp: Date.now() });
    }
    const order = designOrders.find((item) => item.id === invitation.orderId);
    if (!order) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
    const application = await submitOrderApplication(order.id, req.user!, req.body || {}, invitation.id);
    return res.json({ code: 200, success: true, message: '申请已提交，等待品牌方确认', data: application, timestamp: Date.now() });
  } catch (error: any) { res.status(400).json({ code: 400, success: false, message: error.message || '处理邀请失败' }); }
});

invitationsRouter.post('/design-orders/:orderId/invitations/:invitationId/cancel', authenticate, requireRoles('advertiser', 'admin'), async (req, res, next) => {
  try {
    const order = designOrders.find((item) => item.id === req.params.orderId);
    if (!order) return res.status(404).json({ code: 404, success: false, message: '订单不存在' });
    if (!canManage(order, req.user)) return res.status(403).json({ code: 403, success: false, message: '无权撤销邀请' });
    const invitation = (await invitationRows('i.order_id = ?', [order.id])).find((item) => item.id === req.params.invitationId);
    if (!invitation || !activeStatuses.has(invitation.status)) return res.status(400).json({ code: 400, success: false, message: '该邀请不可撤销' });
    const now = new Date().toISOString();
    if (dbPool) await dbPool.query(`UPDATE order_invitations SET status='cancelled', responded_at=? WHERE id=? AND status IN ('queued','sent')`, [now, invitation.id]);
    else { invitation.status = 'cancelled'; invitation.respondedAt = now; }
    return res.json({ code: 200, success: true, message: '邀请已撤销', timestamp: Date.now() });
  } catch (error) { next(error); }
});
