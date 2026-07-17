import { useState } from 'react';
import { listErrorMessage, usePaginatedList } from '../hooks/usePaginatedList';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/Table';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge, statusTone } from '../components/ui/Badge';
import { formatDate, truncate } from '../lib/utils';

type Message = {
  id: string;
  status?: string;
  channel?: string;
  type?: string;
  direction?: string;
  to?: string;
  from?: string;
  content?: { body?: string } | string | null;
  createdAt?: string;
  providerMessageId?: string;
};

function contentPreview(content: Message['content']): string {
  if (!content) return '—';
  if (typeof content === 'string') return truncate(content, 60);
  return truncate(content.body, 60);
}

export function MessagesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const list = usePaginatedList<Message>({
    queryKey: ['messages'],
    path: '/admin/v1/messages',
    page,
    params: search ? { search } : undefined,
  });

  const items = (list.data?.items || []).filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.id.toLowerCase().includes(q) ||
      m.to?.toLowerCase().includes(q) ||
      m.from?.toLowerCase().includes(q) ||
      m.status?.toLowerCase().includes(q) ||
      m.providerMessageId?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Outbound and inbound message history with delivery status."
      />

      <Card>
        <CardContent className="border-b border-slate-100 py-4">
          <Input
            placeholder="Search by recipient, status, or id…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </CardContent>

        {list.isError ? (
          <EmptyState title="Could not load messages" description={listErrorMessage(list.error)} />
        ) : list.isLoading ? (
          <EmptyState title="Loading messages…" />
        ) : items.length === 0 ? (
          <EmptyState title="No messages found" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Status</TH>
                <TH>Channel</TH>
                <TH>Type</TH>
                <TH>Direction</TH>
                <TH>To / From</TH>
                <TH>Preview</TH>
                <TH>Created</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((row) => (
                <TR key={row.id}>
                  <TD>
                    {row.status ? (
                      <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    ) : (
                      '—'
                    )}
                  </TD>
                  <TD className="capitalize">{row.channel || '—'}</TD>
                  <TD>{row.type || '—'}</TD>
                  <TD className="capitalize">{row.direction || '—'}</TD>
                  <TD className="font-mono text-xs">{row.to || row.from || '—'}</TD>
                  <TD>{contentPreview(row.content)}</TD>
                  <TD>{formatDate(row.createdAt)}</TD>
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
