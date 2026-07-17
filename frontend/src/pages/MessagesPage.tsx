import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
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
import { cn, fieldControlClass, fieldLabelClass, formatDate, truncate } from '../lib/utils';

type Message = {
  id: string;
  status?: string;
  channelCode?: string;
  messageType?: string;
  direction?: string;
  body?: string | null;
  content?: { body?: string } | string | null;
  createdAt?: string;
  providerMessageId?: string;
  contact?: { displayName?: string; phoneNumber?: string };
};

type Account = {
  id: string;
  name?: string;
  connectionStatus?: string;
  phoneNumber?: string;
};

type Template = {
  id: string;
  name?: string;
  language?: string;
  status?: string;
  body?: string | null;
  category?: string;
};

const sendSchema = z.object({
  communicationAccountId: z.string().uuid('Select an account'),
  to: z.string().min(5, 'Recipient phone required'),
  templateId: z.string().min(1, 'Select an approved template'),
});

type SendValues = z.infer<typeof sendSchema>;

function contentPreview(row: Message): string {
  if (row.body) return truncate(row.body, 60);
  if (!row.content) return '—';
  if (typeof row.content === 'string') return truncate(row.content, 60);
  return truncate(row.content.body, 60);
}

export function MessagesPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId || '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const list = usePaginatedList<Message>({
    queryKey: ['messages', orgId],
    path: '/admin/v1/messages',
    page,
  });

  const accounts = useQuery({
    queryKey: ['accounts', 'send', orgId],
    enabled: Boolean(orgId) && open,
    queryFn: async () => {
      const { data } = await api.get<{ data: Account[] }>('/admin/v1/accounts', {
        params: { organizationId: orgId, limit: 100 },
      });
      return Array.isArray(data.data) ? data.data : [];
    },
  });

  const templates = useQuery({
    queryKey: ['templates', 'send-picker', orgId],
    enabled: Boolean(orgId) && open,
    queryFn: async () => {
      const { data } = await api.get<{ data: Template[] }>('/admin/v1/templates', {
        params: { organizationId: orgId, limit: 100 },
      });
      const rows = Array.isArray(data.data) ? data.data : [];
      return rows.filter((t) => (t.status || '').toUpperCase() === 'APPROVED');
    },
  });

  const form = useForm<SendValues>({
    resolver: zodResolver(sendSchema),
    defaultValues: {
      communicationAccountId: '',
      to: '',
      templateId: '',
    },
  });

  const selectedTemplateId = form.watch('templateId');
  const selectedTemplate = useMemo(
    () => (templates.data || []).find((t) => t.id === selectedTemplateId),
    [templates.data, selectedTemplateId],
  );

  useEffect(() => {
    const first = accounts.data?.find((a) => a.connectionStatus === 'CONNECTED');
    if (first) form.setValue('communicationAccountId', first.id);
  }, [accounts.data, form]);

  const send = useMutation({
    mutationFn: async (values: SendValues) => {
      const template = (templates.data || []).find((t) => t.id === values.templateId);
      if (!template?.name) {
        throw new Error('Selected template not found');
      }
      const { data } = await api.post(
        '/admin/v1/messages',
        {
          communicationAccountId: values.communicationAccountId,
          to: values.to,
          messageType: 'TEMPLATE',
          templateName: template.name,
          templateLanguage: template.language || 'en_US',
          body: template.body || undefined,
        },
        { params: { organizationId: orgId } },
      );
      return data;
    },
    onSuccess: async () => {
      setOpen(false);
      form.reset({ communicationAccountId: '', to: '', templateId: '' });
      await queryClient.invalidateQueries({ queryKey: ['messages'] });
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const items = (list.data?.items || []).filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.id.toLowerCase().includes(q) ||
      m.contact?.phoneNumber?.toLowerCase().includes(q) ||
      m.contact?.displayName?.toLowerCase().includes(q) ||
      m.status?.toLowerCase().includes(q) ||
      m.providerMessageId?.toLowerCase().includes(q) ||
      m.body?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Messages"
        description="WhatsApp outbound and inbound history with delivery status."
        actions={<Button onClick={() => setOpen(true)}>Send message</Button>}
      />

      <Card>
        <CardContent className="border-b border-zinc-100 py-4 dark:border-zinc-800">
          <Input
            placeholder="Search by recipient, status, or id…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </CardContent>

        {list.isError ? (
          <EmptyState title="Could not load messages" description={listErrorMessage(list.error)} />
        ) : list.isLoading ? (
          <EmptyState title="Loading messages…" />
        ) : items.length === 0 ? (
          <EmptyState title="No messages found" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Status</TH>
                <TH>Type</TH>
                <TH>Direction</TH>
                <TH>Contact</TH>
                <TH>Preview</TH>
                <TH>Created</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((row) => (
                <TR key={row.id}>
                  <TD>
                    {row.status ? (
                      <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD>{row.messageType || '—'}</TD>
                  <TD className="capitalize">{row.direction || '—'}</TD>
                  <TD className="font-mono text-xs">
                    {row.contact?.phoneNumber ||
                      row.contact?.displayName ||
                      '—'}
                  </TD>
                  <TD>{contentPreview(row)}</TD>
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
        open={open}
        title="Send WhatsApp template"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={send.isPending}
              disabled={!selectedTemplate}
              onClick={form.handleSubmit((values) => send.mutateAsync(values))}
            >
              Send template
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          <p className="text-xs text-zinc-500">
            Cold contacts (no open 24h session) require an APPROVED Meta template.
            Free-text is only allowed inside an active conversation (use Inbox).
          </p>
          <div>
            <label className={cn(fieldLabelClass, 'mb-1 block')}>Account</label>
            <select
              className={cn(fieldControlClass, 'h-10 px-3')}
              {...form.register('communicationAccountId')}
            >
              <option value="">Select account…</option>
              {(accounts.data || []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.phoneNumber || a.id.slice(0, 8)} ({a.connectionStatus})
                </option>
              ))}
            </select>
            {form.formState.errors.communicationAccountId ? (
              <p className="mt-1 text-xs text-red-600">
                {form.formState.errors.communicationAccountId.message}
              </p>
            ) : null}
          </div>
          <Input
            label="To (E.164)"
            placeholder="+918754519567"
            hint="10-digit Indian mobiles are normalized to +91…"
            error={form.formState.errors.to?.message}
            {...form.register('to')}
          />
          <div>
            <label className={cn(fieldLabelClass, 'mb-1 block')}>
              Message template
            </label>
            <select
              className={cn(fieldControlClass, 'h-10 px-3')}
              {...form.register('templateId')}
            >
              <option value="">Select approved template…</option>
              {(templates.data || []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.language}) · {t.category || '—'}
                </option>
              ))}
            </select>
            {form.formState.errors.templateId ? (
              <p className="mt-1 text-xs text-red-600">
                {form.formState.errors.templateId.message}
              </p>
            ) : null}
            {templates.isSuccess && (templates.data || []).length === 0 ? (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                No APPROVED templates yet. Create/sync one under Templates first.
              </p>
            ) : null}
          </div>
          {selectedTemplate ? (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900">
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                Preview · {selectedTemplate.language}
              </div>
              <div className="whitespace-pre-wrap text-zinc-800 dark:text-zinc-100">
                {selectedTemplate.body || '(no body text)'}
              </div>
            </div>
          ) : null}
          {send.isError ? (
            <p className="text-sm text-red-600">{getErrorMessage(send.error)}</p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
