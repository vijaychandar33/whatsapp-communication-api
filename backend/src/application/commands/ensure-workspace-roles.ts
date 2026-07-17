import { Prisma } from '@prisma/client';
import {
  ROLE_DESCRIPTIONS,
  WORKSPACE_ROLES,
  WorkspaceRole,
} from '../../domain/auth/workspace-roles';

type Tx = Prisma.TransactionClient;

const ROLE_PERMISSION_CODES: Record<WorkspaceRole, string[] | 'ALL' | 'ALL_EXCEPT'> = {
  owner: 'ALL',
  admin: 'ALL_EXCEPT',
  developer: ['api_keys:read', 'api_keys:write'],
  staff: [
    'messages:read',
    'messages:write',
    'accounts:read',
    'webhooks:read',
  ],
};

const ADMIN_EXCLUDED = new Set([
  'users:read',
  'users:write',
  'roles:read',
  'roles:write',
]);

/**
 * Ensures owner/admin/developer/staff roles exist for an org and attaches permissions.
 * Also remaps legacy agent/viewer role assignments onto staff.
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
    } else if (role.description !== ROLE_DESCRIPTIONS[name]) {
      role = await tx.role.update({
        where: { id: role.id },
        data: { description: ROLE_DESCRIPTIONS[name] },
      });
    }
    result[name] = role.id;

    const codes = ROLE_PERMISSION_CODES[name];
    let permissionIds: string[];
    if (codes === 'ALL') {
      permissionIds = permissions.map((p) => p.id);
    } else if (codes === 'ALL_EXCEPT') {
      permissionIds = permissions
        .filter((p) => !ADMIN_EXCLUDED.has(p.code))
        .map((p) => p.id);
    } else {
      permissionIds = codes
        .map((c) => byCode.get(c))
        .filter((id): id is string => Boolean(id));
    }

    // Replace permission set so admin loses user/role perms on re-ensure.
    await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
    for (const permissionId of permissionIds) {
      await tx.rolePermission.create({
        data: { roleId: role.id, permissionId },
      });
    }
  }

  await migrateLegacyRoles(tx, organizationId, result.staff);

  return result;
}

async function migrateLegacyRoles(
  tx: Tx,
  organizationId: string,
  staffRoleId: string,
) {
  const legacy = await tx.role.findMany({
    where: {
      organizationId,
      name: { in: ['agent', 'viewer'] },
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!legacy.length) return;

  const legacyIds = legacy.map((r) => r.id);
  const assignments = await tx.userRole.findMany({
    where: { roleId: { in: legacyIds } },
    select: { userId: true, roleId: true },
  });

  for (const row of assignments) {
    await tx.userRole.deleteMany({
      where: { userId: row.userId, roleId: row.roleId },
    });
    const alreadyStaff = await tx.userRole.findFirst({
      where: { userId: row.userId, roleId: staffRoleId },
    });
    if (!alreadyStaff) {
      await tx.userRole.create({
        data: { userId: row.userId, roleId: staffRoleId },
      });
    }
  }

  await tx.role.updateMany({
    where: { id: { in: legacyIds } },
    data: { deletedAt: new Date() },
  });
}
