import type { Job } from 'pg-boss';
import { logger } from '../lib/logger.js';
import { processDocument } from '../modules/knowledge/service.js';
import { getBoss, INGEST_QUEUE, type IngestJob } from './queue.js';

export async function registerIngestWorker(): Promise<void> {
  await getBoss().work<IngestJob>(INGEST_QUEUE, async (jobs: Job<IngestJob>[]) => {
    for (const job of jobs) {
      logger.info({ documentId: job.data.documentId }, 'ingest job started');
      await processDocument(job.data.clientId, job.data.documentId);
    }
  });
}
