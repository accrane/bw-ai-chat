import { describe, expect, it } from 'vitest';
import { createSseParser, type SseEvent } from './sse.js';

describe('createSseParser', () => {
  it('parses complete events', () => {
    const events: SseEvent[] = [];
    const push = createSseParser((e) => events.push(e));
    push('event: delta\ndata: {"text":"hi"}\n\nevent: done\ndata: {"answered":true}\n\n');
    expect(events).toEqual([
      { type: 'delta', data: { text: 'hi' } },
      { type: 'done', data: { answered: true } },
    ]);
  });

  it('handles events split across arbitrary chunk boundaries', () => {
    const events: SseEvent[] = [];
    const push = createSseParser((e) => events.push(e));
    const full = 'event: delta\ndata: {"text":"hello world"}\n\n';
    for (const char of full) push(char);
    expect(events).toEqual([{ type: 'delta', data: { text: 'hello world' } }]);
  });

  it('skips malformed frames without dying', () => {
    const events: SseEvent[] = [];
    const push = createSseParser((e) => events.push(e));
    push('event: delta\ndata: {broken json\n\nevent: delta\ndata: {"text":"ok"}\n\n');
    expect(events).toEqual([{ type: 'delta', data: { text: 'ok' } }]);
  });
});
