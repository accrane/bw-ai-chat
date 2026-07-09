import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { del, get, post, type ClientDetail, type KnowledgeDocument } from '../api';
import { Button, Card, ErrorNote, Field, Spinner, StatusPill, TextInput } from '../ui';

export function KnowledgeTab({ client }: { client: ClientDetail }) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [content, setContent] = useState('');

  const documents = useQuery({
    queryKey: ['documents', client.id],
    queryFn: () =>
      get<{ documents: KnowledgeDocument[]; total: number }>(
        `/v1/admin/clients/${client.id}/documents?limit=100`,
      ),
    refetchInterval: (query) =>
      query.state.data?.documents.some((d) => d.status === 'pending' || d.status === 'processing')
        ? 1500
        : false,
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['documents', client.id] });

  const add = useMutation({
    mutationFn: () =>
      post(`/v1/admin/clients/${client.id}/documents`, {
        title,
        content,
        ...(url ? { url } : {}),
      }),
    onSuccess: () => {
      setAdding(false);
      setTitle('');
      setUrl('');
      setContent('');
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (docId: string) => del(`/v1/admin/clients/${client.id}/documents/${docId}`),
    onSuccess: invalidate,
  });

  if (documents.isLoading) return <Spinner />;
  if (documents.isError) return <ErrorNote error={documents.error} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {documents.data!.total} document{documents.data!.total === 1 ? '' : 's'} — WordPress
          content syncs automatically; add manual knowledge here.
        </p>
        <Button onClick={() => setAdding((a) => !a)}>{adding ? 'Cancel' : 'Add text'}</Button>
      </div>

      {adding && (
        <Card title="Add manual knowledge">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Title">
                <TextInput value={title} onChange={(e) => setTitle(e.target.value)} required />
              </Field>
              <Field label="Source URL (optional, used in citations)">
                <TextInput
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://…"
                />
              </Field>
            </div>
            <Field label="Content (markdown supported — headings become citation sections)">
              <textarea
                className="w-full rounded-md border border-slate-300 px-3 py-1.5 font-mono text-xs"
                rows={8}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                required
              />
            </Field>
            {add.isError && <ErrorNote error={add.error} />}
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? 'Adding…' : 'Ingest'}
            </Button>
          </form>
        </Card>
      )}

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
              <th className="pb-2">Title</th>
              <th className="pb-2">Source</th>
              <th className="pb-2">Status</th>
              <th className="pb-2">Tokens</th>
              <th className="pb-2">Updated</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {documents.data!.documents.map((doc) => (
              <tr key={doc.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2">
                  {doc.url ? (
                    <a
                      href={doc.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-900 hover:underline"
                    >
                      {doc.title}
                    </a>
                  ) : (
                    doc.title
                  )}
                  {doc.error && <span className="ml-2 text-xs text-red-600">{doc.error}</span>}
                </td>
                <td className="py-2 text-slate-500">{doc.sourceType}</td>
                <td className="py-2">
                  <StatusPill status={doc.status} />
                </td>
                <td className="py-2 text-slate-500">{doc.tokenCount ?? '—'}</td>
                <td className="py-2 text-slate-500">{doc.updatedAt.slice(0, 10)}</td>
                <td className="py-2 text-right">
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (confirm(`Delete "${doc.title}" from the knowledge base?`))
                        remove.mutate(doc.id);
                    }}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
