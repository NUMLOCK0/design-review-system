import dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const { dbPool } = await import('../apps/server/src/config/database.js');
  const { migrateReferenceLinkItems } = await import('../apps/server/src/config/persistence.js');

  if (!dbPool) throw new Error('未检测到 MYSQL_URL，无法执行竞品参考结构迁移');
  try {
    const changed = await migrateReferenceLinkItems();
    console.log(`竞品参考结构迁移完成，共更新 ${changed} 条订单记录`);
  } finally {
    await dbPool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
