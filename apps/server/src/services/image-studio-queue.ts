import { Queue, QueueEvents, type JobsOptions } from 'bullmq';

export const IMAGE_STUDIO_QUEUES = {
  analysis: 'image-studio-analysis',
  text: 'image-studio-text',
  generation: 'image-studio-generation',
  export: 'image-studio-export',
} as const;

export type ImageStudioQueueName = typeof IMAGE_STUDIO_QUEUES[keyof typeof IMAGE_STUDIO_QUEUES];

let parsedConnection: Record<string, unknown> | null = null;
const queues = new Map<ImageStudioQueueName, Queue>();
const queueEvents = new Map<ImageStudioQueueName, QueueEvents>();

function redisConnection() {
  if (parsedConnection) return parsedConnection;
  const raw = String(process.env.REDIS_URL || '').trim();
  if (!raw) throw new Error('生图服务需要配置 REDIS_URL，未启用内存队列回退');
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('REDIS_URL 格式无效'); }
  if (!['redis:', 'rediss:'].includes(url.protocol)) throw new Error('REDIS_URL 必须使用 redis:// 或 rediss://');
  parsedConnection = {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 10_000,
  };
  if (!Number.isInteger(parsedConnection.port) || !Number.isInteger(parsedConnection.db)) throw new Error('REDIS_URL 端口或 DB 编号无效');
  return parsedConnection;
}

export function getImageStudioRedisConnection() { return redisConnection(); }

export function assertImageStudioInfrastructure() {
  redisConnection();
  if (process.env.NODE_ENV === 'production' && !process.env.MYSQL_URL) throw new Error('生产生图服务必须配置 MYSQL_URL');
}

export function getImageStudioQueue(name: ImageStudioQueueName) {
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection: redisConnection() as never,
      defaultJobOptions: {
        attempts: Number(process.env.IMAGE_STUDIO_QUEUE_ATTEMPTS || 4),
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: { age: 7 * 24 * 60 * 60, count: 10_000 },
        removeOnFail: false,
      },
    });
    queue.on('error', (error) => console.error('[image-studio] queue error', error));
    queues.set(name, queue);
  }
  return queue;
}

export function getImageStudioQueueEvents(name: ImageStudioQueueName) {
  let events = queueEvents.get(name);
  if (!events) {
    events = new QueueEvents(name, { connection: redisConnection() as never, autorun: true });
    events.on('error', (error) => console.error('[image-studio] queue events error', error));
    queueEvents.set(name, events);
  }
  return events;
}

export async function dispatchImageStudioJob(name: ImageStudioQueueName, jobName: string, jobId: string, payload: unknown) {
  const options: JobsOptions = { jobId, attempts: Number(process.env.IMAGE_STUDIO_QUEUE_ATTEMPTS || 4), backoff: { type: 'exponential', delay: 3000 } };
  return getImageStudioQueue(name).add(jobName, payload, options);
}

export async function closeImageStudioQueues() {
  await Promise.all([
    ...[...queueEvents.values()].map((item) => item.close()),
    ...[...queues.values()].map((item) => item.close()),
  ]);
  queueEvents.clear();
  queues.clear();
  parsedConnection = null;
}
