import type { NextFunction, Request, Response } from 'express';
import { tooManyRequests } from '../lib/errors.js';

interface Window {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window in-memory limiter keyed by IP. Good enough for a single API
 * instance; replaced by a Postgres-backed limiter when we scale out (Phase 7).
 */
export function rateLimit({
  windowMs,
  max,
  keyOf,
}: {
  windowMs: number;
  max: number;
  /** defaults to the request IP; use for per-session limits */
  keyOf?: (req: Request, res: Response) => string;
}) {
  const windows = new Map<string, Window>();

  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = keyOf ? keyOf(req, _res) : (req.ip ?? 'unknown');
    const now = Date.now();
    const window = windows.get(key);

    if (!window || window.resetAt <= now) {
      // Piggyback stale-entry cleanup on writes to keep the map bounded.
      if (windows.size > 10_000) {
        for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
      }
      windows.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    window.count += 1;
    if (window.count > max) {
      _res.setHeader('Retry-After', Math.ceil((window.resetAt - now) / 1000));
      next(tooManyRequests('Too many requests, slow down.'));
      return;
    }
    next();
  };
}
