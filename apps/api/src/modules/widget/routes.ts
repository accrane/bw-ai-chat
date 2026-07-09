import { Router, type NextFunction, type Request, type Response } from 'express';
import type { WidgetConfigResponse, WidgetSessionResponse } from '@bellaworks/shared';
import { env } from '../../config/env.js';
import { newSessionId } from '../../lib/crypto.js';
import { isOriginAllowed } from '../../lib/domains.js';
import { badRequest, forbidden, notFound } from '../../lib/errors.js';
import { signSessionToken } from '../../lib/session-token.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { findClientBySlug, type ClientRecord } from '../clients/repository.js';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;

interface WidgetLocals {
  client: ClientRecord;
  origin: string;
}

const locals = (res: Response): WidgetLocals => res.locals as unknown as WidgetLocals;

/**
 * Resolves the client and enforces the Origin allow-list. CORS headers are
 * set before enforcement so browsers can read error responses; preflights
 * (OPTIONS) end here. Every widget route sits behind this gate.
 */
async function widgetGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Express 5 types wildcard-route params as string | string[].
  const slug = typeof req.params.slug === 'string' ? req.params.slug : '';
  if (!SLUG_PATTERN.test(slug)) throw badRequest('invalid_client_id', 'Malformed client id.');

  const client = await findClientBySlug(slug);
  if (!client) throw notFound('unknown_client', 'No client with this id.');

  const origin = req.headers.origin;
  const allowed = isOriginAllowed(origin, client.allowedDomains);

  res.setHeader('Vary', 'Origin');
  if (origin && allowed) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '600');
  }
  if (req.method === 'OPTIONS') {
    res.status(allowed ? 204 : 403).end();
    return;
  }

  if (!origin) throw forbidden('origin_required', 'Requests must include an Origin header.');
  if (!allowed) throw forbidden('origin_not_allowed', 'This domain is not authorized.');
  if (client.status !== 'active') throw forbidden('client_paused', 'This client is paused.');

  locals(res).client = client;
  locals(res).origin = origin;
  next();
}

export const widgetRouter = Router();

widgetRouter.use('/:slug/{*any}', widgetGate);

widgetRouter.get('/:slug/config', (_req: Request, res: Response) => {
  const { client } = locals(res);
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
  const { client, origin } = locals(res);
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
