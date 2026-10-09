import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv.config({ path: fileURLToPath(new URL('../apps/server/.env', import.meta.url)) });
async function main() {
  const { dbPool } = await import('../apps/server/src/config/database');
  const { ensureCollaborationSchema } = await import('../apps/server/src/config/collaboration-schema');
  const { ensureChatSchema } = await import('../apps/server/src/config/chat-schema');
  if (!dbPool) throw new Error('需要 MYSQL_URL，未修改数据库');
  try { await ensureChatSchema(dbPool); await ensureCollaborationSchema(dbPool); console.log('需求协作数据表已就绪。'); }
  finally { await dbPool.end(); }
}
void main();
