import { PgBoss } from 'pg-boss';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export const INGEST_QUEUE = 'ingest-document';

export interface IngestJob {
  documentId: string;
  clientId: string;
}

let boss: PgBoss | null = null;

/** Starts pg-boss (creates its schema on first run). Worker registration lives in worker.ts. */
export async function startQueue(): Promise<void> {
  if (boss) return;
  const instance = new PgBoss({ connectionString: env.DATABASE_URL, schema: 'pgboss' });
  instance.on('error', (err: Error) => logger.error({ err }, 'pg-boss error'));
  await instance.start();
  await instance.createQueue(INGEST_QUEUE);
  boss = instance;
}

export function getBoss(): PgBoss {
  if (!boss) throw new Error('job queue not started');
  return boss;
}

export async function enqueueIngest(documentId: string, clientId: string): Promise<void> {
  await getBoss().send(INGEST_QUEUE, { documentId, clientId } satisfies IngestJob, {
    retryLimit: 3,
    retryDelay: 15,
    retryBackoff: true,
  });
}

export async function stopQueue(): Promise<void> {
  if (!boss) return;
  await boss.stop({ graceful: true, timeout: 5_000 });
  boss = null;
}
