import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge, statusTone } from '../components/ui/Badge';
import { formatDate } from '../lib/utils';

export function ProfilePage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pwOpen, setPwOpen] = useState(false);
  const form = useForm({
    defaultValues: {
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      avatarUrl: user?.avatarUrl || '',
    },
  });
  const pwForm = useForm({
    defaultValues: { currentPassword: '', newPassword: '' },
  });

  useEffect(() => {
    form.reset({
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      avatarUrl: user?.avatarUrl || '',
    });
  }, [user, form]);

  const org = useQuery({
    queryKey: ['organization', user?.organizationId],
    enabled: Boolean(user?.organizationId),
    queryFn: async () => {
      const { data } = await api.get<{
        data: {
          id: string;
          name: string;
          slug: string;
          type?: string;
          status?: string;
          createdAt?: string;
        };
      }>(`/admin/v1/organizations/${user!.organizationId}`);
      return data.data;
    },
  });

  const save = useMutation({
    mutationFn: async (values: {
      firstName: string;
      lastName: string;
      avatarUrl: string;
    }) => {
      const { data } = await api.patch('/admin/v1/auth/me', {
        firstName: values.firstName || undefined,
        lastName: values.lastName || undefined,
        avatarUrl: values.avatarUrl || null,
      });
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });

  const changePw = useMutation({
    mutationFn: async (values: {
      currentPassword: string;
      newPassword: string;
    }) => {
      await api.post('/admin/v1/auth/change-password', values);
    },
    onSuccess: () => {
      pwForm.reset();
      setPwOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const sessions = useQuery({
    queryKey: ['sessions'],
    queryFn: async () => {
      const { data } = await api.get<{
        data: Array<{
          id: string;
          createdAt: string;
          expiresAt: string;
          userAgent?: string | null;
          ipAddress?: string | null;
        }>;
      }>('/admin/v1/auth/sessions');
      return data.data;
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/v1/auth/sessions/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const revokeAll = useMutation({
    mutationFn: async () => {
      await api.delete('/admin/v1/auth/sessions');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sessions'] });
    },
  });

  const organization = org.data || user?.organization;

  return (
    <div>
      <PageHeader
        title="Profile"
        description="Your account details and workspace organization."
        actions={
          <Button variant="secondary" onClick={() => setPwOpen(true)}>
            Update password
          </Button>
        }
      />

      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                className="space-y-4"
                onSubmit={form.handleSubmit((v) => save.mutateAsync(v))}
              >
                <Input label="Email" value={user?.email || ''} disabled />
                <Input label="First name" {...form.register('firstName')} />
                <Input label="Last name" {...form.register('lastName')} />
                <Input
                  label="Avatar URL"
                  placeholder="https://…"
                  {...form.register('avatarUrl')}
                />
                {save.isError ? (
                  <p className="text-sm text-red-600">
                    {getErrorMessage(save.error)}
                  </p>
                ) : null}
                {save.isSuccess ? (
                  <p className="text-sm text-zinc-800 dark:text-zinc-200">
                    Profile saved.
                  </p>
                ) : null}
                <Button type="submit" loading={save.isPending}>
                  Save profile
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Organization</CardTitle>
            </CardHeader>
            <CardContent>
              {org.isError ? (
                <EmptyState
                  title="Could not load organization"
                  description={getErrorMessage(org.error)}
                />
              ) : org.isLoading && !organization ? (
                <EmptyState title="Loading organization…" />
              ) : !organization ? (
                <EmptyState title="No organization" />
              ) : (
                <dl className="space-y-4 text-sm">
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Name
                    </dt>
                    <dd className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                      {organization.name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Slug
                    </dt>
                    <dd className="mt-1 font-mono text-zinc-700 dark:text-zinc-300">
                      {organization.slug}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Type
                    </dt>
                    <dd className="mt-1 text-zinc-700 dark:text-zinc-300">
                      {organization.type || '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Status
                    </dt>
                    <dd className="mt-1">
                      {organization.status ? (
                        <Badge tone={statusTone(organization.status)}>
                          {organization.status}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Created
                    </dt>
                    <dd className="mt-1 text-zinc-700 dark:text-zinc-300">
                      {formatDate(organization.createdAt)}
                    </dd>
                  </div>
                </dl>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Active sessions</CardTitle>
            <Button
              variant="secondary"
              loading={revokeAll.isPending}
              onClick={() => revokeAll.mutate()}
            >
              Revoke all
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {(sessions.data || []).length === 0 ? (
              <EmptyState title="No active sessions" />
            ) : (
              (sessions.data || []).map((s) => (
                <div
                  key={s.id}
                  className="flex items-start justify-between gap-3 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"
                >
                  <div>
                    <div className="font-medium text-zinc-800 dark:text-zinc-100">
                      {s.userAgent || 'Unknown device'}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {s.ipAddress || '—'} · created {formatDate(s.createdAt)}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    loading={revoke.isPending}
                    onClick={() => revoke.mutate(s.id)}
                  >
                    Revoke
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Modal
        open={pwOpen}
        title="Update password"
        onClose={() => setPwOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPwOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={changePw.isPending}
              onClick={pwForm.handleSubmit((v) => changePw.mutateAsync(v))}
            >
              Update password
            </Button>
          </>
        }
      >
        <form className="space-y-3">
          <Input
            label="Current password"
            type="password"
            {...pwForm.register('currentPassword', { required: true })}
          />
          <Input
            label="New password"
            type="password"
            {...pwForm.register('newPassword', {
              required: true,
              minLength: 8,
            })}
          />
          {changePw.isError ? (
            <p className="text-sm text-red-600">
              {getErrorMessage(changePw.error)}
            </p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
