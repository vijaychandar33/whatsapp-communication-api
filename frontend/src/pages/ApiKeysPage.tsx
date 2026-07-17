import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { useCan } from '../hooks/useCan';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge, statusTone } from '../components/ui/Badge';
import { formatDate } from '../lib/utils';

const API_SCOPES = [
  'messages:send',
  'messages:read',
  'contacts:read',
  'contacts:write',
  'conversations:read',
  'webhooks:manage',
  'broadcasts:send',
] as const;

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix?: string;
  status?: string;
  scopes?: string[];
  lastUsedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  createdAt?: string;
  key?: string;
};

export function ApiKeysPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const { canManageMembers: canManage } = useCan();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([
    'messages:send',
    'messages:read',
  ]);
  const [expiresInDays, setExpiresInDays] = useState('');

  const list = useQuery({
    queryKey: ['api-keys', orgId],
    enabled: Boolean(orgId) && canManage,
    queryFn: async () => {
      const { data } = await api.get<{ data: ApiKeyRow[] }>(
        '/admin/v1/api-keys',
        { params: { organizationId: orgId, limit: 50 } },
      );
      return Array.isArray(data.data) ? data.data : [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ data: ApiKeyRow }>(
        '/admin/v1/api-keys',
        {
          organizationId: orgId,
          name,
          scopes,
          expiresInDays: expiresInDays ? Number(expiresInDays) : undefined,
        },
      );
      return data.data;
    },
    onSuccess: async (result) => {
      if (result.key) setCreatedKey(result.key);
      setName('');
      setExpiresInDays('');
      await queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/v1/api-keys/${id}`, {
        params: { organizationId: orgId },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  if (!orgId) {
    return (
      <div>
        <PageHeader
          title="API Keys"
          description="Developer keys for the public WhatsApp API."
        />
        <EmptyState
          title="Organization required"
          description="Sign in with a user that has an organization context."
        />
      </div>
    );
  }

  if (!canManage) {
    return (
      <div>
        <PageHeader
          title="API Keys"
          description="Developer keys for the public WhatsApp API."
        />
        <EmptyState
          title="Admin only"
          description="API keys require admin role or higher."
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="API Keys"
        description="Developer keys for the public WhatsApp API."
        actions={
          <Button
            onClick={() => {
              setOpen(true);
              setCreatedKey(null);
            }}
          >
            Create key
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {list.isError ? (
            <EmptyState
              title="Could not load API keys"
              description={getErrorMessage(list.error)}
            />
          ) : list.isLoading ? (
            <EmptyState title="Loading API keys…" />
          ) : !(list.data || []).length ? (
            <EmptyState
              title="No API keys yet"
              description="Create a key for integrations."
            />
          ) : (
            (list.data || []).map((k) => (
              <div
                key={k.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
              >
                <div>
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    {k.name}
                  </div>
                  <div className="font-mono text-xs text-slate-500">
                    {k.keyPrefix}… ·{' '}
                    {(k.scopes || []).join(', ') || 'no scopes'}
                  </div>
                  <div className="text-xs text-slate-400">
                    last used {formatDate(k.lastUsedAt || undefined)} · expires{' '}
                    {formatDate(k.expiresAt || undefined)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={statusTone(k.status || '')}>{k.status}</Badge>
                  {k.status === 'ACTIVE' ? (
                    <Button
                      variant="secondary"
                      onClick={() => revoke.mutate(k.id)}
                    >
                      Revoke
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
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
              <Button
                variant="secondary"
                onClick={() => {
                  setOpen(false);
                  setCreatedKey(null);
                }}
              >
                Cancel
              </Button>
              <Button
                loading={create.isPending}
                disabled={!name.trim()}
                onClick={() => create.mutate()}
              >
                Create
              </Button>
            </>
          )
        }
      >
        {createdKey ? (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">
              Copy this key now — it will not be shown again.
            </p>
            <code className="block break-all rounded bg-slate-50 p-2 text-xs dark:bg-slate-800">
              {createdKey}
            </code>
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Expires in days (optional)"
              type="number"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
            />
            <div className="space-y-1">
              <div className="text-sm font-medium">Scopes</div>
              {API_SCOPES.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={scopes.includes(s)}
                    onChange={(e) => {
                      setScopes((prev) =>
                        e.target.checked
                          ? [...prev, s]
                          : prev.filter((x) => x !== s),
                      );
                    }}
                  />
                  {s}
                </label>
              ))}
            </div>
            {create.isError ? (
              <p className="text-sm text-red-600">
                {getErrorMessage(create.error)}
              </p>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  );
}
