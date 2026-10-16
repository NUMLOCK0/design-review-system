import dotenv from 'dotenv';
import { dbPool } from './config/database.js';
import { ensureImageStudioSchema } from './config/image-studio-schema.js';
import { startImageStudioWorkers, stopImageStudioWorkers } from './services/image-studio-worker.js';
import { ensureAiCallLogSchema } from './services/ai-call-log.js';

dotenv.config();

async function main() {
  if (!dbPool) throw new Error('生图 Worker 必须连接 MySQL，不支持内存模式');
  await ensureAiCallLogSchema();
  await ensureImageStudioSchema(dbPool);
  await startImageStudioWorkers();
  console.log('[image-studio] Worker online');
}

let stopping: Promise<void> | null = null;
async function shutdown(signal: string) {
  if (stopping) return stopping;
  stopping = (async () => {
    console.log(`[image-studio] graceful shutdown requested (${signal})`);
    const graceMs = Math.max(5000, Number(process.env.IMAGE_STUDIO_SHUTDOWN_GRACE_MS || 25_000));
    const forcedExit = setTimeout(() => {
      console.error('[image-studio] drain grace period elapsed; exiting so BullMQ can recover active jobs');
      process.exit(1);
    }, graceMs);
    try { await stopImageStudioWorkers(); }
    finally { clearTimeout(forcedExit); }
    await dbPool?.end();
  })();
  return stopping;
}

process.once('SIGTERM', () => { void shutdown('SIGTERM').finally(() => process.exit(0)); });
process.once('SIGINT', () => { void shutdown('SIGINT').finally(() => process.exit(0)); });
void main().catch(async (error) => {
  console.error('[image-studio] Worker startup failed', error);
  await shutdown('startup-error').catch(() => undefined);
  process.exitCode = 1;
});
