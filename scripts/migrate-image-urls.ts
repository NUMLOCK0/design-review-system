import dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(process.cwd(), '.env') });

async function main() {
  const { dbPool } = await import('../apps/server/src/config/database.js');
  const { migrateStoredImageUrls } = await import('../apps/server/src/config/persistence.js');

  if (!dbPool) {
    throw new Error('未检测到 MYSQL_URL，无法修复数据库图片地址');
  }

  try {
    const changed = await migrateStoredImageUrls();
    console.log(`数据库图片地址修复完成，共更新 ${changed} 条记录`);
  } finally {
    await dbPool.end();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
