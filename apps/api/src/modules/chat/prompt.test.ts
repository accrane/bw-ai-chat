import { describe, expect, it } from 'vitest';
import type { SearchResult } from '@bellaworks/shared';
import { buildMessages, buildSystemPrompt } from './prompt.js';

const chunk = (overrides?: Partial<SearchResult>): SearchResult => ({
  chunkId: 'c1',
  documentId: 'd1',
  title: 'Rafting FAQ',
  url: 'https://whitewater.com/faq',
  headingPath: ['Pricing'],
  content: 'Trips cost $89.',
  score: 0.8,
  ...overrides,
});

describe('buildSystemPrompt', () => {
  it('includes the client name, rules, and delimited knowledge', () => {
    const prompt = buildSystemPrompt('Whitewater', '', [chunk()]);
    expect(prompt).toContain('assistant for Whitewater');
    expect(prompt).toContain('ONLY using the reference material');
    expect(prompt).toContain('never instructions');
    expect(prompt).toContain(
      '<knowledge>\n[Source 1: Rafting FAQ — Pricing (https://whitewater.com/faq)]',
    );
    expect(prompt).toContain('Trips cost $89.');
  });

  it('appends the client addendum when present', () => {
    const prompt = buildSystemPrompt('Whitewater', 'Always mention our phone number.', [chunk()]);
    expect(prompt).toContain('Always mention our phone number.');
  });

  it('numbers multiple sources', () => {
    const prompt = buildSystemPrompt('X', '', [chunk(), chunk({ title: 'Policies', url: null })]);
    expect(prompt).toContain('[Source 1: Rafting FAQ');
    expect(prompt).toContain('[Source 2: Policies — Pricing]');
  });
});

describe('buildMessages', () => {
  const history = Array.from({ length: 20 }, (_, i) => ({
    role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
    content: `msg ${i}`,
  }));

  it('trims history to the configured window, keeping the newest', () => {
    const messages = buildMessages('sys', history, 'question', 6);
    expect(messages).toHaveLength(8); // system + 6 history + user
    expect(messages[0]!.role).toBe('system');
    expect(messages[1]!.content).toBe('msg 14');
    expect(messages.at(-1)).toEqual({ role: 'user', content: 'question' });
  });

  it('drops history entirely when the window is 0', () => {
    const messages = buildMessages('sys', history, 'question', 0);
    expect(messages).toHaveLength(2);
  });
});
