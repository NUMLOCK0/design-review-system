import { Router } from 'express';
import crypto from 'crypto';
import type { DesignerPortfolio, DesignerProfile, PlatformType } from '@design-review/shared';
import { authenticate, requireRoles } from '../middleware/auth.middleware.js';
import { dbPool } from '../config/database.js';
import { recordAdminAudit } from '../services/admin-audit.js';
import { notifyUser } from './messages.js';
import { getDesignerClaimEligibility } from '../services/designer-claim-eligibility.js';

export const designerProfilesRouter = Router();

const parseJson = <T,>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== 'string') return value as T;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};
const stringArray = (value: unknown, limit = 20) => Array.isArray(value) ? [...new Set(value.map(String).map((item) => item.trim()).filter(Boolean))].slice(0, limit) : [];
const now = () => new Date().toISOString();

function profileFromRow(row: any): DesignerProfile {
  return {
    userId: row.user_id || row.id,
    name: row.name || '未命名设计师',
    avatarUrl: row.avatar_url || undefined,
    headline: row.headline || undefined,
    bio: row.bio || undefined,
    industries: parseJson(row.industries, []),
    yearsExperience: Number(row.years_experience || 0),
    publicStatus: row.public_status || 'draft',
    profileCompleted: Boolean(row.profile_completed),
    categories: parseJson(row.categories, []),
    platforms: parseJson(row.platforms, []),
    styles: parseJson(row.styles, []),
    minBudget: row.min_budget === null || row.min_budget === undefined ? undefined : Number(row.min_budget),
    maxActiveOrders: Number(row.max_active_orders || 3),
    availabilityStatus: row.availability_status || 'available',
    portfolioUrls: parseJson(row.portfolio_urls, []),
    activeOrderCount: Number(row.active_order_count || 0),
    qualityScore: Number(row.quality_score || 85),
    onTimeRate: Number(row.on_time_rate || 92),
  };
}

function portfolioFromRow(row: any): DesignerPortfolio {
  return {
    id: row.id,
    designerId: row.designer_id,
    title: row.title,
    coverUrl: row.cover_url,
    imageUrls: parseJson(row.image_urls, []),
    category: row.category || undefined,
    industry: row.industry || undefined,
    platform: row.platform || undefined,
    description: row.description || undefined,
    designerRole: row.designer_role || undefined,
    tags: parseJson(row.tags, []),
    sortOrder: Number(row.sort_order || 0),
    status: row.status || 'draft',
    isFeatured: Boolean(row.is_featured),
    createdAt: row.created_at,
    updatedAt: row.updated_at || undefined,
    publishedAt: row.published_at || undefined,
  };
}

async function getProfile(userId: string) {
  const [rows]: any = await dbPool!.query(`SELECT u.id, u.name, u.avatar_url, p.*
    FROM users u LEFT JOIN designer_profiles p ON p.user_id = u.id
    WHERE u.id=? LIMIT 1`, [userId]);
  const row = rows[0] || { id: userId };
  return profileFromRow(row);
}

function profilePayload(body: any, current: DesignerProfile) {
  const name = String(body.name ?? current.name ?? '').trim();
  const categories = stringArray(body.categories ?? current.categories);
  const platforms = stringArray(body.platforms ?? current.platforms);
  const styles = stringArray(body.styles ?? current.styles);
  const industries = stringArray(body.industries ?? current.industries);
  const headline = String(body.headline ?? current.headline ?? '').trim().slice(0, 256);
  const bio = String(body.bio ?? current.bio ?? '').trim().slice(0, 2000);
  const publicStatus = ['draft', 'published', 'hidden'].includes(body.publicStatus) ? body.publicStatus : current.publicStatus || 'draft';
  const profileCompleted = Boolean(headline && bio && categories.length && platforms.length);
  return {
    name, headline, bio, industries, yearsExperience: Math.min(Math.max(Number(body.yearsExperience ?? current.yearsExperience ?? 0) || 0, 0), 80),
    categories, platforms, styles, minBudget: body.minBudget === '' || body.minBudget === null ? null : Math.max(0, Number(body.minBudget ?? current.minBudget ?? 0) || 0),
    maxActiveOrders: Math.min(Math.max(Number(body.maxActiveOrders ?? current.maxActiveOrders ?? 3) || 3, 1), 20),
    availabilityStatus: ['available', 'busy', 'unavailable'].includes(body.availabilityStatus) ? body.availabilityStatus : current.availabilityStatus,
    portfolioUrls: stringArray(body.portfolioUrls ?? current.portfolioUrls, 10), publicStatus, profileCompleted,
  };
}

designerProfilesRouter.get('/designer-profile/claim-eligibility', authenticate, requireRoles('designer'), async (req, res, next) => {
  try {
    const eligibility = await getDesignerClaimEligibility(req.user!.id);
    res.json({ code: 200, success: true, data: eligibility, timestamp: Date.now() });
  } catch (error) { next(error); }
});

designerProfilesRouter.get('/designer-profile/me', authenticate, requireRoles('designer'), async (req, res, next) => {
  try {
    if (!dbPool) return res.status(503).json({ code: 503, success: false, message: '数据库未连接，暂时无法保存设计师资料' });
    res.json({ code: 200, success: true, data: await getProfile(req.user!.id), timestamp: Date.now() });
  } catch (error) { next(error); }
});

designerProfilesRouter.put('/designer-profile/me', authenticate, requireRoles('designer'), async (req, res, next) => {
  try {
    if (!dbPool) return res.status(503).json({ code: 503, success: false, message: '数据库未连接，暂时无法保存设计师资料' });
    const current = await getProfile(req.user!.id);
    const data = profilePayload(req.body || {}, current);
    if (!data.name || data.name.length > 64) return res.status(400).json({ code: 400, success: false, message: '展示名称不能为空且不能超过64个字符' });
    if (data.publicStatus === 'published' && !data.profileCompleted) return res.status(400).json({ code: 400, success: false, message: '请完善简介、擅长类型和平台后再公开主页' });
    await dbPool.query('UPDATE users SET name=? WHERE id=?', [data.name, req.user!.id]);
    await dbPool.query(`INSERT INTO designer_profiles
      (user_id, categories, platforms, styles, min_budget, max_active_orders, availability_status, portfolio_urls, headline, bio, industries, years_experience, public_status, profile_completed, updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE categories=VALUES(categories), platforms=VALUES(platforms), styles=VALUES(styles), min_budget=VALUES(min_budget), max_active_orders=VALUES(max_active_orders), availability_status=VALUES(availability_status), portfolio_urls=VALUES(portfolio_urls), headline=VALUES(headline), bio=VALUES(bio), industries=VALUES(industries), years_experience=VALUES(years_experience), public_status=VALUES(public_status), profile_completed=VALUES(profile_completed), updated_at=VALUES(updated_at)`, [
      req.user!.id, JSON.stringify(data.categories), JSON.stringify(data.platforms), JSON.stringify(data.styles), data.minBudget, data.maxActiveOrders, data.availabilityStatus,
      JSON.stringify(data.portfolioUrls), data.headline || null, data.bio || null, JSON.stringify(data.industries), data.yearsExperience, data.publicStatus, data.profileCompleted ? 1 : 0, now()
    ]);
    res.json({ code: 200, success: true, message: '个人主页已保存', data: await getProfile(req.user!.id), timestamp: Date.now() });
  } catch (error) { next(error); }
});

designerProfilesRouter.get('/designer-portfolios/mine', authenticate, requireRoles('designer'), async (req, res, next) => {
  try {
    if (!dbPool) return res.status(503).json({ code: 503, success: false, message: '数据库未连接' });
    const [rows]: any = await dbPool.query('SELECT * FROM designer_portfolios WHERE designer_id=? ORDER BY is_featured DESC, sort_order ASC, created_at DESC', [req.user!.id]);
    res.json({ code: 200, success: true, data: rows.map(portfolioFromRow), timestamp: Date.now() });
  } catch (error) { next(error); }
});

function portfolioPayload(body: any, current?: DesignerPortfolio) {
  const imageUrls = stringArray(body.imageUrls ?? current?.imageUrls, 20);
  const title = String(body.title ?? current?.title ?? '').trim().slice(0, 256);
  const requestedStatus = body.status ?? current?.status ?? 'draft';
  const status = requestedStatus === 'draft' ? 'draft' : requestedStatus === 'hidden' ? 'hidden' : 'pending_review';
  return {
    title, imageUrls, coverUrl: String(body.coverUrl ?? current?.coverUrl ?? imageUrls[0] ?? '').trim(),
    category: String(body.category ?? current?.category ?? '').trim().slice(0, 64), industry: String(body.industry ?? current?.industry ?? '').trim().slice(0, 64),
    platform: String(body.platform ?? current?.platform ?? '').trim().slice(0, 32) as PlatformType, description: String(body.description ?? current?.description ?? '').trim().slice(0, 2000),
    designerRole: String(body.designerRole ?? current?.designerRole ?? '').trim().slice(0, 256), tags: stringArray(body.tags ?? current?.tags, 12), sortOrder: Math.max(0, Number(body.sortOrder ?? current?.sortOrder ?? 0) || 0), status,
    isFeatured: Boolean(body.isFeatured ?? current?.isFeatured),
  };
}

designerProfilesRouter.post('/designer-portfolios', authenticate, requireRoles('designer'), async (req, res, next) => {
  try {
    if (!dbPool) return res.status(503).json({ code: 503, success: false, message: '数据库未连接' });
    const data = portfolioPayload(req.body || {});
    if (!data.title || !data.imageUrls.length || !data.coverUrl) return res.status(400).json({ code: 400, success: false, message: '请填写项目名称并至少上传一张作品图' });
    if (data.status === 'pending_review' && data.imageUrls.length < 1) return res.status(400).json({ code: 400, success: false, message: '作品至少需要一张图片' });
    const id = `portfolio_${crypto.randomUUID()}`;
    const createdAt = now();
    if (data.isFeatured) await dbPool.query('UPDATE designer_portfolios SET is_featured=FALSE WHERE designer_id=?', [req.user!.id]);
    await dbPool.query(`INSERT INTO designer_portfolios (id, designer_id, title, cover_url, image_urls, category, industry, platform, description, designer_role, tags, sort_order, status, is_featured, created_at, updated_at, published_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [id, req.user!.id, data.title, data.coverUrl, JSON.stringify(data.imageUrls), data.category || null, data.industry || null, data.platform || null, data.description || null, data.designerRole || null, JSON.stringify(data.tags), data.sortOrder, data.status, data.isFeatured ? 1 : 0, createdAt, createdAt, data.status === 'published' ? createdAt : null]);
    if (data.status === 'pending_review') notifyUser('u_rev_1', { type: 'review', title: '新设计师作品待审核', content: `${req.user!.name}提交了作品「${data.title}」，请在客服工作台完成审核。`, link: '/service/portfolio-review' });
    res.status(201).json({ code: 200, success: true, message: data.status === 'pending_review' ? '作品已提交审核' : data.status === 'hidden' ? '作品已隐藏' : '作品草稿已保存', data: portfolioFromRow({ id, designer_id: req.user!.id, title: data.title, cover_url: data.coverUrl, image_urls: JSON.stringify(data.imageUrls), category: data.category, industry: data.industry, platform: data.platform, description: data.description, designer_role: data.designerRole, tags: JSON.stringify(data.tags), sort_order: data.sortOrder, status: data.status, is_featured: data.isFeatured, created_at: createdAt, updated_at: createdAt, published_at: data.status === 'published' ? createdAt : null }), timestamp: Date.now() });
  } catch (error) { next(error); }
});

designerProfilesRouter.put('/designer-portfolios/:id', authenticate, requireRoles('designer'), async (req, res, next) => {
  try {
    if (!dbPool) return res.status(503).json({ code: 503, success: false, message: '数据库未连接' });
    const [rows]: any = await dbPool.query('SELECT * FROM designer_portfolios WHERE id=? AND designer_id=? LIMIT 1', [req.params.id, req.user!.id]);
    if (!rows[0]) return res.status(404).json({ code: 404, success: false, message: '作品不存在' });
    const data = portfolioPayload(req.body || {}, portfolioFromRow(rows[0]));
    if (!data.title || !data.imageUrls.length || !data.coverUrl) return res.status(400).json({ code: 400, success: false, message: '请填写项目名称并至少上传一张作品图' });
    const updatedAt = now();
    if (data.isFeatured) await dbPool.query('UPDATE designer_portfolios SET is_featured=FALSE WHERE designer_id=?', [req.user!.id]);
    await dbPool.query(`UPDATE designer_portfolios SET title=?, cover_url=?, image_urls=?, category=?, industry=?, platform=?, description=?, designer_role=?, tags=?, sort_order=?, status=?, is_featured=?, updated_at=?, published_at=? WHERE id=? AND designer_id=?`, [
      data.title, data.coverUrl, JSON.stringify(data.imageUrls), data.category || null, data.industry || null, data.platform || null, data.description || null, data.designerRole || null, JSON.stringify(data.tags), data.sortOrder, data.status, data.isFeatured ? 1 : 0, updatedAt, data.status === 'published' ? (rows[0].published_at || updatedAt) : null, req.params.id, req.user!.id
    ]);
    const [updated]: any = await dbPool.query('SELECT * FROM designer_portfolios WHERE id=? LIMIT 1', [req.params.id]);
    if (data.status === 'pending_review') notifyUser('u_rev_1', { type: 'review', title: '设计师作品待审核', content: req.user!.name + '更新并提交了作品「' + data.title + '」，请在客服工作台完成审核。', link: '/service/portfolio-review' });
    res.json({ code: 200, success: true, message: data.status === 'pending_review' ? '作品已重新提交审核' : '作品已保存', data: portfolioFromRow(updated[0]), timestamp: Date.now() });
  } catch (error) { next(error); }
});

designerProfilesRouter.delete('/designer-portfolios/:id', authenticate, requireRoles('designer'), async (req, res, next) => {
  try {
    if (!dbPool) return res.status(503).json({ code: 503, success: false, message: '数据库未连接' });
    const [result]: any = await dbPool.query('DELETE FROM designer_portfolios WHERE id=? AND designer_id=?', [req.params.id, req.user!.id]);
    if (!result.affectedRows) return res.status(404).json({ code: 404, success: false, message: '作品不存在' });
    res.json({ code: 200, success: true, message: '作品已删除', timestamp: Date.now() });
  } catch (error) { next(error); }
});

export async function publicDesigner(id: string) {
  const [rows]: any = await dbPool!.query(`SELECT u.id, u.name, u.avatar_url, p.*,
    (SELECT COUNT(*) FROM designer_portfolios dp WHERE dp.designer_id=u.id AND dp.status='published') AS portfolio_count
    FROM users u JOIN user_roles ur ON ur.user_id=u.id AND ur.role='designer'
    LEFT JOIN designer_profiles p ON p.user_id=u.id
    WHERE u.id=?`, [id]);
  if (!rows[0]) return null;
  const profile = profileFromRow(rows[0]);
  if (profile.publicStatus !== 'published') return null;
  const [portfolioRows]: any = await dbPool!.query('SELECT * FROM designer_portfolios WHERE designer_id=? AND status=\'published\' ORDER BY is_featured DESC, sort_order ASC, created_at DESC', [id]);
  return { ...profile, portfolios: portfolioRows.map(portfolioFromRow), portfolioCount: Number(rows[0].portfolio_count || 0) };
}

designerProfilesRouter.get('/designers/recommended', authenticate, requireRoles('advertiser', 'admin'), async (req, res, next) => {
  try {
    if (!dbPool) return res.status(503).json({ code: 503, success: false, message: '数据库未连接' });
    const [rows]: any = await dbPool.query(`SELECT u.id, u.name, u.avatar_url, p.*,
      (SELECT COUNT(*) FROM designer_portfolios dp WHERE dp.designer_id=u.id AND dp.status='published') AS portfolio_count,
      (SELECT GROUP_CONCAT(dp.cover_url ORDER BY dp.is_featured DESC, dp.sort_order ASC SEPARATOR '|||') FROM designer_portfolios dp WHERE dp.designer_id=u.id AND dp.status='published') AS portfolio_covers
      FROM users u JOIN user_roles ur ON ur.user_id=u.id AND ur.role='designer'
      JOIN designer_profiles p ON p.user_id=u.id AND p.public_status='published' AND p.profile_completed=TRUE
      ORDER BY p.updated_at DESC LIMIT 50`);
    const keyword = String(req.query.keyword || '').trim().toLowerCase();
    const category = String(req.query.category || '').trim();
    const platform = String(req.query.platform || '').trim();
    const industry = String(req.query.industry || '').trim();
    const list = rows.map((row: any) => {
      const profileBase = profileFromRow(row);
      const covers = String(row.portfolio_covers || '').split('|||').filter(Boolean).slice(0, 5);
      const profile = { ...profileBase, portfolioUrls: [...new Set([...(profileBase.portfolioUrls || []), ...covers])].slice(0, 5) };
      const categoryMatch = !category || profile.categories.includes(category);
      const platformMatch = !platform || profile.platforms.includes(platform as PlatformType);
      const industryMatch = !industry || (profile.industries || []).includes(industry);
      const text = [profile.name, profile.headline, profile.bio, ...(profile.categories || []), ...(profile.platforms || []), ...(profile.styles || []), ...(profile.industries || [])].join(' ').toLowerCase();
      const score = (categoryMatch ? 25 : 0) + (platformMatch ? 20 : 0) + (industryMatch ? 15 : 0) + Math.min(15, Number(row.portfolio_count || 0) * 3) + (profile.availabilityStatus === 'available' ? 15 : 5) + Math.min(10, profile.yearsExperience || 0);
      return { ...profile, portfolios: undefined, portfolioCount: Number(row.portfolio_count || 0), recommendationScore: score, recommendationReasons: [categoryMatch && category ? `擅长${category}` : '擅长多种设计类型', platformMatch && platform ? '投放平台经验匹配' : '平台经验丰富', industryMatch && industry ? `熟悉${industry}行业` : '有公开作品可参考', profile.availabilityStatus === 'available' ? '当前可接单' : '近期可排期'].filter(Boolean) };
    }).filter((item: DesignerProfile & { portfolioCount: number }) => (!keyword || [item.name, item.headline, item.bio, ...(item.categories || []), ...(item.styles || []), ...(item.industries || [])].join(' ').toLowerCase().includes(keyword))).filter((item: DesignerProfile & { portfolioCount: number }) => item.portfolioCount > 0).sort((a: any, b: any) => b.recommendationScore - a.recommendationScore);
    res.json({ code: 200, success: true, data: list.slice(0, Math.min(Number(req.query.limit) || 4, 12)), timestamp: Date.now() });
  } catch (error) { next(error); }
});

designerProfilesRouter.get('/designers/:id', authenticate, requireRoles('advertiser', 'designer', 'customer_service', 'admin'), async (req, res, next) => {
  try {
    if (!dbPool) return res.status(503).json({ code: 503, success: false, message: '数据库未连接' });
    const designer = await publicDesigner(String(req.params.id));
    if (!designer) return res.status(404).json({ code: 404, success: false, message: '该设计师主页未公开' });
    res.json({ code: 200, success: true, data: designer, timestamp: Date.now() });
  } catch (error) { next(error); }
});

designerProfilesRouter.get('/designers/:id/portfolios', authenticate, requireRoles('advertiser', 'designer', 'customer_service', 'admin'), async (req, res, next) => {
  try {
    if (!dbPool) return res.status(503).json({ code: 503, success: false, message: '数据库未连接' });
    const [rows]: any = await dbPool.query('SELECT * FROM designer_portfolios WHERE designer_id=? AND status=\'published\' ORDER BY is_featured DESC, sort_order ASC, created_at DESC', [req.params.id]);
    res.json({ code: 200, success: true, data: rows.map(portfolioFromRow), timestamp: Date.now() });
  } catch (error) { next(error); }
});

designerProfilesRouter.get('/admin/designer-portfolios', authenticate, requireRoles('admin'), async (req, res, next) => {
  try {
    if (!dbPool) return res.status(503).json({ code: 503, success: false, message: '数据库未连接' });
    const status = ['draft', 'pending_review', 'published', 'hidden'].includes(String(req.query.status)) ? String(req.query.status) : 'all';
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
    const where = status === 'all' ? '' : 'WHERE dp.status=?';
    const params = status === 'all' ? [] : [status];
    const [countRows]: any = await dbPool.query(`SELECT COUNT(*) AS total FROM designer_portfolios dp ${where}`, params);
    const total = Number(countRows?.[0]?.total || 0);
    const [rows]: any = await dbPool.query(`SELECT dp.*, u.name AS designer_name, u.avatar_url AS designer_avatar
      FROM designer_portfolios dp JOIN users u ON u.id=dp.designer_id ${where}
      ORDER BY dp.updated_at DESC, dp.created_at DESC LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize]);
    res.json({ code: 200, success: true, data: rows.map((row: any) => ({ ...portfolioFromRow(row), designerName: row.designer_name, designerAvatarUrl: row.designer_avatar || undefined })), total, page, pageSize, hasMore: page * pageSize < total, timestamp: Date.now() });
  } catch (error) { next(error); }
});

designerProfilesRouter.get('/service/designer-portfolios', authenticate, requireRoles('customer_service', 'admin'), async (req, res, next) => {
  try {
    if (!dbPool) return res.status(503).json({ code: 503, success: false, message: '数据库未连接' });
    const status = ['draft', 'pending_review', 'published', 'hidden'].includes(String(req.query.status)) ? String(req.query.status) : 'all';
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
    const where = status === 'all' ? '' : 'WHERE dp.status=?';
    const params = status === 'all' ? [] : [status];
    const [countRows]: any = await dbPool.query(`SELECT COUNT(*) AS total FROM designer_portfolios dp ${where}`, params);
    const total = Number(countRows?.[0]?.total || 0);
    const [rows]: any = await dbPool.query(`SELECT dp.*, u.name AS designer_name, u.avatar_url AS designer_avatar
      FROM designer_portfolios dp JOIN users u ON u.id=dp.designer_id ${where}
      ORDER BY dp.updated_at DESC, dp.created_at DESC LIMIT ? OFFSET ?`, [...params, pageSize, (page - 1) * pageSize]);
    res.json({ code: 200, success: true, data: rows.map((row: any) => ({ ...portfolioFromRow(row), designerName: row.designer_name, designerAvatarUrl: row.designer_avatar || undefined })), total, page, pageSize, hasMore: page * pageSize < total, timestamp: Date.now() });
  } catch (error) { next(error); }
});

designerProfilesRouter.put('/service/designer-portfolios/:id', authenticate, requireRoles('customer_service', 'admin'), async (req, res, next) => {
  try {
    if (!dbPool) return res.status(503).json({ code: 503, success: false, message: '数据库未连接' });
    const status = String(req.body?.status || '');
    if (!['published', 'hidden'].includes(status)) return res.status(400).json({ code: 400, success: false, message: '无效的作品审核状态' });
    const id = String(req.params.id);
    const [result]: any = await dbPool.query('UPDATE designer_portfolios SET status=?, published_at=CASE WHEN ?=\'published\' THEN COALESCE(published_at, ?) ELSE published_at END, updated_at=? WHERE id=?', [status, status, now(), now(), id]);
    if (!result.affectedRows) return res.status(404).json({ code: 404, success: false, message: '作品不存在' });
    const [portfolioRows]: any = await dbPool.query('SELECT designer_id, title FROM designer_portfolios WHERE id=? LIMIT 1', [id]);
    notifyUser(portfolioRows[0]?.designer_id, { type: 'review', title: status === 'published' ? '设计师作品审核通过' : '设计师作品审核未通过', content: `作品「${portfolioRows[0]?.title || id}」${status === 'published' ? '已审核通过并公开' : '已审核未通过并下架'}。`, link: '/designer/profile' });
    void recordAdminAudit({ operatorId: req.user!.id, operatorName: req.user!.name, module: 'designer_moderation', action: 'service_portfolio_status_change', targetType: 'designer_portfolio', targetId: id, summary: `${req.user!.name}审核设计师作品：${status === 'published' ? '通过公开' : '下架'}`, detail: { status }, ipAddress: req.ip }).catch((error) => console.error('[Audit] 作品审核日志写入失败:', error));
    res.json({ code: 200, success: true, message: status === 'published' ? '作品已审核通过并公开' : '作品已下架', timestamp: Date.now() });
  } catch (error) { next(error); }
});

designerProfilesRouter.put('/admin/designer-portfolios/:id', authenticate, requireRoles('admin'), async (req, res, next) => {
  try {
    if (!dbPool) return res.status(503).json({ code: 503, success: false, message: '数据库未连接' });
    const status = String(req.body?.status || '');
    if (!['draft', 'published', 'hidden'].includes(status)) return res.status(400).json({ code: 400, success: false, message: '无效的作品状态' });
    const [result]: any = await dbPool.query('UPDATE designer_portfolios SET status=?, published_at=CASE WHEN ?=\'published\' THEN COALESCE(published_at, ?) ELSE published_at END, updated_at=? WHERE id=?', [status, status, now(), now(), String(req.params.id)]);
    if (!result.affectedRows) return res.status(404).json({ code: 404, success: false, message: '作品不存在' });
    const [portfolioRows]: any = await dbPool.query('SELECT designer_id, title FROM designer_portfolios WHERE id=? LIMIT 1', [String(req.params.id)]);
    notifyUser(portfolioRows[0]?.designer_id, { type: 'review', title: status === 'published' ? '设计师作品审核通过' : status === 'hidden' ? '设计师作品已下架' : '设计师作品状态已调整', content: `作品「${portfolioRows[0]?.title || String(req.params.id)}」${status === 'published' ? '已审核通过并公开' : status === 'hidden' ? '已审核未通过并下架' : '已设为草稿'}。`, link: '/designer/profile' });
    void recordAdminAudit({ operatorId: req.user!.id, operatorName: req.user!.name, module: 'designer_moderation', action: 'portfolio_status_change', targetType: 'designer_portfolio', targetId: String(req.params.id), summary: `${req.user!.name}修改设计师作品状态为${status}`, detail: { status }, ipAddress: req.ip }).catch((error) => console.error('[Audit] 作品审核日志写入失败:', error));
    res.json({ code: 200, success: true, message: status === 'published' ? '作品已审核通过' : status === 'hidden' ? '作品已下架' : '作品已设为草稿', timestamp: Date.now() });
  } catch (error) { next(error); }
});

designerProfilesRouter.put('/admin/designer-profiles/:id', authenticate, requireRoles('admin'), async (req, res, next) => {
  try {
    if (!dbPool) return res.status(503).json({ code: 503, success: false, message: '数据库未连接' });
    const status = String(req.body?.publicStatus || '');
    if (!['draft', 'published', 'hidden'].includes(status)) return res.status(400).json({ code: 400, success: false, message: '无效的主页状态' });
    const [result]: any = await dbPool.query('UPDATE designer_profiles SET public_status=?, updated_at=? WHERE user_id=?', [status, now(), String(req.params.id)]);
    if (!result.affectedRows) return res.status(404).json({ code: 404, success: false, message: '设计师资料不存在' });
    void recordAdminAudit({ operatorId: req.user!.id, operatorName: req.user!.name, module: 'designer_moderation', action: 'profile_status_change', targetType: 'designer_profile', targetId: String(req.params.id), summary: `${req.user!.name}修改设计师主页状态为${status}`, detail: { status }, ipAddress: req.ip }).catch((error) => console.error('[Audit] 主页审核日志写入失败:', error));
    res.json({ code: 200, success: true, message: status === 'published' ? '主页已公开' : '主页已隐藏', timestamp: Date.now() });
  } catch (error) { next(error); }
});
