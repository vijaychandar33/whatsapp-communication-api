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
import { Badge, statusTone } from '../components/ui/Badge';
import { formatDate } from '../lib/utils';

type Template = {
  id: string;
  name?: string;
  language?: string;
  category?: string;
  status?: string;
  channelCode?: string;
  body?: string | null;
  createdAt?: string;
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
  const [draft, setDraft] = useState({
    name: '',
    language: 'en',
    category: 'UTILITY',
    body: '',
  });
  const queryClient = useQueryClient();

  const list = usePaginatedList<Template>({
    queryKey: ['templates', orgId],
    path: '/admin/v1/templates',
    page,
  });

  const accounts = useQuery({
    queryKey: ['accounts', 'templates-sync', orgId],
    enabled: Boolean(orgId) && syncOpen,
    queryFn: async () => {
      const { data } = await api.get<{ data: Account[] }>('/admin/v1/accounts', {
        params: { organizationId: orgId, limit: 100 },
      });
      return Array.isArray(data.data) ? data.data : [];
    },
  });

  const sync = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/admin/v1/templates/sync', {
        organizationId: orgId,
        communicationAccountId: accountId,
      });
      return data;
    },
    onSuccess: async () => {
      setSyncOpen(false);
      setAccountId('');
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      await api.post('/admin/v1/templates', {
        organizationId: orgId,
        channelCode: 'WHATSAPP',
        name: draft.name,
        language: draft.language,
        category: draft.category,
        body: draft.body,
        status: 'DRAFT',
      });
    },
    onSuccess: async () => {
      setCreateOpen(false);
      setDraft({ name: '', language: 'en', category: 'UTILITY', body: '' });
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
        description="Message templates synced from Meta WhatsApp."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(true)}>
              Create draft
            </Button>
            <Button onClick={() => setSyncOpen(true)}>Sync from Meta</Button>
          </div>
        }
      />

      <Card>
        <CardContent className="border-b border-slate-100 py-4">
          <Input
            placeholder="Search templates…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </CardContent>

        {list.isError ? (
          <EmptyState title="Could not load templates" description={listErrorMessage(list.error)} />
        ) : list.isLoading ? (
          <EmptyState title="Loading templates…" />
        ) : items.length === 0 ? (
          <EmptyState
            title="No templates found"
            description="Connect a WhatsApp account and sync templates from Meta."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Body</TH>
                <TH>Language</TH>
                <TH>Category</TH>
                <TH>Status</TH>
                <TH>Created</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((row) => (
                <TR key={row.id}>
                  <TD className="font-medium text-slate-900">{row.name || '—'}</TD>
                  <TD className="max-w-xs truncate text-slate-600">
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
                </TR>
              ))}
            </TBody>
          </Table>
        )}

        <Pagination
          page={list.data?.meta.page || page}
          totalPages={list.data?.meta.totalPages || 1}
          total={list.data?.meta.total}
          onChange={setPage}
        />
      </Card>

      <Modal
        open={createOpen}
        title="Create draft template"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={create.isPending}
              disabled={!draft.name.trim() || !draft.body.trim()}
              onClick={() => create.mutate()}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="Name"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
          />
          <Input
            label="Language"
            value={draft.language}
            onChange={(e) =>
              setDraft((d) => ({ ...d, language: e.target.value }))
            }
          />
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">Category</span>
            <select
              className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
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
            <span className="text-sm font-medium text-slate-700">Body</span>
            <textarea
              className="min-h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
              value={draft.body}
              onChange={(e) =>
                setDraft((d) => ({ ...d, body: e.target.value }))
              }
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
          <label className="mb-1 block text-sm font-medium text-slate-700">
            WhatsApp account
          </label>
          <select
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
          {sync.isError ? (
            <p className="text-sm text-red-600">{getErrorMessage(sync.error)}</p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
