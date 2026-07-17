import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { WorkspaceRole, hasMinRole, highestRole } from '../lib/roles';

export function useCan() {
  const { user } = useAuth();
  const roles = user?.roles;
  const workspaceRole =
    (user as { workspaceRole?: WorkspaceRole } | null)?.workspaceRole ||
    highestRole(roles);

  return useMemo(
    () => ({
      role: workspaceRole,
      can: (min: WorkspaceRole) => hasMinRole(roles, min),
      canManageMembers: hasMinRole(roles, 'admin'),
      canEditSettings: hasMinRole(roles, 'admin'),
      canSendMessages: hasMinRole(roles, 'agent'),
      isOwner: workspaceRole === 'owner',
      isSystem: user?.organization?.type === 'SYSTEM',
    }),
    [roles, workspaceRole, user?.organization?.type],
  );
}
