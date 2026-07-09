import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import type { IngestResponse, ListDocumentsResponse, SearchResponse } from '@bellaworks/shared';
import { withDbContext } from '../../db/context.js';
import { badRequest, notFound } from '../../lib/errors.js';
import { apiKeyAuth, authedTenant } from '../../middleware/api-key-auth.js';
import { extractText } from './extract.js';
import * as repo from './repository.js';
import { ingestDocument, searchKnowledge } from './service.js';

const IngestSchema = z.object({
  // pdf/docx arrive via the multipart /documents/file route
  sourceType: z.enum(['manual', 'markdown', 'text', 'wordpress']).default('manual'),
  sourceId: z.string().min(1).max(255).optional(),
  title: z.string().min(1).max(300),
  url: z.string().url().optional(),
  content: z.string().min(1).max(500_000),
});

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const SearchSchema = z.object({
  query: z.string().min(1).max(1_000),
  limit: z.coerce.number().int().min(1).max(50).default(8),
  minScore: z.coerce.number().min(0).max(1).default(0),
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

export const knowledgeRouter = Router();
knowledgeRouter.use(apiKeyAuth);

knowledgeRouter.post('/documents', async (req: Request, res: Response) => {
  const body = IngestSchema.parse(req.body);
  const result: IngestResponse = await ingestDocument(authedTenant(res).clientId, body);
  res.status(202).json(result);
});

knowledgeRouter.post(
  '/documents/file',
  upload.single('file'),
  async (req: Request, res: Response) => {
    if (!req.file) throw badRequest('missing_file', 'Attach a file in the "file" field.');
    const { text, sourceType } = await extractText(req.file.originalname, req.file.buffer);
    if (!text.trim()) throw badRequest('empty_file', 'No text could be extracted from the file.');

    const fields = z
      .object({
        title: z.string().min(1).max(300).optional(),
        sourceId: z.string().min(1).max(255).optional(),
        url: z.string().url().optional(),
      })
      .parse(req.body ?? {});

    const result: IngestResponse = await ingestDocument(authedTenant(res).clientId, {
      sourceType,
      sourceId: fields.sourceId ?? req.file.originalname,
      title: fields.title ?? req.file.originalname,
      url: fields.url,
      content: text,
    });
    res.status(202).json(result);
  },
);

knowledgeRouter.get('/documents', async (req: Request, res: Response) => {
  const { limit, offset } = ListQuerySchema.parse(req.query);
  const { clientId } = authedTenant(res);
  const { documents, total } = await withDbContext({ tenantId: clientId }, (db) =>
    repo.listDocuments(db, limit, offset),
  );
  const body: ListDocumentsResponse = { documents, total, limit, offset };
  res.json(body);
});

knowledgeRouter.get('/documents/:id', async (req: Request, res: Response) => {
  const id = z.string().uuid().parse(req.params.id);
  const { clientId } = authedTenant(res);
  const document = await withDbContext({ tenantId: clientId }, (db) => repo.getDocument(db, id));
  if (!document) throw notFound('unknown_document', 'No document with this id.');
  res.json({ document });
});

knowledgeRouter.delete('/documents/:id', async (req: Request, res: Response) => {
  const id = z.string().uuid().parse(req.params.id);
  const { clientId } = authedTenant(res);
  const deleted = await withDbContext({ tenantId: clientId }, (db) => repo.deleteDocument(db, id));
  if (!deleted) throw notFound('unknown_document', 'No document with this id.');
  res.status(204).end();
});

knowledgeRouter.post('/search', async (req: Request, res: Response) => {
  const { query, limit, minScore } = SearchSchema.parse(req.body);
  const results = await searchKnowledge(authedTenant(res).clientId, query, limit, minScore);
  const body: SearchResponse = { results };
  res.json(body);
});
