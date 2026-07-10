import type pg from 'pg';
import type {
  DocumentStatus,
  KnowledgeDocument,
  SearchResult,
  SourceType,
} from '@bw-ai-chat/shared';
import type { DocumentChunk } from './chunker.js';

/**
 * All functions take a tenant-scoped db handle from withDbContext — RLS has
 * already narrowed visibility to the current client, so no query here filters
 * by client_id except where it must be written into new rows.
 */

interface DocumentRow {
  id: string;
  source_type: SourceType;
  source_id: string;
  title: string;
  url: string | null;
  content_hash: string;
  status: DocumentStatus;
  error: string | null;
  token_count: number | null;
  created_at: Date;
  updated_at: Date;
}

const DOC_COLUMNS = `id, source_type, source_id, title, url, content_hash, status, error,
                     token_count, created_at, updated_at`;

function toDocument(row: DocumentRow): KnowledgeDocument & { contentHash: string } {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    title: row.title,
    url: row.url,
    status: row.status,
    error: row.error,
    tokenCount: row.token_count,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    contentHash: row.content_hash,
  };
}

export async function findByIdentity(
  db: pg.PoolClient,
  sourceType: SourceType,
  sourceId: string,
): Promise<(KnowledgeDocument & { contentHash: string }) | null> {
  const { rows } = await db.query<DocumentRow>(
    `select ${DOC_COLUMNS} from documents where source_type = $1 and source_id = $2`,
    [sourceType, sourceId],
  );
  return rows[0] ? toDocument(rows[0]) : null;
}

export interface DocumentInput {
  sourceType: SourceType;
  sourceId: string;
  title: string;
  url: string | null;
  content: string;
  contentHash: string;
}

export async function insertDocument(
  db: pg.PoolClient,
  clientId: string,
  input: DocumentInput,
): Promise<KnowledgeDocument> {
  const { rows } = await db.query<DocumentRow>(
    `insert into documents (client_id, source_type, source_id, title, url, content, content_hash)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning ${DOC_COLUMNS}`,
    [
      clientId,
      input.sourceType,
      input.sourceId,
      input.title,
      input.url,
      input.content,
      input.contentHash,
    ],
  );
  return withoutHash(toDocument(rows[0]!));
}

export async function updateDocumentContent(
  db: pg.PoolClient,
  id: string,
  input: Pick<DocumentInput, 'title' | 'url' | 'content' | 'contentHash'>,
): Promise<KnowledgeDocument> {
  const { rows } = await db.query<DocumentRow>(
    `update documents
        set title = $2, url = $3, content = $4, content_hash = $5,
            status = 'pending', error = null
      where id = $1
     returning ${DOC_COLUMNS}`,
    [id, input.title, input.url, input.content, input.contentHash],
  );
  return withoutHash(toDocument(rows[0]!));
}

const withoutHash = (doc: KnowledgeDocument & { contentHash: string }): KnowledgeDocument => {
  const { contentHash: _hash, ...rest } = doc;
  return rest;
};

export async function getDocument(
  db: pg.PoolClient,
  id: string,
): Promise<KnowledgeDocument | null> {
  const { rows } = await db.query<DocumentRow>(
    `select ${DOC_COLUMNS} from documents where id = $1`,
    [id],
  );
  return rows[0] ? withoutHash(toDocument(rows[0])) : null;
}

export async function getDocumentWithContent(
  db: pg.PoolClient,
  id: string,
): Promise<{ id: string; title: string; content: string } | null> {
  const { rows } = await db.query<{ id: string; title: string; content: string }>(
    `select id, title, content from documents where id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function listDocuments(
  db: pg.PoolClient,
  limit: number,
  offset: number,
  sourceType?: SourceType,
): Promise<{ documents: KnowledgeDocument[]; total: number }> {
  const [list, count] = await Promise.all([
    db.query<DocumentRow>(
      `select ${DOC_COLUMNS} from documents
        where ($3::text is null or source_type = $3)
        order by updated_at desc limit $1 offset $2`,
      [limit, offset, sourceType ?? null],
    ),
    db.query<{ total: string }>(
      `select count(*) as total from documents where ($1::text is null or source_type = $1)`,
      [sourceType ?? null],
    ),
  ]);
  return {
    documents: list.rows.map((row) => withoutHash(toDocument(row))),
    total: Number(count.rows[0]!.total),
  };
}

export async function deleteDocument(db: pg.PoolClient, id: string): Promise<boolean> {
  const res = await db.query(`delete from documents where id = $1`, [id]);
  return (res.rowCount ?? 0) > 0;
}

export async function setDocumentStatus(
  db: pg.PoolClient,
  id: string,
  status: DocumentStatus,
  extra?: { error?: string | null; tokenCount?: number | null },
): Promise<void> {
  await db.query(
    `update documents set status = $2, error = $3, token_count = coalesce($4, token_count)
      where id = $1`,
    [id, status, extra?.error ?? null, extra?.tokenCount ?? null],
  );
}

export interface ChunkMeta {
  id: string;
  contentHash: string;
  chunkIndex: number;
  headingPath: string[];
}

export async function listChunkMeta(db: pg.PoolClient, documentId: string): Promise<ChunkMeta[]> {
  const { rows } = await db.query<{
    id: string;
    content_hash: string;
    chunk_index: number;
    heading_path: string[];
  }>(`select id, content_hash, chunk_index, heading_path from chunks where document_id = $1`, [
    documentId,
  ]);
  return rows.map((r) => ({
    id: r.id,
    contentHash: r.content_hash,
    chunkIndex: r.chunk_index,
    headingPath: r.heading_path,
  }));
}

const toVectorLiteral = (embedding: number[]): string => `[${embedding.join(',')}]`;

export async function insertChunk(
  db: pg.PoolClient,
  clientId: string,
  documentId: string,
  chunk: DocumentChunk,
  chunkIndex: number,
  embedding: number[],
  embeddingModel: string,
): Promise<void> {
  await db.query(
    `insert into chunks
       (document_id, client_id, chunk_index, content, heading_path, content_hash,
        token_count, embedding, embedding_model)
     values ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9)`,
    [
      documentId,
      clientId,
      chunkIndex,
      chunk.content,
      chunk.headingPath,
      chunk.contentHash,
      chunk.tokenCount,
      toVectorLiteral(embedding),
      embeddingModel,
    ],
  );
}

export async function updateChunkPosition(
  db: pg.PoolClient,
  id: string,
  chunkIndex: number,
  headingPath: string[],
): Promise<void> {
  await db.query(`update chunks set chunk_index = $2, heading_path = $3 where id = $1`, [
    id,
    chunkIndex,
    headingPath,
  ]);
}

export async function deleteChunks(db: pg.PoolClient, ids: string[]): Promise<void> {
  await db.query(`delete from chunks where id = any($1)`, [ids]);
}

export async function searchChunks(
  db: pg.PoolClient,
  embedding: number[],
  limit: number,
  minScore: number,
): Promise<SearchResult[]> {
  const { rows } = await db.query<{
    chunk_id: string;
    document_id: string;
    title: string;
    url: string | null;
    heading_path: string[];
    content: string;
    score: number;
  }>(
    `select c.id as chunk_id, c.document_id, d.title, d.url, c.heading_path, c.content,
            1 - (c.embedding <=> $1::vector) as score
       from chunks c
       join documents d on d.id = c.document_id
      where 1 - (c.embedding <=> $1::vector) >= $2
      order by c.embedding <=> $1::vector
      limit $3`,
    [toVectorLiteral(embedding), minScore, limit],
  );
  return rows.map((r) => ({
    chunkId: r.chunk_id,
    documentId: r.document_id,
    title: r.title,
    url: r.url,
    headingPath: r.heading_path,
    content: r.content,
    score: Number(r.score),
  }));
}
