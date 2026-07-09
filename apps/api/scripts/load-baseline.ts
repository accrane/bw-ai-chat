/**
 * Chat-path load baseline: N concurrent visitors chatting for DURATION_MS
 * against the local API (fake providers recommended so OpenAI latency/cost
 * stays out of the measurement). Reports throughput and latency percentiles —
 * run before deployment changes to catch regressions.
 *
 *   pnpm --filter @bellaworks/api exec tsx scripts/load-baseline.ts
 */
const API = process.env.LOAD_API ?? 'http://localhost:3001';
const SLUG = process.env.LOAD_SLUG ?? 'whitewater';
const ORIGIN = 'https://whitewater.com';
const CONCURRENCY = Number(process.env.LOAD_CONCURRENCY ?? 10);
const DURATION_MS = Number(process.env.LOAD_DURATION_MS ?? 10_000);

const latencies: number[] = [];
let errors = 0;

async function visitor(): Promise<void> {
  const session = await fetch(`${API}/v1/widget/${SLUG}/session`, {
    method: 'POST',
    headers: { origin: ORIGIN },
  });
  const { token } = (await session.json()) as { token: string };

  const deadline = Date.now() + DURATION_MS;
  while (Date.now() < deadline) {
    const start = performance.now();
    try {
      const res = await fetch(`${API}/v1/chat/${SLUG}/messages`, {
        method: 'POST',
        headers: {
          origin: ORIGIN,
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ message: 'how much does a trip cost?' }),
      });
      await res.text(); // drain the stream
      if (res.ok) latencies.push(performance.now() - start);
      else if (res.status === 429) await new Promise((r) => setTimeout(r, 2000));
      else errors++;
    } catch {
      errors++;
    }
  }
}

console.log(`load baseline: ${CONCURRENCY} visitors for ${DURATION_MS / 1000}s against ${API}`);
const startedAt = Date.now();
await Promise.all(Array.from({ length: CONCURRENCY }, visitor));
const elapsed = (Date.now() - startedAt) / 1000;

latencies.sort((a, b) => a - b);
const pct = (p: number): number => latencies[Math.floor((latencies.length - 1) * p)] ?? 0;
console.log(`completed chats: ${latencies.length} (${(latencies.length / elapsed).toFixed(1)}/s)`);
console.log(
  `latency p50=${pct(0.5).toFixed(0)}ms p95=${pct(0.95).toFixed(0)}ms p99=${pct(0.99).toFixed(0)}ms`,
);
console.log(`errors: ${errors}`);
process.exit(0);
