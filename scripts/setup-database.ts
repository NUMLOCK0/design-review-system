/** Create the application schema and the twelve explicitly requested starter accounts. */
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { ddlStatements } from '../apps/server/src/init-db';

type Role = 'advertiser' | 'designer' | 'customer_service' | 'admin';
type Account = { email: string; name: string; role: Role; department: string; organizationId: string | null };

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/server');
const envPath = path.join(serverDir, '.env');
dotenv.config({ path: envPath, override: true });

const accounts: Account[] = [
  ...Array.from({ length: 3 }, (_, index) => ({ email: `advertiser0${index + 1}@cozi.com`, name: `品牌方0${index + 1}`, role: 'advertiser' as const, department: '品牌营销部', organizationId: `org_cozi_advertiser0${index + 1}` })),
  ...Array.from({ length: 3 }, (_, index) => ({ email: `designer0${index + 1}@cozi.com`, name: `设计师0${index + 1}`, role: 'designer' as const, department: '视觉设计部', organizationId: null })),
  ...Array.from({ length: 3 }, (_, index) => ({ email: `customer_service0${index + 1}@cozi.com`, name: `客服0${index + 1}`, role: 'customer_service' as const, department: '客服与争议处理部', organizationId: null })),
  ...Array.from({ length: 3 }, (_, index) => ({ email: `admin0${index + 1}@cozi.com`, name: `管理员0${index + 1}`, role: 'admin' as const, department: '运营管理部', organizationId: null })),
];

async function main() {
  const phase = process.argv[2]?.replace(/^--phase=/, '') ?? 'all';
  if (!['all', 'base', 'persistence', 'applications', 'evaluations', 'forms', 'chat', 'collaboration', 'accounts'].includes(phase)) {
    throw new Error('未知的数据库初始化阶段');
  }
  const run = (name: string) => phase === 'all' || phase === name;
  const password = process.env.BOOTSTRAP_PASSWORD;
  if (!password) throw new Error('请通过 BOOTSTRAP_PASSWORD 环境变量提供初始密码');
  if (!process.env.MYSQL_URL) throw new Error(`请在 ${envPath} 配置 MYSQL_URL`);

  // Load the pool only after dotenv has read the explicit server .env file.
  const { dbPool } = await import('../apps/server/src/config/database');
  if (!dbPool) throw new Error('MySQL 连接池未创建');
  try {
    await dbPool.query('SELECT 1');
    console.log('数据库已连接；开始检查和创建应用表。');
    if (run('base')) {
    const [existingTables]: any = await dbPool.query('SHOW TABLES');
    const tableNames = new Set(existingTables.map((row: Record<string, string>) => Object.values(row)[0]));
    for (const [index, statement] of ddlStatements.entries()) {
      const tableName = /CREATE TABLE IF NOT EXISTS\s+([a-z_]+)/i.exec(statement)?.[1];
      if (tableName && tableNames.has(tableName)) continue;
      console.log(`创建基础表 ${index + 1}/${ddlStatements.length}：${tableName ?? 'unknown'}…`);
      await dbPool.query(statement);
    }
    }

    if (run('persistence')) {
    const { ensurePersistenceSchema } = await import('../apps/server/src/config/persistence');
    console.log('检查持久化表…');
    await ensurePersistenceSchema({ preserveExistingData: true });
    }
    if (run('applications')) {
    const { ensureOrderApplicationSchema } = await import('../apps/server/src/config/order-application-schema');
    console.log('检查接单表…');
    await ensureOrderApplicationSchema(dbPool);
    }
    if (run('evaluations')) {
    const { ensureOrderEvaluationSchema } = await import('../apps/server/src/config/order-evaluation-schema');
    console.log('检查评价表…');
    await ensureOrderEvaluationSchema(dbPool);
    }
    if (run('chat')) {
    const { ensureChatSchema } = await import('../apps/server/src/config/chat-schema');
    console.log('检查订单聊天表…');
    await ensureChatSchema(dbPool);
    }
    if (run('collaboration')) {
    const { ensureCollaborationSchema } = await import('../apps/server/src/config/collaboration-schema');
    console.log('检查需求协作表…');
    await ensureCollaborationSchema(dbPool);
    }
    if (run('forms')) {
    const { initializeFormTemplates } = await import('../apps/server/src/routes/form-templates');
    console.log('检查表单模板…');
    await initializeFormTemplates();
    }

    if (run('accounts')) {
    const connection = await dbPool.getConnection();
    let created = 0;
    let alreadyPresent = 0;
    try {
      await connection.beginTransaction();
      const [existingRows]: any = await connection.query(
        `SELECT id, email, role, password_hash, is_active FROM users WHERE email IN (${accounts.map(() => '?').join(',')}) FOR UPDATE`,
        accounts.map((account) => account.email),
      );
      const existingByEmail = new Map<string, any>(existingRows.map((row: any) => [row.email, row]));
      const newUsers: unknown[][] = [];
      const newRoles: unknown[][] = [];
      for (const account of accounts) {
        const existing = existingByEmail.get(account.email);
        if (existing) {
          if (existing.role !== account.role || !existing.is_active || !existing.password_hash || !(await bcrypt.compare(password, existing.password_hash))) {
            throw new Error(`${account.email} 已存在，但角色、状态或密码与本次要求不一致；未覆盖现有账号`);
          }
          alreadyPresent++;
          continue;
        }
        const id = `u_${crypto.randomUUID()}`;
        const passwordHash = await bcrypt.hash(password, 10);
        newUsers.push([id, account.name, account.email, passwordHash, account.role, account.department, account.organizationId, account.role === 'advertiser', true]);
        newRoles.push([id, account.role]);
        created++;
      }
      if (newUsers.length) {
        await connection.query(
          `INSERT INTO users (id, name, email, password_hash, role, department, organization_id, is_organization_admin, is_active) VALUES ${newUsers.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',')}`,
          newUsers.flat(),
        );
        await connection.query(
          `INSERT INTO user_roles (user_id, role, created_at) VALUES ${newRoles.map(() => '(?, ?, CURRENT_TIMESTAMP)').join(',')}`,
          newRoles.flat(),
        );
      }
      await connection.commit();
    } catch (error) {
      try { await connection.rollback(); } catch { /* The connection may already be lost. */ }
      throw error;
    } finally {
      connection.release();
    }

    const [verified]: any = await dbPool.query(
      `SELECT u.email, u.role, u.password_hash, u.is_active, ur.role AS linked_role
       FROM users u LEFT JOIN user_roles ur ON ur.user_id=u.id
       WHERE u.email IN (${accounts.map(() => '?').join(',')})`,
      accounts.map((account) => account.email),
    );
    if (verified.length !== accounts.length) throw new Error(`账号核验失败：预期 ${accounts.length} 个，实际 ${verified.length} 个`);
    for (const account of accounts) {
      const row = verified.find((item: any) => item.email === account.email);
      if (!row || row.role !== account.role || row.linked_role !== account.role || !row.is_active || !(await bcrypt.compare(password, row.password_hash))) {
        throw new Error(`${account.email} 核验失败`);
      }
    }
    const [tables]: any = await dbPool.query('SHOW TABLES');
    console.log(`应用表 ${tables.length} 张；账号新建 ${created} 个、已有且匹配 ${alreadyPresent} 个；12 个账号和密码哈希均已核验。`);
    }
  } finally {
    await dbPool.end();
  }
}

main().catch((error: any) => {
  // 驱动错误全文可能包含连接串；只显示安全的错误码。
  const safeMessage = typeof error?.message === 'string' && /^(请通过 BOOTSTRAP_PASSWORD|请在 .* 配置 MYSQL_URL|MySQL 连接池未创建|账号核验失败：|[^\s@]+@cozi\.com (已存在|核验失败))/.test(error.message);
  console.error(error?.code ? `数据库操作失败：${error.code}` : safeMessage ? error.message : '数据库初始化失败，请检查服务端日志');
  process.exitCode = 1;
});
