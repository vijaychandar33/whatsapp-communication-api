import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Pin,
  PinOff,
  Search,
  Send,
  UserPlus,
  CircleDot,
  Sparkles,
} from 'lucide-react';
import { api, getErrorMessage } from '../lib/api';
import { listErrorMessage, usePaginatedList } from '../hooks/usePaginatedList';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import { AccountBadge, formatAccountLabel } from '../components/ui/AccountBadge';
import { Badge, statusTone } from '../components/ui/Badge';
import { cn, formatDate, truncate } from '../lib/utils';

type Tag = { id: string; name: string; color?: string };

type Contact = {
  id: string;
  displayName?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  company?: string | null;
  tags?: Tag[];
  notes?: { id: string; noteText: string; createdAt?: string }[];
};

type Conversation = {
  id: string;
  status?: string;
  channelCode?: string;
  contactId?: string;
  communicationAccountId?: string;
  assignedToUserId?: string | null;
  isPinned?: boolean;
  unreadCount?: number;
  lastMessageText?: string | null;
  contact?: Contact;
  communicationAccount?: {
    id: string;
    name?: string;
    channelCode?: string;
    phoneNumber?: string;
  };
  lastMessageAt?: string;
  createdAt?: string;
  aiAutoreplyDisabled?: boolean;
  aiReplyCount?: number;
  aiHandoffSummary?: string | null;
};

type Message = {
  id: string;
  direction?: string;
  body?: string | null;
  status?: string;
  createdAt?: string;
  messageType?: string;
  aiGenerated?: boolean;
};

type ConversationDetail = Conversation & {
  messages?: Message[];
};

type StatusFilter = '' | 'OPEN' | 'PENDING' | 'CLOSED' | 'ARCHIVED';

export function ConversationsPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId || '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [noteText, setNoteText] = useState('');
  const [tagIdToAdd, setTagIdToAdd] = useState('');
  const [templateId, setTemplateId] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const list = usePaginatedList<Conversation>({
    queryKey: ['conversations', orgId, status, unreadOnly, debouncedQ],
    path: '/admin/v1/conversations',
    page,
    limit: 40,
    params: {
      ...(status ? { status } : {}),
      ...(unreadOnly ? { unreadOnly: 'true' } : {}),
      ...(debouncedQ ? { q: debouncedQ } : {}),
    },
  });

  const detail = useQuery({
    queryKey: ['conversations', 'detail', selectedId, orgId],
    enabled: Boolean(selectedId && orgId),
    queryFn: async () => {
      const { data } = await api.get<{ data: ConversationDetail }>(
        `/admin/v1/conversations/${selectedId}`,
        { params: { organizationId: orgId } },
      );
      return data.data;
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

  const templates = useQuery({
    queryKey: ['templates', 'inbox', orgId],
    enabled: Boolean(orgId && selectedId),
    queryFn: async () => {
      const { data } = await api.get<{
        data: { id: string; name?: string; language?: string; status?: string }[];
      }>('/admin/v1/templates', {
        params: { organizationId: orgId, limit: 100 },
      });
      return Array.isArray(data.data) ? data.data : [];
    },
  });

  useEffect(() => {
    setReply('');
    setNoteText('');
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId || !orgId) return;
    const unread = list.data?.items.find((c) => c.id === selectedId)?.unreadCount;
    if (!unread) return;
    void api
      .post(`/admin/v1/conversations/${selectedId}/read`, null, {
        params: { organizationId: orgId },
      })
      .then(() =>
        queryClient.invalidateQueries({ queryKey: ['conversations'] }),
      )
      .catch(() => undefined);
  }, [selectedId, orgId, list.data?.items, queryClient]);

  const invalidateThread = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['conversations', 'detail', selectedId],
    });
    await queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const patchStatus = useMutation({
    mutationFn: async (next: string) => {
      await api.patch(
        `/admin/v1/conversations/${selectedId}`,
        { status: next },
        { params: { organizationId: orgId } },
      );
    },
    onSuccess: invalidateThread,
  });

  const archive = useMutation({
    mutationFn: async () => {
      await api.post(`/admin/v1/conversations/${selectedId}/archive`, null, {
        params: { organizationId: orgId },
      });
    },
    onSuccess: invalidateThread,
  });

  const pin = useMutation({
    mutationFn: async (isPinned: boolean) => {
      await api.post(
        `/admin/v1/conversations/${selectedId}/pin`,
        { isPinned },
        { params: { organizationId: orgId } },
      );
    },
    onSuccess: invalidateThread,
  });

  const assign = useMutation({
    mutationFn: async () => {
      await api.post(
        `/admin/v1/conversations/${selectedId}/assign`,
        { assignedToUserId: user?.id },
        { params: { organizationId: orgId } },
      );
    },
    onSuccess: invalidateThread,
  });

  const sendReply = useMutation({
    mutationFn: async () => {
      const conv = detail.data;
      if (!conv) throw new Error('No conversation selected');
      const to = conv.contact?.phoneNumber;
      if (!to) throw new Error('Contact has no phone number');
      const accountId =
        conv.communicationAccountId || conv.communicationAccount?.id;
      if (!accountId) throw new Error('No communication account on conversation');

      const selectedTemplate = (templates.data || []).find(
        (t) => t.id === templateId,
      );

      if (selectedTemplate?.name) {
        await api.post(
          '/admin/v1/messages',
          {
            communicationAccountId: accountId,
            to,
            messageType: 'TEMPLATE',
            templateName: selectedTemplate.name,
            templateLanguage: selectedTemplate.language || 'en',
            conversationId: conv.id,
            contactId: conv.contactId,
          },
          { params: { organizationId: orgId } },
        );
        return;
      }

      await api.post(
        '/admin/v1/messages',
        {
          communicationAccountId: accountId,
          to,
          body: reply,
          messageType: 'TEXT',
          conversationId: conv.id,
          contactId: conv.contactId,
        },
        { params: { organizationId: orgId } },
      );
    },
    onSuccess: async () => {
      setReply('');
      setTemplateId('');
      await invalidateThread();
      await queryClient.invalidateQueries({ queryKey: ['messages'] });
    },
  });

  const draftAi = useMutation({
    mutationFn: async () => {
      if (!selectedId) throw new Error('No conversation');
      const { data } = await api.post<{ data: { draft: string } }>(
        '/admin/v1/ai/draft',
        { organizationId: orgId, conversationId: selectedId },
      );
      return data.data.draft;
    },
    onSuccess: (draft) => {
      setReply(draft);
      setTemplateId('');
    },
  });

  const toggleAi = useMutation({
    mutationFn: async (paused: boolean) => {
      if (!selectedId) throw new Error('No conversation');
      await api.post(
        `/admin/v1/ai/conversations/${selectedId}/autoreply`,
        { paused, assignToMe: paused },
        { params: { organizationId: orgId } },
      );
    },
    onSuccess: invalidateThread,
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const contactId = detail.data?.contact?.id || detail.data?.contactId;
      if (!contactId) throw new Error('No contact');
      await api.post(
        `/admin/v1/contacts/${contactId}/notes`,
        { noteText },
        { params: { organizationId: orgId } },
      );
    },
    onSuccess: async () => {
      setNoteText('');
      await invalidateThread();
    },
  });

  const addTag = useMutation({
    mutationFn: async () => {
      const contactId = detail.data?.contact?.id || detail.data?.contactId;
      if (!contactId || !tagIdToAdd) throw new Error('Pick a tag');
      await api.post(
        `/admin/v1/contacts/${contactId}/tags`,
        { tagId: tagIdToAdd },
        { params: { organizationId: orgId } },
      );
    },
    onSuccess: async () => {
      setTagIdToAdd('');
      await invalidateThread();
    },
  });

  const removeTag = useMutation({
    mutationFn: async (tagId: string) => {
      const contactId = detail.data?.contact?.id || detail.data?.contactId;
      if (!contactId) throw new Error('No contact');
      await api.delete(`/admin/v1/contacts/${contactId}/tags/${tagId}`, {
        params: { organizationId: orgId },
      });
    },
    onSuccess: invalidateThread,
  });

  const items = list.data?.items || [];
  const messages = detail.data?.messages || [];
  const contactTags = detail.data?.contact?.tags || [];
  const availableTags = useMemo(
    () =>
      (tags.data || []).filter(
        (t) => !contactTags.some((ct) => ct.id === t.id),
      ),
    [tags.data, contactTags],
  );

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100vh-3.5rem)] flex-col bg-slate-50 sm:-mx-6 lg:-mx-8 lg:h-screen">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Inbox</h1>
          <p className="text-xs text-slate-500">
            Shared WhatsApp conversations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => {
                setUnreadOnly(e.target.checked);
                setPage(1);
              }}
            />
            Unread
          </label>
          <select
            className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as StatusFilter);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="PENDING">Pending</option>
            <option value="CLOSED">Closed</option>
            <option value="ARCHIVED">Archived</option>
          </select>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)_300px]">
        {/* Thread list */}
        <aside className="flex min-h-0 flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                className="w-full rounded-md border border-slate-200 py-2 pl-8 pr-3 text-sm outline-none focus:border-zinc-950 dark:focus:border-zinc-300"
                placeholder="Search…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {list.isError ? (
              <EmptyState
                title="Could not load inbox"
                description={listErrorMessage(list.error)}
              />
            ) : list.isLoading ? (
              <EmptyState title="Loading…" />
            ) : items.length === 0 ? (
              <EmptyState title="No conversations" />
            ) : (
              items.map((row) => {
                const active = selectedId === row.id;
                const name =
                  row.contact?.displayName ||
                  row.contact?.phoneNumber ||
                  'Unknown';
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className={cn(
                      'flex w-full gap-3 border-b border-slate-100 px-3 py-3 text-left transition',
                      active ? 'bg-zinc-100 dark:bg-zinc-800' : 'hover:bg-slate-50',
                    )}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-700">
                      {name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1">
                        {row.isPinned ? (
                          <Pin className="h-3 w-3 text-amber-500" />
                        ) : null}
                        <span
                          className={cn(
                            'truncate text-sm',
                            (row.unreadCount || 0) > 0
                              ? 'font-semibold text-slate-900'
                              : 'font-medium text-slate-800',
                          )}
                        >
                          {name}
                        </span>
                        {(row.unreadCount || 0) > 0 ? (
                          <span className="ml-auto rounded-full bg-zinc-950 px-1.5 py-0.5 text-[10px] font-semibold text-white dark:bg-white dark:text-zinc-950">
                            {row.unreadCount}
                          </span>
                        ) : (
                          <span className="ml-auto text-[10px] text-slate-400">
                            {formatDate(row.lastMessageAt).split(',')[0]}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {row.lastMessageText || 'No messages yet'}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <AccountBadge
                          account={row.communicationAccount}
                          className="text-[10px]"
                        />
                        {row.status ? (
                          <Badge tone={statusTone(row.status)}>
                            {row.status}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {(list.data?.meta.totalPages || 1) > 1 ? (
            <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs">
              <button
                type="button"
                className="text-zinc-800 dark:text-zinc-200 disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <span className="text-slate-500">
                {page}/{list.data?.meta.totalPages || 1}
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
          ) : null}
        </aside>

        {/* Thread */}
        <section className="flex min-h-0 flex-col bg-slate-100/60">
          {!selectedId ? (
            <div className="flex flex-1 items-center justify-center">
              <EmptyState title="Select a conversation" />
            </div>
          ) : detail.isLoading ? (
            <EmptyState title="Loading thread…" />
          ) : detail.isError ? (
            <EmptyState
              title="Could not load conversation"
              description={getErrorMessage(detail.error)}
            />
          ) : (
            <>
              <header className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-slate-900">
                    {detail.data?.contact?.displayName ||
                      detail.data?.contact?.phoneNumber ||
                      'Conversation'}
                  </div>
                  <div className="text-xs text-slate-500">
                    {detail.data?.contact?.phoneNumber || '—'} ·{' '}
                    {formatAccountLabel(detail.data?.communicationAccount)}
                  </div>
                </div>
                <select
                  className="rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                  value={detail.data?.status || 'OPEN'}
                  onChange={(e) => patchStatus.mutate(e.target.value)}
                >
                  <option value="OPEN">Open</option>
                  <option value="PENDING">Pending</option>
                  <option value="CLOSED">Closed</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
                <Button
                  variant="secondary"
                  loading={assign.isPending}
                  onClick={() => assign.mutate()}
                >
                  <UserPlus className="mr-1 h-3.5 w-3.5" />
                  Assign me
                </Button>
                <Button
                  variant="secondary"
                  loading={pin.isPending}
                  onClick={() =>
                    pin.mutate(!(detail.data?.isPinned ?? false))
                  }
                >
                  {detail.data?.isPinned ? (
                    <PinOff className="h-3.5 w-3.5" />
                  ) : (
                    <Pin className="h-3.5 w-3.5" />
                  )}
                </Button>
                <Button
                  variant="secondary"
                  loading={archive.isPending}
                  onClick={() => archive.mutate()}
                >
                  <Archive className="h-3.5 w-3.5" />
                </Button>
              </header>

              {detail.data?.aiAutoreplyDisabled ||
              detail.data?.aiHandoffSummary ? (
                <div className="flex flex-wrap items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-900">
                  <span className="flex-1">
                    {detail.data.aiHandoffSummary ||
                      'AI auto-reply paused for this thread.'}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={toggleAi.isPending}
                    onClick={() => toggleAi.mutate(false)}
                  >
                    Resume AI
                  </Button>
                </div>
              ) : (
                <div className="flex justify-end border-b border-slate-100 bg-white px-4 py-1.5">
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={toggleAi.isPending}
                    onClick={() => toggleAi.mutate(true)}
                  >
                    Take over (pause AI)
                  </Button>
                </div>
              )}

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
                {messages.length === 0 ? (
                  <p className="text-center text-sm text-slate-500">
                    No messages yet.
                  </p>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        'max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm',
                        m.direction === 'OUTBOUND'
                          ? 'ml-auto bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                          : 'mr-auto bg-white text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100',
                      )}
                    >
                      <div>
                        {m.body || truncate(m.messageType, 40) || '—'}
                      </div>
                      <div
                        className={cn(
                          'mt-1 text-[10px]',
                          m.direction === 'OUTBOUND'
                            ? 'text-zinc-400 dark:text-zinc-500'
                            : 'text-zinc-400',
                        )}
                      >
                        {m.aiGenerated ? 'AI · ' : ''}
                        {m.status} · {formatDate(m.createdAt)}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <footer className="border-t border-slate-200 bg-white p-3">
                <div className="mb-2 flex flex-wrap gap-2">
                  <select
                    className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs"
                    value={templateId}
                    onChange={(e) => setTemplateId(e.target.value)}
                  >
                    <option value="">Send text reply…</option>
                    {(templates.data || []).map((t) => (
                      <option key={t.id} value={t.id}>
                        Template: {t.name} ({t.language || 'en'})
                        {t.status ? ` · ${t.status}` : ''}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="secondary"
                    loading={draftAi.isPending}
                    disabled={!selectedId}
                    onClick={() => draftAi.mutate()}
                  >
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    Draft with AI
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder={
                      templateId
                        ? 'Template selected — press Send'
                        : 'Type a reply…'
                    }
                    value={reply}
                    disabled={Boolean(templateId)}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (
                        e.key === 'Enter' &&
                        !e.shiftKey &&
                        (reply.trim() || templateId)
                      ) {
                        e.preventDefault();
                        sendReply.mutate();
                      }
                    }}
                  />
                  <Button
                    loading={sendReply.isPending}
                    disabled={!reply.trim() && !templateId}
                    onClick={() => sendReply.mutate()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                {draftAi.isError ? (
                  <p className="mt-2 text-sm text-red-600">
                    {getErrorMessage(draftAi.error)}
                  </p>
                ) : null}
                {sendReply.isError ? (
                  <p className="mt-2 text-sm text-red-600">
                    {getErrorMessage(sendReply.error)}
                  </p>
                ) : null}
              </footer>
            </>
          )}
        </section>

        {/* Contact sidebar */}
        <aside className="hidden min-h-0 flex-col border-l border-slate-200 bg-white lg:flex">
          {!detail.data?.contact ? (
            <div className="flex flex-1 items-center justify-center p-4">
              <EmptyState title="Contact details" description="Select a thread" />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800 text-lg font-semibold text-zinc-800">
                  {(
                    detail.data.contact.displayName ||
                    detail.data.contact.phoneNumber ||
                    '?'
                  )
                    .slice(0, 1)
                    .toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-slate-900">
                    {detail.data.contact.displayName || 'Unnamed'}
                  </div>
                  <div className="font-mono text-xs text-slate-500">
                    {detail.data.contact.phoneNumber || '—'}
                  </div>
                </div>
              </div>

              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs uppercase text-slate-400">Email</dt>
                  <dd>{detail.data.contact.email || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-400">Company</dt>
                  <dd>{detail.data.contact.company || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-slate-400">Assignee</dt>
                  <dd className="flex items-center gap-1">
                    <CircleDot className="h-3 w-3 text-slate-400" />
                    {detail.data.assignedToUserId === user?.id
                      ? 'You'
                      : detail.data.assignedToUserId || 'Unassigned'}
                  </dd>
                </div>
              </dl>

              <div className="mt-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
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
                        title="Remove tag"
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

              <div className="mt-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Notes
                </div>
                <div className="mb-2 space-y-2">
                  {(detail.data.contact.notes || []).length === 0 ? (
                    <p className="text-xs text-slate-400">No notes yet</p>
                  ) : (
                    (detail.data.contact.notes || []).map((n) => (
                      <div
                        key={n.id}
                        className="rounded-md border border-slate-100 bg-slate-50 px-2 py-1.5 text-xs text-slate-700"
                      >
                        {n.noteText}
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
        </aside>
      </div>
    </div>
  );
}
