import type pg from 'pg';
import type { ChatHistoryMessage } from '@bellaworks/shared';

export interface ConversationRecord {
  id: string;
  sessionId: string;
  createdAt: Date;
}

export async function createConversation(
  db: pg.PoolClient,
  clientId: string,
  sessionId: string,
): Promise<ConversationRecord> {
  const { rows } = await db.query<{ id: string; session_id: string; created_at: Date }>(
    `insert into conversations (client_id, session_id) values ($1, $2)
     returning id, session_id, created_at`,
    [clientId, sessionId],
  );
  const row = rows[0]!;
  return { id: row.id, sessionId: row.session_id, createdAt: row.created_at };
}

export async function getConversation(
  db: pg.PoolClient,
  id: string,
): Promise<ConversationRecord | null> {
  const { rows } = await db.query<{ id: string; session_id: string; created_at: Date }>(
    `select id, session_id, created_at from conversations where id = $1`,
    [id],
  );
  const row = rows[0];
  return row ? { id: row.id, sessionId: row.session_id, createdAt: row.created_at } : null;
}

export async function touchConversation(db: pg.PoolClient, id: string): Promise<void> {
  await db.query(`update conversations set updated_at = now() where id = $1`, [id]);
}

export interface MessageInsert {
  id?: string;
  conversationId: string;
  clientId: string;
  role: 'user' | 'assistant';
  content: string;
  sourceChunkIds?: string[];
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
  latencyMs?: number;
  answered?: boolean;
}

export async function insertMessage(db: pg.PoolClient, m: MessageInsert): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into messages
       (id, conversation_id, client_id, role, content, source_chunk_ids,
        input_tokens, output_tokens, model, latency_ms, answered)
     values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     returning id`,
    [
      m.id ?? null,
      m.conversationId,
      m.clientId,
      m.role,
      m.content,
      m.sourceChunkIds ?? [],
      m.inputTokens ?? null,
      m.outputTokens ?? null,
      m.model ?? null,
      m.latencyMs ?? null,
      m.answered ?? true,
    ],
  );
  return rows[0]!.id;
}

export async function listMessages(
  db: pg.PoolClient,
  conversationId: string,
): Promise<ChatHistoryMessage[]> {
  const { rows } = await db.query<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    created_at: Date;
  }>(
    `select id, role, content, created_at from messages
      where conversation_id = $1 order by created_at asc`,
    [conversationId],
  );
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at.toISOString(),
  }));
}

/** Last N messages in chronological order, for prompt history. */
export async function recentMessages(
  db: pg.PoolClient,
  conversationId: string,
  limit: number,
  excludeId?: string,
): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  if (limit <= 0) return [];
  const { rows } = await db.query<{ role: 'user' | 'assistant'; content: string }>(
    `select role, content from messages
      where conversation_id = $1 and ($3::uuid is null or id <> $3::uuid)
      order by created_at desc limit $2`,
    [conversationId, limit, excludeId ?? null],
  );
  return rows.reverse();
}

/** Rates an assistant message, only if it belongs to the caller's session. */
export async function rateMessage(
  db: pg.PoolClient,
  messageId: string,
  sessionId: string,
  rating: 1 | -1,
): Promise<boolean> {
  const res = await db.query(
    `update messages m set rating = $2
       from conversations c
      where m.id = $1 and c.id = m.conversation_id
        and c.session_id = $3 and m.role = 'assistant'`,
    [messageId, rating, sessionId],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function getMonthUsage(db: pg.PoolClient, clientId: string): Promise<number> {
  const { rows } = await db.query<{ tokens: string }>(
    `select tokens from usage_counters
      where client_id = $1 and month = date_trunc('month', now())::date`,
    [clientId],
  );
  return rows[0] ? Number(rows[0].tokens) : 0;
}

export async function incrementUsage(
  db: pg.PoolClient,
  clientId: string,
  tokens: number,
): Promise<void> {
  await db.query(
    `insert into usage_counters (client_id, month, tokens)
     values ($1, date_trunc('month', now())::date, $2)
     on conflict (client_id, month) do update set tokens = usage_counters.tokens + excluded.tokens`,
    [clientId, tokens],
  );
}
