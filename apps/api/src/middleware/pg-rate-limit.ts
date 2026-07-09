import type { NextFunction, Request, Response } from 'express';
import { appPool } from '../db/pool.js';
import { tooManyRequests } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

/**
 * Fixed-window limiter backed by Postgres, so limits hold across API
 * instances. One atomic upsert per request; fails open on database errors
 * (an unavailable limiter must not take chat down with it). Stale rows are
 * swept by the nightly maintenance job.
 */
export function pgRateLimit({
  scope,
  windowMs,
  max,
  keyOf,
}: {
  scope: string;
  windowMs: number;
  max: number;
  /** defaults to the request IP */
  keyOf?: (req: Request, res: Response) => string;
}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = `${scope}:${keyOf ? keyOf(req, res) : (req.ip ?? 'unknown')}`;
    let count = 0;
    try {
      const result = await appPool.query<{ count: number }>(
        `insert into rate_limits (key, window_start, count) values ($1, now(), 1)
         on conflict (key) do update set
           count = case when rate_limits.window_start <= now() - ($2 || ' milliseconds')::interval
                        then 1 else rate_limits.count + 1 end,
           window_start = case when rate_limits.window_start <= now() - ($2 || ' milliseconds')::interval
                               then now() else rate_limits.window_start end
         returning count`,
        [key, windowMs],
      );
      count = result.rows[0]!.count;
    } catch (error) {
      logger.warn({ err: error, scope }, 'rate limiter unavailable, allowing request');
      next();
      return;
    }
    if (count > max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      next(tooManyRequests('Too many requests, slow down.'));
      return;
    }
    next();
  };
}
