import { describe, expect, it } from 'vitest';
import { encode } from 'gpt-tokenizer';
import { chunkDocument } from './chunker.js';

const para = (words: number, word = 'raft'): string => Array(words).fill(word).join(' ');

describe('chunkDocument', () => {
  it('tracks markdown heading paths', () => {
    const md = [
      '# Trips',
      'We run trips daily.',
      '## Pricing',
      'Trips cost $99 per person.',
      '## Safety',
      'Helmets are required at all times.',
    ].join('\n\n');
    const chunks = chunkDocument('Whitewater FAQ', md);
    const paths = chunks.flatMap((c) => [c.headingPath.join(' > ')]);
    expect(paths.join('|')).toContain('Trips');
    // small sections merge, but the heading structure is preserved somewhere
    expect(chunks.every((c) => c.headingPath[0] === 'Trips')).toBe(true);
    expect(chunks[0]!.embedInput.startsWith('Whitewater FAQ > Trips')).toBe(true);
  });

  it('splits sections into separate chunks once they are big enough', () => {
    const md = `# A\n\n${para(400)}\n\n# B\n\n${para(400, 'kayak')}`;
    const chunks = chunkDocument('Doc', md);
    expect(chunks.length).toBe(2);
    expect(chunks[0]!.headingPath).toEqual(['A']);
    expect(chunks[1]!.headingPath).toEqual(['B']);
  });

  it('never exceeds the token ceiling for multi-paragraph content', () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) => para(150, `word${i}`)).join('\n\n');
    const chunks = chunkDocument('Doc', paragraphs);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(encode(chunk.content).length).toBeLessThanOrEqual(800);
    }
  });

  it('carries overlap across size-triggered splits', () => {
    // paragraphs must fit within the 100-token overlap budget to be carried
    const paragraphs = Array.from(
      { length: 20 },
      (_, i) => `Paragraph ${i}. ${para(55, 'river')}`,
    ).join('\n\n');
    const chunks = chunkDocument('Doc', paragraphs);
    expect(chunks.length).toBeGreaterThan(1);
    const first = chunks[0]!.content;
    const second = chunks[1]!.content;
    const lastParagraphOfFirst = first.split('\n\n').at(-1)!;
    expect(second.startsWith(lastParagraphOfFirst)).toBe(true);
  });

  it('splits a single oversized paragraph at sentence boundaries', () => {
    const sentences = Array.from({ length: 100 }, (_, i) => `Sentence ${i} ${para(20)}.`).join(' ');
    const chunks = chunkDocument('Doc', sentences);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('produces stable hashes and changes them when headings move', () => {
    const a = chunkDocument('Doc', '# One\n\nSame paragraph.');
    const b = chunkDocument('Doc', '# One\n\nSame paragraph.');
    const c = chunkDocument('Doc', '# Two\n\nSame paragraph.');
    expect(a[0]!.contentHash).toBe(b[0]!.contentHash);
    expect(a[0]!.contentHash).not.toBe(c[0]!.contentHash);
  });

  it('handles plain text without headings', () => {
    const chunks = chunkDocument('Doc', 'Just a plain paragraph.\n\nAnd another.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.headingPath).toEqual([]);
  });

  it('returns nothing for effectively empty content', () => {
    expect(chunkDocument('Doc', '\n\n  \n')).toHaveLength(0);
  });
});
