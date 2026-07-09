import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Branding, ChatSource, WidgetConfigResponse } from '@bellaworks/shared';
import { ChatClient, fetchConfig } from './api.js';
import { ChatIcon, CloseIcon, SendIcon } from './icons.js';
import { renderMarkdown } from './markdown.js';
import { baseStyles, hostVars } from './styles.js';

interface Msg {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: ChatSource[];
  streaming?: boolean;
  failed?: boolean;
}

const uid = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;

export function App({ clientId, apiBase }: { clientId: string; apiBase: string }) {
  const [config, setConfig] = useState<WidgetConfigResponse | null>(null);

  useEffect(() => {
    fetchConfig(apiBase, clientId)
      .then(setConfig)
      .catch((err) => console.warn('[bellaworks-chat] disabled:', err));
  }, [apiBase, clientId]);

  if (!config) return null;
  return (
    <>
      <style>{baseStyles}</style>
      <style>{hostVars(config.branding)}</style>
      <Widget clientId={clientId} apiBase={apiBase} config={config} />
    </>
  );
}

function useTheme(setting: Branding['theme']): 'light' | 'dark' {
  const query = useMemo(() => window.matchMedia?.('(prefers-color-scheme: dark)'), []);
  const [systemDark, setSystemDark] = useState(query?.matches ?? false);
  useEffect(() => {
    if (!query || setting !== 'auto') return;
    const onChange = (e: MediaQueryListEvent): void => setSystemDark(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [query, setting]);
  return setting === 'auto' ? (systemDark ? 'dark' : 'light') : setting;
}

function Widget({
  clientId,
  apiBase,
  config,
}: {
  clientId: string;
  apiBase: string;
  config: WidgetConfigResponse;
}) {
  const branding = config.branding;
  const theme = useTheme(branding.theme);
  const chat = useMemo(() => new ChatClient(apiBase, clientId), [apiBase, clientId]);

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  const restored = useRef(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // restore a previous conversation once, on first open
  useEffect(() => {
    if (!open || restored.current) return;
    restored.current = true;
    chat
      .history()
      .then((history) => {
        if (history) {
          setMessages(history.messages.map((m) => ({ id: m.id, role: m.role, text: m.content })));
        }
      })
      .catch(() => undefined);
  }, [open, chat]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else launcherRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const update = (id: string, patch: (m: Msg) => Msg): void =>
    setMessages((all) => all.map((m) => (m.id === id ? patch(m) : m)));

  async function send(event: Event): Promise<void> {
    event.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    const botId = uid();
    setMessages((all) => [
      ...all,
      { id: uid(), role: 'user', text },
      { id: botId, role: 'assistant', text: '', streaming: true },
    ]);
    setBusy(true);
    try {
      await chat.send(text, {
        onDelta: (delta) => update(botId, (m) => ({ ...m, text: m.text + delta })),
        onSources: (sources) => update(botId, (m) => (sources.length ? { ...m, sources } : m)),
      });
      update(botId, (m) => ({ ...m, streaming: false }));
    } catch {
      update(botId, (m) => ({
        ...m,
        streaming: false,
        failed: true,
        text: m.text || 'Sorry — something went wrong. Please try again.',
      }));
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  const name = branding.companyName ?? config.name;

  return (
    <div class="root" data-theme={theme} data-position={branding.position}>
      {open && (
        <div
          class="panel"
          role="dialog"
          aria-modal="true"
          aria-label={`${name} chat`}
          onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        >
          <div class="header">
            {(branding.avatarUrl ?? branding.logoUrl) && (
              <img src={branding.avatarUrl ?? branding.logoUrl} alt="" />
            )}
            <span class="name">{name}</span>
            <button class="close" aria-label="Close chat" onClick={() => setOpen(false)}>
              <CloseIcon />
            </button>
          </div>

          <div class="messages" ref={scrollRef} aria-live="polite">
            <div class="msg bot">
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(branding.welcomeMessage) }} />
            </div>
            {messages.map((m) => (
              <>
                <div
                  key={m.id}
                  class={`msg ${m.role === 'user' ? 'user' : 'bot'}${m.failed ? ' failed' : ''}`}
                >
                  {m.role === 'user' ? (
                    m.text
                  ) : m.streaming && !m.text ? (
                    <span class="typing" aria-label="Typing">
                      <span />
                      <span />
                      <span />
                    </span>
                  ) : (
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }} />
                  )}
                </div>
                {m.sources && (
                  <div class="sources">
                    Sources:{' '}
                    {m.sources.map((s, i) => (
                      <>
                        {i > 0 && ', '}
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noopener noreferrer">
                            {s.title}
                          </a>
                        ) : (
                          s.title
                        )}
                      </>
                    ))}
                  </div>
                )}
              </>
            ))}
          </div>

          <form class="inputbar" onSubmit={send}>
            <input
              ref={inputRef}
              value={input}
              onInput={(e) => setInput((e.target as HTMLInputElement).value)}
              placeholder="Type your question…"
              aria-label="Your message"
              maxLength={4000}
            />
            <button class="send" type="submit" disabled={busy || !input.trim()} aria-label="Send">
              <SendIcon />
            </button>
          </form>
          <div class="credit">Powered by Bellaworks</div>
        </div>
      )}

      <button
        ref={launcherRef}
        class="launcher"
        aria-label={open ? 'Close chat' : `Chat with ${name}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>
    </div>
  );
}
