export type WorkspaceRole = 'owner' | 'admin' | 'agent' | 'viewer';

const RANK: Record<WorkspaceRole, number> = {
  owner: 4,
  admin: 3,
  agent: 2,
  viewer: 1,
};

export function highestRole(roles?: string[]): WorkspaceRole | null {
  if (!roles?.length) return null;
  let best: WorkspaceRole | null = null;
  for (const raw of roles) {
    const n = raw.toLowerCase();
    const mapped =
      n === 'owner' || n === 'admin' || n === 'agent' || n === 'viewer'
        ? (n as WorkspaceRole)
        : n === 'admin'
          ? 'admin'
          : null;
    if (!mapped) continue;
    if (!best || RANK[mapped] > RANK[best]) best = mapped;
  }
  return best;
}

export function hasMinRole(
  roles: string[] | undefined,
  min: WorkspaceRole,
): boolean {
  const current = highestRole(roles);
  if (!current) return false;
  return RANK[current] >= RANK[min];
}
