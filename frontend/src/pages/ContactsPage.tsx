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
import { formatDate } from '../lib/utils';

type Contact = {
  id: string;
  displayName?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  externalId?: string | null;
  createdAt?: string;
};

const schema = z.object({
  organizationId: z.string().uuid(),
  displayName: z.string().optional(),
  phoneNumber: z.string().min(5, 'Phone required'),
  email: z.string().email().optional().or(z.literal('')),
});

type FormValues = z.infer<typeof schema>;

export function ContactsPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const list = usePaginatedList<Contact>({
    queryKey: ['contacts'],
    path: '/admin/v1/contacts',
    page,
    params: search ? { search } : undefined,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      organizationId: user?.organizationId || '',
      displayName: '',
      phoneNumber: '',
      email: '',
    },
  });

  const create = useMutation({
    mutationFn: async (values: FormValues) => {
      const { data } = await api.post('/admin/v1/contacts', {
        ...values,
        email: values.email || undefined,
      });
      return data;
    },
    onSuccess: async () => {
      setOpen(false);
      form.reset({
        organizationId: user?.organizationId || '',
        displayName: '',
        phoneNumber: '',
        email: '',
      });
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  const items = (list.data?.items || []).filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.displayName?.toLowerCase().includes(q) ||
      c.phoneNumber?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="Address book used by messaging flows."
        actions={<Button onClick={() => setOpen(true)}>Create contact</Button>}
      />

      <Card>
        <CardContent className="border-b border-slate-100 py-4">
          <Input
            placeholder="Search contacts…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </CardContent>

        {list.isError ? (
          <EmptyState title="Could not load contacts" description={listErrorMessage(list.error)} />
        ) : list.isLoading ? (
          <EmptyState title="Loading contacts…" />
        ) : items.length === 0 ? (
          <EmptyState title="No contacts found" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Phone</TH>
                <TH>Email</TH>
                <TH>External ID</TH>
                <TH>Created</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((row) => (
                <TR key={row.id}>
                  <TD className="font-medium text-slate-900">
                    {row.displayName || '—'}
                  </TD>
                  <TD className="font-mono text-xs">{row.phoneNumber || '—'}</TD>
                  <TD>{row.email || '—'}</TD>
                  <TD className="font-mono text-xs">{row.externalId || '—'}</TD>
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
        title="Create contact"
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
          <Input label="Display name" {...form.register('displayName')} />
          <Input
            label="Phone number"
            placeholder="+919876543210"
            error={form.formState.errors.phoneNumber?.message}
            {...form.register('phoneNumber')}
          />
          <Input
            label="Email"
            type="email"
            error={form.formState.errors.email?.message}
            {...form.register('email')}
          />
          {create.isError ? (
            <p className="text-sm text-red-600">{getErrorMessage(create.error)}</p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
