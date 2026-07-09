export const SOURCE_TYPES = ['manual', 'markdown', 'text', 'pdf', 'docx', 'wordpress'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'failed';

/** Document as returned by the knowledge endpoints (never includes raw content). */
export interface KnowledgeDocument {
  id: string;
  sourceType: SourceType;
  sourceId: string;
  title: string;
  url: string | null;
  status: DocumentStatus;
  error: string | null;
  tokenCount: number | null;
  createdAt: string;
  updatedAt: string;
}

/** POST /v1/knowledge/documents */
export interface IngestResponse {
  document: KnowledgeDocument;
  /** false when the content hash was unchanged and no work was queued */
  queued: boolean;
}

/** GET /v1/knowledge/documents */
export interface ListDocumentsResponse {
  documents: KnowledgeDocument[];
  total: number;
  limit: number;
  offset: number;
}

export interface SearchResult {
  chunkId: string;
  documentId: string;
  title: string;
  url: string | null;
  headingPath: string[];
  content: string;
  /** cosine similarity, 0..1 (higher is more relevant) */
  score: number;
}

/** POST /v1/knowledge/search */
export interface SearchResponse {
  results: SearchResult[];
}
