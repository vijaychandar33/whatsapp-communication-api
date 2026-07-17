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

type Template = {
  id: string;
  name?: string;
  language?: string;
  category?: string;
  status?: string;
  channel?: string;
  createdAt?: string;
};

export function TemplatesPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const list = usePaginatedList<Template>({
    queryKey: ['templates'],
    path: '/admin/v1/templates',
    page,
    params: search ? { search } : undefined,
  });

  const items = (list.data?.items || []).filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.name?.toLowerCase().includes(q) ||
      t.language?.toLowerCase().includes(q) ||
      t.status?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Templates"
        description="Message templates synced from channel providers."
      />

      <Card>
        <CardContent className="border-b border-slate-100 py-4">
          <Input
            placeholder="Search templates…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </CardContent>

        {list.isError ? (
          <EmptyState title="Could not load templates" description={listErrorMessage(list.error)} />
        ) : list.isLoading ? (
          <EmptyState title="Loading templates…" />
        ) : items.length === 0 ? (
          <EmptyState title="No templates found" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Language</TH>
                <TH>Category</TH>
                <TH>Channel</TH>
                <TH>Status</TH>
                <TH>Created</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((row) => (
                <TR key={row.id}>
                  <TD className="font-medium text-slate-900">{row.name || '—'}</TD>
                  <TD>{row.language || '—'}</TD>
                  <TD>{row.category || '—'}</TD>
                  <TD className="capitalize">{row.channel || '—'}</TD>
                  <TD>
                    {row.status ? (
                      <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    ) : (
                      '—'
                    )}
                  </TD>
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
