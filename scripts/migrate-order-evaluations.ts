import { dbPool } from '../apps/server/src/config/database.js';
import { ensureOrderEvaluationSchema } from '../apps/server/src/config/order-evaluation-schema.js';

async function main() {
  if (!dbPool) throw new Error('未配置 MYSQL_URL');
  try {
    await ensureOrderEvaluationSchema(dbPool);
    console.log('订单评价数据库迁移完成；历史已验收订单不补造评价');
  } finally { await dbPool.end(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
