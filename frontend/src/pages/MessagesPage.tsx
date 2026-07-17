import { useEffect, useState } from 'react';
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
import { formatDate, truncate } from '../lib/utils';

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

const sendSchema = z.object({
  communicationAccountId: z.string().uuid('Select an account'),
  to: z.string().min(5, 'Recipient phone required'),
  body: z.string().min(1, 'Message body required'),
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

  const form = useForm<SendValues>({
    resolver: zodResolver(sendSchema),
    defaultValues: {
      communicationAccountId: '',
      to: '',
      body: '',
    },
  });

  useEffect(() => {
    const first = accounts.data?.find((a) => a.connectionStatus === 'CONNECTED');
    if (first) form.setValue('communicationAccountId', first.id);
  }, [accounts.data, form]);

  const send = useMutation({
    mutationFn: async (values: SendValues) => {
      const { data } = await api.post(
        '/admin/v1/messages',
        {
          communicationAccountId: values.communicationAccountId,
          to: values.to,
          body: values.body,
          messageType: 'TEXT',
        },
        { params: { organizationId: orgId } },
      );
      return data;
    },
    onSuccess: async () => {
      setOpen(false);
      form.reset({ communicationAccountId: '', to: '', body: '' });
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
        <CardContent className="border-b border-slate-100 py-4">
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
        title="Send WhatsApp message"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={send.isPending}
              onClick={form.handleSubmit((values) => send.mutateAsync(values))}
            >
              Send
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Account
            </label>
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
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
            placeholder="+919876543210"
            error={form.formState.errors.to?.message}
            {...form.register('to')}
          />
          <Input
            label="Message"
            error={form.formState.errors.body?.message}
            {...form.register('body')}
          />
          {send.isError ? (
            <p className="text-sm text-red-600">{getErrorMessage(send.error)}</p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
