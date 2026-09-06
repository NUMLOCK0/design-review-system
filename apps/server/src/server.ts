import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { reviewTasksRouter } from './routes/review-tasks.js';
import { reviewRulesRouter } from './routes/review-rules.js';
import { authRouter } from './routes/auth.js';
import { uploadRouter } from './routes/upload.js';
import { designOrdersRouter } from './routes/design-orders.js';
import { systemConfigRouter } from './routes/system-config.js';
import { walletRouter } from './routes/wallet.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// 中间件配置
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 静态文件目录（用于本地文件上传预览）
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

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
app.use('/api/wallet', walletRouter);

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

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` [API Server] 设计审核系统后端服务启动成功!`);
  console.log(` 访问地址: http://localhost:${PORT}`);
  console.log(` API 基础路径: http://localhost:${PORT}/api`);
  console.log(` 上传静态目录: http://localhost:${PORT}/uploads`);
  console.log(`=======================================================`);
});
