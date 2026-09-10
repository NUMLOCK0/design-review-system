import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { reviewTasksRouter, tasks } from './routes/review-tasks.js';
import { reviewRulesRouter, rules } from './routes/review-rules.js';
import { authRouter } from './routes/auth.js';
import { uploadRouter } from './routes/upload.js';
import { designOrders, designOrdersRouter } from './routes/design-orders.js';
import { initializeSystemConfig, systemConfigRouter } from './routes/system-config.js';
import { designerWallets, walletRouter, withdrawalRequests } from './routes/wallet.js';
import { disputes, disputesRouter } from './routes/disputes.js';
import { messages, messagesRouter } from './routes/messages.js';
import { invitationsRouter } from './routes/invitations.js';
import { serviceRouter, serviceLogs } from './routes/service.js';
import { initializePersistence, refreshPersistence } from './config/persistence.js';
import { paymentsRouter } from './routes/payments.js';
import { ensureOssCors } from './config/oss-client.js';
import { designerProfilesRouter } from './routes/designer-profiles.js';
import { usersRouter } from './routes/users.js';
import { adminAuditLogsRouter } from './routes/admin-audit-logs.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;
let refreshPromise: Promise<unknown> | null = null;
let lastRefreshAt = 0;

// 中间件配置
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// 生产环境以 MySQL 为准，避免 PM2 进程继续使用启动时的旧内存快照。
app.use('/api', async (_req, _res, next) => {
  // 登录、验证码和健康检查不依赖业务内存快照，跳过全量 MySQL 刷新，避免登录被数据库抖动阻断。
  if (_req.path === '/health' || _req.path.startsWith('/auth')) return next();
  // 多个页面请求同时进入时共用一次刷新，避免并发查询耗尽连接并触发 ECONNRESET。
  if (Date.now() - lastRefreshAt < 1000) return next();
  try {
    if (!refreshPromise) {
      refreshPromise = refreshPersistence({ designOrders, rules, tasks, disputes, messages, serviceLogs, designerWallets, withdrawalRequests })
        .finally(() => { lastRefreshAt = Date.now(); refreshPromise = null; });
    }
    await refreshPromise;
    next();
  } catch (error) {
    refreshPromise = null;
    next(error);
  }
});

// 仅公开带水印预览目录；原图统一存储在 private-uploads 或私有 OSS。
const uploadsDir = path.join(process.cwd(), 'uploads');
const previewUploadsDir = path.join(uploadsDir, 'previews');
if (!fs.existsSync(previewUploadsDir)) {
  fs.mkdirSync(previewUploadsDir, { recursive: true });
}
app.use('/uploads/previews', express.static(previewUploadsDir, { dotfiles: 'deny', index: false }));

// 健康检查路由
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    service: 'Design Review System Backend API',
    version: '1.0.0'
  });
});

// 业务路由注册
app.use('/api/auth', authRouter);
app.use('/api/review-tasks', reviewTasksRouter);
app.use('/api/review-rules', reviewRulesRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/design-orders', designOrdersRouter);
app.use('/api/system-config', systemConfigRouter);
app.use('/api/users', usersRouter);
app.use('/api/admin/audit-logs', adminAuditLogsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/wallet', walletRouter);
app.use('/api/disputes', disputesRouter);
app.use('/api/messages', messagesRouter);
app.use('/api', designerProfilesRouter);
app.use('/api', invitationsRouter);
app.use('/api/service', serviceRouter);

// 全局错误处理中间件
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[API Error]:', err);
  res.status(err.status || 500).json({
    code: err.code || 500,
    success: false,
    message: err.message || '内部服务器错误',
    data: null,
    timestamp: Date.now()
  });
});

async function startServer() {
  await initializePersistence({ designOrders, rules, tasks, disputes, messages, serviceLogs, designerWallets, withdrawalRequests });
  await initializeSystemConfig();
  await ensureOssCors();
  app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` [API Server] 设计审核系统后端服务启动成功!`);
    console.log(` 访问地址: http://localhost:${PORT}`);
    console.log(` API 基础路径: http://localhost:${PORT}/api`);
    console.log(` 图片预览目录: http://localhost:${PORT}/uploads/previews`);
    console.log(`=======================================================`);
  });
}

void startServer();
