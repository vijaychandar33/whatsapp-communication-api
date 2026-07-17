import { useMemo } from 'react';
import { useAuth } from './useAuth';
import {
  WorkspaceCapability,
  WorkspaceRole,
  hasCapability,
  highestRole,
} from '../lib/roles';

export function useCan() {
  const { user } = useAuth();
  const roles = user?.roles;
  const workspaceRole =
    (user as { workspaceRole?: WorkspaceRole } | null)?.workspaceRole ||
    highestRole(roles);

  return useMemo(
    () => ({
      role: workspaceRole,
      can: (capability: WorkspaceCapability) =>
        hasCapability(roles, capability),
      canManageMembers: hasCapability(roles, 'members'),
      canManageApiKeys: hasCapability(roles, 'api_keys'),
      canEditSettings: hasCapability(roles, 'settings'),
      canSendMessages: hasCapability(roles, 'messaging_write'),
      canAccessWorkspace: hasCapability(roles, 'workspace'),
      isOwner: workspaceRole === 'owner',
      isSystem: user?.organization?.type === 'SYSTEM',
    }),
    [roles, workspaceRole, user?.organization?.type],
  );
}
