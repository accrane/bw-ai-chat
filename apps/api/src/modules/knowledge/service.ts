import { createHash, randomUUID } from 'node:crypto';
import type { IngestResponse, SearchResult, SourceType } from '@bw-ai-chat/shared';
import { withDbContext } from '../../db/context.js';
import { getEmbeddingsProvider } from '../../lib/embeddings.js';
import { logger } from '../../lib/logger.js';
import { enqueueIngest } from '../../queue/queue.js';
import { chunkDocument } from './chunker.js';
import * as repo from './repository.js';

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

export interface IngestInput {
  sourceType: SourceType;
  sourceId?: string;
  title: string;
  url?: string;
  content: string;
}

/**
 * Upserts by (sourceType, sourceId) and enqueues processing — unless the
 * content hash is unchanged, in which case this is a no-op (the delta-sync
 * fast path WordPress reconciliation relies on).
 */
export async function ingestDocument(
  clientId: string,
  input: IngestInput,
): Promise<IngestResponse> {
  const contentHash = sha256(input.content);
  const sourceId = input.sourceId ?? randomUUID();

  const result = await withDbContext({ tenantId: clientId }, async (db) => {
    const existing = await repo.findByIdentity(db, input.sourceType, sourceId);
    if (existing && existing.contentHash === contentHash && existing.status !== 'failed') {
      const { contentHash: _unused, ...document } = existing;
      return { document, queued: false };
    }
    const fields = {
      title: input.title,
      url: input.url ?? null,
      content: input.content,
      contentHash,
    };
    const document = existing
      ? await repo.updateDocumentContent(db, existing.id, fields)
      : await repo.insertDocument(db, clientId, {
          ...fields,
          sourceType: input.sourceType,
          sourceId,
        });
    return { document, queued: true };
  });

  // Enqueue only after the document row is committed, so the worker can't
  // race a transaction it can't see yet.
  if (result.queued) await enqueueIngest(result.document.id, clientId);
  return result;
}

/**
 * The pg-boss worker's job: chunk, diff against existing chunks by hash,
 * embed only what changed, and swap the results in atomically.
 */
export async function processDocument(clientId: string, documentId: string): Promise<void> {
  const doc = await withDbContext({ tenantId: clientId }, (db) =>
    repo.getDocumentWithContent(db, documentId),
  );
  if (!doc) return; // deleted while queued

  await withDbContext({ tenantId: clientId }, (db) =>
    repo.setDocumentStatus(db, documentId, 'processing'),
  );

  try {
    const chunks = chunkDocument(doc.title, doc.content);
    const provider = getEmbeddingsProvider();

    const existing = await withDbContext({ tenantId: clientId }, (db) =>
      repo.listChunkMeta(db, documentId),
    );
    const reusable = new Map<string, repo.ChunkMeta[]>();
    for (const meta of existing) {
      const bucket = reusable.get(meta.contentHash);
      if (bucket) bucket.push(meta);
      else reusable.set(meta.contentHash, [meta]);
    }

    const reused: { meta: repo.ChunkMeta; index: number; headingPath: string[] }[] = [];
    const fresh: { chunk: (typeof chunks)[number]; index: number }[] = [];
    chunks.forEach((chunk, index) => {
      const match = reusable.get(chunk.contentHash)?.pop();
      if (match) reused.push({ meta: match, index, headingPath: chunk.headingPath });
      else fresh.push({ chunk, index });
    });
    const stale = [...reusable.values()].flat();

    const embeddings = fresh.length
      ? await provider.embed(fresh.map((f) => f.chunk.embedInput))
      : [];

    await withDbContext({ tenantId: clientId }, async (db) => {
      if (stale.length)
        await repo.deleteChunks(
          db,
          stale.map((s) => s.id),
        );
      for (const r of reused) {
        if (
          r.meta.chunkIndex !== r.index ||
          r.meta.headingPath.join('\n') !== r.headingPath.join('\n')
        ) {
          await repo.updateChunkPosition(db, r.meta.id, r.index, r.headingPath);
        }
      }
      for (let i = 0; i < fresh.length; i++) {
        await repo.insertChunk(
          db,
          clientId,
          documentId,
          fresh[i]!.chunk,
          fresh[i]!.index,
          embeddings[i]!,
          provider.model,
        );
      }
      await repo.setDocumentStatus(db, documentId, 'ready', {
        tokenCount: chunks.reduce((sum, c) => sum + c.tokenCount, 0),
      });
    });

    logger.info(
      { documentId, chunks: chunks.length, embedded: fresh.length, reused: reused.length },
      'document processed',
    );
  } catch (error) {
    await withDbContext({ tenantId: clientId }, (db) =>
      repo.setDocumentStatus(db, documentId, 'failed', {
        error: String(error instanceof Error ? error.message : error).slice(0, 500),
      }),
    ).catch(() => undefined);
    throw error; // let pg-boss retry
  }
}

export async function searchKnowledge(
  clientId: string,
  query: string,
  limit: number,
  minScore: number,
): Promise<SearchResult[]> {
  const [embedding] = await getEmbeddingsProvider().embed([query]);
  return withDbContext({ tenantId: clientId }, (db) =>
    repo.searchChunks(db, embedding!, limit, minScore),
  );
}
