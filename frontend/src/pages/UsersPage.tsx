import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { useCan } from '../hooks/useCan';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { EmptyState } from '../components/ui/EmptyState';
import { Badge } from '../components/ui/Badge';
import { cn, fieldControlClass, fieldLabelClass, formatDate } from '../lib/utils';

type Member = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  workspaceRole?: string | null;
  createdAt?: string;
};

type InviteRole = 'ADMIN' | 'DEVELOPER' | 'STAFF';
type MemberRole = 'admin' | 'developer' | 'staff';

const ROLE_LABELS: Record<MemberRole, string> = {
  admin: 'Admin',
  developer: 'Developer',
  staff: 'Staff',
};

export function UsersPage() {
  const { user } = useAuth();
  const orgId = user?.organizationId;
  const { canManageMembers } = useCan();
  const queryClient = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<InviteRole>('STAFF');
  const [inviteEmail, setInviteEmail] = useState('');

  const members = useQuery({
    queryKey: ['members', orgId],
    enabled: Boolean(orgId),
    queryFn: async () => {
      const { data } = await api.get<{ data: Member[] }>('/admin/v1/users', {
        params: { organizationId: orgId },
      });
      return Array.isArray(data.data) ? data.data : [];
    },
  });

  const invites = useQuery({
    queryKey: ['invitations', orgId],
    enabled: Boolean(orgId) && canManageMembers,
    queryFn: async () => {
      const { data } = await api.get<{
        data: Array<{
          id: string;
          email?: string | null;
          role: string;
          expiresAt: string;
        }>;
      }>('/admin/v1/invitations', { params: { organizationId: orgId } });
      return Array.isArray(data.data) ? data.data : [];
    },
  });

  const changeRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: MemberRole }) => {
      await api.patch(`/admin/v1/users/${id}/role`, { role });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/v1/users/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['members'] });
    },
  });

  const createInvite = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{
        data: { invitePath: string; token: string };
      }>('/admin/v1/invitations', {
        organizationId: orgId,
        email: inviteEmail.trim(),
        role: inviteRole,
      });
      return data.data;
    },
    onSuccess: async (result) => {
      setInviteUrl(`${window.location.origin}${result.invitePath}`);
      setInviteEmail('');
      setInviteRole('STAFF');
      await queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
  });

  const revokeInvite = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/admin/v1/invitations/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
  });

  if (!orgId) {
    return (
      <div>
        <PageHeader title="Users" description="Workspace members and invites." />
        <EmptyState
          title="Organization required"
          description="Sign in with a user that has an organization context."
        />
      </div>
    );
  }

  if (!canManageMembers) {
    return (
      <div>
        <PageHeader title="Users" description="Workspace members and invites." />
        <EmptyState
          title="Owner only"
          description="Only the workspace owner can manage teammates."
        />
      </div>
    );
  }

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail.trim());

  return (
    <div>
      <PageHeader
        title="Users"
        description="Invite teammates and manage workspace roles."
        actions={
          <Button
            onClick={() => {
              setInviteOpen(true);
              setInviteUrl(null);
            }}
          >
            Invite
          </Button>
        }
      />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {members.isError ? (
              <EmptyState
                title="Could not load members"
                description={getErrorMessage(members.error)}
              />
            ) : members.isLoading ? (
              <EmptyState title="Loading members…" />
            ) : !(members.data || []).length ? (
              <EmptyState title="No members yet" />
            ) : (
              (members.data || []).map((m) => (
                <div
                  key={m.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"
                >
                  <div>
                    <div className="font-medium text-zinc-900 dark:text-zinc-100">
                      {[m.firstName, m.lastName].filter(Boolean).join(' ') ||
                        m.email}
                    </div>
                    <div className="text-xs text-zinc-500">{m.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.workspaceRole !== 'owner' ? (
                      <select
                        className={cn(fieldControlClass, 'h-8 w-auto px-2 text-xs')}
                        value={
                          m.workspaceRole === 'admin' ||
                          m.workspaceRole === 'developer' ||
                          m.workspaceRole === 'staff'
                            ? m.workspaceRole
                            : 'staff'
                        }
                        onChange={(e) =>
                          changeRole.mutate({
                            id: m.id,
                            role: e.target.value as MemberRole,
                          })
                        }
                      >
                        <option value="admin">Admin</option>
                        <option value="developer">Developer</option>
                        <option value="staff">Staff</option>
                      </select>
                    ) : (
                      <Badge>Owner</Badge>
                    )}
                    {m.workspaceRole !== 'owner' ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => remove.mutate(m.id)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Pending invites</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(invites.data || []).length === 0 ? (
              <EmptyState title="No pending invites" />
            ) : (
              (invites.data || []).map((i) => (
                <div
                  key={i.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700"
                >
                  <div>
                    {i.email} · {i.role} · expires {formatDate(i.expiresAt)}
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => revokeInvite.mutate(i.id)}
                  >
                    Revoke
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Modal
        open={inviteOpen}
        title="Invite teammate"
        onClose={() => {
          setInviteOpen(false);
          setInviteUrl(null);
        }}
        footer={
          inviteUrl ? (
            <Button
              onClick={() => {
                setInviteOpen(false);
                setInviteUrl(null);
              }}
            >
              Done
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button
                loading={createInvite.isPending}
                disabled={!emailOk}
                onClick={() => createInvite.mutate()}
              >
                Create invite link
              </Button>
            </>
          )
        }
      >
        {inviteUrl ? (
          <div className="space-y-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Copy this link now — it will not be shown again.
            </p>
            <code className="block break-all rounded bg-zinc-50 p-2 text-xs dark:bg-zinc-800">
              {inviteUrl}
            </code>
          </div>
        ) : (
          <div className="space-y-3">
            <Input
              label="Email"
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@company.com"
            />
            <label className="block space-y-1.5">
              <span className={fieldLabelClass}>Role</span>
              <select
                className={cn(fieldControlClass, 'h-10 px-3')}
                value={inviteRole}
                onChange={(e) =>
                  setInviteRole(e.target.value as InviteRole)
                }
              >
                <option value="ADMIN">Admin — all access except users</option>
                <option value="DEVELOPER">Developer — API keys only</option>
                <option value="STAFF">Staff — messaging only</option>
              </select>
            </label>
            <p className="text-xs text-zinc-500">
              Owner is not invitable here — ownership is transferred separately.
              Roles: Admin ({ROLE_LABELS.admin}), Developer, Staff.
            </p>
            {createInvite.isError ? (
              <p className="text-sm text-red-600">
                {getErrorMessage(createInvite.error)}
              </p>
            ) : null}
          </div>
        )}
      </Modal>
    </div>
  );
}
