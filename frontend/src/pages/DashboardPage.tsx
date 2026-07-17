import { useQuery } from '@tanstack/react-query';
import { api, getErrorMessage } from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';

type DashboardData = {
  totals?: Record<string, number>;
  messagesToday?: number;
  activeConversations?: number;
  organizations?: number;
  users?: number;
  accounts?: number;
  health?: { status?: string; database?: string; cache?: string };
  recentActivity?: Array<{ id: string; summary: string; createdAt?: string }>;
  [key: string]: unknown;
};

export function DashboardPage() {
  const query = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => {
      const { data } = await api.get<{ data: DashboardData }>('/admin/v1/dashboard');
      return data.data;
    },
    retry: false,
  });

  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const { data } = await api.get<{ data: DashboardData['health'] }>(
        '/admin/v1/health',
      );
      return data.data;
    },
    retry: false,
  });

  const stats = [
    { label: 'Organizations', value: query.data?.organizations ?? query.data?.totals?.organizations },
    { label: 'Users', value: query.data?.users ?? query.data?.totals?.users },
    { label: 'Accounts', value: query.data?.accounts ?? query.data?.totals?.accounts },
    {
      label: 'Messages today',
      value: query.data?.messagesToday ?? query.data?.totals?.messagesToday,
    },
    {
      label: 'Active conversations',
      value:
        query.data?.activeConversations ?? query.data?.totals?.activeConversations,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Operational overview of the communication platform."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="py-5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {stat.label}
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {query.isLoading ? '…' : (stat.value ?? '—')}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>API health</CardTitle>
            {health.data?.status ? (
              <Badge tone={health.data.status === 'ok' ? 'success' : 'warning'}>
                {health.data.status}
              </Badge>
            ) : null}
          </CardHeader>
          <CardContent>
            {health.isError ? (
              <EmptyState
                title="Health endpoint unavailable"
                description={getErrorMessage(health.error)}
              />
            ) : (
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-slate-500">Database</dt>
                  <dd className="font-medium text-slate-900">
                    {health.data?.database || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Cache</dt>
                  <dd className="font-medium text-slate-900">
                    {health.data?.cache || '—'}
                  </dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dashboard feed</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {query.isError ? (
              <EmptyState
                title="Dashboard unavailable"
                description={getErrorMessage(
                  query.error,
                  'GET /admin/v1/dashboard is not available yet.',
                )}
              />
            ) : query.isLoading ? (
              <EmptyState title="Loading dashboard…" />
            ) : query.data?.recentActivity?.length ? (
              <ul className="divide-y divide-slate-100">
                {query.data.recentActivity.map((item) => (
                  <li key={item.id} className="px-5 py-3 text-sm">
                    <div className="text-slate-800">{item.summary}</div>
                    {item.createdAt ? (
                      <div className="mt-0.5 text-xs text-slate-500">{item.createdAt}</div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No dashboard metrics yet"
                description="Connect accounts and send messages to populate this view."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
