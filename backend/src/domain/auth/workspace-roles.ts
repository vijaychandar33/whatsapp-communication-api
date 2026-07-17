/** Fixed workspace roles (wacrm-parity). Rank higher = more power. */
export const WORKSPACE_ROLES = ['owner', 'admin', 'agent', 'viewer'] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const ROLE_RANK: Record<WorkspaceRole, number> = {
  owner: 4,
  admin: 3,
  agent: 2,
  viewer: 1,
};

export const ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  owner: 'Full ownership — members, settings, billing transfer',
  admin: 'Manage members and workspace settings',
  agent: 'Operational access — messaging and contacts',
  viewer: 'Read-only access',
};

export function normalizeRoleName(name: string): string {
  return name.trim().toLowerCase();
}

export function asWorkspaceRole(name: string | undefined | null): WorkspaceRole | null {
  if (!name) return null;
  const n = normalizeRoleName(name);
  return (WORKSPACE_ROLES as readonly string[]).includes(n)
    ? (n as WorkspaceRole)
    : null;
}

/** Highest workspace role from a list of role names (includes legacy "admin" → admin). */
export function highestRole(roleNames: string[]): WorkspaceRole | null {
  let best: WorkspaceRole | null = null;
  for (const raw of roleNames) {
    const mapped =
      asWorkspaceRole(raw) ??
      (normalizeRoleName(raw) === 'admin' ? ('admin' as WorkspaceRole) : null);
    if (!mapped) continue;
    if (!best || ROLE_RANK[mapped] > ROLE_RANK[best]) best = mapped;
  }
  return best;
}

export function hasMinRole(
  roleNames: string[],
  min: WorkspaceRole,
): boolean {
  const current = highestRole(roleNames);
  if (!current) return false;
  return ROLE_RANK[current] >= ROLE_RANK[min];
}

export function inviteRoleToWorkspace(
  role: 'ADMIN' | 'AGENT' | 'VIEWER' | string,
): Exclude<WorkspaceRole, 'owner'> {
  const n = normalizeRoleName(String(role));
  if (n === 'admin') return 'admin';
  if (n === 'viewer') return 'viewer';
  return 'agent';
}
