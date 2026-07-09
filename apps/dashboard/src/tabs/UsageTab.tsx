import { useQuery } from '@tanstack/react-query';
import { get, type ClientDetail, type UsageSummary } from '../api';
import { Card, ErrorNote, Spinner } from '../ui';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

export function UsageTab({ client }: { client: ClientDetail }) {
  const usage = useQuery({
    queryKey: ['usage', client.id],
    queryFn: () => get<UsageSummary>(`/v1/admin/clients/${client.id}/usage`),
  });

  if (usage.isLoading) return <Spinner />;
  if (usage.isError) return <ErrorNote error={usage.error} />;
  const data = usage.data!;
  const currentMonth = data.months[0];
  const budget = client.aiSettings.monthlyTokenBudget;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Conversations" value={data.totals.conversations} />
        <Stat label="Messages" value={data.totals.messages} />
        <Stat label="Documents" value={data.totals.documents} />
        <Stat
          label="Tokens this month"
          value={currentMonth ? currentMonth.tokens.toLocaleString() : '0'}
        />
      </div>

      {currentMonth && (
        <Card title="Monthly budget">
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-900"
              style={{ width: `${Math.min(100, (currentMonth.tokens / budget) * 100)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {currentMonth.tokens.toLocaleString()} of {budget.toLocaleString()} tokens (
            {((currentMonth.tokens / budget) * 100).toFixed(1)}%) — when the budget is reached, the
            widget serves the fallback message at zero cost.
          </p>
        </Card>
      )}

      <Card title="Last 30 days">
        {data.days.length === 0 ? (
          <p className="text-sm text-slate-500">No activity yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                <th className="pb-2">Day</th>
                <th className="pb-2">Questions</th>
                <th className="pb-2">Unanswered</th>
              </tr>
            </thead>
            <tbody>
              {[...data.days].reverse().map((d) => (
                <tr key={d.day} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 text-slate-600">{d.day}</td>
                  <td className="py-1.5">{d.questions}</td>
                  <td
                    className={`py-1.5 ${d.unanswered > 0 ? 'text-amber-600' : 'text-slate-400'}`}
                  >
                    {d.unanswered}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-xs text-slate-400">
          Full analytics (topics, CSV export, satisfaction) arrive in Phase 7.
        </p>
      </Card>
    </div>
  );
}
