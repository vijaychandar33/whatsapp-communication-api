import { useState } from 'react';
import { listErrorMessage, usePaginatedList } from '../hooks/usePaginatedList';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/Table';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge, statusTone } from '../components/ui/Badge';
import { formatDate } from '../lib/utils';

type Conversation = {
  id: string;
  status?: string;
  channel?: string;
  contactId?: string;
  contact?: { displayName?: string; phoneNumber?: string };
  lastMessageAt?: string;
  createdAt?: string;
  unreadCount?: number;
};

export function ConversationsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const list = usePaginatedList<Conversation>({
    queryKey: ['conversations'],
    path: '/admin/v1/conversations',
    page,
    params: search ? { search } : undefined,
  });

  const items = (list.data?.items || []).filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.id.toLowerCase().includes(q) ||
      c.contact?.displayName?.toLowerCase().includes(q) ||
      c.contact?.phoneNumber?.toLowerCase().includes(q) ||
      c.status?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Conversations"
        description="Inbox threads across connected channels."
      />

      <Card>
        <CardContent className="border-b border-slate-100 py-4">
          <Input
            placeholder="Search conversations…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </CardContent>

        {list.isError ? (
          <EmptyState
            title="Could not load conversations"
            description={listErrorMessage(list.error)}
          />
        ) : list.isLoading ? (
          <EmptyState title="Loading conversations…" />
        ) : items.length === 0 ? (
          <EmptyState title="No conversations yet" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Contact</TH>
                <TH>Channel</TH>
                <TH>Status</TH>
                <TH>Unread</TH>
                <TH>Last activity</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((row) => (
                <TR key={row.id}>
                  <TD>
                    <div className="font-medium text-slate-900">
                      {row.contact?.displayName || row.contactId || '—'}
                    </div>
                    <div className="font-mono text-xs text-slate-500">
                      {row.contact?.phoneNumber || row.id.slice(0, 8)}
                    </div>
                  </TD>
                  <TD className="capitalize">{row.channel || '—'}</TD>
                  <TD>
                    {row.status ? (
                      <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD>{row.unreadCount ?? 0}</TD>
                  <TD>{formatDate(row.lastMessageAt || row.createdAt)}</TD>
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
    </div>
  );
}
