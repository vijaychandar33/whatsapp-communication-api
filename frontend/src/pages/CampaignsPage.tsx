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
import { AccountBadge } from '../components/ui/AccountBadge';
import { Badge, statusTone } from '../components/ui/Badge';
import { cn, formatDate } from '../lib/utils';

type Campaign = {
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

type ContactList = {
  id: string;
  name: string;
  description?: string | null;
  _count?: { members: number };
};

const selectClass =
  'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100';

export function CampaignsPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId || '';
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const list = usePaginatedList<Campaign>({
    queryKey: ['campaigns', orgId],
    path: '/admin/v1/campaigns',
    page,
  });

  const start = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/admin/v1/campaigns/${id}/start`, null, {
        params: { organizationId: orgId },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  const cancel = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/admin/v1/campaigns/${id}/cancel`, null, {
        params: { organizationId: orgId },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  const items = list.data?.items || [];

  return (
    <div>
      <PageHeader
        title="Campaigns"
        description="Send WhatsApp template messages to contact lists — tracked per recipient."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Megaphone className="mr-1.5 h-4 w-4" />
            New Campaign
          </Button>
        }
      />

      <Card>
        {list.isError ? (
          <EmptyState
            title="Could not load campaigns"
            description={listErrorMessage(list.error)}
          />
        ) : list.isLoading ? (
          <EmptyState title="Loading…" />
        ) : items.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="Create a campaign to send an approved template to one or more contact lists."
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
                  onClick={() => navigate(`/campaigns/${row.id}`)}
                >
                  <div className="font-medium text-slate-900">{row.name}</div>
                  <div className="mt-0.5">
                    <AccountBadge account={row.communicationAccount} />
                  </div>
                  <div className="text-xs text-slate-500">
                    {row.templateName} · {formatAudienceLabel(row.audienceType)} ·{' '}
                    {row.totalCount ?? 0} recipients · {formatDate(row.createdAt)}
                  </div>
                </button>
                {row.status ? (
                  <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                ) : null}
                <div className="text-xs text-slate-500">
                  sent {row.sentCount ?? 0}/{row.totalCount ?? 0}
                  {(row.failedCount || 0) > 0 ? ` · fail ${row.failedCount}` : ''}
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

      <CreateCampaignModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        orgId={orgId}
        onCreated={(id) => {
          setCreateOpen(false);
          void queryClient.invalidateQueries({ queryKey: ['campaigns'] });
          navigate(`/campaigns/${id}`);
        }}
      />
    </div>
  );
}

export function CampaignDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const orgId = user?.organizationId || '';
  const queryClient = useQueryClient();

  const detail = useQuery({
    queryKey: ['campaigns', 'detail', id, orgId],
    enabled: Boolean(id && orgId),
    refetchInterval: (q) =>
      q.state.data?.status === 'SENDING' ? 2500 : false,
    queryFn: async () => {
      const { data } = await api.get<{ data: Campaign }>(
        `/admin/v1/campaigns/${id}`,
        { params: { organizationId: orgId } },
      );
      return data.data;
    },
  });

  const start = useMutation({
    mutationFn: async () => {
      await api.post(`/admin/v1/campaigns/${id}/start`, null, {
        params: { organizationId: orgId },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['campaigns', 'detail', id],
      });
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  const cancel = useMutation({
    mutationFn: async () => {
      await api.post(`/admin/v1/campaigns/${id}/cancel`, null, {
        params: { organizationId: orgId },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['campaigns', 'detail', id],
      });
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });

  const c = detail.data;

  return (
    <div>
      <PageHeader
        title={c?.name || 'Campaign'}
        description={
          c
            ? `${c.templateName} (${c.templateLanguage}) · ${formatAudienceLabel(c.audienceType)}`
            : 'Campaign detail'
        }
        actions={
          <div className="flex gap-2">
            <Link
              to="/campaigns"
              className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back
            </Link>
            {(c?.status === 'DRAFT' || c?.status === 'SCHEDULED') && (
              <Button loading={start.isPending} onClick={() => start.mutate()}>
                Start send
              </Button>
            )}
            {c?.status === 'SENDING' && (
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
          title="Could not load campaign"
          description={getErrorMessage(detail.error)}
        />
      ) : !c ? (
        <EmptyState title="Not found" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardContent className="space-y-3 py-4">
              <Badge tone={statusTone(c.status || '')}>{c.status}</Badge>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs uppercase text-slate-400">Account</dt>
                  <dd>
                    {c.communicationAccount?.name ||
                      c.communicationAccount?.phoneNumber ||
                      '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-400">Progress</dt>
                  <dd>
                    sent {c.sentCount}/{c.totalCount}
                    <br />
                    delivered {c.deliveredCount} · read {c.readCount}
                    <br />
                    failed {c.failedCount} · skipped {c.skippedCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-400">Timeline</dt>
                  <dd>
                    created {formatDate(c.createdAt)}
                    <br />
                    started {formatDate(c.startedAt)}
                    <br />
                    completed {formatDate(c.completedAt)}
                  </dd>
                </div>
                {c.errorMessage ? (
                  <p className="text-sm text-red-600">{c.errorMessage}</p>
                ) : null}
              </dl>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardContent className="py-4">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">
                Recipients (first 200)
              </h3>
              {(c.recipients || []).length === 0 ? (
                <EmptyState title="No recipients yet — start the campaign" />
              ) : (
                <div className="max-h-[28rem] divide-y divide-slate-100 overflow-y-auto">
                  {(c.recipients || []).map((r) => (
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

function formatAudienceLabel(type?: string) {
  if (type === 'CONTACT_LISTS') return 'Contact lists';
  if (type === 'ALL') return 'All contacts';
  if (type === 'TAGS') return 'Tags';
  if (type === 'MANUAL') return 'Manual';
  return type || '—';
}

function CreateCampaignModal({
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
  const [templateLanguage, setTemplateLanguage] = useState('');
  const [listIds, setListIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ count: number } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const accounts = useQuery({
    queryKey: ['accounts', 'campaign', orgId],
    enabled: open && Boolean(orgId),
    queryFn: async () => {
      const { data } = await api.get<{ data: Account[] }>('/admin/v1/accounts', {
        params: { organizationId: orgId, limit: 100 },
      });
      return (Array.isArray(data.data) ? data.data : []).filter(
        (a) => (a.connectionStatus || '').toUpperCase() === 'CONNECTED',
      );
    },
  });

  const templates = useQuery({
    queryKey: ['templates', 'campaign', orgId, accountId],
    enabled: open && Boolean(orgId) && Boolean(accountId),
    queryFn: async () => {
      const { data } = await api.get<{ data: Template[] }>(
        '/admin/v1/templates',
        {
          params: {
            organizationId: orgId,
            limit: 200,
            communicationAccountId: accountId,
          },
        },
      );
      return (Array.isArray(data.data) ? data.data : []).filter(
        (t) => (t.status || '').toUpperCase() === 'APPROVED',
      );
    },
  });

  const contactLists = useQuery({
    queryKey: ['contact-lists', 'campaign', orgId],
    enabled: open && Boolean(orgId),
    queryFn: async () => {
      const { data } = await api.get<{ data: ContactList[] }>(
        '/admin/v1/contact-lists',
        { params: { organizationId: orgId } },
      );
      return Array.isArray(data.data) ? data.data : [];
    },
  });

  const templateNames = useMemo(() => {
    const names = new Set<string>();
    for (const t of templates.data || []) {
      if (t.name) names.add(t.name);
    }
    return [...names].sort();
  }, [templates.data]);

  const languageOptions = useMemo(() => {
    if (!templateName) return [];
    const langs = (templates.data || [])
      .filter((t) => t.name === templateName && t.language)
      .map((t) => t.language as string);
    return [...new Set(langs)].sort();
  }, [templates.data, templateName]);

  useEffect(() => {
    if (!open) {
      setName('');
      setAccountId('');
      setTemplateName('');
      setTemplateLanguage('');
      setListIds([]);
      setPreview(null);
      setFormError(null);
    }
  }, [open]);

  useEffect(() => {
    setTemplateName('');
    setTemplateLanguage('');
    setPreview(null);
  }, [accountId]);

  useEffect(() => {
    setTemplateLanguage('');
    setPreview(null);
  }, [templateName]);

  useEffect(() => {
    if (
      templateLanguage &&
      !languageOptions.includes(templateLanguage)
    ) {
      setTemplateLanguage('');
    } else if (!templateLanguage && languageOptions.length === 1) {
      setTemplateLanguage(languageOptions[0]);
    }
  }, [languageOptions, templateLanguage]);

  const isValid =
    Boolean(name.trim()) &&
    Boolean(accountId) &&
    Boolean(templateName) &&
    Boolean(templateLanguage) &&
    listIds.length > 0;

  const payload = () => ({
    organizationId: orgId,
    communicationAccountId: accountId,
    name: name.trim(),
    templateName,
    templateLanguage,
    audienceType: 'CONTACT_LISTS' as const,
    audienceFilter: { listIds },
  });

  const runPreview = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ data: { count: number } }>(
        '/admin/v1/campaigns/preview',
        payload(),
      );
      return data.data;
    },
    onSuccess: (data) => {
      setPreview(data);
      setFormError(null);
    },
    onError: (err) => setFormError(getErrorMessage(err)),
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ data: { id: string } }>(
        '/admin/v1/campaigns',
        payload(),
      );
      return data.data;
    },
    onSuccess: (data) => onCreated(data.id),
    onError: (err) => setFormError(getErrorMessage(err)),
  });

  const toggleList = (id: string) => {
    setListIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    setPreview(null);
  };

  return (
    <Modal
      open={open}
      title="New Campaign"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            loading={runPreview.isPending}
            disabled={!isValid}
            onClick={() => runPreview.mutate()}
          >
            Preview audience
          </Button>
          <Button
            loading={create.isPending}
            disabled={!isValid}
            onClick={() => create.mutate()}
          >
            Create campaign
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Campaign name"
          placeholder="e.g. March promo — VIP list"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">
            WhatsApp account
          </span>
          <select
            className={selectClass}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            <option value="">Select account…</option>
            {(accounts.data || []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.phoneNumber}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">
            Message template
          </span>
          <select
            className={selectClass}
            value={templateName}
            disabled={!accountId || (templates.data || []).length === 0}
            onChange={(e) => setTemplateName(e.target.value)}
          >
            <option value="">
              {!accountId
                ? 'Select an account first'
                : (templates.data || []).length === 0
                  ? 'No approved templates'
                  : 'Select template…'}
            </option>
            {templateNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-700">
            Template language
          </span>
          <select
            className={selectClass}
            value={templateLanguage}
            disabled={!templateName || languageOptions.length === 0}
            onChange={(e) => setTemplateLanguage(e.target.value)}
          >
            <option value="">
              {!templateName
                ? 'Select a template first'
                : languageOptions.length === 0
                  ? 'No languages available'
                  : 'Select language…'}
            </option>
            {languageOptions.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </label>

        <div>
          <div className="mb-2 text-sm font-medium text-slate-700">
            Audience — contact lists
          </div>
          {(contactLists.data || []).length === 0 ? (
            <p className="text-sm text-slate-500">
              No contact lists yet.{' '}
              <Link to="/contacts" className="text-zinc-900 underline">
                Create one in Contacts
              </Link>
              .
            </p>
          ) : (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2">
              {(contactLists.data || []).map((list) => {
                const checked = listIds.includes(list.id);
                return (
                  <label
                    key={list.id}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50',
                      checked && 'bg-zinc-50',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleList(list.id)}
                    />
                    <span className="flex-1 font-medium text-slate-800">
                      {list.name}
                    </span>
                    <span className="text-xs text-slate-400">
                      {list._count?.members ?? 0} contacts
                    </span>
                  </label>
                );
              })}
            </div>
          )}
          {listIds.length > 0 ? (
            <p className="mt-1.5 text-xs text-slate-500">
              {listIds.length} list{listIds.length === 1 ? '' : 's'} selected
            </p>
          ) : null}
        </div>

        {preview ? (
          <p className="rounded-md bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
            Audience preview: <strong>{preview.count}</strong> unique recipients
          </p>
        ) : null}

        {formError ? (
          <p className="text-sm text-red-600">{formError}</p>
        ) : null}
        {runPreview.isError && !formError ? (
          <p className="text-sm text-red-600">
            {getErrorMessage(runPreview.error)}
          </p>
        ) : null}
        {create.isError && !formError ? (
          <p className="text-sm text-red-600">{getErrorMessage(create.error)}</p>
        ) : null}
      </div>
    </Modal>
  );
}
