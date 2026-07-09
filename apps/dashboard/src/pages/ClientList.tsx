import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { get, post, type ClientSummary } from '../api';
import { Button, Card, ErrorNote, Field, Spinner, StatusPill, TextInput } from '../ui';

export function ClientList() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [domains, setDomains] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);

  const clients = useQuery({
    queryKey: ['clients'],
    queryFn: () => get<{ clients: ClientSummary[] }>('/v1/admin/clients'),
  });

  const create = useMutation({
    mutationFn: () =>
      post<{ client: ClientSummary; apiKey: string }>('/v1/admin/clients', {
        slug,
        name,
        allowedDomains: domains
          .split(',')
          .map((d) => d.trim())
          .filter(Boolean),
      }),
    onSuccess: (data) => {
      setNewKey(data.apiKey);
      setCreating(false);
      setSlug('');
      setName('');
      setDomains('');
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
  });

  if (clients.isLoading) return <Spinner />;
  if (clients.isError) return <ErrorNote error={clients.error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900">Clients</h1>
        <Button onClick={() => setCreating((c) => !c)}>{creating ? 'Cancel' : 'New client'}</Button>
      </div>

      {newKey && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-medium text-amber-900">
            Client created. Copy the API key now — it is shown only once:
          </p>
          <code className="mt-2 block rounded bg-white p-2 font-mono text-xs">{newKey}</code>
          <Button variant="secondary" className="mt-2" onClick={() => setNewKey(null)}>
            I stored it
          </Button>
        </div>
      )}

      {creating && (
        <Card title="New client">
          <form
            className="grid gap-4 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <Field label="Slug (public widget id)">
              <TextInput
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="whitewater"
                required
              />
            </Field>
            <Field label="Company name">
              <TextInput
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Whitewater Rafting Co."
                required
              />
            </Field>
            <Field label="Allowed domains (comma-separated)">
              <TextInput
                value={domains}
                onChange={(e) => setDomains(e.target.value)}
                placeholder="example.com, www.example.com"
              />
            </Field>
            {create.isError && (
              <div className="sm:col-span-3">
                <ErrorNote error={create.error} />
              </div>
            )}
            <div className="sm:col-span-3">
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create client'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {clients.data!.clients.length === 0 ? (
          <p className="text-sm text-slate-500">No clients yet — create the first one.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="pb-2">Name</th>
                <th className="pb-2">Slug</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {clients.data!.clients.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                >
                  <td className="py-2">
                    <Link
                      className="font-medium text-slate-900 hover:underline"
                      to={`/clients/${c.id}`}
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="py-2 font-mono text-xs text-slate-500">{c.slug}</td>
                  <td className="py-2">
                    <StatusPill status={c.status} />
                  </td>
                  <td className="py-2 text-slate-500">{c.createdAt.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
