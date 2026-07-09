import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { appPool } from './db/pool.js';
import { logger } from './lib/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFound } from './lib/errors.js';
import { adminRouter } from './modules/admin/routes.js';
import { chatRouter } from './modules/chat/routes.js';
import { knowledgeRouter } from './modules/knowledge/routes.js';
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
  app.use('/v1/knowledge', knowledgeRouter);
  app.use('/v1/chat', chatRouter);
  app.use('/v1/admin', adminRouter);

  // Embeddable widget assets (CDN takes over in Phase 8). The loader URL is
  // the permanent embed contract, so it gets a short cache; versioned bundles
  // are immutable.
  const widgetDist = fileURLToPath(new URL('../../../packages/widget/dist/', import.meta.url));
  if (existsSync(widgetDist)) {
    app.get('/widget.js', (_req, res) => {
      res.setHeader('Cache-Control', 'public, max-age=300');
      res.sendFile(path.join(widgetDist, 'widget.js'));
    });
    // Versioned bundles are immutable in production; dev must always
    // revalidate or rebuilt bundles never reach the browser.
    app.use(
      '/widget',
      express.static(
        widgetDist,
        env.NODE_ENV === 'production'
          ? { immutable: true, maxAge: '365d' }
          : { etag: true, maxAge: 0 },
      ),
    );
  }

  // Built admin dashboard (during development it runs on Vite at :5174).
  const dashboardDist = fileURLToPath(new URL('../../dashboard/dist/', import.meta.url));
  if (existsSync(dashboardDist)) {
    app.use('/admin', express.static(dashboardDist));
    app.get('/admin/{*any}', (_req, res) => res.sendFile(path.join(dashboardDist, 'index.html')));
  }

  app.use((req, _res, next) =>
    next(notFound('not_found', `No route for ${req.method} ${req.path}`)),
  );
  app.use(errorHandler);

  return app;
}
