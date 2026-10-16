import { dbPool } from '../config/database.js';
import { IMAGE_STUDIO_QUEUES, getImageStudioQueueEvents, type ImageStudioQueueName } from './image-studio-queue.js';
import { publishImageStudioEvent } from '../socket/chat-socket.js';

let started = false;

export function startImageStudioRealtimeBridge() {
  if (started || !dbPool || !process.env.REDIS_URL) return;
  started = true;
  const queues = [IMAGE_STUDIO_QUEUES.generation, IMAGE_STUDIO_QUEUES.text, IMAGE_STUDIO_QUEUES.export];
  for (const name of queues) {
    const events = getImageStudioQueueEvents(name as ImageStudioQueueName);
    events.on('progress', async ({ jobId, data }) => {
      try {
        const [rows]: any = await dbPool!.query(`SELECT owner_id,project_id,status FROM image_studio_jobs WHERE id=? LIMIT 1`, [jobId]);
        if (!rows[0]) return;
        publishImageStudioEvent(String(rows[0].owner_id), { jobId, projectId: rows[0].project_id, status: rows[0].status, progress: data, emittedAt: new Date().toISOString() });
      } catch (error) { console.error('[image-studio] realtime progress relay failed', error); }
    });
    events.on('completed', async ({ jobId }) => {
      try {
        const [rows]: any = await dbPool!.query(`SELECT owner_id,project_id,status,progress,error_code,error_message,completed_at
          FROM image_studio_jobs WHERE id=? LIMIT 1`, [jobId]);
        if (!rows[0]) return;
        const [eventRows]: any = await dbPool!.query('SELECT event_id,event_type,payload_json,created_at FROM image_studio_job_events WHERE job_id=? ORDER BY event_id DESC LIMIT 1', [jobId]);
        const event = eventRows[0];
        publishImageStudioEvent(String(rows[0].owner_id), { jobId, projectId: rows[0].project_id, status: rows[0].status,
          progress: Number(rows[0].progress), eventId: event ? Number(event.event_id) : null,
          eventType: event?.event_type || 'job.completed', data: typeof event?.payload_json === 'string' ? JSON.parse(event.payload_json) : event?.payload_json || null,
          emittedAt: event?.created_at || rows[0].completed_at || new Date().toISOString() });
      } catch (error) { console.error('[image-studio] realtime completion relay failed', error); }
    });
    events.on('failed', async ({ jobId, failedReason }) => {
      try {
        const queue = (await import('./image-studio-queue.js')).getImageStudioQueue(name as ImageStudioQueueName);
        const bullJob = await queue.getJob(jobId);
        const queueState = bullJob ? await bullJob.getState() : 'failed';
        if (queueState === 'waiting' || queueState === 'delayed' || queueState === 'waiting-children') return;
        await new Promise((resolve) => setTimeout(resolve, 250));
        const [rows]: any = await dbPool!.query(`SELECT owner_id,project_id,status,progress,error_code,error_message FROM image_studio_jobs WHERE id=? LIMIT 1`, [jobId]);
        if (!rows[0]) return;
        publishImageStudioEvent(String(rows[0].owner_id), { jobId, projectId: rows[0].project_id, status: rows[0].status,
          progress: Number(rows[0].progress), error: rows[0].error_code ? { code: rows[0].error_code, message: rows[0].error_message } : { message: String(failedReason || '任务失败').replace(/Bearer\s+\S+/gi, 'Bearer [redacted]').slice(0, 768) },
          emittedAt: new Date().toISOString() });
      } catch (error) { console.error('[image-studio] realtime failure relay failed', error); }
    });
  }
}
