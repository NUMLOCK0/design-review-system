import { dbPool } from '../apps/server/src/config/database.js';
import { ensureOrderApplicationSchema } from '../apps/server/src/config/order-application-schema.js';

async function main() {
  if (!dbPool) throw new Error('未配置 MYSQL_URL');
  try {
    await ensureOrderApplicationSchema(dbPool);
    console.log('接单申请数据库迁移完成');
  } finally { await dbPool.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
