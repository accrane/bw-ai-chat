import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { verifyAdminToken, type AdminClaims } from '../lib/admin-token.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export const ADMIN_COOKIE = 'bw_admin';

export const adminLocals = (res: Response): AdminClaims =>
  (res.locals as { admin: AdminClaims }).admin;

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq !== -1 && part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

export async function adminAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = readCookie(req, ADMIN_COOKIE);
  const claims = token ? await verifyAdminToken(env.ADMIN_JWT_SECRET, token) : null;
  if (!claims) throw unauthorized('admin_auth_required', 'Sign in to the dashboard.');

  // CSRF defense-in-depth on top of SameSite: mutations must carry the
  // dashboard's custom header, which cross-site forms cannot set.
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'bw-dashboard') {
    throw forbidden('csrf_check_failed', 'Missing dashboard request header.');
  }

  (res.locals as { admin?: AdminClaims }).admin = claims;
  next();
}
