import { randomUUID } from 'node:crypto';
import express from 'express';
import { pinoHttp } from 'pino-http';
import { appPool } from './db/pool.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './lib/errors.js';
import { widgetRouter } from './modules/widget/routes.js';

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '64kb' }));
  app.use(
    pinoHttp({
      logger,
      genReqId: () => randomUUID(),
      customProps: () => ({}),
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  app.use((req, res, next) => {
    res.setHeader('X-Request-Id', String(req.id));
    next();
  });

  app.get('/health', async (_req, res) => {
    let db = 'up';
    try {
      await appPool.query('select 1');
    } catch {
      db = 'down';
    }
    res.status(db === 'up' ? 200 : 503).json({ ok: db === 'up', db });
  });

  app.use('/v1/widget', widgetRouter);

  app.use((req, _res, next) =>
    next(notFound('not_found', `No route for ${req.method} ${req.path}`)),
  );
  app.use(errorHandler);

  return app;
}
