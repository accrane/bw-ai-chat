import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { AiSettingsSchema, BrandingSchema } from '@bellaworks/shared';
import { withDbContext } from '../../db/context.js';
import { generateApiKey } from '../../lib/crypto.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { sealSecret } from '../../lib/secret-box.js';
import { adminAuth } from '../../middleware/admin-auth.js';
import * as knowledgeRepo from '../knowledge/repository.js';
import { ingestDocument } from '../knowledge/service.js';
import { adminAuthRouter } from './auth-routes.js';
import * as repo from './repository.js';

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,62}$/;

const CreateClientSchema = z.object({
  slug: z.string().regex(SLUG_PATTERN, 'lowercase letters, numbers, and dashes'),
  name: z.string().min(1).max(200),
  allowedDomains: z.array(z.string().min(1).max(253)).default([]),
});

const UpdateClientSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['active', 'paused']).optional(),
  allowedDomains: z.array(z.string().min(1).max(253)).optional(),
  branding: BrandingSchema.optional(),
  // Dashboard sends full settings; apiKeyOverride semantics: undefined =
  // keep current, null = clear, string = new plaintext key (sealed here).
  aiSettings: AiSettingsSchema.omit({ apiKeyOverride: true })
    .extend({ apiKeyOverride: z.string().min(8).nullable().optional() })
    .optional(),
});

const PageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const uuidParam = (value: unknown): string => z.string().uuid().parse(value);

export const adminRouter = Router();
adminRouter.use('/auth', adminAuthRouter);
adminRouter.use(adminAuth);

// ---- clients ---------------------------------------------------------------

adminRouter.get('/clients', async (_req: Request, res: Response) => {
  res.json({ clients: await repo.listClients() });
});

adminRouter.post('/clients', async (req: Request, res: Response) => {
  const input = CreateClientSchema.parse(req.body);
  let client;
  try {
    client = await repo.createClient(input);
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw badRequest('slug_taken', 'A client with this slug already exists.');
    }
    throw error;
  }
  const { key, hash, prefix } = generateApiKey();
  await repo.insertApiKey(client.id, 'default', hash, prefix);
  res.status(201).json({ client, apiKey: key });
});

adminRouter.get('/clients/:id', async (req: Request, res: Response) => {
  const detail = await repo.getClientDetail(uuidParam(req.params.id));
  if (!detail) throw notFound('unknown_client', 'No client with this id.');
  res.json({ client: detail });
});

adminRouter.patch('/clients/:id', async (req: Request, res: Response) => {
  const id = uuidParam(req.params.id);
  const patch = UpdateClientSchema.parse(req.body);

  let aiSettings;
  if (patch.aiSettings) {
    const { apiKeyOverride, ...rest } = patch.aiSettings;
    const sealed =
      apiKeyOverride === undefined
        ? await repo.getSealedOverride(id) // keep whatever is stored
        : apiKeyOverride === null
          ? null
          : sealSecret(apiKeyOverride);
    aiSettings = AiSettingsSchema.parse({ ...rest, apiKeyOverride: sealed });
  }

  const updated = await repo.updateClient(id, { ...patch, aiSettings });
  if (!updated) throw notFound('unknown_client', 'No client with this id.');
  res.json({ client: await repo.getClientDetail(id) });
});

adminRouter.delete('/clients/:id', async (req: Request, res: Response) => {
  const deleted = await repo.deleteClient(uuidParam(req.params.id));
  if (!deleted) throw notFound('unknown_client', 'No client with this id.');
  res.status(204).end();
});

// ---- API keys ---------------------------------------------------------------

adminRouter.post('/clients/:id/keys', async (req: Request, res: Response) => {
  const id = uuidParam(req.params.id);
  const { name } = z
    .object({ name: z.string().min(1).max(100).default('key') })
    .parse(req.body ?? {});
  if (!(await repo.getClientDetail(id)))
    throw notFound('unknown_client', 'No client with this id.');
  const { key, hash, prefix } = generateApiKey();
  const keyId = await repo.insertApiKey(id, name, hash, prefix);
  res.status(201).json({ id: keyId, apiKey: key, prefix });
});

adminRouter.post('/clients/:id/keys/:keyId/revoke', async (req: Request, res: Response) => {
  const revoked = await repo.revokeApiKey(uuidParam(req.params.id), uuidParam(req.params.keyId));
  if (!revoked) throw notFound('unknown_key', 'No active key with this id.');
  res.status(204).end();
});

// ---- knowledge ---------------------------------------------------------------

adminRouter.get('/clients/:id/documents', async (req: Request, res: Response) => {
  const id = uuidParam(req.params.id);
  const { limit, offset } = PageSchema.parse(req.query);
  const result = await withDbContext({ tenantId: id }, (db) =>
    knowledgeRepo.listDocuments(db, limit, offset),
  );
  res.json({ ...result, limit, offset });
});

adminRouter.post('/clients/:id/documents', async (req: Request, res: Response) => {
  const id = uuidParam(req.params.id);
  const body = z
    .object({
      title: z.string().min(1).max(300),
      content: z.string().min(1).max(500_000),
      url: z.string().url().optional(),
    })
    .parse(req.body);
  const result = await ingestDocument(id, { sourceType: 'manual', ...body });
  res.status(202).json(result);
});

adminRouter.delete('/clients/:id/documents/:docId', async (req: Request, res: Response) => {
  const deleted = await withDbContext({ tenantId: uuidParam(req.params.id) }, (db) =>
    knowledgeRepo.deleteDocument(db, uuidParam(req.params.docId)),
  );
  if (!deleted) throw notFound('unknown_document', 'No document with this id.');
  res.status(204).end();
});

// ---- conversations + usage ---------------------------------------------------

adminRouter.get('/clients/:id/conversations', async (req: Request, res: Response) => {
  const id = uuidParam(req.params.id);
  const { limit, offset } = PageSchema.parse(req.query);
  res.json(await repo.listConversations(id, limit, offset));
});

adminRouter.get('/clients/:id/conversations/:convId', async (req: Request, res: Response) => {
  const messages = await repo.getConversationMessages(
    uuidParam(req.params.id),
    uuidParam(req.params.convId),
  );
  if (!messages) throw notFound('unknown_conversation', 'No conversation with this id.');
  res.json({ messages });
});

adminRouter.delete('/clients/:id/conversations/:convId', async (req: Request, res: Response) => {
  const deleted = await repo.deleteConversation(
    uuidParam(req.params.id),
    uuidParam(req.params.convId),
  );
  if (!deleted) throw notFound('unknown_conversation', 'No conversation with this id.');
  res.status(204).end();
});

adminRouter.get('/clients/:id/usage', async (req: Request, res: Response) => {
  res.json(await repo.getUsage(uuidParam(req.params.id)));
});

adminRouter.get('/clients/:id/unanswered', async (req: Request, res: Response) => {
  res.json({ questions: await repo.getUnansweredQuestions(uuidParam(req.params.id)) });
});

const csv = (rows: (string | number | null)[][]): string =>
  rows
    .map((row) =>
      row
        .map(
          (v) =>
            `"${String(v ?? '')
              .replaceAll('"', '""')
              .replaceAll('\n', ' ')}"`,
        )
        .join(','),
    )
    .join('\r\n');

adminRouter.get('/clients/:id/export/conversations.csv', async (req: Request, res: Response) => {
  const rows = await repo.exportMessages(uuidParam(req.params.id));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="conversations.csv"');
  res.send(
    csv([
      [
        'conversation_id',
        'time',
        'role',
        'content',
        'answered',
        'rating',
        'model',
        'input_tokens',
        'output_tokens',
      ],
      ...rows,
    ]),
  );
});

adminRouter.get('/clients/:id/export/unanswered.csv', async (req: Request, res: Response) => {
  const questions = await repo.getUnansweredQuestions(uuidParam(req.params.id));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="unanswered.csv"');
  res.send(
    csv([
      ['question', 'times_asked', 'last_asked'],
      ...questions.map((q) => [q.question, q.times, q.lastAsked]),
    ]),
  );
});
