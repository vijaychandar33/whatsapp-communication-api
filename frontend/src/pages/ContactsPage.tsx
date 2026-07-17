import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../lib/api';
import { listErrorMessage, usePaginatedList } from '../hooks/usePaginatedList';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { AccountBadge } from '../components/ui/AccountBadge';
import { cn, formatDate } from '../lib/utils';

type Tag = { id: string; name: string; color?: string };

type Contact = {
  id: string;
  displayName?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  company?: string | null;
  externalId?: string | null;
  createdAt?: string;
  tags?: Tag[];
  notes?: { id: string; noteText: string; createdAt?: string }[];
  whatsappAccounts?: {
    id: string;
    name?: string | null;
    phoneNumber?: string | null;
  }[];
};

const schema = z.object({
  organizationId: z.string().uuid(),
  displayName: z.string().optional(),
  phoneNumber: z.string().min(5, 'Phone required'),
  email: z.string().email().optional().or(z.literal('')),
  company: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function ContactsPage() {
  const { user } = useAuth();
  const isSystem = user?.organization?.type === 'SYSTEM';
  const orgId = user?.organizationId || '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [open, setOpen] = useState(false);
  const [tagModal, setTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#171717');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [tagIdToAdd, setTagIdToAdd] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const list = usePaginatedList<Contact>({
    queryKey: ['contacts', orgId, debouncedQ],
    path: '/admin/v1/contacts',
    page,
    params: debouncedQ ? { q: debouncedQ } : {},
  });

  const tags = useQuery({
    queryKey: ['tags', orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data } = await api.get<{ data: Tag[] }>('/admin/v1/tags', {
        params: { organizationId: orgId },
      });
      return Array.isArray(data.data) ? data.data : [];
    },
  });

  const detail = useQuery({
    queryKey: ['contacts', 'detail', selectedId, orgId],
    enabled: Boolean(selectedId && orgId),
    queryFn: async () => {
      const { data } = await api.get<{ data: Contact }>(
        `/admin/v1/contacts/${selectedId}`,
        { params: { organizationId: orgId } },
      );
      return data.data;
    },
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      organizationId: orgId,
      displayName: '',
      phoneNumber: '',
      email: '',
      company: '',
    },
  });

  useEffect(() => {
    if (orgId) form.setValue('organizationId', orgId);
  }, [orgId, form]);

  const create = useMutation({
    mutationFn: async (values: FormValues) => {
      const { data } = await api.post('/admin/v1/contacts', {
        ...values,
        email: values.email || undefined,
        company: values.company || undefined,
      });
      return data;
    },
    onSuccess: async () => {
      setOpen(false);
      form.reset({
        organizationId: orgId,
        displayName: '',
        phoneNumber: '',
        email: '',
        company: '',
      });
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  const createTag = useMutation({
    mutationFn: async () => {
      await api.post(
        '/admin/v1/tags',
        { name: newTagName, color: newTagColor },
        { params: { organizationId: orgId } },
      );
    },
    onSuccess: async () => {
      setTagModal(false);
      setNewTagName('');
      await queryClient.invalidateQueries({ queryKey: ['tags'] });
    },
  });

  const addTag = useMutation({
    mutationFn: async () => {
      if (!selectedId || !tagIdToAdd) return;
      await api.post(
        `/admin/v1/contacts/${selectedId}/tags`,
        { tagId: tagIdToAdd },
        { params: { organizationId: orgId } },
      );
    },
    onSuccess: async () => {
      setTagIdToAdd('');
      await queryClient.invalidateQueries({
        queryKey: ['contacts', 'detail', selectedId],
      });
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  const removeTag = useMutation({
    mutationFn: async (tagId: string) => {
      if (!selectedId) return;
      await api.delete(`/admin/v1/contacts/${selectedId}/tags/${tagId}`, {
        params: { organizationId: orgId },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['contacts', 'detail', selectedId],
      });
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  const addNote = useMutation({
    mutationFn: async () => {
      if (!selectedId) return;
      await api.post(
        `/admin/v1/contacts/${selectedId}/notes`,
        { noteText },
        { params: { organizationId: orgId } },
      );
    },
    onSuccess: async () => {
      setNoteText('');
      await queryClient.invalidateQueries({
        queryKey: ['contacts', 'detail', selectedId],
      });
    },
  });

  const deleteNote = useMutation({
    mutationFn: async (noteId: string) => {
      if (!selectedId) return;
      await api.delete(`/admin/v1/contacts/${selectedId}/notes/${noteId}`, {
        params: { organizationId: orgId },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['contacts', 'detail', selectedId],
      });
    },
  });

  const items = list.data?.items || [];
  const contactTags = detail.data?.tags || [];
  const availableTags = (tags.data || []).filter(
    (t) => !contactTags.some((ct) => ct.id === t.id),
  );

  return (
    <div>
      <PageHeader
        title="Contacts"
        description="Address book with tags and notes."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setTagModal(true)}>
              Manage tags
            </Button>
            <Button onClick={() => setOpen(true)}>Create contact</Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
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
            <EmptyState
              title="Could not load contacts"
              description={listErrorMessage(list.error)}
            />
          ) : list.isLoading ? (
            <EmptyState title="Loading contacts…" />
          ) : items.length === 0 ? (
            <EmptyState title="No contacts found" />
          ) : (
            <div className="divide-y divide-slate-100">
              {items.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedId(row.id)}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50',
                    selectedId === row.id && 'bg-zinc-100 dark:bg-zinc-800',
                  )}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
                    {(row.displayName || row.phoneNumber || '?')
                      .slice(0, 1)
                      .toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900">
                      {row.displayName || '—'}
                    </div>
                    <div className="font-mono text-xs text-slate-500">
                      {row.phoneNumber || '—'}
                      {row.company ? ` · ${row.company}` : ''}
                    </div>
                    {(row.whatsappAccounts || []).length > 0 ? (
                      <div className="mt-1">
                        <AccountBadge account={row.whatsappAccounts} />
                      </div>
                    ) : null}
                    {row.tags && row.tags.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {row.tags.map((t) => (
                          <span
                            key={t.id}
                            className="rounded-full px-1.5 py-0.5 text-[10px] text-white"
                            style={{ backgroundColor: t.color || '#64748b' }}
                          >
                            {t.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {formatDate(row.createdAt).split(',')[0]}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs">
            <button
              type="button"
              className="text-zinc-800 dark:text-zinc-200 disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Prev
            </button>
            <span className="text-slate-500">
              {page}/{list.data?.meta.totalPages || 1} · {list.data?.meta.total || 0}{' '}
              total
            </span>
            <button
              type="button"
              className="text-zinc-800 dark:text-zinc-200 disabled:opacity-40"
              disabled={page >= (list.data?.meta.totalPages || 1)}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </Card>

        <Card>
          <CardContent className="py-4">
            {!selectedId ? (
              <EmptyState title="Select a contact" />
            ) : detail.isLoading ? (
              <EmptyState title="Loading…" />
            ) : detail.isError ? (
              <EmptyState
                title="Could not load contact"
                description={getErrorMessage(detail.error)}
              />
            ) : (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    {detail.data?.displayName || 'Unnamed'}
                  </h2>
                  <p className="font-mono text-sm text-slate-500">
                    {detail.data?.phoneNumber}
                  </p>
                  <p className="text-sm text-slate-600">
                    {detail.data?.email || 'No email'}
                    {detail.data?.company ? ` · ${detail.data.company}` : ''}
                  </p>
                  <div className="mt-2">
                    <div className="mb-1 text-xs font-semibold uppercase text-slate-400">
                      WhatsApp accounts
                    </div>
                    <AccountBadge
                      account={
                        (detail.data as Contact | undefined)?.whatsappAccounts
                      }
                    />
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase text-slate-400">
                    Tags
                  </div>
                  <div className="mb-2 flex flex-wrap gap-1">
                    {contactTags.length === 0 ? (
                      <span className="text-xs text-slate-400">No tags</span>
                    ) : (
                      contactTags.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          className="rounded-full px-2 py-0.5 text-xs text-white"
                          style={{ backgroundColor: t.color || '#64748b' }}
                          onClick={() => removeTag.mutate(t.id)}
                        >
                          {t.name} ×
                        </button>
                      ))
                    )}
                  </div>
                  <div className="flex gap-1">
                    <select
                      className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                      value={tagIdToAdd}
                      onChange={(e) => setTagIdToAdd(e.target.value)}
                    >
                      <option value="">Add tag…</option>
                      {availableTags.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <Button
                      variant="secondary"
                      disabled={!tagIdToAdd}
                      loading={addTag.isPending}
                      onClick={() => addTag.mutate()}
                    >
                      Add
                    </Button>
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase text-slate-400">
                    Notes
                  </div>
                  <div className="mb-2 max-h-48 space-y-2 overflow-y-auto">
                    {(detail.data?.notes || []).length === 0 ? (
                      <p className="text-xs text-slate-400">No notes</p>
                    ) : (
                      (detail.data?.notes || []).map((n) => (
                        <div
                          key={n.id}
                          className="rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs"
                        >
                          <div className="flex justify-between gap-2">
                            <span>{n.noteText}</span>
                            <button
                              type="button"
                              className="text-red-500"
                              onClick={() => deleteNote.mutate(n.id)}
                            >
                              ×
                            </button>
                          </div>
                          <div className="mt-1 text-[10px] text-slate-400">
                            {formatDate(n.createdAt)}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Input
                      placeholder="Add note…"
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                    />
                    <Button
                      variant="secondary"
                      disabled={!noteText.trim()}
                      loading={addNote.isPending}
                      onClick={() => addNote.mutate()}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
          {isSystem ? (
            <Input
              label="Organization ID"
              error={form.formState.errors.organizationId?.message}
              {...form.register('organizationId')}
            />
          ) : (
            <input type="hidden" {...form.register('organizationId')} />
          )}
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
          <Input label="Company" {...form.register('company')} />
          {create.isError ? (
            <p className="text-sm text-red-600">{getErrorMessage(create.error)}</p>
          ) : null}
        </form>
      </Modal>

      <Modal
        open={tagModal}
        title="Tags"
        onClose={() => setTagModal(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setTagModal(false)}>
              Close
            </Button>
            <Button
              loading={createTag.isPending}
              disabled={!newTagName.trim()}
              onClick={() => createTag.mutate()}
            >
              Create tag
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {(tags.data || []).map((t) => (
              <span
                key={t.id}
                className="rounded-full px-2 py-0.5 text-xs text-white"
                style={{ backgroundColor: t.color || '#64748b' }}
              >
                {t.name}
              </span>
            ))}
            {(tags.data || []).length === 0 ? (
              <span className="text-xs text-slate-400">No tags yet</span>
            ) : null}
          </div>
          <Input
            label="New tag name"
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
          />
          <Input
            label="Color"
            type="color"
            value={newTagColor}
            onChange={(e) => setNewTagColor(e.target.value)}
          />
          {createTag.isError ? (
            <p className="text-sm text-red-600">
              {getErrorMessage(createTag.error)}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}
