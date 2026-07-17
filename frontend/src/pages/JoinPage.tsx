import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { api, getErrorMessage } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { setAuthSession } from '../lib/auth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';

type Peek = {
  id: string;
  email?: string | null;
  role: string;
  label?: string | null;
  expiresAt: string;
  organization?: { id: string; name: string; slug: string } | null;
};

type RedeemResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    email: string;
    organizationId: string;
    organization?: { id: string; name: string; slug: string };
    roles?: string[];
    workspaceRole?: string;
  };
};

const schema = z.object({
  email: z.string().min(3).regex(/^[^\s@]+@[^\s@]+$/),
  password: z.string().min(8),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function JoinPage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, ready, user } = useAuth();
  const [mode, setMode] = useState<'accept' | 'signup'>('signup');

  const peek = useQuery({
    queryKey: ['invite-peek', token],
    enabled: Boolean(token),
    queryFn: async () => {
      const { data } = await api.get<{ data: Peek }>(
        '/admin/v1/invitations/peek',
        { params: { token } },
      );
      return data.data;
    },
    retry: false,
  });

  useEffect(() => {
    if (ready && isAuthenticated) setMode('accept');
  }, [ready, isAuthenticated]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      email: '',
      password: '',
      firstName: '',
      lastName: '',
    },
  });

  useEffect(() => {
    if (peek.data?.email) form.setValue('email', peek.data.email);
  }, [peek.data, form]);

  const redeem = useMutation({
    mutationFn: async (payload?: FormValues) => {
      const { data } = await api.post<{ data: RedeemResponse }>(
        '/admin/v1/invitations/redeem',
        {
          token,
          ...(payload
            ? {
                email: payload.email,
                password: payload.password,
                firstName: payload.firstName || undefined,
                lastName: payload.lastName || undefined,
              }
            : {}),
        },
      );
      return data.data;
    },
    onSuccess: (result) => {
      setAuthSession(result.accessToken, result.refreshToken, result.user);
      navigate('/', { replace: true });
      window.location.reload();
    },
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fafafa] px-4 dark:bg-zinc-950">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-500">
            WhatsApp Admin
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
            Join workspace
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {peek.data?.organization?.name || 'Invitation'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {peek.isLoading ? (
              <EmptyState title="Loading invitation…" />
            ) : peek.isError ? (
              <EmptyState
                title="Invalid invitation"
                description={getErrorMessage(peek.error)}
              />
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  Role: <span className="font-medium">{peek.data?.role}</span>
                  {peek.data?.label ? ` · ${peek.data.label}` : ''}
                </p>

                {isAuthenticated ? (
                  <>
                    <p className="text-sm text-slate-600">
                      Signed in as {user?.email}. Accept to join this workspace
                      (only if you already belong to it).
                    </p>
                    <Button
                      className="w-full"
                      loading={redeem.isPending}
                      onClick={() => redeem.mutate(undefined)}
                    >
                      Accept invite
                    </Button>
                  </>
                ) : mode === 'signup' ? (
                  <form
                    className="space-y-3"
                    onSubmit={form.handleSubmit((v) => redeem.mutate(v))}
                  >
                    <Input
                      label="Email"
                      error={form.formState.errors.email?.message}
                      {...form.register('email')}
                    />
                    <Input
                      label="Password"
                      type="password"
                      error={form.formState.errors.password?.message}
                      {...form.register('password')}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input label="First name" {...form.register('firstName')} />
                      <Input label="Last name" {...form.register('lastName')} />
                    </div>
                    <Button type="submit" className="w-full" loading={redeem.isPending}>
                      Create account & join
                    </Button>
                    <p className="text-center text-sm text-slate-500">
                      Already have an account?{' '}
                      <Link
                        to={`/login?invite=${token}`}
                        className="font-medium text-zinc-950 dark:text-zinc-50 hover:underline"
                      >
                        Sign in
                      </Link>
                    </p>
                  </form>
                ) : null}

                {redeem.isError ? (
                  <p className="text-sm text-red-600">
                    {getErrorMessage(redeem.error)}
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
