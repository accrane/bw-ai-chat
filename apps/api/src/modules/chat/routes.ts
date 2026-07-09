import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { ChatErrorEvent } from '@bellaworks/shared';
import { HttpError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { rateLimit } from '../../middleware/rate-limit.js';
import { sessionAuth, sessionLocals } from '../../middleware/session-auth.js';
import { widgetGate, widgetLocals } from '../../middleware/widget-gate.js';
import { getConversationWithMessages, handleChatMessage } from './service.js';

const MessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(4_000),
});

// Per-session, on top of the per-IP limits elsewhere: one visitor can't burn
// a client's token budget in a loop.
const messageLimiter = rateLimit({
  windowMs: 60_000,
  max: 12,
  keyOf: (_req, res) => sessionLocals(res).sessionId,
});

export const chatRouter = Router();

chatRouter.use('/:slug/{*any}', widgetGate);
chatRouter.use('/:slug/{*any}', sessionAuth);

chatRouter.post('/:slug/messages', messageLimiter, async (req: Request, res: Response) => {
  const body = MessageSchema.parse(req.body);
  const { client } = widgetLocals(res);
  const { sessionId } = sessionLocals(res);

  const events = handleChatMessage({
    client,
    sessionId,
    conversationId: body.conversationId,
    message: body.message,
  });

  // Resolve the first event before committing to an SSE response, so
  // validation problems (unknown conversation, etc.) surface as JSON errors.
  const first = await events.next();

  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (type: string, data: unknown): void => {
    res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    if (!first.done) send(first.value.type, first.value.data);
    for await (const event of events) {
      send(event.type, event.data);
    }
  } catch (error) {
    // Headers are gone; the only option is an in-stream error event.
    logger.error({ err: error }, 'chat stream failed');
    const payload: ChatErrorEvent =
      error instanceof HttpError
        ? { code: error.code, message: error.message }
        : { code: 'chat_failed', message: 'Something went wrong generating a response.' };
    send('error', payload);
  }
  res.end();
});

chatRouter.get('/:slug/conversations/:id', async (req: Request, res: Response) => {
  const conversationId = z.string().uuid().parse(req.params.id);
  const { client } = widgetLocals(res);
  const { sessionId } = sessionLocals(res);
  res.json(await getConversationWithMessages(client.id, sessionId, conversationId));
});
