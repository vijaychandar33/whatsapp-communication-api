import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';

const LEGACY_REDIRECT: Record<string, string> = {
  profile: '/profile',
  security: '/profile',
  members: '/users',
  api: '/api-keys',
  whatsapp: '/accounts',
};

export function SettingsPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rawTab = params.get('tab');

  useEffect(() => {
    if (!rawTab) return;
    const target = LEGACY_REDIRECT[rawTab];
    if (target) {
      navigate(target, { replace: true });
      return;
    }
    // overview / workspace / appearance → stay on settings (strip tab)
    navigate('/settings', { replace: true });
  }, [rawTab, navigate]);

  if (!orgId) {
    return (
      <div>
        <PageHeader
          title="Settings"
          description="Workspace defaults for this organization."
        />
        <EmptyState
          title="Organization required"
          description="Sign in with a user that has an organization context."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Workspace defaults for this organization."
      />
      <WorkspaceForm orgId={orgId} />
    </div>
  );
}

function WorkspaceForm({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ['settings', orgId],
    queryFn: async () => {
      const { data } = await api.get<{
        data: {
          timezone?: string;
          locale?: string;
          webhookUrl?: string;
          settings?: Record<string, unknown>;
        };
      }>('/admin/v1/settings', { params: { organizationId: orgId } });
      return data.data;
    },
  });

  const form = useForm({
    defaultValues: {
      timezone: 'UTC',
      locale: 'en',
      webhookUrl: '',
      notifyEmail: '',
      rateLimitPerMinute: '100',
    },
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    const s = settingsQuery.data;
    const nested = (s.settings || {}) as Record<string, unknown>;
    form.reset({
      timezone: String(s.timezone || 'UTC'),
      locale: String(s.locale || 'en'),
      webhookUrl: String(s.webhookUrl || ''),
      notifyEmail: String(nested.notifyEmail || ''),
      rateLimitPerMinute: String(nested.rateLimitPerMinute ?? 100),
    });
  }, [settingsQuery.data, form]);

  const save = useMutation({
    mutationFn: async (values: {
      timezone: string;
      locale: string;
      webhookUrl: string;
      notifyEmail: string;
      rateLimitPerMinute: string;
    }) => {
      await api.put('/admin/v1/settings', {
        organizationId: orgId,
        timezone: values.timezone,
        locale: values.locale,
        webhookUrl: values.webhookUrl || undefined,
        settings: {
          ...(settingsQuery.data?.settings &&
          typeof settingsQuery.data.settings === 'object'
            ? settingsQuery.data.settings
            : {}),
          defaultChannel: 'WHATSAPP',
          notifyEmail: values.notifyEmail || undefined,
          rateLimitPerMinute: Number(values.rateLimitPerMinute) || undefined,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  if (settingsQuery.isLoading) {
    return <EmptyState title="Loading settings…" />;
  }

  if (settingsQuery.isError) {
    return (
      <EmptyState
        title="Could not load settings"
        description={getErrorMessage(settingsQuery.error)}
      />
    );
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Workspace defaults</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={form.handleSubmit((v) => save.mutateAsync(v))}
        >
          <Input label="Timezone" {...form.register('timezone')} />
          <Input label="Locale" {...form.register('locale')} />
          <Input label="Webhook URL" {...form.register('webhookUrl')} />
          <Input label="Notify email" {...form.register('notifyEmail')} />
          <Input
            label="Rate limit / minute"
            type="number"
            {...form.register('rateLimitPerMinute')}
          />
          {save.isError ? (
            <p className="text-sm text-red-600">{getErrorMessage(save.error)}</p>
          ) : null}
          {save.isSuccess ? (
            <p className="text-sm text-zinc-800 dark:text-zinc-200">
              Settings saved.
            </p>
          ) : null}
          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
