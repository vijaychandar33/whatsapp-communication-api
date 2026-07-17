import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';

type OrgSettings = {
  timezone?: string;
  defaultChannel?: string;
  webhookUrl?: string;
  notifyEmail?: string;
  rateLimitPerMinute?: number | string;
  [key: string]: unknown;
};

type FormValues = {
  timezone: string;
  defaultChannel: string;
  webhookUrl: string;
  notifyEmail: string;
  rateLimitPerMinute: string;
};

export function SettingsPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const queryClient = useQueryClient();

  const settingsQuery = useQuery({
    queryKey: ['settings', orgId],
    enabled: Boolean(orgId),
    retry: false,
    queryFn: async () => {
      try {
        const { data } = await api.get<{ data: OrgSettings }>(
          `/admin/v1/settings${orgId ? `?organizationId=${orgId}` : ''}`,
        );
        return data.data;
      } catch {
        // Fallback: org detail often embeds settings
        if (!orgId) throw new Error('No organization');
        const { data } = await api.get<{
          data: { settings?: OrgSettings };
        }>(`/admin/v1/organizations/${orgId}`);
        return (data.data.settings || {}) as OrgSettings;
      }
    },
  });

  const form = useForm<FormValues>({
    defaultValues: {
      timezone: 'UTC',
      defaultChannel: 'whatsapp',
      webhookUrl: '',
      notifyEmail: '',
      rateLimitPerMinute: '100',
    },
  });

  useEffect(() => {
    if (!settingsQuery.data) return;
    const s = settingsQuery.data;
    form.reset({
      timezone: String(s.timezone || 'UTC'),
      defaultChannel: String(s.defaultChannel || 'whatsapp'),
      webhookUrl: String(s.webhookUrl || ''),
      notifyEmail: String(s.notifyEmail || ''),
      rateLimitPerMinute: String(s.rateLimitPerMinute ?? 100),
    });
  }, [settingsQuery.data, form]);

  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        organizationId: orgId,
        timezone: values.timezone,
        defaultChannel: values.defaultChannel,
        webhookUrl: values.webhookUrl || undefined,
        notifyEmail: values.notifyEmail || undefined,
        rateLimitPerMinute: Number(values.rateLimitPerMinute) || undefined,
      };

      try {
        const { data } = await api.put('/admin/v1/settings', payload);
        return data;
      } catch {
        const { data } = await api.patch('/admin/v1/settings', payload);
        return data;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Organization defaults and operational preferences."
      />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>Organization settings</CardTitle>
        </CardHeader>
        <CardContent>
          {!orgId ? (
            <EmptyState
              title="No organization context"
              description="Sign in with a user assigned to an organization."
            />
          ) : settingsQuery.isError && !settingsQuery.data ? (
            <EmptyState
              title="Settings unavailable"
              description={getErrorMessage(
                settingsQuery.error,
                'Settings endpoints are not available yet. You can still draft values locally.',
              )}
            />
          ) : (
            <form
              className="space-y-4"
              onSubmit={form.handleSubmit((values) => save.mutateAsync(values))}
            >
              <Input label="Timezone" {...form.register('timezone')} />
              <Input label="Default channel" {...form.register('defaultChannel')} />
              <Input
                label="Outbound webhook URL"
                placeholder="https://example.com/hooks/comm"
                {...form.register('webhookUrl')}
              />
              <Input
                label="Notify email"
                type="email"
                {...form.register('notifyEmail')}
              />
              <Input
                label="Rate limit / minute"
                type="number"
                {...form.register('rateLimitPerMinute')}
              />

              {save.isError ? (
                <p className="text-sm text-red-600">
                  {getErrorMessage(
                    save.error,
                    'Save failed — settings write endpoint may not exist yet.',
                  )}
                </p>
              ) : null}
              {save.isSuccess ? (
                <p className="text-sm text-emerald-700">Settings saved.</p>
              ) : null}

              <div className="flex justify-end">
                <Button type="submit" loading={save.isPending}>
                  Save settings
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
