import { useState } from 'react';
import { listErrorMessage, usePaginatedList } from '../hooks/usePaginatedList';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/Table';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState } from '../components/ui/EmptyState';
import { formatDate, truncate } from '../lib/utils';

type MediaItem = {
  id: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  url?: string;
  createdAt?: string;
};

function formatBytes(n?: number): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const list = usePaginatedList<MediaItem>({
    queryKey: ['media'],
    path: '/admin/v1/media',
    page,
    params: search ? { search } : undefined,
  });

  const items = (list.data?.items || []).filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.filename?.toLowerCase().includes(q) ||
      m.mimeType?.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Media"
        description="Uploaded assets referenced by messages and templates."
      />

      <Card>
        <CardContent className="border-b border-slate-100 py-4">
          <Input
            placeholder="Search media…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </CardContent>

        {list.isError ? (
          <EmptyState title="Could not load media" description={listErrorMessage(list.error)} />
        ) : list.isLoading ? (
          <EmptyState title="Loading media…" />
        ) : items.length === 0 ? (
          <EmptyState title="No media files" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Filename</TH>
                <TH>MIME</TH>
                <TH>Size</TH>
                <TH>URL</TH>
                <TH>Created</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((row) => (
                <TR key={row.id}>
                  <TD className="font-medium text-slate-900">
                    {row.filename || row.id.slice(0, 8)}
                  </TD>
                  <TD>{row.mimeType || '—'}</TD>
                  <TD>{formatBytes(row.sizeBytes)}</TD>
                  <TD className="font-mono text-xs">{truncate(row.url, 48)}</TD>
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
