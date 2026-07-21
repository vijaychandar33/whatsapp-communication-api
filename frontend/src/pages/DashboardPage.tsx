import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, getErrorMessage } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';
import { DateRangeSelector } from '../components/ui/DateRangeSelector';
import { formatDate } from '../lib/utils';
import {
  defaultDateRangeValue,
  periodStatLabel,
  resolveDateRange,
  type DateRangeValue,
} from '../lib/date-range';

type DashboardData = {
  live?: {
    messagesToday?: number;
    inboundToday?: number;
    outboundToday?: number;
    openConversations?: number;
    failedToday?: number;
    newContactsToday?: number;
    messagesYesterday?: number;
    newContactsYesterday?: number;
    openConversationsYesterday?: number;
  };
  last7Days?: {
    messagesSent?: number;
    messagesReceived?: number;
    messagesFailed?: number;
    conversationsOpened?: number;
  };
  series?: Array<{ day: string; inbound: number; outbound: number }>;
  activity?: Array<{
    id: string;
    kind: 'message' | 'contact';
    summary: string;
    createdAt: string;
  }>;
  rangeDays?: number;
  from?: string;
  to?: string;
};

type HealthData = {
  status?: string;
  database?: string;
  cache?: string;
};

function delta(current?: number, previous?: number): string {
  const c = current ?? 0;
  const p = previous ?? 0;
  const d = c - p;
  if (d === 0) return '±0 vs previous period';
  return `${d > 0 ? '+' : ''}${d} vs previous period`;
}

export function DashboardPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const [dateRange, setDateRange] = useState<DateRangeValue>(defaultDateRangeValue);

  const resolved = useMemo(() => resolveDateRange(dateRange), [dateRange]);

  const query = useQuery({
    queryKey: ['dashboard', orgId, resolved.from, resolved.to],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data } = await api.get<{ data: DashboardData }>(
        '/admin/v1/dashboard',
        {
          params: {
            organizationId: orgId,
            from: resolved.from,
            to: resolved.to,
          },
        },
      );
      return data.data;
    },
    retry: false,
  });

  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const { data } = await api.get<{ data: HealthData }>('/admin/v1/health');
      return data.data;
    },
    retry: false,
  });

  const live = query.data?.live;
  const period = query.data?.last7Days;
  const series = query.data?.series || [];
  const maxSeries = Math.max(
    1,
    ...series.map((s) => s.inbound + s.outbound),
  );

  const stats = [
    {
      label: periodStatLabel('Messages', dateRange.preset),
      value: live?.messagesToday,
      hint: delta(live?.messagesToday, live?.messagesYesterday),
    },
    {
      label: periodStatLabel('New contacts', dateRange.preset),
      value: live?.newContactsToday,
      hint: delta(live?.newContactsToday, live?.newContactsYesterday),
    },
    {
      label: 'Open conversations',
      value: live?.openConversations,
      hint: delta(live?.openConversations, live?.openConversationsYesterday),
    },
    {
      label: periodStatLabel('Inbound', dateRange.preset),
      value: live?.inboundToday,
    },
    {
      label: periodStatLabel('Outbound', dateRange.preset),
      value: live?.outboundToday,
    },
    {
      label: periodStatLabel('Failed', dateRange.preset),
      value: live?.failedToday,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Operational overview of your WhatsApp workspace."
      />

      <DateRangeSelector
        value={dateRange}
        onChange={setDateRange}
        className="mb-6"
      />

      <p className="mb-4 text-sm text-slate-500">
        Showing data for <span className="font-medium text-slate-700">{resolved.label}</span>
      </p>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="py-5">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {stat.label}
              </div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {query.isLoading ? '…' : (stat.value ?? 0)}
              </div>
              {stat.hint ? (
                <div className="mt-1 text-xs text-slate-500">{stat.hint}</div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Volume</CardTitle>
          </CardHeader>
          <CardContent>
            {query.isError ? (
              <EmptyState
                title="Dashboard unavailable"
                description={getErrorMessage(query.error)}
              />
            ) : series.length === 0 ? (
              <EmptyState title="No series data for this period" />
            ) : (
              <div className="flex h-40 items-end gap-0.5">
                {series.map((s) => {
                  const total = s.inbound + s.outbound;
                  const h = Math.max(4, Math.round((total / maxSeries) * 140));
                  const inH =
                    total > 0 ? Math.round((s.inbound / total) * h) : 0;
                  return (
                    <div
                      key={s.day}
                      className="group relative flex flex-1 flex-col justify-end"
                      title={`${s.day}: in ${s.inbound} / out ${s.outbound}`}
                    >
                      <div
                        className="w-full rounded-t bg-zinc-900/80 dark:bg-zinc-100/80"
                        style={{ height: h - inH }}
                      />
                      <div
                        className="w-full bg-slate-400/70"
                        style={{ height: inH }}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-slate-400" />
                Inbound
              </span>
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-zinc-950 dark:bg-white" />
                Outbound
              </span>
              <span>
                Sent {period?.messagesSent ?? 0} · received{' '}
                {period?.messagesReceived ?? 0}
              </span>
            </div>
          </CardContent>
        </Card>

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
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {(query.data?.activity || []).length === 0 ? (
            <EmptyState
              title="No activity in this period"
              description="Messages and new contacts in the selected range will show here."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {(query.data?.activity || []).map((item) => (
                <li key={`${item.kind}-${item.id}`} className="px-5 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge>{item.kind}</Badge>
                    <span className="text-slate-800">{item.summary}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {formatDate(item.createdAt)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
