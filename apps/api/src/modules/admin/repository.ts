import {
  AiSettingsSchema,
  BrandingSchema,
  type AiSettings,
  type Branding,
} from '@bw-ai-chat/shared';
import { adminPool } from '../../db/pool.js';
import { withDbContext } from '../../db/context.js';

/**
 * Admin operations. Client CRUD is inherently cross-tenant and runs on the
 * privileged pool; per-client insight reads reuse the tenant-scoped context
 * so RLS stays the backstop even for the dashboard.
 */

export interface AdminClientSummary {
  id: string;
  slug: string;
  name: string;
  status: string;
  createdAt: string;
}

export interface AdminClientDetail extends AdminClientSummary {
  allowedDomains: string[];
  branding: Branding;
  aiSettings: Omit<AiSettings, 'apiKeyOverride'> & { hasApiKeyOverride: boolean };
  keys: {
    id: string;
    name: string;
    prefix: string;
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
  }[];
}

interface ClientRow {
  id: string;
  slug: string;
  name: string;
  status: string;
  allowed_domains: string[];
  branding: unknown;
  ai_settings: unknown;
  created_at: Date;
}

function summary(row: ClientRow): AdminClientSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listClients(): Promise<AdminClientSummary[]> {
  const { rows } = await adminPool.query<ClientRow>(
    `select id, slug, name, status, allowed_domains, branding, ai_settings, created_at
       from clients order by created_at desc`,
  );
  return rows.map(summary);
}

export async function getClientDetail(id: string): Promise<AdminClientDetail | null> {
  const { rows } = await adminPool.query<ClientRow>(
    `select id, slug, name, status, allowed_domains, branding, ai_settings, created_at
       from clients where id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;

  const keys = await adminPool.query<{
    id: string;
    name: string;
    key_prefix: string;
    created_at: Date;
    last_used_at: Date | null;
    revoked_at: Date | null;
  }>(
    `select id, name, key_prefix, created_at, last_used_at, revoked_at
       from api_keys where client_id = $1 order by created_at desc`,
    [id],
  );

  const parsedSettings = AiSettingsSchema.parse(
    typeof row.ai_settings === 'object' && row.ai_settings ? row.ai_settings : {},
  );
  const { apiKeyOverride, ...restSettings } = parsedSettings;

  return {
    ...summary(row),
    allowedDomains: row.allowed_domains,
    branding: BrandingSchema.parse(
      typeof row.branding === 'object' && row.branding ? row.branding : {},
    ),
    aiSettings: { ...restSettings, hasApiKeyOverride: apiKeyOverride !== null },
    keys: keys.rows.map((k) => ({
      id: k.id,
      name: k.name,
      prefix: k.key_prefix,
      createdAt: k.created_at.toISOString(),
      lastUsedAt: k.last_used_at?.toISOString() ?? null,
      revokedAt: k.revoked_at?.toISOString() ?? null,
    })),
  };
}

export async function createClient(input: {
  slug: string;
  name: string;
  allowedDomains: string[];
}): Promise<AdminClientSummary> {
  const { rows } = await adminPool.query<ClientRow>(
    `insert into clients (slug, name, allowed_domains, branding, ai_settings)
     values ($1, $2, $3, '{}'::jsonb, '{}'::jsonb)
     returning id, slug, name, status, allowed_domains, branding, ai_settings, created_at`,
    [input.slug, input.name, input.allowedDomains],
  );
  return summary(rows[0]!);
}

export async function updateClient(
  id: string,
  patch: {
    name?: string;
    status?: string;
    allowedDomains?: string[];
    branding?: Branding;
    aiSettings?: AiSettings;
  },
): Promise<boolean> {
  const res = await adminPool.query(
    `update clients set
        name = coalesce($2, name),
        status = coalesce($3, status),
        allowed_domains = coalesce($4, allowed_domains),
        branding = coalesce($5, branding),
        ai_settings = coalesce($6, ai_settings)
      where id = $1`,
    [
      id,
      patch.name ?? null,
      patch.status ?? null,
      patch.allowedDomains ?? null,
      patch.branding ? JSON.stringify(patch.branding) : null,
      patch.aiSettings ? JSON.stringify(patch.aiSettings) : null,
    ],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Current sealed override, needed to preserve it across settings updates. */
export async function getSealedOverride(id: string): Promise<string | null> {
  const { rows } = await adminPool.query<{ override: string | null }>(
    `select ai_settings->>'apiKeyOverride' as override from clients where id = $1`,
    [id],
  );
  return rows[0]?.override ?? null;
}

export async function deleteClient(id: string): Promise<boolean> {
  const res = await adminPool.query(`delete from clients where id = $1`, [id]);
  return (res.rowCount ?? 0) > 0;
}

export async function insertApiKey(
  clientId: string,
  name: string,
  hash: string,
  prefix: string,
): Promise<string> {
  const { rows } = await adminPool.query<{ id: string }>(
    `insert into api_keys (client_id, name, key_hash, key_prefix)
     values ($1, $2, $3, $4) returning id`,
    [clientId, name, hash, prefix],
  );
  return rows[0]!.id;
}

export async function revokeApiKey(clientId: string, keyId: string): Promise<boolean> {
  const res = await adminPool.query(
    `update api_keys set revoked_at = now() where id = $1 and client_id = $2 and revoked_at is null`,
    [keyId, clientId],
  );
  return (res.rowCount ?? 0) > 0;
}

// ---- per-client insights (tenant-scoped) -----------------------------------

export interface ConversationSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  firstMessage: string | null;
}

export async function listConversations(
  clientId: string,
  limit: number,
  offset: number,
): Promise<{ conversations: ConversationSummary[]; total: number }> {
  return withDbContext({ tenantId: clientId }, async (db) => {
    const [list, count] = await Promise.all([
      db.query<{
        id: string;
        created_at: Date;
        updated_at: Date;
        message_count: string;
        first_message: string | null;
      }>(
        `select c.id, c.created_at, c.updated_at,
                (select count(*) from messages m where m.conversation_id = c.id) as message_count,
                (select m.content from messages m
                  where m.conversation_id = c.id and m.role = 'user'
                  order by m.created_at asc limit 1) as first_message
           from conversations c
          order by c.updated_at desc limit $1 offset $2`,
        [limit, offset],
      ),
      db.query<{ total: string }>(`select count(*) as total from conversations`),
    ]);
    return {
      conversations: list.rows.map((r) => ({
        id: r.id,
        createdAt: r.created_at.toISOString(),
        updatedAt: r.updated_at.toISOString(),
        messageCount: Number(r.message_count),
        firstMessage: r.first_message ? r.first_message.slice(0, 120) : null,
      })),
      total: Number(count.rows[0]!.total),
    };
  });
}

export interface AdminMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  answered: boolean;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  rating: number | null;
  sources: { title: string; url: string | null }[];
}

export async function getConversationMessages(
  clientId: string,
  conversationId: string,
): Promise<AdminMessage[] | null> {
  return withDbContext({ tenantId: clientId }, async (db) => {
    const conv = await db.query(`select id from conversations where id = $1`, [conversationId]);
    if (!conv.rows[0]) return null;

    const { rows } = await db.query<{
      id: string;
      role: string;
      content: string;
      created_at: Date;
      answered: boolean;
      model: string | null;
      input_tokens: number | null;
      output_tokens: number | null;
      latency_ms: number | null;
      source_chunk_ids: string[];
      rating: number | null;
    }>(
      `select id, role, content, created_at, answered, model, input_tokens, output_tokens,
              latency_ms, source_chunk_ids, rating
         from messages where conversation_id = $1 order by created_at asc`,
      [conversationId],
    );

    const chunkIds = [...new Set(rows.flatMap((r) => r.source_chunk_ids))];
    const titles = new Map<string, { title: string; url: string | null }>();
    if (chunkIds.length) {
      const docs = await db.query<{ chunk_id: string; title: string; url: string | null }>(
        `select c.id as chunk_id, d.title, d.url
           from chunks c join documents d on d.id = c.document_id
          where c.id = any($1)`,
        [chunkIds],
      );
      for (const d of docs.rows) titles.set(d.chunk_id, { title: d.title, url: d.url });
    }

    return rows.map((r) => {
      const sources: { title: string; url: string | null }[] = [];
      const seen = new Set<string>();
      for (const chunkId of r.source_chunk_ids) {
        const doc = titles.get(chunkId);
        if (doc && !seen.has(doc.title)) {
          seen.add(doc.title);
          sources.push(doc);
        }
      }
      return {
        id: r.id,
        role: r.role,
        content: r.content,
        createdAt: r.created_at.toISOString(),
        answered: r.answered,
        model: r.model,
        inputTokens: r.input_tokens,
        outputTokens: r.output_tokens,
        latencyMs: r.latency_ms,
        rating: r.rating,
        sources,
      };
    });
  });
}

export async function deleteConversation(
  clientId: string,
  conversationId: string,
): Promise<boolean> {
  const res = await adminPool.query(`delete from conversations where id = $1 and client_id = $2`, [
    conversationId,
    clientId,
  ]);
  return (res.rowCount ?? 0) > 0;
}

export interface UnansweredQuestion {
  question: string;
  times: number;
  lastAsked: string;
}

/** Fallback answers paired with the visitor question that triggered them. */
export async function getUnansweredQuestions(clientId: string): Promise<UnansweredQuestion[]> {
  return withDbContext({ tenantId: clientId }, async (db) => {
    const { rows } = await db.query<{ question: string; times: string; last_asked: Date }>(
      `select u.content as question, count(*) as times, max(a.created_at) as last_asked
         from messages a
         join lateral (
           select content from messages u
            where u.conversation_id = a.conversation_id
              and u.role = 'user' and u.created_at < a.created_at
            order by u.created_at desc limit 1
         ) u on true
        where a.role = 'assistant' and a.answered = false
        group by u.content
        order by times desc, last_asked desc
        limit 100`,
    );
    return rows.map((r) => ({
      question: r.question,
      times: Number(r.times),
      lastAsked: r.last_asked.toISOString(),
    }));
  });
}

export async function exportMessages(clientId: string): Promise<(string | number | null)[][]> {
  return withDbContext({ tenantId: clientId }, async (db) => {
    const { rows } = await db.query<{
      conversation_id: string;
      created_at: Date;
      role: string;
      content: string;
      answered: boolean;
      rating: number | null;
      model: string | null;
      input_tokens: number | null;
      output_tokens: number | null;
    }>(
      `select conversation_id, created_at, role, content, answered, rating, model,
              input_tokens, output_tokens
         from messages order by conversation_id, created_at limit 50000`,
    );
    return rows.map((r) => [
      r.conversation_id,
      r.created_at.toISOString(),
      r.role,
      r.content,
      r.role === 'assistant' ? String(r.answered) : '',
      r.rating,
      r.model,
      r.input_tokens,
      r.output_tokens,
    ]);
  });
}

export interface UsageSummary {
  months: { month: string; tokens: number }[];
  days: { day: string; questions: number; unanswered: number }[];
  totals: { conversations: number; messages: number; documents: number };
  satisfaction: { up: number; down: number };
  avgLatencyMs: number | null;
  topDocuments: { title: string; citations: number }[];
}

export async function getUsage(clientId: string): Promise<UsageSummary> {
  return withDbContext({ tenantId: clientId }, async (db) => {
    const [months, days, totals, quality, topDocs] = await Promise.all([
      db.query<{ month: Date; tokens: string }>(
        `select month, tokens from usage_counters order by month desc limit 12`,
      ),
      db.query<{ day: Date; questions: string; unanswered: string }>(
        `select date_trunc('day', created_at)::date as day,
                count(*) filter (where role = 'user') as questions,
                count(*) filter (where role = 'assistant' and answered = false) as unanswered
           from messages
          where created_at > now() - interval '30 days'
          group by 1 order by 1`,
      ),
      db.query<{ conversations: string; messages: string; documents: string }>(
        `select (select count(*) from conversations) as conversations,
                (select count(*) from messages) as messages,
                (select count(*) from documents) as documents`,
      ),
      db.query<{ up: string; down: string; avg_latency: string | null }>(
        `select count(*) filter (where rating = 1) as up,
                count(*) filter (where rating = -1) as down,
                avg(latency_ms) filter (where answered) as avg_latency
           from messages where role = 'assistant'`,
      ),
      db.query<{ title: string; citations: string }>(
        `select d.title, count(*) as citations
           from messages m
           cross join lateral unnest(m.source_chunk_ids) as chunk_id
           join chunks c on c.id = chunk_id
           join documents d on d.id = c.document_id
          group by d.title
          order by citations desc limit 5`,
      ),
    ]);
    return {
      months: months.rows.map((r) => ({
        month: r.month.toISOString().slice(0, 7),
        tokens: Number(r.tokens),
      })),
      days: days.rows.map((r) => ({
        day: r.day.toISOString().slice(0, 10),
        questions: Number(r.questions),
        unanswered: Number(r.unanswered),
      })),
      totals: {
        conversations: Number(totals.rows[0]!.conversations),
        messages: Number(totals.rows[0]!.messages),
        documents: Number(totals.rows[0]!.documents),
      },
      satisfaction: {
        up: Number(quality.rows[0]!.up),
        down: Number(quality.rows[0]!.down),
      },
      avgLatencyMs:
        quality.rows[0]!.avg_latency === null
          ? null
          : Math.round(Number(quality.rows[0]!.avg_latency)),
      topDocuments: topDocs.rows.map((r) => ({
        title: r.title,
        citations: Number(r.citations),
      })),
    };
  });
}
