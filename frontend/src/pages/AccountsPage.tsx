import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../lib/api';
import { listErrorMessage, usePaginatedList } from '../hooks/usePaginatedList';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/Table';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge, statusTone } from '../components/ui/Badge';
import { formatDate } from '../lib/utils';

type Account = {
  id: string;
  name?: string;
  channelCode?: string;
  phoneNumber?: string;
  connectionStatus?: string;
  externalAccountId?: string;
  createdAt?: string;
};

const schema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(2),
  channelCode: z.literal('WHATSAPP'),
  phoneNumber: z.string().optional(),
  phoneNumberId: z.string().min(1, 'Phone number ID required'),
  businessAccountId: z.string().optional(),
  accessToken: z.string().min(10, 'Access token required'),
  webhookSecret: z.string().optional(),
  verifyToken: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function AccountsPage() {
  const { user } = useAuth();
  const isSystem = user?.organization?.type === 'SYSTEM';
  const orgId = user?.organizationId || '';
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const list = usePaginatedList<Account>({
    queryKey: ['accounts', orgId],
    path: '/admin/v1/accounts',
    page,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      organizationId: orgId,
      name: '',
      channelCode: 'WHATSAPP',
      phoneNumber: '',
      phoneNumberId: '',
      businessAccountId: '',
      accessToken: '',
      webhookSecret: '',
      verifyToken: '',
    },
  });

  useEffect(() => {
    if (orgId) form.setValue('organizationId', orgId);
  }, [orgId, form]);

  const create = useMutation({
    mutationFn: async (values: FormValues) => {
      const { data: created } = await api.post<{ data: Account }>(
        '/admin/v1/accounts',
        {
          organizationId: values.organizationId,
          name: values.name,
          channelCode: values.channelCode,
          phoneNumber: values.phoneNumber || undefined,
        },
      );

      await api.post(`/admin/v1/accounts/${created.data.id}/connect`, {
        accessToken: values.accessToken,
        phoneNumberId: values.phoneNumberId,
        businessAccountId: values.businessAccountId || undefined,
        verifyToken: values.verifyToken || undefined,
        webhookSecret: values.webhookSecret || undefined,
      });

      return created.data;
    },
    onSuccess: async () => {
      setOpen(false);
      form.reset({
        organizationId: orgId,
        name: '',
        channelCode: 'WHATSAPP',
        phoneNumber: '',
        phoneNumberId: '',
        businessAccountId: '',
        accessToken: '',
        webhookSecret: '',
        verifyToken: '',
      });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const disconnect = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/admin/v1/accounts/${id}/disconnect`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const webhookBase = window.location.origin;

  return (
    <div>
      <PageHeader
        title="WhatsApp"
        description="Connect WhatsApp Cloud API numbers with Meta credentials."
        actions={<Button onClick={() => setOpen(true)}>Connect number</Button>}
      />

      <Card>
        {list.isError ? (
          <EmptyState
            title="Could not load WhatsApp accounts"
            description={listErrorMessage(list.error)}
          />
        ) : list.isLoading ? (
          <EmptyState title="Loading WhatsApp accounts…" />
        ) : !list.data?.items.length ? (
          <EmptyState
            title="No WhatsApp numbers"
            description="Connect a Meta Cloud API phone number to start messaging."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Phone / ID</TH>
                <TH>Status</TH>
                <TH>Created</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {list.data.items.map((row) => (
                <TR key={row.id}>
                  <TD className="font-medium text-slate-900">{row.name || '—'}</TD>
                  <TD className="font-mono text-xs">
                    {row.phoneNumber || row.externalAccountId || '—'}
                  </TD>
                  <TD>
                    {row.connectionStatus ? (
                      <Badge tone={statusTone(row.connectionStatus)}>
                        {row.connectionStatus}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD>{formatDate(row.createdAt)}</TD>
                  <TD>
                    {row.connectionStatus === 'CONNECTED' ? (
                      <Button
                        variant="secondary"
                        loading={disconnect.isPending}
                        onClick={() => disconnect.mutate(row.id)}
                      >
                        Disconnect
                      </Button>
                    ) : null}
                  </TD>
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
        title="Connect WhatsApp account"
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={create.isPending}
              onClick={form.handleSubmit((values) => create.mutateAsync(values))}
            >
              Connect
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          {isSystem ? (
            <Input
              label="Organization ID"
              error={form.formState.errors.organizationId?.message}
              {...form.register('organizationId')}
            />
          ) : (
            <input type="hidden" {...form.register('organizationId')} />
          )}
          <Input
            label="Display name"
            error={form.formState.errors.name?.message}
            {...form.register('name')}
          />
          <Input
            label="Display phone (optional)"
            placeholder="+91…"
            {...form.register('phoneNumber')}
          />
          <Input
            label="Phone number ID"
            error={form.formState.errors.phoneNumberId?.message}
            {...form.register('phoneNumberId')}
          />
          <Input
            label="WABA / Business account ID"
            {...form.register('businessAccountId')}
          />
          <Input
            label="Access token"
            type="password"
            error={form.formState.errors.accessToken?.message}
            {...form.register('accessToken')}
          />
          <Input
            label="Webhook secret (app secret)"
            type="password"
            {...form.register('webhookSecret')}
          />
          <Input label="Webhook verify token" {...form.register('verifyToken')} />
          <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            After connecting, set Meta webhook URL to{' '}
            <span className="font-mono">
              {webhookBase}/api/v1/webhooks/whatsapp/&lt;accountId&gt;
            </span>
          </p>
          {create.isError ? (
            <p className="text-sm text-red-600">{getErrorMessage(create.error)}</p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
