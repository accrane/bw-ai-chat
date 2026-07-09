import { adminPool } from '../db/pool.js';
import { logger } from '../lib/logger.js';
import { getBoss } from './queue.js';

export const MAINTENANCE_QUEUE = 'maintenance';

/**
 * Nightly housekeeping: per-client conversation retention (data-privacy
 * posture — clients choose how long visitor conversations are kept) and the
 * rate-limit window sweep. Trusted internal job, runs on the privileged pool.
 */
export async function runMaintenance(): Promise<void> {
  const swept = await adminPool.query(
    `delete from rate_limits where window_start < now() - interval '1 hour'`,
  );

  const purged = await adminPool.query(
    `delete from conversations c
      using clients cl
      where cl.id = c.client_id
        and (cl.ai_settings->>'retentionDays') is not null
        and c.updated_at < now() - ((cl.ai_settings->>'retentionDays') || ' days')::interval`,
  );

  logger.info(
    { rateLimitRowsSwept: swept.rowCount, conversationsPurged: purged.rowCount },
    'maintenance complete',
  );
}

export async function registerMaintenance(): Promise<void> {
  const boss = getBoss();
  await boss.createQueue(MAINTENANCE_QUEUE);
  await boss.work(MAINTENANCE_QUEUE, async () => {
    await runMaintenance();
  });
  await boss.schedule(MAINTENANCE_QUEUE, '0 3 * * *');
}
