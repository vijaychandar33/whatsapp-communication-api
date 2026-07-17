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

type UserRow = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  status?: string;
  organizationId?: string;
  createdAt?: string;
  roles?: Array<{ role?: { name?: string } } | string>;
};

const schema = z.object({
  organizationId: z.string().uuid('Organization ID required'),
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function roleNames(roles?: UserRow['roles']): string {
  if (!roles?.length) return '—';
  return roles
    .map((r) => (typeof r === 'string' ? r : r.role?.name))
    .filter(Boolean)
    .join(', ') || '—';
}

export function UsersPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const list = usePaginatedList<UserRow>({
    queryKey: ['users'],
    path: '/admin/v1/users',
    page,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      organizationId: user?.organizationId || '',
      email: '',
      password: '',
      firstName: '',
      lastName: '',
    },
  });

  const create = useMutation({
    mutationFn: async (values: FormValues) => {
      const { data } = await api.post('/admin/v1/users', values);
      return data;
    },
    onSuccess: async () => {
      setOpen(false);
      form.reset({
        organizationId: user?.organizationId || '',
        email: '',
        password: '',
        firstName: '',
        lastName: '',
      });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const items = (list.data?.items || []).filter((row) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      row.email?.toLowerCase().includes(q) ||
      row.firstName?.toLowerCase().includes(q) ||
      row.lastName?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Users"
        description="Operators and members with dashboard access."
        actions={<Button onClick={() => setOpen(true)}>Create user</Button>}
      />

      <Card>
        <CardContent className="border-b border-slate-100 py-4">
          <Input
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </CardContent>

        {list.isError ? (
          <EmptyState title="Could not load users" description={listErrorMessage(list.error)} />
        ) : list.isLoading ? (
          <EmptyState title="Loading users…" />
        ) : items.length === 0 ? (
          <EmptyState title="No users found" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Email</TH>
                <TH>Name</TH>
                <TH>Roles</TH>
                <TH>Status</TH>
                <TH>Created</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((row) => (
                <TR key={row.id}>
                  <TD className="font-medium text-slate-900">{row.email}</TD>
                  <TD>
                    {[row.firstName, row.lastName].filter(Boolean).join(' ') || '—'}
                  </TD>
                  <TD>{roleNames(row.roles)}</TD>
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
        title="Create user"
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
            label="Organization ID"
            error={form.formState.errors.organizationId?.message}
            {...form.register('organizationId')}
          />
          <Input
            label="Email"
            type="email"
            error={form.formState.errors.email?.message}
            {...form.register('email')}
          />
          <Input
            label="Password"
            type="password"
            error={form.formState.errors.password?.message}
            {...form.register('password')}
          />
          <div className="grid grid-cols-2 gap-3">
            <Input label="First name" {...form.register('firstName')} />
            <Input label="Last name" {...form.register('lastName')} />
          </div>
          {create.isError ? (
            <p className="text-sm text-red-600">{getErrorMessage(create.error)}</p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
