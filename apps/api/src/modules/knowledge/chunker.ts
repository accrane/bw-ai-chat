import { createHash } from 'node:crypto';
import { encode } from 'gpt-tokenizer';

/**
 * Heading-aware chunking. Markdown headings build a heading path (used for
 * citations); paragraphs are packed into chunks of at most MAX_TOKENS with a
 * small overlap carried across size-triggered splits. `embedInput` prefixes
 * the title + heading path so retrieval sees the chunk's context; the chunk
 * hash covers embedInput, so moving a paragraph under a new heading re-embeds
 * it while untouched chunks are skipped entirely.
 */

export interface DocumentChunk {
  content: string;
  headingPath: string[];
  tokenCount: number;
  embedInput: string;
  contentHash: string;
}

const MAX_TOKENS = 800;
const MIN_FLUSH_TOKENS = 200;
const OVERLAP_TOKENS = 100;

const countTokens = (text: string): number => encode(text).length;
const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

interface Block {
  text: string;
  headingPath: string[];
  tokens: number;
}

function parseBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const headingStack: { level: number; text: string }[] = [];
  let paragraph: string[] = [];

  const flushParagraph = (): void => {
    const text = paragraph.join('\n').trim();
    paragraph = [];
    if (!text) return;
    blocks.push({ text, headingPath: headingStack.map((h) => h.text), tokens: countTokens(text) });
  };

  for (const line of content.split(/\r?\n/)) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      const level = heading[1]!.length;
      while (headingStack.length && headingStack[headingStack.length - 1]!.level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, text: heading[2]!.trim() });
    } else if (line.trim() === '') {
      flushParagraph();
    } else {
      paragraph.push(line);
    }
  }
  flushParagraph();
  return blocks;
}

/** Splits a paragraph that alone exceeds MAX_TOKENS at sentence boundaries. */
function splitOversized(block: Block): Block[] {
  if (block.tokens <= MAX_TOKENS) return [block];
  const out: Block[] = [];
  let current: string[] = [];
  let currentTokens = 0;
  // A single "sentence" with no punctuation can still exceed MAX_TOKENS; it is
  // kept whole (embedding models accept far larger inputs than our target).
  for (const sentence of block.text.split(/(?<=[.!?])\s+/)) {
    const tokens = countTokens(sentence);
    if (current.length && currentTokens + tokens > MAX_TOKENS) {
      out.push({ text: current.join(' '), headingPath: block.headingPath, tokens: currentTokens });
      current = [];
      currentTokens = 0;
    }
    current.push(sentence);
    currentTokens += tokens;
  }
  if (current.length) {
    out.push({ text: current.join(' '), headingPath: block.headingPath, tokens: currentTokens });
  }
  return out;
}

export function chunkDocument(title: string, content: string): DocumentChunk[] {
  const blocks = parseBlocks(content).flatMap(splitOversized);
  const chunks: DocumentChunk[] = [];
  let current: Block[] = [];
  let currentTokens = 0;

  const flush = (carryOverlap: boolean): void => {
    if (!current.length) return;
    const headingPath = current[0]!.headingPath;
    const text = current.map((b) => b.text).join('\n\n');
    const embedInput = `${[title, ...headingPath].filter(Boolean).join(' > ')}\n\n${text}`;
    chunks.push({
      content: text,
      headingPath,
      tokenCount: countTokens(text),
      embedInput,
      contentHash: sha256(embedInput),
    });
    if (carryOverlap) {
      const tail: Block[] = [];
      let tailTokens = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const block = current[i]!;
        if (tailTokens + block.tokens > OVERLAP_TOKENS) break;
        tail.unshift(block);
        tailTokens += block.tokens;
      }
      current = tail;
      currentTokens = tailTokens;
    } else {
      current = [];
      currentTokens = 0;
    }
  };

  let previousPath = '';
  for (const block of blocks) {
    const pathKey = block.headingPath.join(' > ');
    // New heading section: cut the chunk unless it would be uselessly small.
    if (current.length && pathKey !== previousPath && currentTokens >= MIN_FLUSH_TOKENS) {
      flush(false);
    }
    if (current.length && currentTokens + block.tokens > MAX_TOKENS) {
      flush(true);
    }
    current.push(block);
    currentTokens += block.tokens;
    previousPath = pathKey;
  }
  flush(false);
  return chunks;
}
