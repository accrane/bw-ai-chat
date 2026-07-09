import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { del, patch, type ClientDetail } from '../api';
import { Button, Card, ErrorNote, Field, TextInput } from '../ui';

export function SettingsTab({ client }: { client: ClientDetail }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState(client.name);
  const [status, setStatus] = useState(client.status);
  const [domains, setDomains] = useState(client.allowedDomains.join(', '));
  const [ai, setAi] = useState({ ...client.aiSettings });
  const [byokKey, setByokKey] = useState('');
  const [clearByok, setClearByok] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const { hasApiKeyOverride: _has, ...aiRest } = ai;
      return patch(`/v1/admin/clients/${client.id}`, {
        name,
        status,
        allowedDomains: domains
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean),
        aiSettings: {
          ...aiRest,
          ...(clearByok ? { apiKeyOverride: null } : byokKey ? { apiKeyOverride: byokKey } : {}),
        },
      });
    },
    onSuccess: () => {
      setByokKey('');
      setClearByok(false);
      void queryClient.invalidateQueries({ queryKey: ['client', client.id] });
    },
  });

  const remove = useMutation({
    mutationFn: () => del(`/v1/admin/clients/${client.id}`),
    onSuccess: () => navigate('/'),
  });

  const num = (v: string, fallback: number) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Card title="General">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Company name">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Status">
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'active' | 'paused')}
            >
              <option value="active">active</option>
              <option value="paused">paused</option>
            </select>
          </Field>
          <Field label="Allowed domains" hint="Comma-separated hostnames; www counts separately">
            <TextInput value={domains} onChange={(e) => setDomains(e.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="AI settings">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Model">
            <TextInput value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value })} />
          </Field>
          <Field label="Temperature (0–2)">
            <TextInput
              type="number"
              step="0.1"
              min="0"
              max="2"
              value={ai.temperature}
              onChange={(e) => setAi({ ...ai, temperature: num(e.target.value, 0.3) })}
            />
          </Field>
          <Field label="Monthly token budget">
            <TextInput
              type="number"
              min="1"
              value={ai.monthlyTokenBudget}
              onChange={(e) => setAi({ ...ai, monthlyTokenBudget: num(e.target.value, 2_000_000) })}
            />
          </Field>
          <Field
            label="Relevance threshold (0–1)"
            hint="Below this similarity, the fallback answer is used"
          >
            <TextInput
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={ai.relevanceThreshold}
              onChange={(e) => setAi({ ...ai, relevanceThreshold: num(e.target.value, 0.3) })}
            />
          </Field>
          <Field label="History window (messages)">
            <TextInput
              type="number"
              min="0"
              max="50"
              value={ai.maxHistoryMessages}
              onChange={(e) => setAi({ ...ai, maxHistoryMessages: num(e.target.value, 10) })}
            />
          </Field>
        </div>
        <div className="mt-4 grid gap-4">
          <Field
            label="Fallback message"
            hint="Streamed verbatim when nothing relevant is found or the budget is exhausted"
          >
            <TextInput
              value={ai.fallbackMessage}
              onChange={(e) => setAi({ ...ai, fallbackMessage: e.target.value })}
            />
          </Field>
          <Field label="Prompt instructions (appended to the system prompt)">
            <textarea
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              rows={3}
              value={ai.systemPromptAddendum}
              onChange={(e) => setAi({ ...ai, systemPromptAddendum: e.target.value })}
            />
          </Field>
          <Field
            label={`Client's own OpenAI key (BYOK) — ${ai.hasApiKeyOverride ? 'a key is stored' : 'using the platform key'}`}
            hint="Encrypted at rest; leave blank to keep the current setting"
          >
            <div className="flex items-center gap-3">
              <TextInput
                type="password"
                value={byokKey}
                disabled={clearByok}
                onChange={(e) => setByokKey(e.target.value)}
                placeholder="sk-…"
              />
              {ai.hasApiKeyOverride && (
                <label className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={clearByok}
                    onChange={(e) => setClearByok(e.target.checked)}
                  />
                  remove stored key
                </label>
              )}
            </div>
          </Field>
        </div>
      </Card>

      {save.isError && <ErrorNote error={save.error} />}
      <div className="flex items-center justify-between">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save settings'}
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={remove.isPending}
          onClick={() => {
            if (
              confirm(
                `Delete ${client.name} and ALL its data (knowledge, conversations)? This cannot be undone.`,
              )
            ) {
              remove.mutate();
            }
          }}
        >
          Delete client
        </Button>
      </div>
    </form>
  );
}
