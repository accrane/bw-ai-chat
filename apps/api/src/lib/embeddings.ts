import { env } from '../config/env.js';
import { logger } from './logger.js';

export interface EmbeddingsProvider {
  readonly model: string;
  readonly dimensions: number;
  /** Returns one vector per input text, in order. */
  embed(texts: string[]): Promise<number[][]>;
}

const DIMENSIONS = 1536;
const OPENAI_BATCH_SIZE = 100;

export class OpenAIEmbeddings implements EmbeddingsProvider {
  readonly dimensions = DIMENSIONS;

  constructor(
    private readonly apiKey: string,
    readonly model: string = 'text-embedding-3-small',
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const vectors: number[][] = [];
    for (let i = 0; i < texts.length; i += OPENAI_BATCH_SIZE) {
      const batch = texts.slice(i, i + OPENAI_BATCH_SIZE);
      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ model: this.model, input: batch }),
      });
      if (!res.ok) {
        const detail = (await res.text()).slice(0, 300);
        throw new Error(`openai embeddings failed (${res.status}): ${detail}`);
      }
      const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
      vectors.push(...[...json.data].sort((a, b) => a.index - b.index).map((d) => d.embedding));
    }
    return vectors;
  }
}

/**
 * Deterministic offline provider: a normalized bag-of-words hashed into the
 * vector space. Similarity becomes lexical overlap — meaningless semantically
 * but stable and useful, which is exactly what tests and keyless local dev
 * need.
 */
export class FakeEmbeddings implements EmbeddingsProvider {
  readonly model = 'fake-bag-of-words';
  readonly dimensions = DIMENSIONS;

  embed(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((t) => this.vector(t)));
  }

  private vector(text: string): number[] {
    const v = new Float64Array(DIMENSIONS);
    for (const token of text.toLowerCase().split(/[^a-z0-9]+/)) {
      if (!token) continue;
      const i = fnv1a(token) % DIMENSIONS;
      v[i] = (v[i] ?? 0) + 1;
    }
    let norm = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
    if (norm === 0) {
      v[0] = 1;
      norm = 1;
    }
    return Array.from(v, (x) => x / norm);
  }
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

let provider: EmbeddingsProvider | null = null;

export function getEmbeddingsProvider(): EmbeddingsProvider {
  if (provider) return provider;
  const choice = env.EMBEDDINGS_PROVIDER ?? (env.OPENAI_API_KEY ? 'openai' : 'fake');
  if (choice === 'openai') {
    if (!env.OPENAI_API_KEY) {
      throw new Error('EMBEDDINGS_PROVIDER=openai requires OPENAI_API_KEY');
    }
    provider = new OpenAIEmbeddings(env.OPENAI_API_KEY);
  } else {
    if (env.NODE_ENV !== 'test') {
      logger.warn('using fake embeddings provider (set OPENAI_API_KEY for real embeddings)');
    }
    provider = new FakeEmbeddings();
  }
  return provider;
}
