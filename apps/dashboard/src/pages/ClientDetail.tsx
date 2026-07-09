import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Route, Routes, useParams } from 'react-router-dom';
import { get, type ClientDetail as Detail } from '../api';
import { ErrorNote, Spinner, StatusPill } from '../ui';
import { SettingsTab } from '../tabs/SettingsTab';
import { BrandingTab } from '../tabs/BrandingTab';
import { KnowledgeTab } from '../tabs/KnowledgeTab';
import { ConversationsTab } from '../tabs/ConversationsTab';
import { KeysTab } from '../tabs/KeysTab';
import { UsageTab } from '../tabs/UsageTab';

const TABS = [
  { path: '', label: 'Settings' },
  { path: 'branding', label: 'Branding' },
  { path: 'knowledge', label: 'Knowledge' },
  { path: 'conversations', label: 'Conversations' },
  { path: 'keys', label: 'API keys' },
  { path: 'usage', label: 'Usage' },
];

export function ClientDetail() {
  const { id = '' } = useParams();
  const client = useQuery({
    queryKey: ['client', id],
    queryFn: () => get<{ client: Detail }>(`/v1/admin/clients/${id}`),
  });

  if (client.isLoading) return <Spinner />;
  if (client.isError) return <ErrorNote error={client.error} />;
  const detail = client.data!.client;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-sm text-slate-400 hover:text-slate-600">
          ← clients
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">{detail.name}</h1>
        <span className="font-mono text-xs text-slate-400">{detail.slug}</span>
        <StatusPill status={detail.status} />
      </div>

      <nav className="flex gap-1 border-b border-slate-200">
        {TABS.map((tab) => (
          <NavLink
            key={tab.path}
            to={`/clients/${id}${tab.path ? `/${tab.path}` : ''}`}
            end={tab.path === ''}
            className={({ isActive }) =>
              `px-3 py-2 text-sm ${isActive ? 'border-b-2 border-slate-900 font-medium text-slate-900' : 'text-slate-500 hover:text-slate-800'}`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route path="" element={<SettingsTab client={detail} />} />
        <Route path="branding" element={<BrandingTab client={detail} />} />
        <Route path="knowledge" element={<KnowledgeTab client={detail} />} />
        <Route path="conversations" element={<ConversationsTab client={detail} />} />
        <Route path="keys" element={<KeysTab client={detail} />} />
        <Route path="usage" element={<UsageTab client={detail} />} />
      </Routes>
    </div>
  );
}
