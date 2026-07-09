import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { get, type AdminMessage, type ClientDetail, type ConversationSummary } from '../api';
import { Card, ErrorNote, Spinner } from '../ui';

function Transcript({ clientId, conversationId }: { clientId: string; conversationId: string }) {
  const messages = useQuery({
    queryKey: ['conversation', clientId, conversationId],
    queryFn: () =>
      get<{ messages: AdminMessage[] }>(
        `/v1/admin/clients/${clientId}/conversations/${conversationId}`,
      ),
  });

  if (messages.isLoading) return <Spinner />;
  if (messages.isError) return <ErrorNote error={messages.error} />;

  return (
    <div className="space-y-3">
      {messages.data!.messages.map((m) => (
        <div key={m.id} className={m.role === 'user' ? 'pl-8' : 'pr-8'}>
          <div
            className={`rounded-lg px-3 py-2 text-sm ${
              m.role === 'user' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-800'
            }`}
          >
            <p className="whitespace-pre-wrap">{m.content}</p>
          </div>
          <div className="mt-1 text-xs text-slate-400">
            {m.createdAt.replace('T', ' ').slice(0, 16)}
            {m.role === 'assistant' && (
              <>
                {' · '}
                {m.answered ? (m.model ?? 'llm') : 'fallback (unanswered)'}
                {m.inputTokens != null && ` · ${m.inputTokens}→${m.outputTokens} tokens`}
                {m.latencyMs != null && ` · ${m.latencyMs}ms`}
                {m.sources.length > 0 && ` · sources: ${m.sources.map((s) => s.title).join(', ')}`}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ConversationsTab({ client }: { client: ClientDetail }) {
  const [selected, setSelected] = useState<string | null>(null);
  const conversations = useQuery({
    queryKey: ['conversations', client.id],
    queryFn: () =>
      get<{ conversations: ConversationSummary[]; total: number }>(
        `/v1/admin/clients/${client.id}/conversations?limit=50`,
      ),
  });

  if (conversations.isLoading) return <Spinner />;
  if (conversations.isError) return <ErrorNote error={conversations.error} />;
  const list = conversations.data!.conversations;

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
      <Card title={`Conversations (${conversations.data!.total})`}>
        {list.length === 0 ? (
          <p className="text-sm text-slate-500">None yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => setSelected(c.id)}
                  className={`w-full px-2 py-2 text-left text-sm hover:bg-slate-50 ${selected === c.id ? 'bg-slate-50' : ''}`}
                >
                  <span className="block truncate text-slate-800">
                    {c.firstMessage ?? '(no messages)'}
                  </span>
                  <span className="text-xs text-slate-400">
                    {c.updatedAt.replace('T', ' ').slice(0, 16)} · {c.messageCount} messages
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title="Transcript">
        {selected ? (
          <Transcript clientId={client.id} conversationId={selected} />
        ) : (
          <p className="text-sm text-slate-500">Select a conversation.</p>
        )}
      </Card>
    </div>
  );
}
