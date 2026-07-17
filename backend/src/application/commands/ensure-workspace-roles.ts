import { Prisma } from '@prisma/client';
import {
  ROLE_DESCRIPTIONS,
  WORKSPACE_ROLES,
  WorkspaceRole,
} from '../../domain/auth/workspace-roles';

type Tx = Prisma.TransactionClient;

const ROLE_PERMISSION_CODES: Record<WorkspaceRole, string[] | 'ALL'> = {
  owner: 'ALL',
  admin: 'ALL',
  agent: [
    'messages:read',
    'messages:write',
    'accounts:read',
    'contacts:read',
    'webhooks:read',
  ],
  viewer: [
    'messages:read',
    'accounts:read',
    'orgs:read',
    'users:read',
    'webhooks:read',
  ],
};

/**
 * Ensures owner/admin/agent/viewer roles exist for an org and attaches permissions.
 * Returns a map of role name → role id.
 */
export async function ensureWorkspaceRoles(
  tx: Tx,
  organizationId: string,
  generateId: () => string,
): Promise<Record<WorkspaceRole, string>> {
  const permissions = await tx.permission.findMany();
  const byCode = new Map(permissions.map((p) => [p.code, p.id]));
  const result = {} as Record<WorkspaceRole, string>;

  for (const name of WORKSPACE_ROLES) {
    let role = await tx.role.findFirst({
      where: { organizationId, name, deletedAt: null },
    });
    if (!role) {
      role = await tx.role.create({
        data: {
          id: generateId(),
          organizationId,
          name,
          description: ROLE_DESCRIPTIONS[name],
          isSystem: true,
        },
      });
    }
    result[name] = role.id;

    const codes = ROLE_PERMISSION_CODES[name];
    const permissionIds =
      codes === 'ALL'
        ? permissions.map((p) => p.id)
        : codes.map((c) => byCode.get(c)).filter((id): id is string => Boolean(id));

    for (const permissionId of permissionIds) {
      await tx.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId },
        },
        create: { roleId: role.id, permissionId },
        update: {},
      });
    }
  }

  return result;
}
