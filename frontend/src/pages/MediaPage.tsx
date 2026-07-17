import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../lib/api';
import { listErrorMessage, usePaginatedList } from '../hooks/usePaginatedList';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/Table';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState } from '../components/ui/EmptyState';
import { formatDate, truncate } from '../lib/utils';

type MediaItem = {
  id: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  storageUrl?: string;
  createdAt?: string;
};

function formatBytes(n?: number): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId || '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const list = usePaginatedList<MediaItem>({
    queryKey: ['media', orgId],
    path: '/admin/v1/media',
    page,
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const { data } = await api.post('/admin/v1/media/upload', form, {
        params: { organizationId: orgId },
      });
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['media'] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/v1/media/${id}`, {
        params: { organizationId: orgId },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['media'] });
    },
  });

  const items = (list.data?.items || []).filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      m.fileName?.toLowerCase().includes(q) ||
      m.mimeType?.toLowerCase().includes(q) ||
      m.id.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Media"
        description="Uploaded assets referenced by messages and templates."
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) upload.mutate(file);
                e.target.value = '';
              }}
            />
            <Button
              loading={upload.isPending}
              onClick={() => fileRef.current?.click()}
            >
              Upload
            </Button>
          </>
        }
      />

      {upload.isError ? (
        <p className="mb-3 text-sm text-red-600">{getErrorMessage(upload.error)}</p>
      ) : null}

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
                <TH />
              </TR>
            </THead>
            <TBody>
              {items.map((row) => (
                <TR key={row.id}>
                  <TD className="font-medium text-slate-900">
                    {row.fileName || row.id.slice(0, 8)}
                  </TD>
                  <TD>{row.mimeType || '—'}</TD>
                  <TD>{formatBytes(row.sizeBytes)}</TD>
                  <TD className="font-mono text-xs">
                    {truncate(row.storageUrl, 48)}
                  </TD>
                  <TD>{formatDate(row.createdAt)}</TD>
                  <TD>
                    <Button
                      variant="secondary"
                      loading={remove.isPending}
                      onClick={() => remove.mutate(row.id)}
                    >
                      Delete
                    </Button>
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
    </div>
  );
}
