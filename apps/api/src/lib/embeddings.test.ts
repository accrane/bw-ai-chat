import { describe, expect, it } from 'vitest';
import { FakeEmbeddings } from './embeddings.js';

const cosine = (a: number[], b: number[]): number => a.reduce((s, x, i) => s + x * b[i]!, 0);

describe('FakeEmbeddings', () => {
  const provider = new FakeEmbeddings();

  it('returns normalized 1536-dim vectors, deterministically', async () => {
    const [a1] = await provider.embed(['rafting trips on the river']);
    const [a2] = await provider.embed(['rafting trips on the river']);
    expect(a1).toHaveLength(1536);
    expect(a1).toEqual(a2);
    expect(cosine(a1!, a1!)).toBeCloseTo(1, 6);
  });

  it('scores lexically similar texts higher', async () => {
    const [query, related, unrelated] = await provider.embed([
      'how much do rafting trips cost',
      'rafting trips cost $99 per person',
      'our office is closed on sundays',
    ]);
    expect(cosine(query!, related!)).toBeGreaterThan(cosine(query!, unrelated!));
  });

  it('handles texts with no tokens', async () => {
    const [v] = await provider.embed(['!!!']);
    expect(cosine(v!, v!)).toBeCloseTo(1, 6);
  });
});
