import type {
  ChatSource,
  ConversationResponse,
  WidgetConfigResponse,
  WidgetSessionResponse,
} from '@bellaworks/shared';
import { clearSession, loadSession, saveSession, updateConversation } from './session.js';
import { createSseParser } from './sse.js';

export interface StreamHandlers {
  onDelta: (text: string) => void;
  onSources: (sources: ChatSource[]) => void;
}

export async function fetchConfig(
  apiBase: string,
  clientId: string,
  bustCache = false,
): Promise<WidgetConfigResponse> {
  // preview mode (dashboard branding editor) must not see the 5-min cache
  const suffix = bustCache ? `?t=${Date.now()}` : '';
  const res = await fetch(`${apiBase}/v1/widget/${clientId}/config${suffix}`);
  if (!res.ok) throw new Error(`widget config failed (${res.status})`);
  return (await res.json()) as WidgetConfigResponse;
}

export class ChatClient {
  constructor(
    private readonly apiBase: string,
    private readonly clientId: string,
  ) {}

  private async ensureToken(): Promise<string> {
    const stored = loadSession(this.clientId);
    if (stored) return stored.token;
    const res = await fetch(`${this.apiBase}/v1/widget/${this.clientId}/session`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`session mint failed (${res.status})`);
    const session = (await res.json()) as WidgetSessionResponse;
    saveSession(this.clientId, { token: session.token, expiresAt: session.expiresAt });
    return session.token;
  }

  /** Restores the stored conversation, if any survives on the server. */
  async history(): Promise<ConversationResponse | null> {
    const stored = loadSession(this.clientId);
    if (!stored?.conversationId) return null;
    const res = await fetch(
      `${this.apiBase}/v1/chat/${this.clientId}/conversations/${stored.conversationId}`,
      { headers: { authorization: `Bearer ${stored.token}` } },
    );
    if (!res.ok) {
      if (res.status === 404 || res.status === 401) clearSession(this.clientId);
      return null;
    }
    return (await res.json()) as ConversationResponse;
  }

  async send(message: string, handlers: StreamHandlers): Promise<void> {
    try {
      await this.sendOnce(message, handlers);
    } catch (error) {
      // One retry with a fresh session covers server-side token expiry.
      if (error instanceof SessionExpiredError) {
        clearSession(this.clientId);
        await this.sendOnce(message, handlers);
        return;
      }
      throw error;
    }
  }

  private async sendOnce(message: string, handlers: StreamHandlers): Promise<void> {
    const token = await this.ensureToken();
    const conversationId = loadSession(this.clientId)?.conversationId;
    const res = await fetch(`${this.apiBase}/v1/chat/${this.clientId}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message, conversationId }),
    });
    if (res.status === 401) throw new SessionExpiredError();
    if (res.status === 404 && conversationId) {
      // conversation evaporated server-side; start fresh once
      clearSession(this.clientId);
      throw new SessionExpiredError();
    }
    if (!res.ok || !res.body) throw new Error(`chat failed (${res.status})`);

    let streamError: string | null = null;
    const parse = createSseParser((event) => {
      if (event.type === 'meta') {
        const { conversationId: id } = event.data as { conversationId: string };
        updateConversation(this.clientId, id);
      } else if (event.type === 'delta') {
        handlers.onDelta((event.data as { text: string }).text);
      } else if (event.type === 'sources') {
        handlers.onSources((event.data as { sources: ChatSource[] }).sources);
      } else if (event.type === 'error') {
        streamError = (event.data as { message: string }).message;
      }
    });

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parse(decoder.decode(value, { stream: true }));
    }
    if (streamError) throw new Error(streamError);
  }
}

class SessionExpiredError extends Error {
  constructor() {
    super('session expired');
  }
}
