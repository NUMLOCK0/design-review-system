import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import crypto from 'crypto';
import { dbPool } from '../config/database.js';
import { authenticate, clearAuthCookie, JWT_SECRET, setAuthCookie } from '../middleware/auth.middleware.js';
import { consumeEmailCode, consumeSmsCode, createSliderChallenge, isValidPhone, normalizePhone, sendEmailCode, sendSmsCode, verifySliderChallenge } from '../services/phone-verification.js';
import { recordAdminAudit } from '../services/admin-audit.js';

export const authRouter = Router();
type AppRole = 'advertiser' | 'designer' | 'customer_service' | 'admin';
const BUSINESS_ROLES: AppRole[] = ['advertiser', 'designer'];
const PLATFORM_ROLES: AppRole[] = ['customer_service', 'admin'];
const useMemoryAuth = !dbPool && process.env.NODE_ENV !== 'production';

// 兼容旧库中的 reviewer：历史审核员账号统一迁移为客服角色。
function normalizeRole(role: string) {
  return role === 'reviewer' ? 'customer_service' : role;
}

function rolesForUser(role: string): AppRole[] {
  return [normalizeRole(role) as AppRole];
}

async function loadUserRoles(_userId: string, role: string): Promise<AppRole[]> {
  return rolesForUser(role);
}

function userView(user: any, roles: AppRole[]) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: normalizeRole(user.role),
    roles,
    department: user.department,
    avatarUrl: user.avatarUrl,
    organizationId: user.organizationId,
    isOrganizationAdmin: user.isOrganizationAdmin
  };
}

function tokenForUser(user: any, role: AppRole, roles: AppRole[]) {
  return jwt.sign({
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role,
    roles,
    department: user.department,
    organizationId: user.organizationId,
    isOrganizationAdmin: user.isOrganizationAdmin
  }, JWT_SECRET, { expiresIn: '24h' });
}

// 内存 Mock 数据（数据库连接不可用时的安全回退）
let memoryUsers: any[] = [
  {
    id: 'u_admin_1',
    name: '系统管理员',
    email: 'admin@cozi.com',
    passwordHash: bcrypt.hashSync('123456', 10),
    role: 'admin',
    department: '运营管理部',
    avatarUrl: ''
  },
  {
    id: 'u_rev_1',
    name: '王总监(高级审核)',
    email: 'reviewer@cozi.com',
    passwordHash: bcrypt.hashSync('123456', 10),
    role: 'customer_service',
    department: '客服与争议处理部',
    avatarUrl: ''
  },
];

const loginSchema = z.object({
  identifier: z.string().min(1, { message: '请输入邮箱或手机号' }),
  password: z.string().min(1, { message: '密码不能为空' }),
  role: z.enum(['advertiser', 'designer', 'staff']).optional()
});

const registerSchema = z.object({
  name: z.string().min(2, { message: '姓名长度不能少于2位' }),
  channel: z.enum(['phone', 'email']).default('phone'),
  phone: z.string().optional(),
  email: z.string().optional(),
  code: z.string().length(6, { message: '请输入6位验证码' }),
  password: z.string().min(6, { message: '密码长度不能少于6位' }),
  // 管理员与客服由平台侧配置，不允许通过公开注册提权。
  role: z.enum(['advertiser', 'designer']).default('designer'),
  department: z.string().optional()
});

const resetPasswordSchema = z.object({
  channel: z.enum(['phone', 'email']).default('phone'),
  phone: z.string().optional(),
  email: z.string().optional(),
  role: z.enum(['advertiser', 'designer', 'staff']).optional(),
  code: z.string().length(6, { message: '请输入6位验证码' }),
  password: z.string().min(6, { message: '密码长度不能少于6位' })
});

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const normalizeEmail = (email: string) => email.trim().toLowerCase();

// 登录入口筛选业务账号，工作人员账号可从所有入口登录。
async function findLoginUsers(identifier: string, entryRole?: 'advertiser' | 'designer' | 'staff', phoneOnly = false): Promise<any[]> {
  const phone = normalizePhone(identifier);
  const allowedRoles = entryRole === 'staff' ? PLATFORM_ROLES : entryRole ? [entryRole, ...PLATFORM_ROLES] : null;
  let users: any[] = [];
  if (dbPool) {
    const roleClause = allowedRoles ? ` AND role IN (${allowedRoles.map(() => '?').join(',')})` : '';
    const [rows]: any = await dbPool.query(`SELECT * FROM users WHERE ${phoneOnly ? 'phone = ?' : '(email = ? OR phone = ?)'}${roleClause} LIMIT 4`, [...(phoneOnly ? [phone] : [identifier, phone]), ...(allowedRoles || [])]);
    users = rows.map((row: any) => ({
      id: row.id, name: row.name, email: row.email, phone: row.phone,
      passwordHash: row.password_hash, isActive: Boolean(row.is_active), role: normalizeRole(row.role),
      department: row.department, avatarUrl: row.avatar_url,
      organizationId: row.organization_id, isOrganizationAdmin: row.is_organization_admin,
    }));
  } else if (useMemoryAuth) {
    users = memoryUsers.filter((user) => (user.phone === phone || (!phoneOnly && user.email === identifier)) && (!allowedRoles || allowedRoles.includes(normalizeRole(user.role) as AppRole)));
  }
  // 共用手机号时，优先当前入口的业务账号；密码不匹配再核验工作人员账号。
  return users.sort((left, right) => Number(right.role === entryRole) - Number(left.role === entryRole));
}

// 1. 用户登录 API
authRouter.post('/login', async (req, res, next) => {
  try {
    const parseResult = loginSchema.safeParse({ identifier: req.body?.identifier || req.body?.email, password: req.body?.password, role: req.body?.role });
    if (!parseResult.success) {
      return res.status(400).json({
        code: 400,
        success: false,
        message: parseResult.error.errors[0].message
      });
    }

    const { identifier, password, role: entryRole } = parseResult.data;
    const phoneIdentifier = normalizePhone(identifier);
    if (!identifier.includes('@') && !isValidPhone(phoneIdentifier)) {
      return res.status(400).json({ code: 400, success: false, message: '请输入有效的邮箱或手机号' });
    }
    const candidates = await findLoginUsers(identifier, entryRole);
    if (!entryRole && candidates.length > 1) return res.status(400).json({ code: 400, success: false, message: '该手机号绑定了多个系统账号，请从对应的登录入口进入' });
    if (!candidates.length) {
      return res.status(401).json({
        code: 401,
        success: false,
        message: '用户不存在或账号错误'
      });
    }
    let user: any = null;
    for (const candidate of candidates) {
      const isMatch = candidate.passwordHash ? await bcrypt.compare(password, candidate.passwordHash) : password === '123456';
      if (isMatch) { user = candidate; break; }
    }
    if (!user) {
      return res.status(401).json({
        code: 401,
        success: false,
        message: '邮箱或密码不正确'
      });
    }
    if (user.isActive === false) return res.status(403).json({ code: 403, success: false, message: '该账号已被管理员停用' });

    const roles = await loadUserRoles(user.id, user.role);
    const activeRole = roles.includes(normalizeRole(user.role) as AppRole) ? normalizeRole(user.role) as AppRole : roles[0];
    // 签发 JWT Token
    const token = tokenForUser(user, activeRole, roles);
    setAuthCookie(res, token);
    if (PLATFORM_ROLES.includes(activeRole)) {
      void recordAdminAudit({ operatorId: user.id, operatorName: user.name, module: 'auth', action: 'login', targetType: 'user', targetId: user.id, summary: `${user.name}登录后台`, detail: { method: 'password', role: activeRole }, ipAddress: req.ip }).catch((error) => console.error('[Audit] 登录日志写入失败:', error));
    }

    return res.json({
      code: 200,
      success: true,
      message: '登录成功',
      data: {
        token,
        user: userView({ ...user, role: activeRole }, roles)
      },
      timestamp: Date.now()
    });
  } catch (err) {
    next(err);
  }
});

// 2. 用户注册 API
authRouter.post('/register', async (req, res, next) => {
  try {
    const parseResult = registerSchema.safeParse({
      ...req.body,
      channel: req.body?.channel || (req.body?.email ? 'email' : 'phone'),
      code: req.body?.code || req.body?.smsCode || req.body?.emailCode
    });
    if (!parseResult.success) {
      return res.status(400).json({
        code: 400,
        success: false,
        message: parseResult.error.errors[0].message
      });
    }

    const { name, channel, password, role, department } = parseResult.data;
    const phone = channel === 'phone' ? normalizePhone(parseResult.data.phone || '') : null;
    const email = channel === 'email' ? normalizeEmail(parseResult.data.email || '') : `${phone}+${role}@phone.local`;
    if (channel === 'phone' && !isValidPhone(phone || '')) return res.status(400).json({ code: 400, success: false, message: '请输入有效的中国大陆手机号' });
    if (channel === 'email' && !EMAIL_PATTERN.test(email)) return res.status(400).json({ code: 400, success: false, message: '请输入有效的邮箱地址' });
    if (useMemoryAuth && memoryUsers.some((item) => item.email === email || (channel === 'phone' && item.phone === phone && item.role === role))) return res.status(400).json({ code: 400, success: false, message: channel === 'email' ? '该邮箱已注册' : '该手机号已在当前入口注册' });
    try {
      if (channel === 'phone') consumeSmsCode(phone!, parseResult.data.code, 'register');
      else consumeEmailCode(email, parseResult.data.code, 'register');
    } catch (error: any) {
      return res.status(400).json({ code: 400, success: false, message: error.message || '验证码无效' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = `u_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const organizationId = role === 'advertiser' ? 'org_demo_1' : undefined;
    const isOrganizationAdmin = role === 'advertiser';
    const roles: AppRole[] = [role];

    if (dbPool) {
      try {
        const [existing]: any = await dbPool.query('SELECT id FROM users WHERE email = ? OR (phone = ? AND role = ?)', [email, phone, role]);
        if (existing && existing.length > 0) {
          return res.status(400).json({ code: 400, success: false, message: channel === 'email' ? '该邮箱已注册' : '该手机号已在当前入口注册' });
        }

        await dbPool.query(
          `INSERT INTO users (id, name, email, phone, password_hash, role, department, organization_id, is_organization_admin)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [userId, name, email, phone, passwordHash, role, department || '视觉设计部', organizationId || null, isOrganizationAdmin]
        );
        for (const availableRole of roles) {
          await dbPool.query('INSERT IGNORE INTO user_roles (user_id, role, created_at) VALUES (?, ?, ?)', [userId, availableRole, new Date().toISOString()]);
        }
      } catch (error) { return next(error); }
    }

    // 同步内存
    const newUser = {
      id: userId,
      name,
      email,
      phone,
      passwordHash,
      role,
      roles,
      organizationId,
      isOrganizationAdmin,
      department: department || '视觉设计部',
      avatarUrl: ''
    };
    memoryUsers.push(newUser);

    const token = tokenForUser(newUser, role, roles);
    setAuthCookie(res, token);

    return res.status(201).json({
      code: 201,
      success: true,
      message: '注册成功',
      data: {
        token,
        user: userView(newUser, roles)
      },
      timestamp: Date.now()
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ code: 200, success: true, message: '已退出登录', timestamp: Date.now() });
});

// 3. 使用已绑定手机号或邮箱验证码重置密码。
authRouter.post('/password/reset', async (req, res, next) => {
  try {
    const parseResult = resetPasswordSchema.safeParse({
      ...req.body,
      channel: req.body?.channel || (req.body?.email ? 'email' : 'phone'),
      code: req.body?.code || req.body?.smsCode || req.body?.emailCode
    });
    if (!parseResult.success) return res.status(400).json({ code: 400, success: false, message: parseResult.error.errors[0].message });
    const { channel, password, role } = parseResult.data;
    const phone = channel === 'phone' ? normalizePhone(parseResult.data.phone || '') : null;
    const email = channel === 'email' ? normalizeEmail(parseResult.data.email || '') : null;
    if (channel === 'phone' && !isValidPhone(phone || '')) return res.status(400).json({ code: 400, success: false, message: '请输入有效的中国大陆手机号' });
    if (channel === 'email' && !EMAIL_PATTERN.test(email || '')) return res.status(400).json({ code: 400, success: false, message: '请输入有效的邮箱地址' });
    if (channel === 'phone' && !role) {
      if (dbPool) {
        const [matches]: any = await dbPool.query('SELECT id FROM users WHERE phone = ? LIMIT 2', [phone]);
        if (matches?.length > 1) return res.status(400).json({ code: 400, success: false, message: '该手机号绑定了多个系统账号，请从对应的登录入口找回密码' });
      }
      if (useMemoryAuth && memoryUsers.filter((item) => item.phone === phone).length > 1) return res.status(400).json({ code: 400, success: false, message: '该手机号绑定了多个系统账号，请从对应的登录入口找回密码' });
    }
    try {
      if (channel === 'phone') consumeSmsCode(phone!, parseResult.data.code, 'reset');
      else consumeEmailCode(email!, parseResult.data.code, 'reset');
    }
    catch (error: any) { return res.status(400).json({ code: 400, success: false, message: error.message || '验证码无效' }); }

    const passwordHash = await bcrypt.hash(password, 10);
    let updated = false;
    if (dbPool) {
      const roleClause = channel === 'phone' && role && role !== 'staff' ? ' AND role = ?' : channel === 'phone' && role === 'staff' ? " AND role IN ('admin', 'customer_service')" : '';
      const [result]: any = await dbPool.query(`UPDATE users SET password_hash = ? WHERE ${channel === 'phone' ? 'phone' : 'email'} = ?${roleClause}`, [passwordHash, channel === 'phone' ? phone : email, ...(channel === 'phone' && role && role !== 'staff' ? [role] : [])]);
      updated = Boolean(result?.affectedRows);
    }
    const memoryUser = useMemoryAuth ? memoryUsers.find((item) => (channel === 'phone' ? item.phone === phone : item.email === email) && (channel !== 'phone' || !role ? true : role === 'staff' ? PLATFORM_ROLES.includes(item.role) : item.role === role)) : undefined;
    if (memoryUser) {
      memoryUser.passwordHash = passwordHash;
      updated = true;
    }
    if (!updated) return res.status(404).json({ code: 404, success: false, message: channel === 'phone' ? '该手机号尚未绑定账号' : '该邮箱尚未绑定账号' });
    return res.json({ code: 200, success: true, message: '密码重置成功，请使用新密码登录', timestamp: Date.now() });
  } catch (error) { next(error); }
});

// 4. 获取一次性滑块挑战。
authRouter.get('/captcha/challenge', async (_req, res, next) => {
  try {
    res.json({ code: 200, success: true, data: await createSliderChallenge(), timestamp: Date.now() });
  } catch (error) { next(error); }
});

// 5. 校验滑块，成功后只返回短时且一次性的短信令牌。
authRouter.post('/captcha/verify', (req, res) => {
  try {
    const token = verifySliderChallenge(String(req.body?.challengeId || ''), req.body || {});
    res.json({ code: 200, success: true, data: { token }, timestamp: Date.now() });
  } catch (error: any) {
    res.status(400).json({ code: 400, success: false, message: error.message || '滑块验证失败' });
  }
});

// 6. 短信验证码只允许在通过滑块后发送。
authRouter.post('/sms/send', async (req, res) => {
  try {
    const phone = normalizePhone(String(req.body?.phone || ''));
    const purpose = req.body?.purpose === 'register' || req.body?.purpose === 'reset' ? req.body.purpose : 'login';
    const role = ['advertiser', 'designer', 'staff'].includes(req.body?.role) ? req.body.role as 'advertiser' | 'designer' | 'staff' : undefined;
    if (!isValidPhone(phone)) return res.status(400).json({ code: 400, success: false, message: '请输入有效的中国大陆手机号' });
    if (purpose === 'register' || purpose === 'reset') {
      if (purpose === 'register' && (!role || role === 'staff')) return res.status(400).json({ code: 400, success: false, message: '注册入口无效，请从品牌方或设计师入口注册' });
      const matchingMemoryUsers = useMemoryAuth ? memoryUsers.filter((item) => item.phone === phone && (!role || (role === 'staff' ? PLATFORM_ROLES.includes(item.role) : item.role === role))) : [];
      if (purpose === 'reset' && !role && matchingMemoryUsers.length > 1) return res.status(400).json({ code: 400, success: false, message: '该手机号绑定了多个系统账号，请从对应的登录入口找回密码' });
      let exists = matchingMemoryUsers.length > 0;
      if (dbPool) {
        const roleClause = role === 'staff' ? " AND role IN ('admin', 'customer_service')" : role ? ' AND role = ?' : '';
        const [rows]: any = await dbPool.query(`SELECT id FROM users WHERE phone = ?${roleClause} LIMIT 2`, [phone, ...(role && role !== 'staff' ? [role] : [])]);
        if (purpose === 'reset' && !role && rows?.length > 1) return res.status(400).json({ code: 400, success: false, message: '该手机号绑定了多个系统账号，请从对应的登录入口找回密码' });
        exists = Boolean(rows?.length);
      }
      if (purpose === 'register' && exists) return res.status(400).json({ code: 400, success: false, message: '该手机号已在当前入口注册' });
      if (purpose === 'reset' && !exists) return res.status(404).json({ code: 404, success: false, message: '当前入口下该手机号尚未绑定账号' });
    }
    const result = await sendSmsCode(phone, String(req.body?.captchaToken || ''), purpose);
    res.json({ code: 200, success: true, message: '验证码已发送', data: result, timestamp: Date.now() });
  } catch (error: any) {
    res.status(400).json({ code: 400, success: false, message: error.message || '验证码发送失败' });
  }
});

// 7. 邮箱验证码，仅允许在通过滑块后发送。
authRouter.post('/email/send', async (req, res) => {
  try {
    const email = normalizeEmail(String(req.body?.email || ''));
    const purpose = req.body?.purpose === 'register' || req.body?.purpose === 'reset' ? req.body.purpose : null;
    if (!EMAIL_PATTERN.test(email)) return res.status(400).json({ code: 400, success: false, message: '请输入有效的邮箱地址' });
    if (!purpose) return res.status(400).json({ code: 400, success: false, message: '邮箱验证码用途无效' });
    let exists = useMemoryAuth && memoryUsers.some((item) => item.email === email);
    if (dbPool) {
      const [rows]: any = await dbPool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
      exists = Boolean(rows?.length);
    }
    if (purpose === 'register' && exists) return res.status(400).json({ code: 400, success: false, message: '该邮箱已注册' });
    if (purpose === 'reset' && !exists) return res.status(404).json({ code: 404, success: false, message: '该邮箱尚未绑定账号' });
    const result = await sendEmailCode(email, String(req.body?.captchaToken || ''), purpose);
    res.json({ code: 200, success: true, message: '邮箱验证码已发送', data: result, timestamp: Date.now() });
  } catch (error: any) {
    res.status(400).json({ code: 400, success: false, message: error.message || '邮箱验证码发送失败' });
  }
});

// 7. 手机号短信登录。
authRouter.post('/sms/login', async (req, res, next) => {
  try {
    const phone = normalizePhone(String(req.body?.phone || ''));
    const entryRole = ['advertiser', 'designer', 'staff'].includes(req.body?.role) ? req.body.role as 'advertiser' | 'designer' | 'staff' : undefined;
    if (req.body?.role && !entryRole) return res.status(400).json({ code: 400, success: false, message: '登录入口无效' });
    if (!isValidPhone(phone)) return res.status(400).json({ code: 400, success: false, message: '请输入有效的中国大陆手机号' });
    try { consumeSmsCode(phone, String(req.body?.code || ''), 'login'); }
    catch (error: any) { return res.status(400).json({ code: 400, success: false, message: error.message || '验证码无效' }); }
    const candidates = await findLoginUsers(phone, entryRole, true);
    const entryUser = candidates.find((candidate) => candidate.role === entryRole);
    if (candidates.length > 1 && (!entryRole || !entryUser)) return res.status(400).json({ code: 400, success: false, message: '该手机号绑定了多个账号，请从对应入口登录，或使用邮箱和密码登录平台账号' });
    let user: any = entryUser || candidates[0] || null;
    let registered = false;
    if (user?.isActive === false) return res.status(403).json({ code: 403, success: false, message: '该账号已被管理员停用' });
    if (!user) {
      if (entryRole === 'staff') return res.status(404).json({ code: 404, success: false, message: '该手机号没有平台工作人员账号' });
      const userId = `u_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
      const role: AppRole = entryRole || 'advertiser';
      const roles: AppRole[] = [role];
      user = {
        id: userId,
        name: `用户${phone.slice(-4)}`,
        email: `${phone}+${role}@phone.local`,
        phone,
        passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10),
        role,
        roles,
        department: role === 'advertiser' ? '品牌与设计协作部' : '视觉设计部',
        organizationId: role === 'advertiser' ? `org_${userId}` : undefined,
        isOrganizationAdmin: role === 'advertiser',
        avatarUrl: ''
      };
      if (dbPool) {
        await dbPool.query(
          `INSERT INTO users (id, name, email, phone, password_hash, role, department, organization_id, is_organization_admin)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [user.id, user.name, user.email, user.phone, user.passwordHash, user.role, user.department, user.organizationId, user.isOrganizationAdmin]
        );
        for (const availableRole of roles) {
          await dbPool.query('INSERT IGNORE INTO user_roles (user_id, role, created_at) VALUES (?, ?, ?)', [user.id, availableRole, new Date().toISOString()]);
        }
      }
      memoryUsers.push(user);
      registered = true;
    }
    const roles = await loadUserRoles(user.id, user.role);
    const activeRole = roles.includes(normalizeRole(user.role) as AppRole) ? normalizeRole(user.role) as AppRole : roles[0];
    const token = tokenForUser(user, activeRole, roles);
    if (PLATFORM_ROLES.includes(activeRole)) {
      void recordAdminAudit({ operatorId: user.id, operatorName: user.name, module: 'auth', action: 'login', targetType: 'user', targetId: user.id, summary: `${user.name}登录后台`, detail: { method: 'sms', role: activeRole }, ipAddress: req.ip }).catch((error) => console.error('[Audit] 登录日志写入失败:', error));
    }
    setAuthCookie(res, token);
    res.json({ code: 200, success: true, message: registered ? '注册并登录成功' : '登录成功', data: { token, user: userView({ ...user, role: activeRole }, roles) }, timestamp: Date.now() });
  } catch (error) { next(error); }
});

// 8. 获取当前登录用户信息 API
authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    let user: any = null;

    if (dbPool) {
      try {
        const [rows]: any = await dbPool.query(
          'SELECT id, name, email, phone, role, department, avatar_url, organization_id, is_organization_admin, created_at FROM users WHERE id = ? LIMIT 1',
          [userId]
        );
        if (rows && rows.length > 0) {
          user = {
            ...rows[0],
            role: normalizeRole(rows[0].role),
            roles: await loadUserRoles(rows[0].id, rows[0].role),
            avatarUrl: rows[0].avatar_url,
            organizationId: rows[0].organization_id,
            isOrganizationAdmin: rows[0].is_organization_admin
          };
        }
      } catch (e) {
        console.error('从数据库读取当前用户失败:', e);
      }
    }

    if (!user) {
      user = memoryUsers.find(u => u.id === userId) || req.user;
      if (user && !user.roles) user.roles = await loadUserRoles(user.id, user.role);
    }

    return res.json({
      code: 200,
      success: true,
      data: user,
      timestamp: Date.now()
    });
  } catch (err) {
    next(err);
  }
});

// 普通用户切换当前业务角色。平台管理员/客服不参与业务角色切换。
authRouter.post('/switch-role', authenticate, async (req, res, next) => {
  try {
    const targetRole = normalizeRole(String(req.body?.role || '')) as AppRole;
    if (!BUSINESS_ROLES.includes(targetRole)) {
      return res.status(400).json({ code: 400, success: false, message: '仅支持切换为品牌方或设计师' });
    }
    const roles = await loadUserRoles(req.user!.id, req.user!.role);
    if (!roles.includes(targetRole)) {
      return res.status(403).json({ code: 403, success: false, message: '当前账号未开通该角色' });
    }
    const currentUser = memoryUsers.find((item) => item.id === req.user!.id) || req.user;
    const user = {
      ...currentUser,
      role: targetRole,
      roles,
      organizationId: currentUser.organizationId || req.user!.organizationId,
      isOrganizationAdmin: currentUser.isOrganizationAdmin ?? req.user!.isOrganizationAdmin
    };
    const token = tokenForUser(user, targetRole, roles);
    setAuthCookie(res, token);
    return res.json({ code: 200, success: true, message: `已切换为${targetRole === 'advertiser' ? '品牌方' : '设计师'}角色`, data: { token, user: userView(user, roles) }, timestamp: Date.now() });
  } catch (err) { next(err); }
});
