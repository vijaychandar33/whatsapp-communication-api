import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  Check,
  CheckCheck,
  Clock,
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
import { MessageDiagnosticsModal } from '../components/messages/MessageDiagnosticsModal';
import { cn, formatDate } from '../lib/utils';

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
  lastCustomerMessageAt?: string | null;
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
  content?: {
    body?: string;
    templateName?: string;
    templateLanguage?: string;
    [key: string]: unknown;
  } | null;
};

type Template = {
  id: string;
  name?: string;
  language?: string;
  status?: string;
  body?: string | null;
  category?: string;
};

type ConversationDetail = Conversation & {
  messages?: Message[];
  sessionOpen?: boolean;
  sessionExpiresAt?: string | null;
};

type StatusFilter = '' | 'OPEN' | 'PENDING' | 'CLOSED' | 'ARCHIVED';

const SESSION_MS = 24 * 60 * 60 * 1000;

const WA_CHAT_BG =
  'bg-[#e5ddd5] dark:bg-[#0b141a] [background-image:url("data:image/svg+xml,%3Csvg width=%2760%27 height=%2760%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cpath d=%27M30 5c2 8-4 12-8 14 6 1 10 7 8 14-6-3-14-1-16 5 1-7-5-12-12-12 7-2 11-8 10-15 6 4 13 2 18-6z%27 fill=%27%23d4cbc3%27 fill-opacity=%27.35%27/%3E%3C/svg%3E")] dark:[background-image:none]';

function sessionFromLastCustomer(lastCustomerMessageAt?: string | null) {
  if (!lastCustomerMessageAt) {
    return { open: false, expiresAt: null as Date | null, remainingMs: 0 };
  }
  const expiresAt = new Date(
    new Date(lastCustomerMessageAt).getTime() + SESSION_MS,
  );
  const remainingMs = expiresAt.getTime() - Date.now();
  return {
    open: remainingMs > 0,
    expiresAt,
    remainingMs: Math.max(0, remainingMs),
  };
}

function formatRemaining(ms: number) {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h <= 0) return `${m}m left`;
  return `${h}h ${m}m left`;
}

function formatBubbleTime(iso?: string) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function messageBubbleText(m: Message): string {
  if (m.body?.trim()) return m.body;
  const content = m.content;
  if (content && typeof content === 'object') {
    if (typeof content.body === 'string' && content.body.trim()) {
      return content.body;
    }
    if (typeof content.templateName === 'string' && content.templateName) {
      return content.templateName;
    }
  }
  if ((m.messageType || '').toUpperCase() === 'TEMPLATE') {
    return 'Template message';
  }
  return m.messageType ? `[${m.messageType}]` : '—';
}

function MessageTicks({ status }: { status?: string }) {
  const s = (status || '').toUpperCase();
  if (s === 'READ') {
    return <CheckCheck className="h-3.5 w-3.5 text-[#53bdeb]" />;
  }
  if (s === 'DELIVERED') {
    return <CheckCheck className="h-3.5 w-3.5 text-[#667781]" />;
  }
  if (s === 'SENT') {
    return <Check className="h-3.5 w-3.5 text-[#667781]" />;
  }
  if (s === 'QUEUED' || s === 'PENDING') {
    return <Clock className="h-3 w-3 text-[#667781]" />;
  }
  if (s === 'FAILED') {
    return <span className="text-[10px] text-red-500">!</span>;
  }
  return <Check className="h-3.5 w-3.5 text-[#667781]" />;
}

export function ConversationsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [composerMode, setComposerMode] = useState<'text' | 'template'>('text');
  const [diagnosticMessageId, setDiagnosticMessageId] = useState<string | null>(
    null,
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const conversationIdFromUrl = searchParams.get('conversationId');

  useEffect(() => {
    if (conversationIdFromUrl && conversationIdFromUrl !== selectedId) {
      setSelectedId(conversationIdFromUrl);
    }
  }, [conversationIdFromUrl, selectedId]);

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
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data } = await api.get<{ data: ConversationDetail }>(
        `/admin/v1/conversations/${selectedId}`,
        { params: { organizationId: orgId } },
      );
      return data.data;
    },
  });

  const accountId =
    detail.data?.communicationAccountId ||
    detail.data?.communicationAccount?.id ||
    '';

  const templates = useQuery({
    queryKey: ['templates', 'inbox', orgId, accountId],
    enabled: Boolean(orgId && selectedId && accountId),
    queryFn: async () => {
      const { data } = await api.get<{
        data: Template[];
      }>('/admin/v1/templates', {
        params: {
          organizationId: orgId,
          limit: 100,
          communicationAccountId: accountId,
        },
      });
      return (Array.isArray(data.data) ? data.data : []).filter(
        (t) => (t.status || '').toUpperCase() === 'APPROVED',
      );
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

  const session = useMemo(() => {
    if (detail.data?.sessionOpen != null) {
      const expiresAt = detail.data.sessionExpiresAt
        ? new Date(detail.data.sessionExpiresAt)
        : null;
      const remainingMs = expiresAt
        ? Math.max(0, expiresAt.getTime() - Date.now())
        : 0;
      return {
        open: Boolean(detail.data.sessionOpen) && remainingMs > 0,
        expiresAt,
        remainingMs,
      };
    }
    return sessionFromLastCustomer(detail.data?.lastCustomerMessageAt);
  }, [detail.data]);

  useEffect(() => {
    setReply('');
    setNoteText('');
    setTemplateId('');
  }, [selectedId]);

  useEffect(() => {
    if (!session.open) {
      setComposerMode('template');
      setReply('');
    } else if (composerMode === 'template' && !templateId) {
      // keep template mode if user chose it; otherwise allow text
    }
  }, [session.open, selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [detail.data?.messages?.length, selectedId]);

  const markRead = async (conversationId: string) => {
    if (!orgId || !conversationId) return;
    queryClient.setQueriesData(
      { queryKey: ['conversations', orgId] },
      (old: unknown) => {
        if (!old || typeof old !== 'object') return old;
        const data = old as {
          items?: Conversation[];
          meta?: unknown;
        };
        if (!Array.isArray(data.items)) return old;
        return {
          ...data,
          items: data.items.map((c) =>
            c.id === conversationId ? { ...c, unreadCount: 0 } : c,
          ),
        };
      },
    );
    try {
      await api.post(
        `/admin/v1/conversations/${conversationId}/read`,
        {},
        { params: { organizationId: orgId } },
      );
    } catch {
      // GET detail also zeroes unread server-side
    }
  };

  const selectConversation = (row: Conversation) => {
    setSelectedId(row.id);
    setSearchParams({ conversationId: row.id }, { replace: true });
    void markRead(row.id);
  };

  useEffect(() => {
    if (!selectedId || !orgId) return;
    void markRead(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, orgId]);

  // After detail loads, list may still show stale unread — sync from server read side-effect
  useEffect(() => {
    if (!selectedId || !detail.data) return;
    if ((detail.data.unreadCount || 0) === 0) {
      queryClient.setQueriesData(
        { queryKey: ['conversations', orgId] },
        (old: unknown) => {
          if (!old || typeof old !== 'object') return old;
          const data = old as { items?: Conversation[] };
          if (!Array.isArray(data.items)) return old;
          return {
            ...data,
            items: data.items.map((c) =>
              c.id === selectedId ? { ...c, unreadCount: 0 } : c,
            ),
          };
        },
      );
    }
  }, [selectedId, detail.data, orgId, queryClient]);

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
      const accId =
        conv.communicationAccountId || conv.communicationAccount?.id;
      if (!accId) throw new Error('No communication account on conversation');

      const useTemplate = !session.open || composerMode === 'template';
      const selectedTemplate = (templates.data || []).find(
        (t) => t.id === templateId,
      );

      if (useTemplate) {
        if (!selectedTemplate?.name) {
          throw new Error('Pick an approved template');
        }
        await api.post(
          '/admin/v1/messages',
          {
            communicationAccountId: accId,
            to,
            messageType: 'TEMPLATE',
            templateName: selectedTemplate.name,
            templateLanguage: selectedTemplate.language || 'en',
            body: selectedTemplate.body || undefined,
            conversationId: conv.id,
            contactId: conv.contactId,
          },
          { params: { organizationId: orgId } },
        );
        return;
      }

      if (!reply.trim()) throw new Error('Type a reply');
      await api.post(
        '/admin/v1/messages',
        {
          communicationAccountId: accId,
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
      setComposerMode('text');
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

  const canSendText = session.open && composerMode === 'text';
  const canSend =
    canSendText
      ? Boolean(reply.trim())
      : Boolean(templateId);

  return (
    <div className="-mx-4 -my-6 flex h-[calc(100vh-3.5rem)] flex-col bg-[#f0f2f5] dark:bg-zinc-950 sm:-mx-6 lg:-mx-8 lg:h-screen">
      <div className="flex items-center justify-between border-b border-[#d1d7db] bg-[#f0f2f5] px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <h1 className="text-base font-semibold text-[#111b21] dark:text-zinc-100">
            Inbox
          </h1>
          <p className="text-xs text-[#667781]">WhatsApp conversations</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-[#667781]">
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
            className="rounded-lg border-0 bg-white px-2 py-1.5 text-xs shadow-sm dark:bg-zinc-800"
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

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)_300px]">
        {/* Thread list — WhatsApp sidebar */}
        <aside className="flex min-h-0 flex-col border-r border-[#d1d7db] bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="bg-[#f0f2f5] p-2 dark:bg-zinc-900">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#54656f]" />
              <input
                className="w-full rounded-lg border-0 bg-white py-2 pl-9 pr-3 text-sm text-[#111b21] outline-none ring-0 dark:bg-zinc-800 dark:text-zinc-100"
                placeholder="Search or start new chat"
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
                const unread = Math.max(0, row.unreadCount || 0);
                const showUnread = unread > 0 && !active;
                const name =
                  row.contact?.displayName ||
                  row.contact?.phoneNumber ||
                  'Unknown';
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => selectConversation(row)}
                    className={cn(
                      'flex w-full gap-3 border-b border-[#f0f2f5] px-3 py-3 text-left transition dark:border-zinc-800',
                      active
                        ? 'bg-[#f0f2f5] dark:bg-zinc-800'
                        : 'hover:bg-[#f5f6f6] dark:hover:bg-zinc-800/60',
                    )}
                  >
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#dfe5e7] text-base font-semibold text-[#54656f] dark:bg-zinc-700 dark:text-zinc-200">
                      {name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span
                          className={cn(
                            'truncate text-[15px] text-[#111b21] dark:text-zinc-100',
                            showUnread ? 'font-semibold' : 'font-normal',
                          )}
                        >
                          {row.isPinned ? '📌 ' : ''}
                          {name}
                        </span>
                        <span
                          className={cn(
                            'ml-auto shrink-0 text-[11px]',
                            showUnread ? 'text-[#25d366]' : 'text-[#667781]',
                          )}
                        >
                          {formatBubbleTime(row.lastMessageAt) ||
                            formatDate(row.lastMessageAt).split(',')[0]}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <p
                          className={cn(
                            'min-w-0 flex-1 truncate text-[13px]',
                            showUnread
                              ? 'font-medium text-[#3b4a54] dark:text-zinc-200'
                              : 'text-[#667781]',
                          )}
                        >
                          {row.lastMessageText || 'No messages yet'}
                        </p>
                        {showUnread ? (
                          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-[#25d366] px-1.5 text-[11px] font-semibold text-white">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1">
                        <AccountBadge
                          account={row.communicationAccount}
                          className="text-[10px]"
                        />
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {(list.data?.meta.totalPages || 1) > 1 ? (
            <div className="flex items-center justify-between border-t border-[#e9edef] px-3 py-2 text-xs dark:border-zinc-800">
              <button
                type="button"
                className="text-[#008069] disabled:opacity-40"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </button>
              <span className="text-[#667781]">
                {page}/{list.data?.meta.totalPages || 1}
              </span>
              <button
                type="button"
                className="text-[#008069] disabled:opacity-40"
                disabled={page >= (list.data?.meta.totalPages || 1)}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          ) : null}
        </aside>

        {/* Chat pane */}
        <section className="flex min-h-0 flex-col bg-white dark:bg-zinc-950">
          {!selectedId ? (
            <div
              className={cn(
                'flex flex-1 flex-col items-center justify-center',
                WA_CHAT_BG,
              )}
            >
              <div className="max-w-sm rounded-lg bg-white/90 px-6 py-8 text-center shadow-sm dark:bg-zinc-900/90">
                <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#25d366]/text-white">
                  <Send className="h-6 w-6" />
                </div>
                <p className="text-lg font-medium text-[#41525d] dark:text-zinc-200">
                  WhatsApp Inbox
                </p>
                <p className="mt-1 text-sm text-[#667781]">
                  Select a conversation to start messaging
                </p>
              </div>
            </div>
          ) : detail.isLoading ? (
            <EmptyState title="Loading chat…" />
          ) : detail.isError ? (
            <EmptyState
              title="Could not load conversation"
              description={getErrorMessage(detail.error)}
            />
          ) : (
            <>
              <header className="flex flex-wrap items-center gap-2 border-b border-[#d1d7db] bg-[#f0f2f5] px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#dfe5e7] text-sm font-semibold text-[#54656f] dark:bg-zinc-700">
                  {(
                    detail.data?.contact?.displayName ||
                    detail.data?.contact?.phoneNumber ||
                    '?'
                  )
                    .slice(0, 1)
                    .toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-medium text-[#111b21] dark:text-zinc-100">
                    {detail.data?.contact?.displayName ||
                      detail.data?.contact?.phoneNumber ||
                      'Conversation'}
                  </div>
                  <div className="truncate text-xs text-[#667781]">
                    {detail.data?.contact?.phoneNumber || '—'} ·{' '}
                    {formatAccountLabel(detail.data?.communicationAccount)}
                  </div>
                </div>
                <select
                  className="rounded-lg border-0 bg-white px-2 py-1.5 text-xs shadow-sm dark:bg-zinc-800"
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
                  size="sm"
                  loading={assign.isPending}
                  onClick={() => assign.mutate()}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
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
                  size="sm"
                  loading={archive.isPending}
                  onClick={() => archive.mutate()}
                >
                  <Archive className="h-3.5 w-3.5" />
                </Button>
              </header>

              {session.open ? (
                <div className="flex items-center justify-center gap-2 bg-[#fff7d9] px-3 py-1.5 text-center text-[12px] text-[#54656f] dark:bg-amber-950/40 dark:text-amber-200">
                  <Clock className="h-3.5 w-3.5" />
                  Customer service window open ·{' '}
                  {formatRemaining(session.remainingMs)}
                </div>
              ) : (
                <div className="bg-[#ffe6e6] px-3 py-1.5 text-center text-[12px] text-[#9a3b3b] dark:bg-red-950/40 dark:text-red-200">
                  24-hour window closed — only approved templates can be sent
                  until the customer replies
                </div>
              )}

              {detail.data?.aiAutoreplyDisabled ||
              detail.data?.aiHandoffSummary ? (
                <div className="flex flex-wrap items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-1.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
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
                <div className="flex justify-end bg-transparent px-3 py-1">
                  <button
                    type="button"
                    className="text-[11px] text-[#008069] hover:underline"
                    onClick={() => toggleAi.mutate(true)}
                  >
                    Take over (pause AI)
                  </button>
                </div>
              )}

              <div
                className={cn(
                  'min-h-0 flex-1 space-y-1 overflow-y-auto px-4 py-3',
                  WA_CHAT_BG,
                )}
              >
                {messages.length === 0 ? (
                  <p className="text-center text-sm text-[#667781]">
                    No messages yet.
                  </p>
                ) : (
                  messages.map((m) => {
                    const outbound = m.direction === 'OUTBOUND';
                    return (
                      <div
                        key={m.id}
                        className={cn(
                          'flex',
                          outbound ? 'justify-end' : 'justify-start',
                        )}
                      >
                        <div
                          className={cn(
                            'relative max-w-[min(75%,28rem)] rounded-lg px-2.5 pb-1 pt-1.5 text-[14.2px] leading-[19px] shadow-sm',
                            outbound
                              ? 'rounded-tr-none bg-[#d9fdd3] text-[#111b21] dark:bg-[#005c4b] dark:text-zinc-100'
                              : 'rounded-tl-none bg-white text-[#111b21] dark:bg-[#202c33] dark:text-zinc-100',
                          )}
                        >
                          <div className="whitespace-pre-wrap break-words pr-1">
                            {(m.messageType || '').toUpperCase() ===
                            'TEMPLATE' ? (
                              <div>
                                <div className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-[#667781] dark:text-zinc-400">
                                  Template
                                  {typeof m.content?.templateName === 'string'
                                    ? ` · ${m.content.templateName}`
                                    : ''}
                                </div>
                                <div>{messageBubbleText(m)}</div>
                              </div>
                            ) : (
                              messageBubbleText(m)
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center justify-end gap-1 pl-8">
                            {m.aiGenerated ? (
                              <span className="text-[10px] text-[#667781]">
                                AI
                              </span>
                            ) : null}
                            <span className="text-[11px] text-[#667781] dark:text-zinc-400">
                              {formatBubbleTime(m.createdAt)}
                            </span>
                            {outbound ? (
                              <button
                                type="button"
                                className="rounded p-0.5 hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-[#00a884]"
                                title="View delivery details"
                                aria-label={`View ${m.status || 'message'} delivery details`}
                                onClick={() => setDiagnosticMessageId(m.id)}
                              >
                                <MessageTicks status={m.status} />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <footer className="border-t border-[#d1d7db] bg-[#f0f2f5] px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                {session.open ? (
                  <div className="mb-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium',
                        composerMode === 'text'
                          ? 'bg-[#008069] text-white'
                          : 'bg-white text-[#54656f] dark:bg-zinc-800 dark:text-zinc-300',
                      )}
                      onClick={() => {
                        setComposerMode('text');
                        setTemplateId('');
                      }}
                    >
                      Reply
                    </button>
                    <button
                      type="button"
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium',
                        composerMode === 'template'
                          ? 'bg-[#008069] text-white'
                          : 'bg-white text-[#54656f] dark:bg-zinc-800 dark:text-zinc-300',
                      )}
                      onClick={() => setComposerMode('template')}
                    >
                      Template
                    </button>
                    {composerMode === 'text' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        loading={draftAi.isPending}
                        disabled={!selectedId}
                        onClick={() => draftAi.mutate()}
                      >
                        <Sparkles className="mr-1 h-3.5 w-3.5" />
                        Draft with AI
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex items-end gap-2">
                  {!canSendText ? (
                    <select
                      className="min-h-10 min-w-0 flex-1 rounded-lg border-0 bg-white px-3 py-2.5 text-sm shadow-sm outline-none dark:bg-zinc-800"
                      value={templateId}
                      onChange={(e) => setTemplateId(e.target.value)}
                    >
                      <option value="">
                        {(templates.data || []).length
                          ? 'Choose approved template…'
                          : 'No approved templates for this number'}
                      </option>
                      {(templates.data || []).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.language || 'en'})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <textarea
                      className="max-h-32 min-h-10 min-w-0 flex-1 resize-y rounded-lg border-0 bg-white px-3 py-2.5 text-sm text-[#111b21] shadow-sm outline-none dark:bg-zinc-800 dark:text-zinc-100"
                      rows={1}
                      placeholder="Type a message"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && canSend) {
                          e.preventDefault();
                          sendReply.mutate();
                        }
                      }}
                    />
                  )}
                  <button
                    type="button"
                    disabled={!canSend || sendReply.isPending}
                    onClick={() => sendReply.mutate()}
                    className={cn(
                      'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition',
                      canSend
                        ? 'bg-[#008069] hover:bg-[#017561]'
                        : 'cursor-not-allowed bg-[#8696a0]',
                    )}
                  >
                    <Send className="h-4 w-4" />
                  </button>
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
        <aside className="hidden min-h-0 flex-col border-l border-[#d1d7db] bg-white dark:border-zinc-800 dark:bg-zinc-900 lg:flex">
          {!detail.data?.contact ? (
            <div className="flex flex-1 items-center justify-center p-4">
              <EmptyState
                title="Contact details"
                description="Select a thread"
              />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#dfe5e7] text-xl font-semibold text-[#54656f] dark:bg-zinc-700">
                  {(
                    detail.data.contact.displayName ||
                    detail.data.contact.phoneNumber ||
                    '?'
                  )
                    .slice(0, 1)
                    .toUpperCase()}
                </div>
                <div>
                  <div className="font-semibold text-[#111b21] dark:text-zinc-100">
                    {detail.data.contact.displayName || 'Unnamed'}
                  </div>
                  <div className="font-mono text-xs text-[#667781]">
                    {detail.data.contact.phoneNumber || '—'}
                  </div>
                </div>
              </div>

              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs uppercase text-[#8696a0]">Email</dt>
                  <dd>{detail.data.contact.email || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-[#8696a0]">Company</dt>
                  <dd>{detail.data.contact.company || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase text-[#8696a0]">Assignee</dt>
                  <dd className="flex items-center gap-1">
                    <CircleDot className="h-3 w-3 text-[#8696a0]" />
                    {detail.data.assignedToUserId === user?.id
                      ? 'You'
                      : detail.data.assignedToUserId || 'Unassigned'}
                  </dd>
                </div>
              </dl>

              <div className="mt-5">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8696a0]">
                  Tags
                </div>
                <div className="mb-2 flex flex-wrap gap-1">
                  {contactTags.length === 0 ? (
                    <span className="text-xs text-[#8696a0]">No tags</span>
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
                    className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800"
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
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#8696a0]">
                  Notes
                </div>
                <div className="mb-2 space-y-2">
                  {(detail.data.contact.notes || []).length === 0 ? (
                    <p className="text-xs text-[#8696a0]">No notes</p>
                  ) : (
                    (detail.data.contact.notes || []).map((n) => (
                      <div
                        key={n.id}
                        className="rounded-md bg-[#f0f2f5] px-2 py-1.5 text-xs dark:bg-zinc-800"
                      >
                        <div>{n.noteText}</div>
                        <div className="mt-0.5 text-[10px] text-[#8696a0]">
                          {formatDate(n.createdAt)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <Input
                  placeholder="Add a note…"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                />
                <Button
                  className="mt-2"
                  variant="secondary"
                  disabled={!noteText.trim()}
                  loading={addNote.isPending}
                  onClick={() => addNote.mutate()}
                >
                  Save note
                </Button>
              </div>
            </div>
          )}
        </aside>
      </div>
      <MessageDiagnosticsModal
        messageId={diagnosticMessageId}
        organizationId={orgId}
        onClose={() => setDiagnosticMessageId(null)}
      />
    </div>
  );
}
