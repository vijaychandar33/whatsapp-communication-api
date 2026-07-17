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

type Org = {
  id: string;
  name: string;
  slug: string;
  type?: string;
  status?: string;
  createdAt?: string;
};

const schema = z.object({
  name: z.string().min(2, 'Name is required'),
  slug: z
    .string()
    .min(2, 'Slug is required')
    .regex(/^[a-z0-9-]+$/, 'Lowercase letters, numbers, hyphens only'),
});

type FormValues = z.infer<typeof schema>;

export function OrganizationsPage() {
  const { user } = useAuth();
  const isSystem = user?.organization?.type === 'SYSTEM';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const list = usePaginatedList<Org>({
    queryKey: ['organizations'],
    path: '/admin/v1/organizations',
    page,
    scoped: false,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', slug: '' },
  });

  const create = useMutation({
    mutationFn: async (values: FormValues) => {
      const { data } = await api.post('/admin/v1/organizations', values);
      return data;
    },
    onSuccess: async () => {
      setOpen(false);
      form.reset();
      await queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });

  const items = (list.data?.items || []).filter((org) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return org.name?.toLowerCase().includes(q) || org.slug?.toLowerCase().includes(q);
  });

  return (
    <div>
      <PageHeader
        title="Organizations"
        description="Tenants and workspace accounts on the platform."
        actions={
          isSystem ? (
            <Button onClick={() => setOpen(true)}>Create organization</Button>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="border-b border-slate-100 py-4">
          <Input
            placeholder="Search by name or slug…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </CardContent>

        {list.isError ? (
          <EmptyState title="Could not load organizations" description={listErrorMessage(list.error)} />
        ) : list.isLoading ? (
          <EmptyState title="Loading organizations…" />
        ) : items.length === 0 ? (
          <EmptyState title="No organizations found" description="Create one to get started." />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Slug</TH>
                <TH>Type</TH>
                <TH>Status</TH>
                <TH>Created</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((org) => (
                <TR key={org.id}>
                  <TD className="font-medium text-slate-900">{org.name}</TD>
                  <TD className="font-mono text-xs">{org.slug}</TD>
                  <TD>{org.type || '—'}</TD>
                  <TD>
                    {org.status ? (
                      <Badge tone={statusTone(org.status)}>{org.status}</Badge>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD>{formatDate(org.createdAt)}</TD>
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
        title="Create organization"
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
              Create
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          <Input
            label="Name"
            error={form.formState.errors.name?.message}
            {...form.register('name')}
          />
          <Input
            label="Slug"
            hint="URL-safe identifier"
            error={form.formState.errors.slug?.message}
            {...form.register('slug')}
          />
          {create.isError ? (
            <p className="text-sm text-red-600">{getErrorMessage(create.error)}</p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
