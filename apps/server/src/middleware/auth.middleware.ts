import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'design-review-secret-key-2026';

export interface AuthUserPayload {
  id: string;
  email: string;
  name: string;
  role: 'advertiser' | 'designer' | 'customer_service' | 'admin';
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

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      code: 401,
      success: false,
      message: '未提供访问令牌或未登录'
    });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthUserPayload;
    req.user = decoded;
    next();
  } catch (err: any) {
    return res.status(401).json({
      code: 401,
      success: false,
      message: err.name === 'TokenExpiredError' ? '令牌已过期，请重新登录' : '无效的身份令牌'
    });
  }
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
