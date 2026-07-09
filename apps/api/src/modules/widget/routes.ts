import { Router, type Request, type Response } from 'express';
import type { WidgetConfigResponse, WidgetSessionResponse } from '@bellaworks/shared';
import { env } from '../../config/env.js';
import { newSessionId } from '../../lib/crypto.js';
import { signSessionToken } from '../../lib/session-token.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { widgetGate, widgetLocals } from '../../middleware/widget-gate.js';

export const widgetRouter = Router();

widgetRouter.use('/:slug/{*any}', widgetGate);

widgetRouter.get('/:slug/config', (_req: Request, res: Response) => {
  const { client } = widgetLocals(res);
  const body: WidgetConfigResponse = {
    clientId: client.slug,
    name: client.name,
    branding: client.branding,
  };
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json(body);
});

const sessionLimiter = rateLimit({ windowMs: 60_000, max: 30 });

widgetRouter.post('/:slug/session', sessionLimiter, async (_req: Request, res: Response) => {
  const { client, origin } = widgetLocals(res);
  const sessionId = newSessionId();
  const { token, expiresAt } = await signSessionToken(env.SESSION_JWT_SECRET, sessionId, {
    clientId: client.id,
    slug: client.slug,
    origin,
  });
  const body: WidgetSessionResponse = {
    token,
    sessionId,
    expiresAt: expiresAt.toISOString(),
  };
  res.status(201).json(body);
});
