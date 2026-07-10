import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import type { ApiErrorResponse } from '@bw-ai-chat/shared';
import { HttpError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = typeof req.id === 'string' ? req.id : undefined;

  if (err instanceof ZodError) {
    const detail = err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
    const body: ApiErrorResponse = {
      error: { code: 'validation_error', message: detail, requestId },
    };
    res.status(400).json(body);
    return;
  }

  if (err instanceof multer.MulterError) {
    const body: ApiErrorResponse = {
      error: { code: 'upload_error', message: err.message, requestId },
    };
    res.status(400).json(body);
    return;
  }

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
