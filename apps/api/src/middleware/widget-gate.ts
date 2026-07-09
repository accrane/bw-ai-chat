import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { isOriginAllowed } from '../lib/domains.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { findClientBySlug, type ClientRecord } from '../modules/clients/repository.js';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;

export interface WidgetLocals {
  client: ClientRecord;
  origin: string;
}

export const widgetLocals = (res: Response): WidgetLocals => res.locals as unknown as WidgetLocals;

/**
 * Shared gate for all browser-facing widget routes (/v1/widget, /v1/chat):
 * resolves the client from the :slug param and enforces the Origin
 * allow-list. CORS headers are set before enforcement so browsers can read
 * error responses; preflights (OPTIONS) end here.
 */
export async function widgetGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Express 5 types wildcard-route params as string | string[].
  const slug = typeof req.params.slug === 'string' ? req.params.slug : '';
  if (!SLUG_PATTERN.test(slug)) throw badRequest('invalid_client_id', 'Malformed client id.');

  const client = await findClientBySlug(slug);
  if (!client) throw notFound('unknown_client', 'No client with this id.');

  const origin = req.headers.origin;
  // The dashboard's own origin is implicitly allowed so the branding editor
  // can preview any client's widget.
  const allowed =
    isOriginAllowed(origin, client.allowedDomains) ||
    (!!env.DASHBOARD_ORIGIN && origin === env.DASHBOARD_ORIGIN);

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

  widgetLocals(res).client = client;
  widgetLocals(res).origin = origin;
  next();
}
