import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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

type ContactList = {
  id: string;
  name: string;
  description?: string | null;
  _count?: { members: number };
};

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
  primaryConversationId?: string | null;
  whatsappAccounts?: {
    id: string;
    name?: string | null;
    phoneNumber?: string | null;
    bsuid?: string | null;
    parentBsuid?: string | null;
    username?: string | null;
    conversationId?: string | null;
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSystem = user?.organization?.type === 'SYSTEM';
  const orgId = user?.organizationId || '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [open, setOpen] = useState(false);
  const [tagModal, setTagModal] = useState(false);
  const [listModal, setListModal] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [newListDescription, setNewListDescription] = useState('');
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#171717');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [tagIdToAdd, setTagIdToAdd] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [detailError, setDetailError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    setEditingName(false);
    setNameDraft('');
    setDetailError(null);
    setTagIdToAdd('');
    setNoteText('');
  }, [selectedId]);

  useEffect(() => {
    setSelectedId(null);
    setPage(1);
    setImportSummary(null);
  }, [activeListId]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const contactLists = useQuery({
    queryKey: ['contact-lists', orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data } = await api.get<{ data: ContactList[] }>(
        '/admin/v1/contact-lists',
        { params: { organizationId: orgId } },
      );
      return Array.isArray(data.data) ? data.data : [];
    },
  });

  const activeList =
    contactLists.data?.find((l) => l.id === activeListId) ?? null;

  const list = usePaginatedList<Contact>({
    queryKey: ['contacts', orgId, debouncedQ, activeListId],
    path: '/admin/v1/contacts',
    page,
    params: {
      ...(debouncedQ ? { q: debouncedQ } : {}),
      ...(activeListId ? { listId: activeListId } : {}),
    },
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
      const { data } = await api.post<{ data: Contact }>('/admin/v1/contacts', {
        ...values,
        email: values.email || undefined,
        company: values.company || undefined,
      });
      const contact = data.data;
      if (activeListId && contact?.id) {
        await api.post(
          `/admin/v1/contact-lists/${activeListId}/members`,
          { contactId: contact.id },
          { params: { organizationId: orgId } },
        );
      }
      return contact;
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
      await queryClient.invalidateQueries({ queryKey: ['contact-lists'] });
    },
  });

  const createList = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ data: ContactList }>(
        '/admin/v1/contact-lists',
        {
          name: newListName.trim(),
          description: newListDescription.trim() || undefined,
        },
        { params: { organizationId: orgId } },
      );
      return data.data;
    },
    onSuccess: async (created) => {
      setListModal(false);
      setNewListName('');
      setNewListDescription('');
      await queryClient.invalidateQueries({ queryKey: ['contact-lists'] });
      if (created?.id) setActiveListId(created.id);
    },
  });

  const deleteList = useMutation({
    mutationFn: async (listId: string) => {
      await api.delete(`/admin/v1/contact-lists/${listId}`, {
        params: { organizationId: orgId },
      });
    },
    onSuccess: async () => {
      setActiveListId(null);
      await queryClient.invalidateQueries({ queryKey: ['contact-lists'] });
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  const removeFromList = useMutation({
    mutationFn: async () => {
      if (!selectedId || !activeListId) return;
      await api.delete(
        `/admin/v1/contact-lists/${activeListId}/members/${selectedId}`,
        { params: { organizationId: orgId } },
      );
    },
    onSuccess: async () => {
      setSelectedId(null);
      setDetailError(null);
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      await queryClient.invalidateQueries({ queryKey: ['contact-lists'] });
    },
    onError: (err) => setDetailError(getErrorMessage(err)),
  });

  const importContacts = useMutation({
    mutationFn: async (file: File) => {
      if (!activeListId) throw new Error('Select a contact list first');
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await api.post<{
        data: {
          summary: {
            totalRows: number;
            created: number;
            updated: number;
            addedToList: number;
            skipped: number;
            errors: Array<{ row: number; message: string }>;
          };
        };
      }>(`/admin/v1/contact-lists/${activeListId}/import`, formData, {
        params: { organizationId: orgId },
      });
      return data.data;
    },
    onSuccess: async (result) => {
      const s = result.summary;
      setImportSummary(
        `Imported ${s.totalRows} rows · ${s.created} created · ${s.addedToList} added · ${s.skipped} skipped`,
      );
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
      await queryClient.invalidateQueries({ queryKey: ['contact-lists'] });
    },
    onError: (err) => setImportSummary(getErrorMessage(err)),
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

  const updateName = useMutation({
    mutationFn: async (displayName: string) => {
      if (!selectedId) return;
      const { data } = await api.put<{ data: Contact }>(
        `/admin/v1/contacts/${selectedId}`,
        { displayName: displayName.trim() },
        { params: { organizationId: orgId } },
      );
      return data.data;
    },
    onSuccess: async () => {
      setEditingName(false);
      setDetailError(null);
      await queryClient.invalidateQueries({
        queryKey: ['contacts', 'detail', selectedId],
      });
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (err) => setDetailError(getErrorMessage(err)),
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
      setDetailError(null);
      await queryClient.invalidateQueries({
        queryKey: ['contacts', 'detail', selectedId],
      });
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (err) => setDetailError(getErrorMessage(err)),
  });

  const removeTag = useMutation({
    mutationFn: async (tagId: string) => {
      if (!selectedId) return;
      await api.delete(`/admin/v1/contacts/${selectedId}/tags/${tagId}`, {
        params: { organizationId: orgId },
      });
    },
    onSuccess: async () => {
      setDetailError(null);
      await queryClient.invalidateQueries({
        queryKey: ['contacts', 'detail', selectedId],
      });
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (err) => setDetailError(getErrorMessage(err)),
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

  const deleteContact = useMutation({
    mutationFn: async () => {
      if (!selectedId) return;
      await api.delete(`/admin/v1/contacts/${selectedId}`, {
        params: { organizationId: orgId },
      });
    },
    onSuccess: async () => {
      setSelectedId(null);
      setEditingName(false);
      setDetailError(null);
      await queryClient.invalidateQueries({ queryKey: ['contacts'] });
    },
    onError: (err) => setDetailError(getErrorMessage(err)),
  });

  const handleDeleteContact = () => {
    if (!selectedId || !detail.data) return;
    const label =
      detail.data.displayName?.trim() ||
      detail.data.phoneNumber ||
      'this contact';
    if (
      !window.confirm(
        `Delete ${label}? This removes the contact from your address book. Conversations and messages are kept.`,
      )
    ) {
      return;
    }
    deleteContact.mutate();
  };

  const items = list.data?.items || [];
  const contactTags = detail.data?.tags || [];
  const availableTags = (tags.data || []).filter(
    (t) => !contactTags.some((ct) => ct.id === t.id),
  );
  const inboxConversationId =
    detail.data?.primaryConversationId ||
    detail.data?.whatsappAccounts?.find((a) => a.conversationId)
      ?.conversationId ||
    null;

  const openInbox = () => {
    if (!inboxConversationId) return;
    navigate(`/conversations?conversationId=${inboxConversationId}`);
  };

  return (
    <div>
      <PageHeader
        title={activeList ? activeList.name : 'Contacts'}
        description={
          activeList
            ? activeList.description ||
              `Contact list · ${activeList._count?.members ?? 0} members`
            : 'Address book with tags, notes, and contact lists.'
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setTagModal(true)}>
              Manage tags
            </Button>
            <Button variant="secondary" onClick={() => setListModal(true)}>
              Create Contact List
            </Button>
            <Button onClick={() => setOpen(true)}>Create contact</Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveListId(null)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-medium transition',
            !activeListId
              ? 'border-zinc-900 bg-zinc-900 text-white'
              : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
          )}
        >
          All contacts
        </button>
        {(contactLists.data || []).map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setActiveListId(l.id)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition',
              activeListId === l.id
                ? 'border-zinc-900 bg-zinc-900 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
          >
            {l.name}
            {typeof l._count?.members === 'number'
              ? ` (${l._count.members})`
              : ''}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="space-y-3 border-b border-slate-100 py-4">
            <Input
              placeholder={
                activeList
                  ? `Search in ${activeList.name}…`
                  : 'Search contacts…'
              }
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            {activeList ? (
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex cursor-pointer">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) importContacts.mutate(file);
                    }}
                  />
                  <span className="inline-flex h-8 items-center rounded-md border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-800 hover:bg-zinc-50">
                    {importContacts.isPending
                      ? 'Importing…'
                      : 'Import CSV / Excel'}
                  </span>
                </label>
                <Button
                  variant="danger"
                  size="sm"
                  loading={deleteList.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete list "${activeList.name}"? Contacts stay in All contacts.`,
                      )
                    ) {
                      deleteList.mutate(activeList.id);
                    }
                  }}
                >
                  Delete list
                </Button>
                {importSummary ? (
                  <p className="w-full text-xs text-slate-500">{importSummary}</p>
                ) : (
                  <p className="w-full text-xs text-slate-400">
                    Columns: phone, name, email, company
                  </p>
                )}
              </div>
            ) : null}
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
                  {editingName ? (
                    <div className="space-y-2">
                      <Input
                        label="Name"
                        placeholder="Enter contact name"
                        value={nameDraft}
                        autoFocus
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            updateName.mutate(nameDraft);
                          }
                          if (e.key === 'Escape') {
                            setEditingName(false);
                            setDetailError(null);
                          }
                        }}
                      />
                      <div className="flex gap-1">
                        <Button
                          loading={updateName.isPending}
                          onClick={() => updateName.mutate(nameDraft)}
                        >
                          Save name
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={updateName.isPending}
                          onClick={() => {
                            setEditingName(false);
                            setDetailError(null);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="text-lg font-semibold text-slate-900">
                          {detail.data?.displayName?.trim() || 'Unnamed'}
                        </h2>
                        {!detail.data?.displayName?.trim() ? (
                          <p className="mt-0.5 text-xs text-slate-400">
                            No name set — add one so this contact is easier to find
                          </p>
                        ) : null}
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="shrink-0"
                        onClick={() => {
                          setNameDraft(detail.data?.displayName || '');
                          setEditingName(true);
                          setDetailError(null);
                        }}
                      >
                        {detail.data?.displayName?.trim() ? 'Edit name' : 'Add name'}
                      </Button>
                    </div>
                  )}
                  <p className="mt-2 font-mono text-sm text-slate-500">
                    {detail.data?.phoneNumber}
                  </p>
                  <p className="text-sm text-slate-600">
                    {detail.data?.email || 'No email'}
                    {detail.data?.company ? ` · ${detail.data.company}` : ''}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={!inboxConversationId}
                      title={
                        inboxConversationId
                          ? 'Open this contact in Inbox'
                          : 'No conversation yet for this contact'
                      }
                      onClick={openInbox}
                    >
                      Open Inbox
                    </Button>
                    {activeListId ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={removeFromList.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              'Remove this contact from the list? The contact remains in All contacts.',
                            )
                          ) {
                            removeFromList.mutate();
                          }
                        }}
                      >
                        Remove from list
                      </Button>
                    ) : null}
                    <Button
                      variant="danger"
                      size="sm"
                      loading={deleteContact.isPending}
                      onClick={handleDeleteContact}
                    >
                      Delete contact
                    </Button>
                  </div>
                  <div className="mt-2">
                    <div className="mb-1 text-xs font-semibold uppercase text-slate-400">
                      WhatsApp accounts
                    </div>
                    {((detail.data as Contact | undefined)?.whatsappAccounts || [])
                      .length === 0 ? (
                      <AccountBadge account={undefined} />
                    ) : (
                      <ul className="space-y-2">
                        {(
                          (detail.data as Contact | undefined)
                            ?.whatsappAccounts || []
                        ).map((account) => {
                          const label = [
                            account.name?.trim(),
                            account.phoneNumber?.trim(),
                          ]
                            .filter(Boolean)
                            .join(' · ');
                          return (
                            <li
                              key={account.id}
                              className="rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2"
                            >
                              <div className="text-sm font-medium text-slate-800">
                                {label || 'WhatsApp connection'}
                              </div>
                              <div className="mt-0.5 font-mono text-xs text-slate-500">
                                {account.bsuid
                                  ? `BSUID: ${account.bsuid}`
                                  : 'BSUID: —'}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase text-slate-400">
                    Tags
                  </div>
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {contactTags.length === 0 ? (
                      <span className="text-xs text-slate-400">No tags</span>
                    ) : (
                      contactTags.map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs text-white"
                          style={{ backgroundColor: t.color || '#64748b' }}
                        >
                          {t.name}
                          <button
                            type="button"
                            title={`Remove ${t.name}`}
                            aria-label={`Remove tag ${t.name}`}
                            disabled={removeTag.isPending}
                            className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-black/20 text-[11px] leading-none hover:bg-black/35 disabled:opacity-50"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              removeTag.mutate(t.id);
                            }}
                          >
                            ×
                          </button>
                        </span>
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

                {detailError ? (
                  <p className="text-sm text-red-600">{detailError}</p>
                ) : null}

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
        title={
          activeList
            ? `Add contact to ${activeList.name}`
            : 'Create contact'
        }
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
              {activeList ? 'Add to list' : 'Create'}
            </Button>
          </>
        }
      >
        <form className="space-y-4">
          {activeList ? (
            <p className="text-sm text-slate-500">
              If this phone number already exists, the contact will be added to{' '}
              <span className="font-medium text-slate-700">{activeList.name}</span>{' '}
              without changing other lists.
            </p>
          ) : null}
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
        open={listModal}
        title="Create Contact List"
        onClose={() => setListModal(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setListModal(false)}>
              Cancel
            </Button>
            <Button
              loading={createList.isPending}
              disabled={!newListName.trim()}
              onClick={() => createList.mutate()}
            >
              Create list
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Input
            label="List name"
            placeholder="e.g. VIP customers"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
          />
          <Input
            label="Description (optional)"
            value={newListDescription}
            onChange={(e) => setNewListDescription(e.target.value)}
          />
          {createList.isError ? (
            <p className="text-sm text-red-600">
              {getErrorMessage(createList.error)}
            </p>
          ) : null}
        </div>
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
