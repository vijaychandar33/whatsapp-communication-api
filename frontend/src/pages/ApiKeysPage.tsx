import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix?: string;
  status?: string;
  scopes?: string[];
  createdAt?: string;
  key?: string;
};

const schema = z.object({
  organizationId: z.string().uuid('Organization ID required'),
  name: z.string().min(2),
  scopes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function ApiKeysPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId || '';
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const list = usePaginatedList<ApiKeyRow>({
    queryKey: ['api-keys', orgId],
    path: '/admin/v1/api-keys',
    page,
    params: { organizationId: orgId },
    enabled: Boolean(orgId),
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      organizationId: orgId,
      name: '',
      scopes: '',
    },
  });

  const create = useMutation({
    mutationFn: async (values: FormValues) => {
      const scopes = values.scopes
        ? values.scopes.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      const { data } = await api.post<{ data: ApiKeyRow }>('/admin/v1/api-keys', {
        organizationId: values.organizationId,
        name: values.name,
        scopes,
      });
      return data.data;
    },
    onSuccess: async (result) => {
      if (result.key) setCreatedKey(result.key);
      form.reset({ organizationId: orgId, name: '', scopes: '' });
      await queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  return (
    <div>
      <PageHeader
        title="API Keys"
        description="Developer keys for the public Communication API."
        actions={<Button onClick={() => setOpen(true)}>Create API key</Button>}
      />

      <Card>
        {!orgId ? (
          <EmptyState
            title="Organization required"
            description="Sign in with a user that has an organization context."
          />
        ) : list.isError ? (
          <EmptyState title="Could not load API keys" description={listErrorMessage(list.error)} />
        ) : list.isLoading ? (
          <EmptyState title="Loading API keys…" />
        ) : !list.data?.items.length ? (
          <EmptyState title="No API keys yet" description="Create a key for integrations." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Prefix</TH>
                <TH>Scopes</TH>
                <TH>Status</TH>
                <TH>Created</TH>
              </TR>
            </THead>
            <TBody>
              {list.data.items.map((row) => (
                <TR key={row.id}>
                  <TD className="font-medium text-slate-900">{row.name}</TD>
                  <TD className="font-mono text-xs">{row.keyPrefix || '—'}</TD>
                  <TD>{row.scopes?.join(', ') || '—'}</TD>
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
        title="Create API key"
        onClose={() => {
          setOpen(false);
          setCreatedKey(null);
        }}
        footer={
          createdKey ? (
            <Button
              onClick={() => {
                setOpen(false);
                setCreatedKey(null);
              }}
            >
              Done
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                loading={create.isPending}
                onClick={form.handleSubmit((values) => create.mutateAsync(values))}
              >
                Create
              </Button>
            </>
          )
        }
      >
        {createdKey ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Store this key securely. It will not be shown again.
            </p>
            <CardContent className="rounded-md border border-teal-200 bg-accent-muted p-3 font-mono text-xs break-all text-teal-900">
              {createdKey}
            </CardContent>
          </div>
        ) : (
          <form className="space-y-4">
            <Input
              label="Organization ID"
              error={form.formState.errors.organizationId?.message}
              {...form.register('organizationId')}
            />
            <Input
              label="Name"
              error={form.formState.errors.name?.message}
              {...form.register('name')}
            />
            <Input
              label="Scopes"
              hint="Comma-separated, e.g. messages:send, contacts:read"
              {...form.register('scopes')}
            />
            {create.isError ? (
              <p className="text-sm text-red-600">{getErrorMessage(create.error)}</p>
            ) : null}
          </form>
        )}
      </Modal>
    </div>
  );
}
