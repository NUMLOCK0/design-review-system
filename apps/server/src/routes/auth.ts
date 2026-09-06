import { Router } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import crypto from 'crypto';
import { dbPool } from '../config/database.js';
import { authenticate } from '../middleware/auth.middleware.js';

export const authRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'design-review-secret-key-2026';

// 内存 Mock 数据（数据库连接不可用时的安全回退）
let memoryUsers = [
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
    role: 'reviewer',
    department: '视觉设计部',
    avatarUrl: ''
  },
  {
    id: 'u_des_1',
    name: '李设计师',
    email: 'designer@cozi.com',
    passwordHash: bcrypt.hashSync('123456', 10),
    role: 'designer',
    department: '视觉设计部',
    avatarUrl: ''
  },
];

const loginSchema = z.object({
  email: z.string().email({ message: '请输入有效的邮箱地址' }),
  password: z.string().min(1, { message: '密码不能为空' })
});

const registerSchema = z.object({
  name: z.string().min(2, { message: '姓名长度不能少于2位' }),
  email: z.string().email({ message: '请输入有效的邮箱地址' }),
  password: z.string().min(6, { message: '密码长度不能少于6位' }),
  role: z.enum(['admin', 'reviewer', 'designer']).default('designer'),
  department: z.string().optional()
});

// 1. 用户登录 API
authRouter.post('/login', async (req, res, next) => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        code: 400,
        success: false,
        message: parseResult.error.errors[0].message
      });
    }

    const { email, password } = parseResult.data;
    let user: any = null;

    if (dbPool) {
      try {
        const [rows]: any = await dbPool.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
        if (rows && rows.length > 0) {
          user = {
            id: rows[0].id,
            name: rows[0].name,
            email: rows[0].email,
            passwordHash: rows[0].password_hash,
            role: rows[0].role,
            department: rows[0].department,
            avatarUrl: rows[0].avatar_url
          };
        }
      } catch (e) {
        console.error('查询数据库用户出错，切换到内存比对:', e);
      }
    }

    if (!user) {
      user = memoryUsers.find(u => u.email === email);
    }

    if (!user) {
      return res.status(401).json({
        code: 401,
        success: false,
        message: '用户不存在或账号错误'
      });
    }

    // 校验密码
    const isMatch = user.passwordHash
      ? await bcrypt.compare(password, user.passwordHash)
      : password === '123456'; // 兼容无哈希场景

    if (!isMatch) {
      return res.status(401).json({
        code: 401,
        success: false,
        message: '邮箱或密码不正确'
      });
    }

    // 签发 JWT Token
    const tokenPayload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      department: user.department
    };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      code: 200,
      success: true,
      message: '登录成功',
      data: {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          department: user.department,
          avatarUrl: user.avatarUrl
        }
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
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        code: 400,
        success: false,
        message: parseResult.error.errors[0].message
      });
    }

    const { name, email, password, role, department } = parseResult.data;
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = `u_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    if (dbPool) {
      try {
        const [existing]: any = await dbPool.query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing && existing.length > 0) {
          return res.status(400).json({ code: 400, success: false, message: '该邮箱已被注册' });
        }

        await dbPool.query(
          `INSERT INTO users (id, name, email, password_hash, role, department)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [userId, name, email, passwordHash, role, department || '视觉设计部']
        );
      } catch (err: any) {
        console.error('MySQL 注册插入失败:', err);
      }
    }

    // 同步内存
    const newUser = {
      id: userId,
      name,
      email,
      passwordHash,
      role,
      department: department || '视觉设计部',
      avatarUrl: ''
    };
    memoryUsers.push(newUser);

    const tokenPayload = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      department: newUser.department
    };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      code: 201,
      success: true,
      message: '注册成功',
      data: {
        token,
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          department: newUser.department
        }
      },
      timestamp: Date.now()
    });
  } catch (err) {
    next(err);
  }
});

// 3. 获取当前登录用户信息 API
authRouter.get('/me', authenticate, async (req, res, next) => {
  try {
    const userId = req.user!.id;
    let user: any = null;

    if (dbPool) {
      try {
        const [rows]: any = await dbPool.query(
          'SELECT id, name, email, role, department, avatar_url, created_at FROM users WHERE id = ? LIMIT 1',
          [userId]
        );
        if (rows && rows.length > 0) {
          user = rows[0];
        }
      } catch (e) {
        console.error('从数据库读取当前用户失败:', e);
      }
    }

    if (!user) {
      user = memoryUsers.find(u => u.id === userId) || req.user;
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
