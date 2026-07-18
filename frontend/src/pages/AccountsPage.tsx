import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
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
  channelCode?: string;
  phoneNumber?: string | null;
  connectionStatus?: string;
  externalAccountId?: string | null;
  webhookVerifyToken?: string | null;
  accessToken?: string | null;
  webhookSecret?: string | null;
  metadata?: {
    phoneNumberId?: string;
    businessAccountId?: string;
    [key: string]: unknown;
  } | null;
  createdAt?: string;
};

const createSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(2),
  channelCode: z.literal('WHATSAPP'),
  phoneNumber: z.string().optional(),
  phoneNumberId: z.string().min(1, 'Phone number ID required'),
  businessAccountId: z.string().optional(),
  accessToken: z.string().min(10, 'Access token required'),
  webhookSecret: z.string().optional(),
  verifyToken: z.string().optional(),
});

const editSchema = z.object({
  name: z.string().min(2),
  phoneNumber: z.string().optional(),
  phoneNumberId: z.string().min(1, 'Phone number ID required'),
  businessAccountId: z.string().optional(),
  accessToken: z.string().optional(),
  webhookSecret: z.string().optional(),
  verifyToken: z.string().optional(),
});

type CreateValues = z.infer<typeof createSchema>;
type EditValues = z.infer<typeof editSchema>;

const emptyCreate = (orgId: string): CreateValues => ({
  organizationId: orgId,
  name: '',
  channelCode: 'WHATSAPP',
  phoneNumber: '',
  phoneNumberId: '',
  businessAccountId: '',
  accessToken: '',
  webhookSecret: '',
  verifyToken: '',
});

function WebhookUrlBox({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="rounded-md border border-zinc-200 bg-slate-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/80">
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
        Webhook / callback URL
      </div>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
          {url}
        </code>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0"
          onClick={() => void copy()}
        >
          {copied ? (
            <>
              <Check className="mr-1 h-3.5 w-3.5" />
              Copied
            </>
          ) : (
            <>
              <Copy className="mr-1 h-3.5 w-3.5" />
              Copy
            </>
          )}
        </Button>
      </div>
      <p className="mt-2 text-xs text-zinc-500">
        Paste this URL in Meta → WhatsApp → Configuration → Webhook.
      </p>
    </div>
  );
}

export function AccountsPage() {
  const { user } = useAuth();
  const isSystem = user?.organization?.type === 'SYSTEM';
  const orgId = user?.organizationId || '';
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [openingCreate, setOpeningCreate] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const list = usePaginatedList<Account>({
    queryKey: ['accounts', orgId],
    path: '/admin/v1/accounts',
    page,
  });

  const createForm = useForm<CreateValues>({
    resolver: zodResolver(createSchema),
    defaultValues: emptyCreate(orgId),
  });

  const editForm = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: '',
      phoneNumber: '',
      phoneNumberId: '',
      businessAccountId: '',
      accessToken: '',
      webhookSecret: '',
      verifyToken: '',
    },
  });

  useEffect(() => {
    if (orgId) createForm.setValue('organizationId', orgId);
  }, [orgId, createForm]);

  useEffect(() => {
    if (!editing) return;
    const meta = editing.metadata || {};
    editForm.reset({
      name: editing.name || '',
      phoneNumber: editing.phoneNumber || '',
      phoneNumberId:
        (typeof meta.phoneNumberId === 'string' && meta.phoneNumberId) ||
        editing.externalAccountId ||
        '',
      businessAccountId:
        (typeof meta.businessAccountId === 'string' && meta.businessAccountId) ||
        '',
      accessToken: editing.accessToken || '',
      webhookSecret: editing.webhookSecret || '',
      verifyToken: editing.webhookVerifyToken || '',
    });
  }, [editing, editForm]);

  const webhookBase = window.location.origin;

  const openCreate = async () => {
    if (!orgId && !isSystem) return;
    setOpeningCreate(true);
    try {
      const organizationId =
        createForm.getValues('organizationId') || orgId;
      const { data } = await api.post<{ data: Account }>(
        '/admin/v1/accounts',
        {
          organizationId,
          name: 'New WhatsApp number',
          channelCode: 'WHATSAPP',
        },
      );
      setDraftId(data.data.id);
      createForm.reset({
        ...emptyCreate(organizationId),
        name: '',
      });
      setCreateOpen(true);
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
    } catch {
      // surface via toast-less alert on next open attempt — keep silent; button will retry
    } finally {
      setOpeningCreate(false);
    }
  };

  const closeCreate = async (discardDraft: boolean) => {
    const id = draftId;
    setCreateOpen(false);
    setDraftId(null);
    createForm.reset(emptyCreate(orgId));
    if (discardDraft && id) {
      try {
        await api.delete(`/admin/v1/accounts/${id}`);
        await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      } catch {
        // ignore
      }
    }
  };

  const create = useMutation({
    mutationFn: async (values: CreateValues) => {
      if (!draftId) throw new Error('Account draft missing');

      await api.put(`/admin/v1/accounts/${draftId}`, {
        name: values.name,
        phoneNumber: values.phoneNumber || undefined,
        externalAccountId: values.phoneNumberId,
        webhookVerifyToken: values.verifyToken || undefined,
        metadata: {
          phoneNumberId: values.phoneNumberId,
          businessAccountId: values.businessAccountId || undefined,
        },
      });

      await api.post(`/admin/v1/accounts/${draftId}/connect`, {
        accessToken: values.accessToken,
        phoneNumberId: values.phoneNumberId,
        businessAccountId: values.businessAccountId || undefined,
        verifyToken: values.verifyToken || undefined,
        webhookSecret: values.webhookSecret || undefined,
      });

      return draftId;
    },
    onSuccess: async () => {
      setCreateOpen(false);
      setDraftId(null);
      createForm.reset(emptyCreate(orgId));
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const update = useMutation({
    mutationFn: async (values: EditValues) => {
      if (!editing) throw new Error('No account selected');

      await api.put(`/admin/v1/accounts/${editing.id}`, {
        name: values.name,
        phoneNumber: values.phoneNumber || undefined,
        externalAccountId: values.phoneNumberId,
        webhookVerifyToken: values.verifyToken || undefined,
        metadata: {
          ...(editing.metadata || {}),
          phoneNumberId: values.phoneNumberId,
          businessAccountId: values.businessAccountId || undefined,
        },
      });

      const connectBody: Record<string, string> = {
        phoneNumberId: values.phoneNumberId,
      };
      if (values.businessAccountId)
        connectBody.businessAccountId = values.businessAccountId;
      if (values.verifyToken) connectBody.verifyToken = values.verifyToken;
      if (values.accessToken?.trim())
        connectBody.accessToken = values.accessToken.trim();
      if (values.webhookSecret?.trim())
        connectBody.webhookSecret = values.webhookSecret.trim();

      await api.post(`/admin/v1/accounts/${editing.id}/connect`, connectBody);
    },
    onSuccess: async () => {
      setEditing(null);
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  const openEdit = async (row: Account) => {
    try {
      const { data } = await api.get<{ data: Account }>(
        `/admin/v1/accounts/${row.id}`,
      );
      setEditing(data.data);
    } catch {
      setEditing(row);
    }
  };

  const disconnect = useMutation({
    mutationFn: async (id: string) => {
      setDisconnectingId(id);
      await api.post(`/admin/v1/accounts/${id}/disconnect`);
    },
    onSettled: () => setDisconnectingId(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });

  return (
    <div>
      <PageHeader
        title="WhatsApp"
        description="Connect WhatsApp Cloud API numbers with Meta credentials."
        actions={
          <Button loading={openingCreate} onClick={() => void openCreate()}>
            Connect number
          </Button>
        }
      />

      <Card>
        {list.isError ? (
          <EmptyState
            title="Could not load WhatsApp accounts"
            description={listErrorMessage(list.error)}
          />
        ) : list.isLoading ? (
          <EmptyState title="Loading WhatsApp accounts…" />
        ) : !list.data?.items.length ? (
          <EmptyState
            title="No WhatsApp numbers"
            description="Connect a Meta Cloud API phone number to start messaging."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Phone / ID</TH>
                <TH>Status</TH>
                <TH>Created</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {list.data.items.map((row) => (
                <TR key={row.id}>
                  <TD className="font-medium text-slate-900">
                    {row.name || '—'}
                  </TD>
                  <TD className="font-mono text-xs">
                    {row.phoneNumber || row.externalAccountId || '—'}
                  </TD>
                  <TD>
                    {row.connectionStatus ? (
                      <Badge tone={statusTone(row.connectionStatus)}>
                        {row.connectionStatus}
                      </Badge>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD>{formatDate(row.createdAt)}</TD>
                  <TD>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => void openEdit(row)}
                      >
                        Edit
                      </Button>
                      {row.connectionStatus === 'CONNECTED' ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          loading={disconnectingId === row.id}
                          onClick={() => disconnect.mutate(row.id)}
                        >
                          Disconnect
                        </Button>
                      ) : null}
                    </div>
                  </TD>
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
        open={createOpen}
        title="Connect WhatsApp account"
        onClose={() => void closeCreate(true)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => void closeCreate(true)}
            >
              Cancel
            </Button>
            <Button
              loading={create.isPending}
              onClick={createForm.handleSubmit((values) =>
                create.mutateAsync(values),
              )}
            >
              Connect
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          {draftId ? (
            <WebhookUrlBox
              url={`${webhookBase}/api/v1/webhooks/whatsapp/${draftId}`}
            />
          ) : null}
          {isSystem ? (
            <Input
              label="Organization ID"
              error={createForm.formState.errors.organizationId?.message}
              {...createForm.register('organizationId')}
            />
          ) : (
            <input type="hidden" {...createForm.register('organizationId')} />
          )}
          <Input
            label="Display name"
            error={createForm.formState.errors.name?.message}
            {...createForm.register('name')}
          />
          <Input
            label="Display phone (optional)"
            placeholder="+91…"
            {...createForm.register('phoneNumber')}
          />
          <Input
            label="Phone number ID"
            error={createForm.formState.errors.phoneNumberId?.message}
            {...createForm.register('phoneNumberId')}
          />
          <Input
            label="WABA / Business account ID"
            {...createForm.register('businessAccountId')}
          />
          <Input
            label="Access token"
            type="password"
            error={createForm.formState.errors.accessToken?.message}
            {...createForm.register('accessToken')}
          />
          <Input
            label="Webhook secret (app secret)"
            type="password"
            {...createForm.register('webhookSecret')}
          />
          <Input
            label="Webhook verify token"
            {...createForm.register('verifyToken', {
              onBlur: (e) => {
                const token = e.target.value?.trim();
                if (!draftId || !token) return;
                void api.put(`/admin/v1/accounts/${draftId}`, {
                  webhookVerifyToken: token,
                });
              },
            })}
          />
          {create.isError ? (
            <p className="text-sm text-red-600">
              {getErrorMessage(create.error)}
            </p>
          ) : null}
        </form>
      </Modal>

      <Modal
        open={Boolean(editing)}
        title="Edit WhatsApp account"
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              loading={update.isPending}
              onClick={editForm.handleSubmit((values) =>
                update.mutateAsync(values),
              )}
            >
              Save changes
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          {editing ? (
            <WebhookUrlBox
              url={`${webhookBase}/api/v1/webhooks/whatsapp/${editing.id}`}
            />
          ) : null}
          <Input
            label="Display name"
            error={editForm.formState.errors.name?.message}
            {...editForm.register('name')}
          />
          <Input
            label="Display phone (optional)"
            placeholder="+91…"
            {...editForm.register('phoneNumber')}
          />
          <Input
            label="Phone number ID"
            error={editForm.formState.errors.phoneNumberId?.message}
            {...editForm.register('phoneNumberId')}
          />
          <Input
            label="WABA / Business account ID"
            {...editForm.register('businessAccountId')}
          />
          <Input
            label="Access token"
            type="password"
            placeholder={
              editing?.connectionStatus === 'CONNECTED'
                ? undefined
                : 'Required to reconnect'
            }
            error={editForm.formState.errors.accessToken?.message}
            {...editForm.register('accessToken')}
          />
          <Input
            label="Webhook secret (app secret)"
            type="password"
            {...editForm.register('webhookSecret')}
          />
          <Input
            label="Webhook verify token"
            {...editForm.register('verifyToken')}
          />
          {editing?.connectionStatus !== 'CONNECTED' ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              This account is disconnected. Provide an access token to reconnect.
            </p>
          ) : null}
          {update.isError ? (
            <p className="text-sm text-red-600">
              {getErrorMessage(update.error)}
            </p>
          ) : null}
        </form>
      </Modal>
    </div>
  );
}
