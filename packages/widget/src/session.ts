export interface StoredSession {
  token: string;
  expiresAt: string;
  conversationId?: string;
}

/**
 * Session persistence per client, so returning visitors resume their
 * conversation. Falls back to in-memory storage when localStorage is
 * unavailable (private browsing, storage-partitioned iframes).
 */
const memory = new Map<string, string>();

const key = (clientId: string): string => `bw-chat:${clientId}`;

function read(k: string): string | null {
  try {
    return localStorage.getItem(k) ?? memory.get(k) ?? null;
  } catch {
    return memory.get(k) ?? null;
  }
}

function write(k: string, value: string): void {
  memory.set(k, value);
  try {
    localStorage.setItem(k, value);
  } catch {
    /* memory fallback already updated */
  }
}

export function loadSession(clientId: string): StoredSession | null {
  const raw = read(key(clientId));
  if (!raw) return null;
  try {
    const session = JSON.parse(raw) as StoredSession;
    // 60s safety margin so we never send a token that expires mid-stream
    if (new Date(session.expiresAt).getTime() < Date.now() + 60_000) {
      clearSession(clientId);
      return null;
    }
    return session;
  } catch {
    clearSession(clientId);
    return null;
  }
}

export function saveSession(clientId: string, session: StoredSession): void {
  write(key(clientId), JSON.stringify(session));
}

export function updateConversation(clientId: string, conversationId: string): void {
  const session = loadSession(clientId);
  if (session) saveSession(clientId, { ...session, conversationId });
}

export function clearSession(clientId: string): void {
  memory.delete(key(clientId));
  try {
    localStorage.removeItem(key(clientId));
  } catch {
    /* nothing else to clear */
  }
}
