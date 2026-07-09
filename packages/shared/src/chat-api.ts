export type ChatRole = 'user' | 'assistant';

export interface ChatSource {
  title: string;
  url: string | null;
}

/**
 * SSE events streamed by POST /v1/chat/:slug/messages, in order:
 * meta → delta* → sources? → done. An `error` event replaces the rest of the
 * stream if something fails mid-flight.
 */
export interface ChatMetaEvent {
  conversationId: string;
  messageId: string;
}

export interface ChatDeltaEvent {
  text: string;
}

export interface ChatSourcesEvent {
  sources: ChatSource[];
}

export interface ChatDoneEvent {
  inputTokens: number;
  outputTokens: number;
  /** false when the fallback ("I don't know" / budget) path was taken */
  answered: boolean;
}

export interface ChatErrorEvent {
  code: string;
  message: string;
}

export interface ChatHistoryMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
}

/** GET /v1/chat/:slug/conversations/:id */
export interface ConversationResponse {
  conversation: {
    id: string;
    createdAt: string;
  };
  messages: ChatHistoryMessage[];
}
