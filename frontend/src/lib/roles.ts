export type WorkspaceRole = 'owner' | 'admin' | 'developer' | 'staff';

export type WorkspaceCapability =
  | 'members'
  | 'settings'
  | 'api_keys'
  | 'workspace'
  | 'messaging_read'
  | 'messaging_write';

const RANK: Record<WorkspaceRole, number> = {
  owner: 4,
  admin: 3,
  developer: 2,
  staff: 1,
};

const CAPABILITIES: Record<WorkspaceRole, readonly WorkspaceCapability[]> = {
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

const LEGACY: Record<string, WorkspaceRole> = {
  agent: 'staff',
  viewer: 'staff',
};

export function asWorkspaceRole(name?: string | null): WorkspaceRole | null {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n === 'owner' || n === 'admin' || n === 'developer' || n === 'staff') {
    return n;
  }
  return LEGACY[n] ?? null;
}

export function highestRole(roles?: string[]): WorkspaceRole | null {
  if (!roles?.length) return null;
  let best: WorkspaceRole | null = null;
  for (const raw of roles) {
    const mapped = asWorkspaceRole(raw);
    if (!mapped) continue;
    if (!best || RANK[mapped] > RANK[best]) best = mapped;
  }
  return best;
}

export function hasCapability(
  roles: string[] | undefined,
  capability: WorkspaceCapability,
): boolean {
  const role = highestRole(roles);
  if (!role) return false;
  return CAPABILITIES[role].includes(capability);
}

/** @deprecated Prefer hasCapability */
export function hasMinRole(
  roles: string[] | undefined,
  min: WorkspaceRole,
): boolean {
  const current = highestRole(roles);
  if (!current) return false;
  if (
    (min === 'developer' && current === 'staff') ||
    (min === 'staff' && current === 'developer')
  ) {
    return false;
  }
  return RANK[current] >= RANK[min];
}

export function navAllowed(
  path: string,
  role: WorkspaceRole | null,
): boolean {
  if (!role) return false;
  if (role === 'owner') return true;
  if (role === 'admin') return path !== '/users';
  if (role === 'developer') {
    return path === '/' || path === '/api-keys';
  }
  // staff — messaging surfaces
  return [
    '/',
    '/contacts',
    '/conversations',
    '/messages',
    '/broadcasts',
    '/templates',
    '/media',
  ].includes(path);
}
