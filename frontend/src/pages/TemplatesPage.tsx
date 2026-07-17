import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../lib/api';
import { listErrorMessage, usePaginatedList } from '../hooks/usePaginatedList';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/Table';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState } from '../components/ui/EmptyState';
import { AccountBadge } from '../components/ui/AccountBadge';
import { Badge, statusTone } from '../components/ui/Badge';
import { cn, fieldControlClass, fieldLabelClass, formatDate } from '../lib/utils';

type Template = {
  id: string;
  name?: string;
  language?: string;
  category?: string;
  status?: string;
  channelCode?: string;
  body?: string | null;
  providerTemplateId?: string | null;
  createdAt?: string;
  communicationAccountId?: string | null;
  communicationAccount?: {
    id: string;
    name?: string | null;
    phoneNumber?: string | null;
  } | null;
};

type Account = {
  id: string;
  name?: string;
  connectionStatus?: string;
  phoneNumber?: string;
};

export function TemplatesPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId || '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [syncOpen, setSyncOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [accountId, setAccountId] = useState('');
  const [createAccountId, setCreateAccountId] = useState('');
  const [filterAccountId, setFilterAccountId] = useState('');
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    name: '',
    language: 'en_US',
    category: 'UTILITY',
    body: '',
  });
  const queryClient = useQueryClient();

  const list = usePaginatedList<Template>({
    queryKey: ['templates', orgId, filterAccountId],
    path: '/admin/v1/templates',
    page,
    params: filterAccountId
      ? { communicationAccountId: filterAccountId }
      : {},
  });

  const accounts = useQuery({
    queryKey: ['accounts', 'templates', orgId],
    enabled: Boolean(orgId) && (syncOpen || createOpen || true),
    queryFn: async () => {
      const { data } = await api.get<{ data: Account[] }>('/admin/v1/accounts', {
        params: { organizationId: orgId, limit: 100 },
      });
      return Array.isArray(data.data) ? data.data : [];
    },
  });

  const sync = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{
        data?: { synced?: number };
        message?: string;
      }>('/admin/v1/templates/sync', {
        organizationId: orgId,
        communicationAccountId: accountId,
      });
      return data;
    },
    onSuccess: async (res) => {
      setSyncOpen(false);
      setAccountId('');
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
      const synced = res?.data?.synced ?? 0;
      window.alert(
        synced > 0
          ? `Synced ${synced} template${synced === 1 ? '' : 's'} from Meta.`
          : 'Sync ok — Meta returned 0 templates for this WABA.',
      );
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/admin/v1/templates', {
        organizationId: orgId,
        channelCode: 'WHATSAPP',
        name: draft.name,
        language: draft.language,
        category: draft.category,
        body: draft.body,
        communicationAccountId: createAccountId,
      });
      return data;
    },
    onSuccess: async () => {
      setCreateOpen(false);
      setCreateAccountId('');
      setDraft({ name: '', language: 'en_US', category: 'UTILITY', body: '' });
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  const refresh = useMutation({
    mutationFn: async (row: Template) => {
      setRefreshingId(row.id);
      const { data } = await api.post(`/admin/v1/templates/${row.id}/refresh`, {
        organizationId: orgId,
        communicationAccountId:
          row.communicationAccountId ||
          row.communicationAccount?.id ||
          undefined,
      });
      return data;
    },
    onSettled: () => setRefreshingId(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  const items = (list.data?.items || []).filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.name?.toLowerCase().includes(q) ||
      t.language?.toLowerCase().includes(q) ||
      t.status?.toLowerCase().includes(q) ||
      t.body?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Templates"
        description="Create templates on Meta and track approval status."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(true)}>
              Create template
            </Button>
            <Button onClick={() => setSyncOpen(true)}>Sync from Meta</Button>
          </div>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-3 border-b border-zinc-100 py-4 dark:border-zinc-800 sm:flex-row">
          <Input
            placeholder="Search templates…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <select
            className={cn(fieldControlClass, 'h-10 shrink-0 px-3 sm:w-64')}
            value={filterAccountId}
            onChange={(e) => {
              setFilterAccountId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All WhatsApp accounts</option>
            {(accounts.data || []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name || a.phoneNumber || a.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </CardContent>

        {list.isError ? (
          <EmptyState title="Could not load templates" description={listErrorMessage(list.error)} />
        ) : list.isLoading ? (
          <EmptyState title="Loading templates…" />
        ) : items.length === 0 ? (
          <EmptyState
            title="No templates found"
            description="Create a template (submits to Meta) or sync existing ones."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>WhatsApp account</TH>
                <TH>Body</TH>
                <TH>Language</TH>
                <TH>Category</TH>
                <TH>Status</TH>
                <TH>Created</TH>
                <TH className="w-16" />
              </TR>
            </THead>
            <TBody>
              {items.map((row) => (
                <TR key={row.id}>
                  <TD className="font-medium text-zinc-900 dark:text-zinc-100">
                    {row.name || '—'}
                  </TD>
                  <TD>
                    <AccountBadge account={row.communicationAccount} />
                  </TD>
                  <TD className="max-w-xs truncate text-zinc-600 dark:text-zinc-400">
                    {row.body || '—'}
                  </TD>
                  <TD>{row.language || '—'}</TD>
                  <TD>{row.category || '—'}</TD>
                  <TD>
                    {row.status ? (
                      <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD>{formatDate(row.createdAt)}</TD>
                  <TD>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 px-0"
                      title="Refresh status from Meta"
                      disabled={refreshingId === row.id}
                      onClick={() => refresh.mutate(row)}
                    >
                      {refreshingId === row.id ? '…' : '↻'}
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}

        {refresh.isError ? (
          <p className="px-4 py-2 text-sm text-red-600">
            {getErrorMessage(refresh.error)}
          </p>
        ) : null}

        <Pagination
          page={list.data?.meta.page || page}
          totalPages={list.data?.meta.totalPages || 1}
          total={list.data?.meta.total}
          onChange={setPage}
        />
      </Card>

      <Modal
        open={createOpen}
        title="Create template"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={create.isPending}
              disabled={
                !draft.name.trim() ||
                !draft.body.trim() ||
                !createAccountId
              }
              onClick={() => create.mutate()}
            >
              Submit to Meta
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className={fieldLabelClass}>WhatsApp account</span>
            <select
              className={cn(fieldControlClass, 'h-10 px-3')}
              value={createAccountId}
              onChange={(e) => setCreateAccountId(e.target.value)}
            >
              <option value="">Select account…</option>
              {(accounts.data || []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.phoneNumber || a.id.slice(0, 8)} ({a.connectionStatus})
                </option>
              ))}
            </select>
          </label>
          <Input
            label="Name"
            placeholder="hello_pelican741"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
          <p className="text-xs text-zinc-500">
            Lowercase letters, numbers, underscores. Submitted to Meta for review.
          </p>
          <Input
            label="Language"
            placeholder="en_US"
            value={draft.language}
            onChange={(e) =>
              setDraft((d) => ({ ...d, language: e.target.value }))
            }
          />
          <label className="block space-y-1.5">
            <span className={fieldLabelClass}>Category</span>
            <select
              className={cn(fieldControlClass, 'h-10 px-3')}
              value={draft.category}
              onChange={(e) =>
                setDraft((d) => ({ ...d, category: e.target.value }))
              }
            >
              <option value="UTILITY">UTILITY</option>
              <option value="MARKETING">MARKETING</option>
              <option value="AUTHENTICATION">AUTHENTICATION</option>
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className={fieldLabelClass}>Body</span>
            <textarea
              className={cn(fieldControlClass, 'min-h-24 px-3 py-2')}
              value={draft.body}
              onChange={(e) =>
                setDraft((d) => ({ ...d, body: e.target.value }))
              }
              placeholder="Hello, thanks for contacting Pelican741"
            />
          </label>
          {create.isError ? (
            <p className="text-sm text-red-600">{getErrorMessage(create.error)}</p>
          ) : null}
        </div>
      </Modal>

      <Modal
        open={syncOpen}
        title="Sync templates"
        onClose={() => setSyncOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSyncOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={sync.isPending}
              disabled={!accountId}
              onClick={() => sync.mutate()}
            >
              Sync
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className={fieldLabelClass}>WhatsApp account</span>
            <select
              className={cn(fieldControlClass, 'h-10 px-3')}
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              <option value="">Select account…</option>
              {(accounts.data || []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.phoneNumber || a.id.slice(0, 8)} ({a.connectionStatus})
                </option>
              ))}
            </select>
          </label>
          {sync.isError ? (
            <p className="text-sm text-red-600">{getErrorMessage(sync.error)}</p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
