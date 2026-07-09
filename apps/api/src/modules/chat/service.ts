import { randomUUID } from 'node:crypto';
import type {
  ChatDeltaEvent,
  ChatDoneEvent,
  ChatMetaEvent,
  ChatSourcesEvent,
  ChatSource,
  ConversationResponse,
} from '@bellaworks/shared';
import { withDbContext } from '../../db/context.js';
import { getLLMProvider } from '../../lib/llm.js';
import { logger } from '../../lib/logger.js';
import { notFound } from '../../lib/errors.js';
import { openSecret } from '../../lib/secret-box.js';
import type { ClientRecord } from '../clients/repository.js';
import { searchKnowledge } from '../knowledge/service.js';
import { buildMessages, buildSystemPrompt } from './prompt.js';
import * as repo from './repository.js';

export type ChatEvent =
  | { type: 'meta'; data: ChatMetaEvent }
  | { type: 'delta'; data: ChatDeltaEvent }
  | { type: 'sources'; data: ChatSourcesEvent }
  | { type: 'done'; data: ChatDoneEvent };

const TOP_K = 6;

export interface ChatParams {
  client: ClientRecord;
  sessionId: string;
  conversationId?: string;
  message: string;
}

/**
 * The full per-message pipeline: budget check → conversation resolution →
 * retrieval → threshold gate → LLM stream → persistence + usage metering.
 * Fallback paths (irrelevant question, exhausted budget) stream the client's
 * configured message without calling the LLM, so visitors never see errors
 * and unanswerable questions cost zero tokens. The user message is persisted
 * before streaming begins; only the assistant reply is lost if the visitor
 * disconnects mid-stream.
 */
export async function* handleChatMessage(params: ChatParams): AsyncGenerator<ChatEvent> {
  const { client, sessionId, message } = params;
  const settings = client.aiSettings;
  const startedAt = Date.now();

  // Everything before the first yield fails as a plain JSON error — the
  // stream has not started yet.
  const { conversation, userMessageId } = await withDbContext(
    { tenantId: client.id },
    async (db) => {
      let conversation: repo.ConversationRecord;
      if (params.conversationId) {
        const existing = await repo.getConversation(db, params.conversationId);
        if (!existing || existing.sessionId !== sessionId) {
          throw notFound('unknown_conversation', 'No such conversation for this session.');
        }
        conversation = existing;
      } else {
        conversation = await repo.createConversation(db, client.id, sessionId);
      }
      const userMessageId = await repo.insertMessage(db, {
        conversationId: conversation.id,
        clientId: client.id,
        role: 'user',
        content: message,
      });
      return { conversation, userMessageId };
    },
  );

  const usedTokens = await withDbContext({ tenantId: client.id }, (db) =>
    repo.getMonthUsage(db, client.id),
  );
  const overBudget = usedTokens >= settings.monthlyTokenBudget;
  if (overBudget) {
    logger.warn({ clientId: client.id, usedTokens }, 'monthly token budget exhausted');
  }

  // Retrieval (skipped when over budget — no embedding spend either).
  const results = overBudget ? [] : await searchKnowledge(client.id, message, TOP_K, 0);
  const relevant = results.filter((r) => r.score >= settings.relevanceThreshold);

  const assistantMessageId = randomUUID();
  yield { type: 'meta', data: { conversationId: conversation.id, messageId: assistantMessageId } };

  const persistAssistant = async (args: {
    content: string;
    sourceChunkIds: string[];
    usage: { inputTokens: number; outputTokens: number };
    model: string | null;
    answered: boolean;
  }): Promise<void> => {
    await withDbContext({ tenantId: client.id }, async (db) => {
      await repo.insertMessage(db, {
        id: assistantMessageId,
        conversationId: conversation.id,
        clientId: client.id,
        role: 'assistant',
        content: args.content,
        sourceChunkIds: args.sourceChunkIds,
        inputTokens: args.usage.inputTokens,
        outputTokens: args.usage.outputTokens,
        model: args.model ?? undefined,
        latencyMs: Date.now() - startedAt,
        answered: args.answered,
      });
      const total = args.usage.inputTokens + args.usage.outputTokens;
      if (total > 0) await repo.incrementUsage(db, client.id, total);
      await repo.touchConversation(db, conversation.id);
    });
  };

  if (relevant.length === 0) {
    // Fallback: stream the configured message verbatim, zero LLM cost.
    yield { type: 'delta', data: { text: settings.fallbackMessage } };
    yield { type: 'done', data: { inputTokens: 0, outputTokens: 0, answered: false } };
    await persistAssistant({
      content: settings.fallbackMessage,
      sourceChunkIds: [],
      usage: { inputTokens: 0, outputTokens: 0 },
      model: null,
      answered: false,
    });
    return;
  }

  const history = await withDbContext({ tenantId: client.id }, (db) =>
    repo.recentMessages(db, conversation.id, settings.maxHistoryMessages, userMessageId),
  );

  const systemPrompt = buildSystemPrompt(client.name, settings.systemPromptAddendum, relevant);
  const llmMessages = buildMessages(systemPrompt, history, message, settings.maxHistoryMessages);
  const provider = getLLMProvider(
    settings.apiKeyOverride ? openSecret(settings.apiKeyOverride) : null,
  );

  const stream = provider.chatStream({
    model: settings.model,
    temperature: settings.temperature,
    messages: llmMessages,
  });

  let assistantContent = '';
  let usage = { inputTokens: 0, outputTokens: 0 };
  for (;;) {
    const next = await stream.next();
    if (next.done) {
      usage = next.value;
      break;
    }
    assistantContent += next.value;
    yield { type: 'delta', data: { text: next.value } };
  }

  const sources: ChatSource[] = [];
  const seen = new Set<string>();
  for (const r of relevant) {
    const key = `${r.title}|${r.url ?? ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      sources.push({ title: r.title, url: r.url });
    }
  }
  yield { type: 'sources', data: { sources } };
  yield { type: 'done', data: { ...usage, answered: true } };

  await persistAssistant({
    content: assistantContent,
    sourceChunkIds: relevant.map((r) => r.chunkId),
    usage,
    model: settings.model,
    answered: true,
  });
}

export async function getConversationWithMessages(
  clientId: string,
  sessionId: string,
  conversationId: string,
): Promise<ConversationResponse> {
  return withDbContext({ tenantId: clientId }, async (db) => {
    const conversation = await repo.getConversation(db, conversationId);
    if (!conversation || conversation.sessionId !== sessionId) {
      throw notFound('unknown_conversation', 'No such conversation for this session.');
    }
    const messages = await repo.listMessages(db, conversationId);
    return {
      conversation: { id: conversation.id, createdAt: conversation.createdAt.toISOString() },
      messages,
    };
  });
}
