import { useState, type ReactNode } from 'react';
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
import { Toast, type ToastState } from '../components/ui/Toast';
import { cn, fieldControlClass, fieldLabelClass, formatDate } from '../lib/utils';
import { openMetaMessageTemplates } from '../lib/meta-templates';

type TemplateComponent = {
  type?: string;
  format?: string;
  text?: string;
  buttons?: Array<{
    type?: string;
    text?: string;
    url?: string;
    phone_number?: string;
  }>;
};

type Template = {
  id: string;
  name?: string;
  language?: string;
  category?: string;
  status?: string;
  channelCode?: string;
  body?: string | null;
  components?: TemplateComponent[] | null;
  providerTemplateId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  communicationAccountId?: string | null;
  communicationAccount?: {
    id: string;
    name?: string | null;
    phoneNumber?: string | null;
    connectionStatus?: string;
  } | null;
};

function parseTemplateComponents(components?: TemplateComponent[] | null) {
  const list = Array.isArray(components) ? components : [];
  const header = list.find((c) => c.type === 'HEADER');
  const footer = list.find((c) => c.type === 'FOOTER');
  const buttons =
    list.find((c) => c.type === 'BUTTONS')?.buttons?.filter(Boolean) ?? [];
  return { header, footer, buttons };
}

function extractBodyVariables(body?: string | null): string[] {
  if (!body) return [];
  const matches = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]);
  return [...new Set(matches)].sort((a, b) => Number(a) - Number(b));
}

function DetailField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-zinc-900 dark:text-zinc-100">{children}</dd>
    </div>
  );
}

function TemplateDetailModal({
  template,
  onClose,
  onRefresh,
  onDelete,
  refreshing,
  deleting,
}: {
  template: Template;
  onClose: () => void;
  onRefresh: () => void;
  onDelete: () => void;
  refreshing: boolean;
  deleting: boolean;
}) {
  const { header, footer, buttons } = parseTemplateComponents(template.components);
  const variables = extractBodyVariables(template.body);

  return (
    <Modal
      open
      title={template.name || 'Template'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="secondary"
            loading={refreshing}
            onClick={onRefresh}
          >
            Refresh from Meta
          </Button>
          <Button
            variant="secondary"
            className="text-red-600 hover:text-red-700"
            loading={deleting}
            onClick={onDelete}
          >
            Delete
          </Button>
        </>
      }
    >
      <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
        <div className="flex flex-wrap items-center gap-2">
          {template.status ? (
            <Badge tone={statusTone(template.status)}>{template.status}</Badge>
          ) : null}
          {template.category ? (
            <Badge tone="neutral">{template.category}</Badge>
          ) : null}
          {template.channelCode ? (
            <Badge tone="neutral">{template.channelCode}</Badge>
          ) : null}
        </div>

        <dl className="grid gap-4 sm:grid-cols-2">
          <DetailField label="Language">{template.language || '—'}</DetailField>
          <DetailField label="WhatsApp account">
            <AccountBadge account={template.communicationAccount} />
          </DetailField>
          <DetailField label="Meta template ID" className="sm:col-span-2">
            <span className="break-all font-mono text-xs">
              {template.providerTemplateId || '—'}
            </span>
          </DetailField>
          <DetailField label="Created">
            {formatDate(template.createdAt)}
          </DetailField>
          <DetailField label="Last updated">
            {formatDate(template.updatedAt)}
          </DetailField>
          <DetailField label="Internal ID" className="sm:col-span-2">
            <span className="break-all font-mono text-xs">{template.id}</span>
          </DetailField>
        </dl>

        {variables.length > 0 ? (
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Variables
            </h4>
            <div className="flex flex-wrap gap-2">
              {variables.map((v) => (
                <code
                  key={v}
                  className="rounded bg-zinc-100 px-2 py-1 text-xs dark:bg-zinc-800"
                >
                  {`{{${v}}}`}
                </code>
              ))}
            </div>
          </section>
        ) : null}

        {header ? (
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Header
            </h4>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {header.format || 'TEXT'}
              {header.text ? ` · ${header.text}` : ''}
            </p>
          </section>
        ) : null}

        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Body
          </h4>
          <pre className="whitespace-pre-wrap rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            {template.body || '—'}
          </pre>
        </section>

        {footer?.text ? (
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Footer
            </h4>
            <p className="text-sm text-zinc-700 dark:text-zinc-300">{footer.text}</p>
          </section>
        ) : null}

        {buttons.length > 0 ? (
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Buttons
            </h4>
            <ul className="space-y-2">
              {buttons.map((button, index) => (
                <li
                  key={`${button.type}-${button.text}-${index}`}
                  className="rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                >
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">
                    {button.text || '—'}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {button.type || 'BUTTON'}
                    {button.url ? ` · ${button.url}` : ''}
                    {button.phone_number ? ` · ${button.phone_number}` : ''}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Modal>
  );
}

type Account = {
  id: string;
  name?: string;
  connectionStatus?: string;
  phoneNumber?: string;
  metadata?: {
    businessAccountId?: string;
    [key: string]: unknown;
  } | null;
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
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
    enabled: Boolean(orgId),
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
      const account = (accounts.data || []).find((a) => a.id === accountId);
      const accountLabel =
        account?.name || account?.phoneNumber || 'WhatsApp account';
      setSyncOpen(false);
      setAccountId('');
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
      const synced = res?.data?.synced ?? 0;
      setToast({
        tone: synced > 0 ? 'success' : 'info',
        title:
          synced > 0
            ? `Synced ${synced} approved template${synced === 1 ? '' : 's'}`
            : 'No approved templates on Meta',
        description:
          synced > 0
            ? `Pulled approved templates from ${accountLabel}. Previously removed templates are restored.`
            : `${accountLabel} has no approved message templates in Meta yet.`,
      });
    },
    onError: (err) => {
      setToast({
        tone: 'danger',
        title: 'Sync failed',
        description: getErrorMessage(err),
      });
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
    onSuccess: async (data) => {
      const updated = (data as { data?: Template } | undefined)?.data;
      if (updated?.id) {
        setSelectedTemplate((current) =>
          current?.id === updated.id ? { ...current, ...updated } : current,
        );
      }
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
  });

  const remove = useMutation({
    mutationFn: async (row: Template) => {
      setDeletingId(row.id);
      await api.delete(`/admin/v1/templates/${row.id}`, {
        params: { organizationId: orgId },
      });
    },
    onSettled: () => setDeletingId(null),
    onSuccess: async (_data, row) => {
      if (selectedTemplate?.id === row.id) {
        setSelectedTemplate(null);
      }
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
      setToast({
        tone: 'success',
        title: 'Template removed',
        description:
          'Removed from this system only. Sync from Meta to restore it.',
      });
    },
    onError: (err) => {
      setToast({
        tone: 'danger',
        title: 'Delete failed',
        description: getErrorMessage(err),
      });
    },
  });

  const handleDelete = (row: Template) => {
    const label = row.name || 'this template';
    if (
      !window.confirm(
        `Remove "${label}" from this system? It will stay in Meta and can be restored via Sync from Meta.`,
      )
    ) {
      return;
    }
    remove.mutate(row);
  };

  const handleCreateInMeta = () => {
    const connected = (accounts.data || []).filter(
      (a) => a.connectionStatus === 'CONNECTED',
    );
    if (connected.length === 1) {
      const wabaId = connected[0].metadata?.businessAccountId;
      openMetaMessageTemplates(wabaId);
      return;
    }
    if (connected.length > 1) {
      setCreateOpen(true);
      return;
    }
    openMetaMessageTemplates();
  };

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
      <Toast
        open={Boolean(toast)}
        title={toast?.title || ''}
        description={toast?.description}
        tone={toast?.tone || 'success'}
        onClose={() => setToast(null)}
      />
      <PageHeader
        title="Templates"
        description="Sync approved templates from Meta and manage them here."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleCreateInMeta}>
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
            description="Create templates in Meta or sync approved ones from Meta."
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
                <TH className="w-28" />
              </TR>
            </THead>
            <TBody>
              {items.map((row) => (
                <TR
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => setSelectedTemplate(row)}
                >
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
                  <TD onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
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
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 px-2 text-red-600 hover:text-red-700"
                        title="Remove from system (keeps template in Meta)"
                        disabled={deletingId === row.id}
                        onClick={() => handleDelete(row)}
                      >
                        {deletingId === row.id ? '…' : 'Delete'}
                      </Button>
                    </div>
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

      {selectedTemplate ? (
        <TemplateDetailModal
          template={selectedTemplate}
          onClose={() => setSelectedTemplate(null)}
          onRefresh={() => refresh.mutate(selectedTemplate)}
          onDelete={() => handleDelete(selectedTemplate)}
          refreshing={refreshingId === selectedTemplate.id}
          deleting={deletingId === selectedTemplate.id}
        />
      ) : null}

      <Modal
        open={createOpen}
        title="Create template in Meta"
        onClose={() => {
          setCreateOpen(false);
          setCreateAccountId('');
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setCreateOpen(false);
                setCreateAccountId('');
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!createAccountId}
              onClick={() => {
                const account = (accounts.data || []).find(
                  (a) => a.id === createAccountId,
                );
                openMetaMessageTemplates(account?.metadata?.businessAccountId);
                setCreateOpen(false);
                setCreateAccountId('');
              }}
            >
              Open Meta
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Templates are created and managed in Meta. Choose which WhatsApp
            Business account to open.
          </p>
          <label className="block space-y-1.5">
            <span className={fieldLabelClass}>WhatsApp account</span>
            <select
              className={cn(fieldControlClass, 'h-10 px-3')}
              value={createAccountId}
              onChange={(e) => setCreateAccountId(e.target.value)}
            >
              <option value="">Select account…</option>
              {(accounts.data || [])
                .filter((a) => a.connectionStatus === 'CONNECTED')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.phoneNumber || a.id.slice(0, 8)}
                  </option>
                ))}
            </select>
          </label>
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
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Fetches all approved templates from Meta for the selected account.
            Templates previously removed here will be restored.
          </p>
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
