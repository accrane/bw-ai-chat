import { createApp } from './app.js';
import { env } from './config/env.js';
import { closePools } from './db/pool.js';
import { logger } from './lib/logger.js';
import { registerMaintenance } from './queue/maintenance.js';
import { startQueue, stopQueue } from './queue/queue.js';
import { registerIngestWorker } from './queue/worker.js';

await startQueue();
await registerIngestWorker();
await registerMaintenance();

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, 'bw-ai-chat api listening');
});

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'shutting down');
  server.close(async () => {
    await stopQueue();
    await closePools();
    process.exit(0);
  });
  // Failsafe if connections refuse to drain.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
