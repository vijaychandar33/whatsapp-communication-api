/** Fixed workspace roles. Capabilities are not a strict ladder (developer ≠ staff). */

export const WORKSPACE_ROLES = [
  'owner',
  'admin',
  'developer',
  'staff',
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Inviteable roles (owner is assigned only via signup / ownership transfer). */
export const INVITEABLE_ROLES = ['admin', 'developer', 'staff'] as const;
export type InviteableWorkspaceRole = (typeof INVITEABLE_ROLES)[number];

export type WorkspaceCapability =
  | 'members'
  | 'settings'
  | 'api_keys'
  | 'workspace'
  | 'messaging_read'
  | 'messaging_write';

export const ROLE_RANK: Record<WorkspaceRole, number> = {
  owner: 4,
  admin: 3,
  developer: 2,
  staff: 1,
};

export const ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  owner: 'Full access including user management',
  admin: 'Full access except user management',
  developer: 'API keys only',
  staff: 'Messaging only',
};

const ROLE_CAPABILITIES: Record<WorkspaceRole, readonly WorkspaceCapability[]> =
  {
    owner: [
      'members',
      'settings',
      'api_keys',
      'workspace',
      'messaging_read',
      'messaging_write',
    ],
    admin: [
      'settings',
      'api_keys',
      'workspace',
      'messaging_read',
      'messaging_write',
    ],
    developer: ['api_keys'],
    staff: ['messaging_read', 'messaging_write'],
  };

/** Legacy role name → current workspace role. */
const LEGACY_ROLE_MAP: Record<string, WorkspaceRole> = {
  agent: 'staff',
  viewer: 'staff',
};

export function normalizeRoleName(name: string): string {
  return name.trim().toLowerCase();
}

export function asWorkspaceRole(
  name: string | undefined | null,
): WorkspaceRole | null {
  if (!name) return null;
  const n = normalizeRoleName(name);
  if ((WORKSPACE_ROLES as readonly string[]).includes(n)) {
    return n as WorkspaceRole;
  }
  return LEGACY_ROLE_MAP[n] ?? null;
}

export function highestRole(roleNames: string[]): WorkspaceRole | null {
  let best: WorkspaceRole | null = null;
  for (const raw of roleNames) {
    const mapped = asWorkspaceRole(raw);
    if (!mapped) continue;
    if (!best || ROLE_RANK[mapped] > ROLE_RANK[best]) best = mapped;
  }
  return best;
}

export function roleHasCapability(
  role: WorkspaceRole | null | undefined,
  capability: WorkspaceCapability,
): boolean {
  if (!role) return false;
  return ROLE_CAPABILITIES[role].includes(capability);
}

export function hasCapability(
  roleNames: string[] | undefined,
  capability: WorkspaceCapability,
): boolean {
  return roleHasCapability(highestRole(roleNames ?? []), capability);
}

/** @deprecated Prefer hasCapability — kept for gradual migration of rank checks. */
export function hasMinRole(
  roleNames: string[],
  min: WorkspaceRole,
): boolean {
  const current = highestRole(roleNames);
  if (!current) return false;
  // Non-hierarchical peers: developer/staff never satisfy each other via rank.
  if (
    (min === 'developer' && current === 'staff') ||
    (min === 'staff' && current === 'developer')
  ) {
    return false;
  }
  return ROLE_RANK[current] >= ROLE_RANK[min];
}

export function inviteRoleToWorkspace(
  role: string,
): InviteableWorkspaceRole {
  const n = normalizeRoleName(String(role));
  if (n === 'admin') return 'admin';
  if (n === 'developer') return 'developer';
  if (n === 'staff' || n === 'agent' || n === 'viewer') return 'staff';
  return 'staff';
}

export function invitationEnumToWorkspace(
  role: string,
): InviteableWorkspaceRole {
  return inviteRoleToWorkspace(role);
}
