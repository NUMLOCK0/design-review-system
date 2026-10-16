/** Create one named administrator on a fresh installation; never reset an existing account. */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/server');
dotenv.config({ path: path.join(serverDir, '.env') });

async function main() {
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || '').trim().toLowerCase();
  const name = String(process.env.BOOTSTRAP_ADMIN_NAME || '').trim();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 128) throw new Error('请设置有效的 BOOTSTRAP_ADMIN_EMAIL');
  if (!name || name.length > 64) throw new Error('请设置 1–64 字的 BOOTSTRAP_ADMIN_NAME');
  if (password.length < 16) throw new Error('BOOTSTRAP_ADMIN_PASSWORD 至少需要 16 个字符');
  if (!process.env.MYSQL_URL) throw new Error('请先在 apps/server/.env 中配置 MYSQL_URL');

  const { dbPool } = await import('../apps/server/src/config/database');
  if (!dbPool) throw new Error('MySQL 连接池未创建');
  const connection = await dbPool.getConnection();
  try {
    await connection.beginTransaction();
    const [existing]: any = await connection.query('SELECT id FROM users WHERE email=? FOR UPDATE', [email]);
    if (existing.length) throw new Error('该邮箱已存在；不会覆盖账号或重置密码');
    const id = `u_${randomUUID()}`;
    const passwordHash = await bcrypt.hash(password, 12);
    await connection.query('INSERT INTO users (id,name,email,password_hash,role,department,is_active) VALUES (?,?,?,?,?,?,TRUE)',
      [id, name, email, passwordHash, 'admin', '系统管理']);
    await connection.query('INSERT INTO user_roles (user_id,role) VALUES (?,?)', [id, 'admin']);
    await connection.commit();
    console.log(`管理员已创建：${email}`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
    await dbPool.end();
  }
}

main().catch((error: any) => {
  const message = String(error?.message || '');
  if (/^(请设置|BOOTSTRAP_ADMIN_PASSWORD|请先在|MySQL 连接池未创建|该邮箱已存在)/.test(message)) console.error(message);
  else console.error(`管理员创建失败：${error?.code || '请检查数据库连接和表结构'}`);
  process.exitCode = 1;
});
