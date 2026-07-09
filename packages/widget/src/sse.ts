export interface SseEvent {
  type: string;
  data: unknown;
}

/**
 * Incremental SSE parser: feed it raw text chunks (which may split events
 * anywhere), it emits complete events. Matches the API's framing:
 * `event: <type>\ndata: <json>\n\n`.
 */
export function createSseParser(onEvent: (event: SseEvent) => void): (chunk: string) => void {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk;
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const type = /^event: (.+)$/m.exec(block)?.[1];
      const raw = /^data: (.+)$/m.exec(block)?.[1];
      if (!type || raw === undefined) continue;
      try {
        onEvent({ type, data: JSON.parse(raw) });
      } catch {
        // skip malformed frames rather than killing the stream
      }
    }
  };
}
