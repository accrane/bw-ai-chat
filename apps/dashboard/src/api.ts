import type { AiSettings, Branding, KnowledgeDocument } from '@bellaworks/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: {
      'content-type': 'application/json',
      // CSRF token-of-intent the API requires on mutations
      'x-requested-with': 'bw-dashboard',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as {
    error?: { code: string; message: string };
  };
  if (!res.ok) {
    throw new ApiError(
      res.status,
      json.error?.code ?? 'request_failed',
      json.error?.message ?? `Request failed (${res.status})`,
    );
  }
  return json as T;
}

export const get = <T>(path: string): Promise<T> => call<T>('GET', path);
export const post = <T>(path: string, body?: unknown): Promise<T> => call<T>('POST', path, body);
export const patch = <T>(path: string, body?: unknown): Promise<T> => call<T>('PATCH', path, body);
export const del = <T>(path: string): Promise<T> => call<T>('DELETE', path);

// ---- response shapes ---------------------------------------------------------

export interface ClientSummary {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'paused';
  createdAt: string;
}

export interface DashboardAiSettings extends Omit<AiSettings, 'apiKeyOverride'> {
  hasApiKeyOverride: boolean;
}

export interface ClientDetail extends ClientSummary {
  allowedDomains: string[];
  branding: Branding;
  aiSettings: DashboardAiSettings;
  keys: {
    id: string;
    name: string;
    prefix: string;
    createdAt: string;
    lastUsedAt: string | null;
    revokedAt: string | null;
  }[];
}

export interface ConversationSummary {
  id: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  firstMessage: string | null;
}

export interface AdminMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  answered: boolean;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number | null;
  sources: { title: string; url: string | null }[];
}

export interface UsageSummary {
  months: { month: string; tokens: number }[];
  days: { day: string; questions: number; unanswered: number }[];
  totals: { conversations: number; messages: number; documents: number };
}

export type { KnowledgeDocument };
