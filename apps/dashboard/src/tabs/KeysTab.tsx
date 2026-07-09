import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { post, type ClientDetail } from '../api';
import { Button, Card, ErrorNote, TextInput } from '../ui';

export function KeysTab({ client }: { client: ClientDetail }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['client', client.id] });

  const create = useMutation({
    mutationFn: () =>
      post<{ apiKey: string }>(`/v1/admin/clients/${client.id}/keys`, { name: name || 'key' }),
    onSuccess: (data) => {
      setNewKey(data.apiKey);
      setName('');
      invalidate();
    },
  });

  const revoke = useMutation({
    mutationFn: (keyId: string) => post(`/v1/admin/clients/${client.id}/keys/${keyId}/revoke`),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-4">
      {newKey && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-medium text-amber-900">New key — shown only once:</p>
          <code className="mt-2 block rounded bg-white p-2 font-mono text-xs">{newKey}</code>
          <Button variant="secondary" className="mt-2" onClick={() => setNewKey(null)}>
            I stored it
          </Button>
        </div>
      )}

      <Card title="Create key">
        <form
          className="flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="grow">
            <TextInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Key name (e.g. wordpress)"
            />
          </div>
          <Button type="submit" disabled={create.isPending}>
            Create
          </Button>
        </form>
        {create.isError && (
          <div className="mt-3">
            <ErrorNote error={create.error} />
          </div>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Keys authenticate server-to-server integrations (the WordPress plugin). Rotate by creating
          a new key, updating the integration, then revoking the old one.
        </p>
      </Card>

      <Card title="Keys">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="pb-2">Name</th>
              <th className="pb-2">Key</th>
              <th className="pb-2">Created</th>
              <th className="pb-2">Last used</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {client.keys.map((k) => (
              <tr
                key={k.id}
                className={`border-b border-slate-100 last:border-0 ${k.revokedAt ? 'opacity-50' : ''}`}
              >
                <td className="py-2">{k.name}</td>
                <td className="py-2 font-mono text-xs">{k.prefix}…</td>
                <td className="py-2 text-slate-500">{k.createdAt.slice(0, 10)}</td>
                <td className="py-2 text-slate-500">
                  {k.lastUsedAt ? k.lastUsedAt.replace('T', ' ').slice(0, 16) : 'never'}
                </td>
                <td className="py-2 text-right">
                  {k.revokedAt ? (
                    <span className="text-xs text-slate-400">revoked</span>
                  ) : (
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (
                          confirm(
                            `Revoke ${k.prefix}…? Integrations using it stop working immediately.`,
                          )
                        ) {
                          revoke.mutate(k.id);
                        }
                      }}
                    >
                      Revoke
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
