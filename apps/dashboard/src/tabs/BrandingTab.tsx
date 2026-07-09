import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Branding } from '@bellaworks/shared';
import { patch, type ClientDetail } from '../api';
import { Button, Card, ErrorNote, Field, TextInput } from '../ui';

const API_ORIGIN = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'bellaworks-chat': {
        'client-id': string;
        'api-url': string;
        preview: string;
        key?: string | number;
      };
    }
  }
}

function WidgetPreview({ slug, version }: { slug: string; version: number }) {
  const [scriptReady, setScriptReady] = useState(false);
  useEffect(() => {
    if (document.querySelector('script[data-bw-widget]')) {
      setScriptReady(true);
      return;
    }
    const script = document.createElement('script');
    // dev: bypass any previously cached immutable bundle
    script.src = `${API_ORIGIN}/widget/v1.js${import.meta.env.DEV ? `?d=${Date.now()}` : ''}`;
    script.dataset.bwWidget = '1';
    script.onload = () => setScriptReady(true);
    document.head.appendChild(script);
  }, []);

  if (!scriptReady) return null;
  // key remounts the element after each save so it refetches uncached config
  return <bellaworks-chat key={version} client-id={slug} api-url={API_ORIGIN} preview="" />;
}

export function BrandingTab({ client }: { client: ClientDetail }) {
  const queryClient = useQueryClient();
  const [branding, setBranding] = useState<Branding>({ ...client.branding });
  const [version, setVersion] = useState(0);

  const save = useMutation({
    mutationFn: () => patch(`/v1/admin/clients/${client.id}`, { branding }),
    onSuccess: () => {
      setVersion((v) => v + 1);
      void queryClient.invalidateQueries({ queryKey: ['client', client.id] });
    },
  });

  const set = <K extends keyof Branding>(key: K, value: Branding[K]) =>
    setBranding((b) => ({ ...b, [key]: value }));

  const color = (
    label: string,
    key: 'primaryColor' | 'secondaryColor' | 'textColor' | 'backgroundColor',
  ) => (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={branding[key]}
          onChange={(e) => set(key, e.target.value)}
          className="h-8 w-10 cursor-pointer rounded border border-slate-300"
        />
        <TextInput
          value={branding[key]}
          onChange={(e) => set(key, e.target.value)}
          className="font-mono"
        />
      </div>
    </Field>
  );

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <Card title="Branding">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Display name (header)">
            <TextInput
              value={branding.companyName ?? ''}
              onChange={(e) => set('companyName', e.target.value || undefined)}
              placeholder={client.name}
            />
          </Field>
          <Field label="Welcome message">
            <TextInput
              value={branding.welcomeMessage}
              onChange={(e) => set('welcomeMessage', e.target.value)}
            />
          </Field>
          {color('Primary color', 'primaryColor')}
          {color('Secondary color', 'secondaryColor')}
          {color('Text color', 'textColor')}
          {color('Background color', 'backgroundColor')}
          <Field label="Logo / avatar URL">
            <TextInput
              value={branding.avatarUrl ?? ''}
              onChange={(e) => set('avatarUrl', e.target.value || undefined)}
              placeholder="https://…"
            />
          </Field>
          <Field label="Font family">
            <TextInput
              value={branding.fontFamily}
              onChange={(e) => set('fontFamily', e.target.value)}
            />
          </Field>
          <Field label="Corner radius (px)">
            <TextInput
              type="number"
              min="0"
              max="32"
              value={branding.borderRadius}
              onChange={(e) => set('borderRadius', Number(e.target.value) || 0)}
            />
          </Field>
          <Field label="Position">
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              value={branding.position}
              onChange={(e) => set('position', e.target.value as Branding['position'])}
            >
              <option value="bottom-right">bottom-right</option>
              <option value="bottom-left">bottom-left</option>
            </select>
          </Field>
          <Field label="Theme">
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              value={branding.theme}
              onChange={(e) => set('theme', e.target.value as Branding['theme'])}
            >
              <option value="auto">auto (follow visitor)</option>
              <option value="light">light</option>
              <option value="dark">dark</option>
            </select>
          </Field>
        </div>
      </Card>

      {save.isError && <ErrorNote error={save.error} />}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save & update preview'}
        </Button>
        <span className="text-xs text-slate-400">
          The live widget (bottom corner of this page) reloads with saved branding.
        </span>
      </div>

      <WidgetPreview slug={client.slug} version={version} />
    </form>
  );
}
