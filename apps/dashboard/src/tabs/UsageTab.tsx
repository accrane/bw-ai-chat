import { useQuery } from '@tanstack/react-query';
import { get, type ClientDetail, type UnansweredQuestion, type UsageSummary } from '../api';
import { Card, ErrorNote, Spinner } from '../ui';

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
    </div>
  );
}

/** Dependency-free 30-day activity chart. */
function ActivityChart({ days }: { days: UsageSummary['days'] }) {
  if (!days.length) return <p className="text-sm text-slate-500">No activity yet.</p>;
  const max = Math.max(...days.map((d) => d.questions), 1);
  const barWidth = 100 / days.length;
  return (
    <div>
      <svg
        viewBox="0 0 100 32"
        className="h-32 w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label="Questions per day, last 30 days"
      >
        {days.map((d, i) => {
          const h = (d.questions / max) * 28;
          const uh = d.questions ? (d.unanswered / max) * 28 : 0;
          return (
            <g key={d.day}>
              <rect
                x={i * barWidth + barWidth * 0.15}
                y={30 - h}
                width={barWidth * 0.7}
                height={h}
                fill="#0f172a"
                rx="0.5"
              >
                <title>{`${d.day}: ${d.questions} questions, ${d.unanswered} unanswered`}</title>
              </rect>
              {uh > 0 && (
                <rect
                  x={i * barWidth + barWidth * 0.15}
                  y={30 - uh}
                  width={barWidth * 0.7}
                  height={uh}
                  fill="#d97706"
                  rx="0.5"
                />
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-xs text-slate-400">
        <span>{days[0]!.day}</span>
        <span className="text-amber-600">■ unanswered</span>
        <span>{days.at(-1)!.day}</span>
      </div>
    </div>
  );
}

export function UsageTab({ client }: { client: ClientDetail }) {
  const usage = useQuery({
    queryKey: ['usage', client.id],
    queryFn: () => get<UsageSummary>(`/v1/admin/clients/${client.id}/usage`),
  });
  const unanswered = useQuery({
    queryKey: ['unanswered', client.id],
    queryFn: () =>
      get<{ questions: UnansweredQuestion[] }>(`/v1/admin/clients/${client.id}/unanswered`),
  });

  if (usage.isLoading) return <Spinner />;
  if (usage.isError) return <ErrorNote error={usage.error} />;
  const data = usage.data!;
  const currentMonth = data.months[0];
  const budget = client.aiSettings.monthlyTokenBudget;
  const rated = data.satisfaction.up + data.satisfaction.down;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Conversations" value={data.totals.conversations} />
        <Stat label="Messages" value={data.totals.messages} />
        <Stat label="Documents" value={data.totals.documents} />
        <Stat
          label="Tokens this month"
          value={currentMonth ? currentMonth.tokens.toLocaleString() : '0'}
        />
        <Stat
          label="Satisfaction"
          value={rated ? `${Math.round((data.satisfaction.up / rated) * 100)}%` : '—'}
        />
        <Stat
          label="Avg response"
          value={data.avgLatencyMs != null ? `${data.avgLatencyMs}ms` : '—'}
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
            {((currentMonth.tokens / budget) * 100).toFixed(1)}%) — at the cap, the widget serves
            the fallback message at zero cost.
          </p>
        </Card>
      )}

      <Card title="Questions per day (last 30 days)">
        <ActivityChart days={data.days} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Unanswered questions">
          {unanswered.data?.questions.length ? (
            <table className="w-full text-sm">
              <tbody>
                {unanswered.data.questions.slice(0, 10).map((q) => (
                  <tr key={q.question} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5 text-slate-700">{q.question}</td>
                    <td className="py-1.5 text-right text-slate-400">×{q.times}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-500">Nothing unanswered — nice.</p>
          )}
          <p className="mt-3 text-xs text-slate-400">
            These triggered the fallback answer. Adding them to the knowledge base is the
            highest-value content work.
          </p>
        </Card>

        <Card title="Most-cited documents">
          {data.topDocuments.length ? (
            <table className="w-full text-sm">
              <tbody>
                {data.topDocuments.map((d) => (
                  <tr key={d.title} className="border-b border-slate-100 last:border-0">
                    <td className="py-1.5 text-slate-700">{d.title}</td>
                    <td className="py-1.5 text-right text-slate-400">{d.citations} citations</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-500">No cited answers yet.</p>
          )}
        </Card>
      </div>

      <Card title="Export">
        <div className="flex gap-4 text-sm">
          <a
            className="text-slate-700 underline"
            href={`/v1/admin/clients/${client.id}/export/conversations.csv`}
          >
            Conversations (CSV)
          </a>
          <a
            className="text-slate-700 underline"
            href={`/v1/admin/clients/${client.id}/export/unanswered.csv`}
          >
            Unanswered questions (CSV)
          </a>
        </div>
      </Card>
    </div>
  );
}
