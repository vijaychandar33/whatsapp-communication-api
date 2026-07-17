import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Play, Square } from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { listErrorMessage, usePaginatedList } from '../hooks/usePaginatedList';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge, statusTone } from '../components/ui/Badge';
import { formatDate } from '../lib/utils';

type Broadcast = {
  id: string;
  name: string;
  status?: string;
  audienceType?: string;
  templateName?: string;
  templateLanguage?: string;
  totalCount?: number;
  sentCount?: number;
  deliveredCount?: number;
  readCount?: number;
  failedCount?: number;
  skippedCount?: number;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  errorMessage?: string | null;
  communicationAccount?: {
    id: string;
    name?: string;
    phoneNumber?: string;
  };
  recipients?: {
    id: string;
    phoneNumber: string;
    status: string;
    errorMessage?: string | null;
    contact?: { displayName?: string | null; phoneNumber?: string | null };
  }[];
};

type Account = {
  id: string;
  name?: string;
  phoneNumber?: string;
  connectionStatus?: string;
};

type Template = {
  id: string;
  name?: string;
  language?: string;
  status?: string;
};

type Tag = { id: string; name: string; color?: string };

export function BroadcastsPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId || '';
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const list = usePaginatedList<Broadcast>({
    queryKey: ['broadcasts', orgId],
    path: '/admin/v1/broadcasts',
    page,
  });

  const start = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/admin/v1/broadcasts/${id}/start`, null, {
        params: { organizationId: orgId },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/admin/v1/broadcasts/${id}/cancel`, null, {
        params: { organizationId: orgId },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
    },
  });

  const items = list.data?.items || [];

  return (
    <div>
      <PageHeader
        title="Broadcasts"
        description="WhatsApp template campaigns to contacts — tracked per recipient."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Megaphone className="mr-1.5 h-4 w-4" />
            New broadcast
          </Button>
        }
      />

      <Card>
        {list.isError ? (
          <EmptyState
            title="Could not load broadcasts"
            description={listErrorMessage(list.error)}
          />
        ) : list.isLoading ? (
          <EmptyState title="Loading…" />
        ) : items.length === 0 ? (
          <EmptyState
            title="No broadcasts yet"
            description="Create a template campaign to an audience of contacts."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {items.map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-slate-50"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => navigate(`/broadcasts/${row.id}`)}
                >
                  <div className="font-medium text-slate-900">{row.name}</div>
                  <div className="text-xs text-slate-500">
                    {row.templateName} · {row.audienceType} ·{' '}
                    {row.totalCount ?? 0} recipients · {formatDate(row.createdAt)}
                  </div>
                </button>
                {row.status ? (
                  <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                ) : null}
                <div className="text-xs text-slate-500">
                  sent {row.sentCount ?? 0}/{row.totalCount ?? 0}
                  {(row.failedCount || 0) > 0
                    ? ` · fail ${row.failedCount}`
                    : ''}
                </div>
                {(row.status === 'DRAFT' || row.status === 'SCHEDULED') && (
                  <Button
                    variant="secondary"
                    loading={start.isPending}
                    onClick={() => start.mutate(row.id)}
                  >
                    <Play className="mr-1 h-3.5 w-3.5" />
                    Start
                  </Button>
                )}
                {row.status === 'SENDING' && (
                  <Button
                    variant="secondary"
                    loading={cancel.isPending}
                    onClick={() => cancel.mutate(row.id)}
                  >
                    <Square className="mr-1 h-3.5 w-3.5" />
                    Cancel
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs">
          <button
            type="button"
            className="text-zinc-800 dark:text-zinc-200 disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Prev
          </button>
          <span className="text-slate-500">
            {page}/{list.data?.meta.totalPages || 1}
          </span>
          <button
            type="button"
            className="text-zinc-800 dark:text-zinc-200 disabled:opacity-40"
            disabled={page >= (list.data?.meta.totalPages || 1)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      </Card>

      <CreateBroadcastModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        orgId={orgId}
        onCreated={(id) => {
          setCreateOpen(false);
          void queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
          navigate(`/broadcasts/${id}`);
        }}
      />
    </div>
  );
}

export function BroadcastDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const orgId = user?.organizationId || '';
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ['broadcasts', 'detail', id, orgId],
    enabled: Boolean(id && orgId),
    refetchInterval: (q) =>
      q.state.data?.status === 'SENDING' ? 2500 : false,
    queryFn: async () => {
      const { data } = await api.get<{ data: Broadcast }>(
        `/admin/v1/broadcasts/${id}`,
        { params: { organizationId: orgId } },
      );
      return data.data;
    },
  });

  const start = useMutation({
    mutationFn: async () => {
      await api.post(`/admin/v1/broadcasts/${id}/start`, null, {
        params: { organizationId: orgId },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['broadcasts', 'detail', id],
      });
      await queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
    },
  });

  const cancel = useMutation({
    mutationFn: async () => {
      await api.post(`/admin/v1/broadcasts/${id}/cancel`, null, {
        params: { organizationId: orgId },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['broadcasts', 'detail', id],
      });
      await queryClient.invalidateQueries({ queryKey: ['broadcasts'] });
    },
  });

  const b = detail.data;

  return (
    <div>
      <PageHeader
        title={b?.name || 'Broadcast'}
        description={
          b
            ? `${b.templateName} (${b.templateLanguage}) · ${b.audienceType}`
            : 'Campaign detail'
        }
        actions={
          <div className="flex gap-2">
            <Link
              to="/broadcasts"
              className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back
            </Link>
            {(b?.status === 'DRAFT' || b?.status === 'SCHEDULED') && (
              <Button loading={start.isPending} onClick={() => start.mutate()}>
                Start send
              </Button>
            )}
            {b?.status === 'SENDING' && (
              <Button
                variant="secondary"
                loading={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                Cancel
              </Button>
            )}
          </div>
        }
      />

      {detail.isLoading ? (
        <EmptyState title="Loading…" />
      ) : detail.isError ? (
        <EmptyState
          title="Could not load broadcast"
          description={getErrorMessage(detail.error)}
        />
      ) : !b ? (
        <EmptyState title="Not found" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardContent className="space-y-3 py-4">
              <div className="flex items-center gap-2">
                <Badge tone={statusTone(b.status || '')}>{b.status}</Badge>
              </div>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs uppercase text-slate-400">Account</dt>
                  <dd>
                    {b.communicationAccount?.name ||
                      b.communicationAccount?.phoneNumber ||
                      '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-400">Progress</dt>
                  <dd>
                    sent {b.sentCount}/{b.totalCount}
                    <br />
                    delivered {b.deliveredCount} · read {b.readCount}
                    <br />
                    failed {b.failedCount} · skipped {b.skippedCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-400">Timeline</dt>
                  <dd>
                    created {formatDate(b.createdAt)}
                    <br />
                    started {formatDate(b.startedAt)}
                    <br />
                    completed {formatDate(b.completedAt)}
                  </dd>
                </div>
                {b.errorMessage ? (
                  <p className="text-sm text-red-600">{b.errorMessage}</p>
                ) : null}
              </dl>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardContent className="py-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">
                Recipients (first 200)
              </h3>
              {(b.recipients || []).length === 0 ? (
                <EmptyState title="No recipients yet — start the broadcast" />
              ) : (
                <div className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
                  {(b.recipients || []).map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between gap-2 py-2 text-sm"
                    >
                      <div>
                        <div className="font-medium text-slate-800">
                          {r.contact?.displayName || r.phoneNumber}
                        </div>
                        <div className="font-mono text-xs text-slate-500">
                          {r.phoneNumber}
                        </div>
                        {r.errorMessage ? (
                          <div className="text-xs text-red-600">
                            {r.errorMessage}
                          </div>
                        ) : null}
                      </div>
                      <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function CreateBroadcastModal({
  open,
  onClose,
  orgId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  orgId: string;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [templateLanguage, setTemplateLanguage] = useState('en');
  const [audienceType, setAudienceType] = useState<
    'ALL' | 'TAGS' | 'CONTACTS' | 'MANUAL'
  >('ALL');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [phones, setPhones] = useState('');
  const [preview, setPreview] = useState<{ count: number } | null>(null);

  const accounts = useQuery({
    queryKey: ['accounts', 'broadcast', orgId],
    enabled: open && Boolean(orgId),
    queryFn: async () => {
      const { data } = await api.get<{ data: Account[] }>('/admin/v1/accounts', {
        params: { organizationId: orgId, limit: 100 },
      });
      return Array.isArray(data.data) ? data.data : [];
    },
  });

  const templates = useQuery({
    queryKey: ['templates', 'broadcast', orgId],
    enabled: open && Boolean(orgId),
    queryFn: async () => {
      const { data } = await api.get<{ data: Template[] }>(
        '/admin/v1/templates',
        { params: { organizationId: orgId, limit: 100 } },
      );
      return Array.isArray(data.data) ? data.data : [];
    },
  });

  const tags = useQuery({
    queryKey: ['tags', orgId],
    enabled: open && Boolean(orgId) && audienceType === 'TAGS',
    queryFn: async () => {
      const { data } = await api.get<{ data: Tag[] }>('/admin/v1/tags', {
        params: { organizationId: orgId },
      });
      return Array.isArray(data.data) ? data.data : [];
    },
  });

  useEffect(() => {
    if (!open) {
      setName('');
      setAccountId('');
      setTemplateName('');
      setTemplateLanguage('en');
      setAudienceType('ALL');
      setTagIds([]);
      setPhones('');
      setPreview(null);
    }
  }, [open]);

  const selectedTemplate = useMemo(
    () => (templates.data || []).find((t) => t.name === templateName),
    [templates.data, templateName],
  );

  useEffect(() => {
    if (selectedTemplate?.language) {
      setTemplateLanguage(selectedTemplate.language);
    }
  }, [selectedTemplate]);

  const payload = () => ({
    organizationId: orgId,
    communicationAccountId: accountId,
    name,
    templateName,
    templateLanguage,
    audienceType,
    audienceFilter: {
      ...(audienceType === 'TAGS' ? { tagIds } : {}),
      ...(audienceType === 'MANUAL'
        ? {
            phones: phones
              .split(/[\n,]+/)
              .map((p) => p.trim())
              .filter(Boolean),
          }
        : {}),
    },
  });

  const runPreview = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ data: { count: number } }>(
        '/admin/v1/broadcasts/preview',
        payload(),
      );
      return data.data;
    },
    onSuccess: (data) => setPreview(data),
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ data: { id: string } }>(
        '/admin/v1/broadcasts',
        payload(),
      );
      return data.data;
    },
    onSuccess: (data) => onCreated(data.id),
  });

  return (
    <Modal
      open={open}
      title="New broadcast"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            loading={runPreview.isPending}
            disabled={!accountId || !templateName || !name.trim()}
            onClick={() => runPreview.mutate()}
          >
            Preview audience
          </Button>
          <Button
            loading={create.isPending}
            disabled={!accountId || !templateName || !name.trim()}
            onClick={() => create.mutate()}
          >
            Create draft
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label="Campaign name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">
            WhatsApp account
          </span>
          <select
            className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">Select…</option>
            {(accounts.data || []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.phoneNumber} ({a.connectionStatus})
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Template</span>
          <select
            className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
          >
            <option value="">Select…</option>
            {(templates.data || []).map((t) => (
              <option key={t.id} value={t.name || ''}>
                {t.name} ({t.language}) {t.status ? `· ${t.status}` : ''}
              </option>
            ))}
          </select>
        </label>
        <Input
          label="Template language"
          value={templateLanguage}
          onChange={(e) => setTemplateLanguage(e.target.value)}
        />
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">Audience</span>
          <select
            className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
            value={audienceType}
            onChange={(e) =>
              setAudienceType(e.target.value as typeof audienceType)
            }
          >
            <option value="ALL">All contacts with phone</option>
            <option value="TAGS">By tags</option>
            <option value="MANUAL">Manual phone list</option>
          </select>
        </label>
        {audienceType === 'TAGS' ? (
          <div className="flex flex-wrap gap-2">
            {(tags.data || []).map((t) => {
              const on = tagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    on ? 'text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                  style={on ? { backgroundColor: t.color || '#171717' } : undefined}
                  onClick={() =>
                    setTagIds((prev) =>
                      on ? prev.filter((x) => x !== t.id) : [...prev, t.id],
                    )
                  }
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        ) : null}
        {audienceType === 'MANUAL' ? (
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">
              Phones (one per line or comma-separated)
            </span>
            <textarea
              className="min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={phones}
              onChange={(e) => setPhones(e.target.value)}
            />
          </label>
        ) : null}
        {preview ? (
          <p className="text-sm text-zinc-800 dark:text-zinc-200">
            Audience preview: <strong>{preview.count}</strong> recipients
          </p>
        ) : null}
        {runPreview.isError ? (
          <p className="text-sm text-red-600">
            {getErrorMessage(runPreview.error)}
          </p>
        ) : null}
        {create.isError ? (
          <p className="text-sm text-red-600">{getErrorMessage(create.error)}</p>
        ) : null}
      </div>
    </Modal>
  );
}
