import 'dotenv/config';
import { dbPool } from '../apps/server/src/config/database.js';

async function main() {
  if (!dbPool) throw new Error('数据库未配置');
  try {
    const [tables]: any = await dbPool.query("SHOW TABLES LIKE 'image_studio_orchestration_%'");
    const [active]: any = await dbPool.query("SELECT COUNT(*) AS count FROM image_studio_jobs WHERE status IN ('queued','running','cancelling')");
    const [runs]: any = await dbPool.query("SELECT COUNT(*) AS count FROM image_studio_orchestration_runs WHERE status IN ('running','waiting_user','cancelling')");
    console.log(JSON.stringify({ schemaReady: tables.length === 3, activeJobs: Number(active[0].count), activeRuns: Number(runs[0].count), enabled: process.env.IMAGE_STUDIO_ORCHESTRATION_ENABLED === 'true' }));
  } finally { await dbPool.end(); }
}
main().catch((e) => { console.error('检查失败', e.code || e.message); process.exitCode = 1; });
