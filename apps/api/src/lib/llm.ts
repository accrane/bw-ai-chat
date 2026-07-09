import { env } from '../config/env.js';
import { logger } from './logger.js';

export interface LLMChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LLMChatParams {
  model: string;
  temperature: number;
  messages: LLMChatMessage[];
  maxTokens?: number;
}

/** Yields text deltas as they arrive; the generator's return value is usage. */
export interface LLMProvider {
  readonly name: string;
  chatStream(params: LLMChatParams): AsyncGenerator<string, LLMUsage, void>;
}

export class OpenAIChat implements LLMProvider {
  readonly name = 'openai';

  constructor(private readonly apiKey: string) {}

  async *chatStream(params: LLMChatParams): AsyncGenerator<string, LLMUsage, void> {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: params.model,
        temperature: params.temperature,
        messages: params.messages,
        max_completion_tokens: params.maxTokens ?? 1024,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });
    if (!res.ok || !res.body) {
      const detail = (await res.text()).slice(0, 300);
      throw new Error(`openai chat failed (${res.status}): ${detail}`);
    }

    let usage: LLMUsage = { inputTokens: 0, outputTokens: 0 };
    let buffer = '';
    const decoder = new TextDecoder();
    for await (const raw of res.body as unknown as AsyncIterable<Uint8Array>) {
      buffer += decoder.decode(raw, { stream: true });
      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice('data:'.length).trim();
        if (data === '[DONE]') continue;
        const chunk = JSON.parse(data) as {
          choices?: { delta?: { content?: string } }[];
          usage?: { prompt_tokens: number; completion_tokens: number } | null;
        };
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) yield delta;
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          };
        }
      }
    }
    return usage;
  }
}

/**
 * Deterministic offline provider for tests and keyless dev: streams a short
 * answer that quotes the first retrieved knowledge block, proving the
 * retrieval → prompt → stream plumbing without any network call.
 */
export class FakeChat implements LLMProvider {
  readonly name = 'fake';

  async *chatStream(params: LLMChatParams): AsyncGenerator<string, LLMUsage, void> {
    const system = params.messages.find((m) => m.role === 'system')?.content ?? '';
    const knowledge = /<knowledge>\n\[[^\]]*\]\n([\s\S]{0,160})/.exec(system)?.[1];
    const parts = [
      'Based on our information: ',
      knowledge ? knowledge.replace(/\s+/g, ' ').trim() : 'I could not find details on that.',
    ];
    for (const part of parts) yield part;
    const inputTokens = Math.ceil(params.messages.reduce((n, m) => n + m.content.length, 0) / 4);
    const outputTokens = Math.ceil(parts.join('').length / 4);
    return { inputTokens, outputTokens };
  }
}

let platformProvider: LLMProvider | null = null;

/** Provider for a request; a BYOK override key gets its own OpenAI instance. */
export function getLLMProvider(apiKeyOverride?: string | null): LLMProvider {
  if (apiKeyOverride) return new OpenAIChat(apiKeyOverride);
  if (platformProvider) return platformProvider;
  const choice = env.LLM_PROVIDER ?? (env.OPENAI_API_KEY ? 'openai' : 'fake');
  if (choice === 'openai') {
    if (!env.OPENAI_API_KEY) throw new Error('LLM_PROVIDER=openai requires OPENAI_API_KEY');
    platformProvider = new OpenAIChat(env.OPENAI_API_KEY);
  } else {
    if (env.NODE_ENV !== 'test') {
      logger.warn('using fake LLM provider (set OPENAI_API_KEY for real answers)');
    }
    platformProvider = new FakeChat();
  }
  return platformProvider;
}
