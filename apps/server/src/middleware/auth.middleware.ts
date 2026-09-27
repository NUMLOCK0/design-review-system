import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { dbPool } from '../config/database.js';

const configuredJwtSecret = String(process.env.JWT_SECRET || '').trim();
if (process.env.NODE_ENV === 'production' && configuredJwtSecret.length < 32) {
  throw new Error('生产环境必须配置至少 32 位 JWT_SECRET，禁止使用默认密钥');
}

// 开发环境允许使用一次性本地密钥；正式环境缺失密钥时直接阻止启动。
export const JWT_SECRET = configuredJwtSecret || 'local-development-secret-change-me';
export const AUTH_COOKIE_NAME = 'auth_token';

export function setAuthCookie(res: Response, token: string) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${secure}`);
}

export function clearAuthCookie(res: Response) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

export interface AuthUserPayload {
  id: string;
  email: string;
  phone?: string;
  name: string;
  role: 'advertiser' | 'designer' | 'customer_service' | 'admin';
  roles?: Array<'advertiser' | 'designer' | 'customer_service' | 'admin'>;
  organizationId?: string;
  isOrganizationAdmin?: boolean;
  department?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const cookieToken = String(req.headers.cookie || '').split(';').map((item) => item.trim()).find((item) => item.startsWith(`${AUTH_COOKIE_NAME}=`))?.slice(AUTH_COOKIE_NAME.length + 1);
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : cookieToken ? decodeURIComponent(cookieToken) : '';
  if (!token) {
    return res.status(401).json({
      code: 401,
      success: false,
      message: '未提供访问令牌或未登录'
    });
  }

  let decoded: AuthUserPayload;
  try {
    decoded = jwt.verify(token, JWT_SECRET) as AuthUserPayload;
  } catch (err: any) {
    return res.status(401).json({
      code: 401,
      success: false,
      message: err.name === 'TokenExpiredError' ? '令牌已过期，请重新登录' : '无效的身份令牌'
    });
  }

  // 签名有效不代表账号仍然有效。禁用账号后立即拒绝旧 Token，避免 7 天 Token 继续生效。
  if (dbPool) {
    try {
      const [rows]: any = await dbPool.query('SELECT id, is_active FROM users WHERE id = ? LIMIT 1', [decoded.id]);
      if (!rows?.length || !Boolean(rows[0].is_active)) {
        return res.status(401).json({ code: 401, success: false, message: '账号不存在或已被停用，请重新登录' });
      }
    } catch (error) {
      return next(error);
    }
  }

  req.user = decoded;
  next();
}

export function requireRoles(...roles: Array<'advertiser' | 'designer' | 'customer_service' | 'admin'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ code: 401, success: false, message: '请先登录' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        code: 403,
        success: false,
        message: '权限不足，当前角色无权操作'
      });
    }
    next();
  };
}
