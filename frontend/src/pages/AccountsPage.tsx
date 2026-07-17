import { useState } from 'react';
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
  channel?: string;
  phoneNumber?: string;
  status?: string;
  providerAccountId?: string;
  createdAt?: string;
};

const schema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(2),
  channel: z.string().min(2),
  phoneNumberId: z.string().min(1, 'Phone number ID required'),
  wabaId: z.string().optional(),
  accessToken: z.string().min(10, 'Access token required'),
  appSecret: z.string().optional(),
  verifyToken: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function AccountsPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const list = usePaginatedList<Account>({
    queryKey: ['accounts'],
    path: '/admin/v1/accounts',
    page,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      organizationId: user?.organizationId || '',
      name: '',
      channel: 'whatsapp',
      phoneNumberId: '',
      wabaId: '',
      accessToken: '',
      appSecret: '',
      verifyToken: '',
    },
  });

  const create = useMutation({
    mutationFn: async (values: FormValues) => {
      const { data } = await api.post('/admin/v1/accounts', {
        organizationId: values.organizationId,
        name: values.name,
        channel: values.channel,
        credentials: {
          phoneNumberId: values.phoneNumberId,
          wabaId: values.wabaId || undefined,
          accessToken: values.accessToken,
          appSecret: values.appSecret || undefined,
          verifyToken: values.verifyToken || undefined,
        },
      });
      return data;
    },
    onSuccess: async () => {
      setOpen(false);
      form.reset({
        organizationId: user?.organizationId || '',
        name: '',
        channel: 'whatsapp',
        phoneNumberId: '',
        wabaId: '',
        accessToken: '',
        appSecret: '',
        verifyToken: '',
      });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  return (
    <div>
      <PageHeader
        title="Accounts"
        description="Connected channel accounts (WhatsApp and beyond)."
        actions={<Button onClick={() => setOpen(true)}>Connect account</Button>}
      />

      <Card>
        {list.isError ? (
          <EmptyState
            title="Could not load accounts"
            description={listErrorMessage(list.error)}
          />
        ) : list.isLoading ? (
          <EmptyState title="Loading accounts…" />
        ) : !list.data?.items.length ? (
          <EmptyState
            title="No channel accounts"
            description="Connect WhatsApp credentials to start messaging."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Channel</TH>
                <TH>Phone / ID</TH>
                <TH>Status</TH>
                <TH>Created</TH>
              </TR>
            </THead>
            <TBody>
              {list.data.items.map((row) => (
                <TR key={row.id}>
                  <TD className="font-medium text-slate-900">{row.name || '—'}</TD>
                  <TD className="capitalize">{row.channel || '—'}</TD>
                  <TD className="font-mono text-xs">
                    {row.phoneNumber || row.providerAccountId || '—'}
                  </TD>
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
        open={open}
        title="Connect channel account"
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
          <Input
            label="Organization ID"
            error={form.formState.errors.organizationId?.message}
            {...form.register('organizationId')}
          />
          <Input
            label="Display name"
            error={form.formState.errors.name?.message}
            {...form.register('name')}
          />
          <Input label="Channel" {...form.register('channel')} />
          <Input
            label="Phone number ID"
            error={form.formState.errors.phoneNumberId?.message}
            {...form.register('phoneNumberId')}
          />
          <Input label="WABA ID" {...form.register('wabaId')} />
          <Input
            label="Access token"
            type="password"
            error={form.formState.errors.accessToken?.message}
            {...form.register('accessToken')}
          />
          <Input label="App secret" type="password" {...form.register('appSecret')} />
          <Input label="Webhook verify token" {...form.register('verifyToken')} />
          {create.isError ? (
            <p className="text-sm text-red-600">{getErrorMessage(create.error)}</p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
