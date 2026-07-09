import type { NextFunction, Request, Response } from 'express';
import type { ApiErrorResponse } from '@bellaworks/shared';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = typeof req.id === 'string' ? req.id : undefined;

  if (err instanceof HttpError) {
    const body: ApiErrorResponse = {
      error: { code: err.code, message: err.message, requestId },
    };
    res.status(err.status).json(body);
    return;
  }

  (req.log ?? logger).error({ err, requestId }, 'unhandled error');
  const body: ApiErrorResponse = {
    error: { code: 'internal_error', message: 'Internal server error', requestId },
  };
  res.status(500).json(body);
}
