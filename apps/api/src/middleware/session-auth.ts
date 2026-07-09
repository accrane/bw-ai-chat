import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { unauthorized } from '../lib/errors.js';
import { verifySessionToken } from '../lib/session-token.js';
import { widgetLocals } from './widget-gate.js';

export interface SessionLocals {
  sessionId: string;
}

export const sessionLocals = (res: Response): SessionLocals =>
  res.locals as unknown as SessionLocals;

/**
 * Verifies the widget session JWT minted by POST /v1/widget/:slug/session.
 * Runs after widgetGate: the token must belong to the same client the URL
 * names, so a token minted for one client is useless against another.
 */
export async function sessionAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw unauthorized('missing_session', 'Mint a session first: POST /v1/widget/:slug/session');
  }
  const claims = await verifySessionToken(env.SESSION_JWT_SECRET, header.slice('Bearer '.length));
  if (!claims) throw unauthorized('invalid_session', 'Session token is invalid or expired.');
  if (claims.clientId !== widgetLocals(res).client.id) {
    throw unauthorized('invalid_session', 'Session token does not match this client.');
  }
  sessionLocals(res).sessionId = claims.sessionId;
  next();
}
