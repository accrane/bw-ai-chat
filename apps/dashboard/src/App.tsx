import { useQuery } from '@tanstack/react-query';
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { ApiError, get, post } from './api';
import { Spinner } from './ui';
import { Login } from './pages/Login';
import { ClientList } from './pages/ClientList';
import { ClientDetail } from './pages/ClientDetail';

function Shell({ email, children }: { email: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <Link to="/" className="text-sm font-semibold text-slate-900">
            BW AI Chat <span className="font-normal text-slate-400">/ dashboard</span>
          </Link>
          <div className="flex items-center gap-3 text-sm text-slate-500">
            {email}
            <button
              className="text-slate-400 underline hover:text-slate-600"
              onClick={async () => {
                await post('/v1/admin/auth/logout');
                window.location.reload();
              }}
            >
              sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-6">{children}</main>
    </div>
  );
}

export function App() {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => get<{ admin: { id: string; email: string } }>('/v1/admin/auth/me'),
    retry: false,
  });

  if (me.isLoading) return <Spinner />;

  const authed = me.isSuccess;
  const authError = me.error instanceof ApiError && me.error.status === 401;
  if (!authed && !authError && me.isError) {
    return <div className="p-8 text-sm text-red-600">API unreachable — is the server running?</div>;
  }

  return (
    <BrowserRouter basename="/admin">
      {authed ? (
        <Shell email={me.data.admin.email}>
          <Routes>
            <Route path="/" element={<ClientList />} />
            <Route path="/clients/:id/*" element={<ClientDetail />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Shell>
      ) : (
        <Routes>
          <Route path="*" element={<Login onSuccess={() => me.refetch()} />} />
        </Routes>
      )}
    </BrowserRouter>
  );
}
