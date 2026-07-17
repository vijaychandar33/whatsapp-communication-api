import { useState } from 'react';
import { listErrorMessage, usePaginatedList } from '../hooks/usePaginatedList';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Table, THead, TBody, TR, TH, TD } from '../components/ui/Table';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState } from '../components/ui/EmptyState';
import { formatDate, truncate } from '../lib/utils';

type AuditEvent = {
  id: string;
  action?: string;
  actorEmail?: string;
  actorId?: string;
  resourceType?: string;
  resourceId?: string;
  ipAddress?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

export function AuditPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const list = usePaginatedList<AuditEvent>({
    queryKey: ['audit'],
    path: '/admin/v1/audit',
    page,
    params: search ? { search } : undefined,
  });

  const items = (list.data?.items || []).filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.action?.toLowerCase().includes(q) ||
      e.actorEmail?.toLowerCase().includes(q) ||
      e.resourceType?.toLowerCase().includes(q) ||
      e.resourceId?.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <PageHeader
        title="Audit"
        description="Security and operational audit trail."
      />

      <Card>
        <CardContent className="border-b border-slate-100 py-4">
          <Input
            placeholder="Search audit events…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </CardContent>

        {list.isError ? (
          <EmptyState title="Could not load audit log" description={listErrorMessage(list.error)} />
        ) : list.isLoading ? (
          <EmptyState title="Loading audit events…" />
        ) : items.length === 0 ? (
          <EmptyState title="No audit events" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Action</TH>
                <TH>Actor</TH>
                <TH>Resource</TH>
                <TH>IP</TH>
              </TR>
            </THead>
            <TBody>
              {items.map((row) => (
                <TR key={row.id}>
                  <TD>{formatDate(row.createdAt)}</TD>
                  <TD className="font-medium text-slate-900">{row.action || '—'}</TD>
                  <TD>{row.actorEmail || row.actorId || '—'}</TD>
                  <TD className="font-mono text-xs">
                    {[row.resourceType, truncate(row.resourceId, 12)]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </TD>
                  <TD className="font-mono text-xs">{row.ipAddress || '—'}</TD>
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
