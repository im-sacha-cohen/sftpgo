import { api, ApiError, request } from '@/api/client';
import type { BaseVirtualFolder, Group, Permission, User, VirtualFolder } from '@/api/types';

/**
 * "Spaces" are SFTPGo virtual folders presented as shared folders.
 *
 * Giving a member access to a space means, in SFTPGo terms:
 *   1. mount the folder in the member (user or group) at a virtual path, and
 *   2. set the permissions of that virtual path to the role's permissions.
 * Both live on the member object (user.virtual_folders + user.permissions, or
 * group.virtual_folders + group.user_settings.permissions), so a member can
 * never end up with a mount but no rights, which is what caused "access denied".
 */

export type RoleId = 'view' | 'upload' | 'edit' | 'full';

export interface Role {
  id: RoleId;
  name: string;
  does: string;
  not: string;
  perms: Permission[];
}

export const ROLES: Role[] = [
  { id: 'view', name: 'View', does: 'See the files and download them.', not: 'Can’t add, rename or delete anything.', perms: ['list', 'download'] },
  {
    id: 'upload',
    name: 'Upload only',
    does: 'Add files and create folders, like a drop box.',
    not: 'Can’t download, rename or delete.',
    perms: ['list', 'upload', 'create_dirs'],
  },
  {
    id: 'edit',
    name: 'Edit',
    does: 'View, upload, replace, rename, move and delete.',
    not: 'Can’t change who has access.',
    perms: ['list', 'download', 'upload', 'overwrite', 'rename', 'delete', 'create_dirs', 'copy', 'chtimes'],
  },
  { id: 'full', name: 'Full control', does: 'Everything, including links to share it.', not: 'Use for the owner of the space.', perms: ['*'] },
];

export const roleById = (id: RoleId) => ROLES.find((r) => r.id === id)!;

/** Maps a permission list back to a role; null when it matches none ("Custom"). */
export function detectRole(perms: Permission[] | undefined): RoleId | null {
  if (!perms?.length) return null;
  const set = new Set(perms);
  if (set.has('*')) return 'full';
  // Expand SFTPGo's grouped permissions so "delete" == delete_files + delete_dirs, etc.
  const norm = new Set<string>(set);
  if (set.has('delete_files') && set.has('delete_dirs')) norm.add('delete');
  if (set.has('rename_files') && set.has('rename_dirs')) norm.add('rename');
  for (const r of ['edit', 'upload', 'view'] as RoleId[]) {
    const role = roleById(r);
    if (role.perms.every((p) => norm.has(p)) && [...norm].every((p) => role.perms.includes(p as Permission) || p.endsWith('_files') || p.endsWith('_dirs'))) {
      return r;
    }
  }
  return null;
}

export function roleLabel(perms: Permission[] | undefined) {
  const r = detectRole(perms);
  return r ? roleById(r).name : perms?.length ? 'Custom' : 'No access';
}

/** Turns a space name into a path segment: "Factures ACME" -> "factures-acme". */
export function slug(name: string) {
  return (
    name
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'space'
  );
}

export function normPath(p: string) {
  const s = '/' + p.split('/').filter(Boolean).join('/');
  return s === '' ? '/' : s;
}

export type MemberKind = 'user' | 'group';

export interface Member {
  kind: MemberKind;
  name: string;
  description?: string;
  /** Where the member sees the space. */
  path: string;
  perms: Permission[];
  role: RoleId | null;
  /** Number of users in a group. */
  size?: number;
  /**
   * When the mount path has no rights of its own, SFTPGo applies the rights of
   * the closest parent path: those are reported here.
   */
  inherited?: { from: string; perms: Permission[] };
}

/** Rights of the closest configured parent of `path` (SFTPGo's fallback). */
function inheritedFor(perms: Record<string, Permission[]>, path: string): Member['inherited'] {
  let p = path;
  while (p !== '/') {
    p = p.slice(0, p.lastIndexOf('/')) || '/';
    const found = perms[p];
    if (found?.length) return { from: p, perms: found };
  }
  return undefined;
}

function mountOf(folders: VirtualFolder[] | undefined, space: string) {
  return (folders ?? []).find((v) => v.name === space);
}

export function memberFromUser(u: User, space: string): Member | null {
  const mount = mountOf(u.virtual_folders, space);
  if (!mount) return null;
  const path = normPath(mount.virtual_path);
  const all = (u.permissions ?? {}) as Record<string, Permission[]>;
  const perms = (all[path] ?? []) as Permission[];
  return {
    kind: 'user',
    name: u.username ?? '',
    description: u.description,
    path,
    perms,
    role: detectRole(perms),
    inherited: perms.length ? undefined : inheritedFor(all, path),
  };
}

export function memberFromGroup(g: Group, space: string): Member | null {
  const mount = mountOf(g.virtual_folders, space);
  if (!mount) return null;
  const path = normPath(mount.virtual_path);
  const all = (g.user_settings?.permissions ?? {}) as Record<string, Permission[]>;
  const perms = (all[path] ?? []) as Permission[];
  return {
    kind: 'group',
    name: g.name ?? '',
    description: g.description,
    path,
    perms,
    role: detectRole(perms),
    size: g.users?.length ?? 0,
    inherited: perms.length ? undefined : inheritedFor(all, path),
  };
}

/** Loads every member of a space (the folder lists its users and groups). */
export async function loadMembers(folder: BaseVirtualFolder): Promise<Member[]> {
  const space = folder.name ?? '';
  const users = await Promise.all((folder.users ?? []).map((u) => api.get<User>(`/users/${encodeURIComponent(u)}`).catch(() => null)));
  // `groups` is returned by the server but missing from the OpenAPI schema.
  const folderGroups = (folder as BaseVirtualFolder & { groups?: string[] }).groups ?? [];
  const groups = await Promise.all(folderGroups.map((g) => api.get<Group>(`/groups/${encodeURIComponent(g)}`).catch(() => null)));
  const out: Member[] = [];
  for (const u of users) {
    const m = u && memberFromUser(u, space);
    if (m) out.push(m);
  }
  for (const g of groups) {
    const m = g && memberFromGroup(g, space);
    if (m) out.push(m);
  }
  return out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'group' ? 1 : -1));
}

/** Mounts `space` at `path` with `role` (or unmounts it when role is null) on the given object. */
function applyTo<T extends { virtual_folders?: VirtualFolder[] }>(
  obj: T,
  space: string,
  path: string | null,
  role: RoleId | null,
  getPerms: (o: T) => Record<string, Permission[]>,
  setPerms: (o: T, p: Record<string, Permission[]>) => T,
): T {
  const old = mountOf(obj.virtual_folders, space);
  const perms = { ...getPerms(obj) };
  if (old) delete perms[normPath(old.virtual_path)];
  const vfs = (obj.virtual_folders ?? []).filter((v) => v.name !== space);
  if (role && path) {
    const p = normPath(path);
    vfs.push({ name: space, virtual_path: p, quota_size: old?.quota_size ?? -1, quota_files: old?.quota_files ?? -1 } as VirtualFolder);
    perms[p] = roleById(role).perms;
  }
  return setPerms({ ...obj, virtual_folders: vfs }, perms);
}

/**
 * Reads an object, changes it and writes it back only if nobody changed it in
 * between (the server answers 412 otherwise): then it starts again from the
 * fresh copy, so two admins editing at the same time don't erase each other.
 */
async function updateSafely<T extends { updated_at?: number }>(path: string, change: (current: T) => T) {
  for (let attempt = 1; ; attempt++) {
    const current = await api.get<T>(path);
    try {
      await request(path, {
        method: 'PUT',
        body: change(current),
        headers: { 'X-SFTPGo-If-Updated-At': String(current.updated_at ?? 0) },
      });
      return;
    } catch (err) {
      if (err instanceof ApiError && err.status === 412 && attempt < 4) continue;
      throw err;
    }
  }
}

/** "/" must always keep a permission entry or SFTPGo rejects the user. */
const keepRoot = (perms: Record<string, Permission[]>) => (perms['/'] ? perms : { ...perms, '/': ['list', 'download'] as Permission[] });

export function setUserAccess(username: string, space: string, path: string | null, role: RoleId | null) {
  return updateSafely<User>(`/users/${encodeURIComponent(username)}`, (u) =>
    applyTo(
      u,
      space,
      path,
      role,
      (o) => (o.permissions ?? {}) as Record<string, Permission[]>,
      (o, p) => ({ ...o, permissions: keepRoot(p) }),
    ),
  );
}

/** Sets, or removes with a null role, the role on a folder of the user's own files. */
export function setUserPathRole(username: string, path: string, role: RoleId | null) {
  return updateSafely<User>(`/users/${encodeURIComponent(username)}`, (u) => {
    const p = normPath(path);
    const perms = { ...(u.permissions ?? {}) } as Record<string, Permission[]>;
    if (role) perms[p] = roleById(role).perms;
    else delete perms[p];
    return { ...u, permissions: keepRoot(perms) };
  });
}

export function setGroupAccess(groupName: string, space: string, path: string | null, role: RoleId | null) {
  return updateSafely<Group>(`/groups/${encodeURIComponent(groupName)}`, (g) =>
    applyTo(
      g,
      space,
      path,
      role,
      (o) => (o.user_settings?.permissions ?? {}) as Record<string, Permission[]>,
      (o, p) => ({ ...o, user_settings: { ...o.user_settings, permissions: p } }),
    ),
  );
}

export function setMemberAccess(m: { kind: MemberKind; name: string }, space: string, path: string | null, role: RoleId | null) {
  return m.kind === 'user' ? setUserAccess(m.name, space, path, role) : setGroupAccess(m.name, space, path, role);
}

/* ---------- Effective access of a user (what they see when signing in) ---------- */

export interface AccessNode {
  path: string;
  /** Space name when the path is a mounted virtual folder. */
  space?: string;
  perms: Permission[];
  /** Where the rights come from, in plain words. */
  source: string;
}

const groupApplies = (type?: number) => type === 1 || type === 2; // primary or secondary; "membership" applies nothing

/**
 * Builds the user's effective tree: their home "/" plus every mounted space,
 * merging group settings the way SFTPGo does (the user's own entry for a path
 * wins over a group's).
 */
export async function effectiveAccess(user: User): Promise<AccessNode[]> {
  const nodes = new Map<string, AccessNode>();
  const own = (user.permissions ?? {}) as Record<string, Permission[]>;
  for (const [p, perms] of Object.entries(own)) {
    nodes.set(normPath(p), { path: normPath(p), perms, source: 'Set on the user' });
  }
  for (const vf of user.virtual_folders ?? []) {
    const p = normPath(vf.virtual_path);
    const n = nodes.get(p);
    nodes.set(p, { path: p, space: vf.name, perms: n?.perms ?? [], source: n ? 'Given directly' : 'Mounted, but no rights set' });
  }
  const groups = await Promise.all(
    (user.groups ?? []).filter((g) => groupApplies(g.type)).map((g) => api.get<Group>(`/groups/${encodeURIComponent(g.name ?? '')}`).catch(() => null)),
  );
  for (const g of groups) {
    if (!g) continue;
    const gp = (g.user_settings?.permissions ?? {}) as Record<string, Permission[]>;
    for (const [p, perms] of Object.entries(gp)) {
      const np = normPath(p);
      if (!nodes.has(np)) nodes.set(np, { path: np, perms, source: `Through group ${g.name}` });
      else if (!nodes.get(np)!.perms.length) nodes.set(np, { ...nodes.get(np)!, perms, source: `Through group ${g.name}` });
    }
    for (const vf of g.virtual_folders ?? []) {
      const p = normPath(vf.virtual_path);
      const n = nodes.get(p);
      if (n) {
        if (!n.space) nodes.set(p, { ...n, space: vf.name });
      } else nodes.set(p, { path: p, space: vf.name, perms: [], source: `Mounted by group ${g.name}, no rights set` });
    }
  }
  if (!nodes.has('/')) nodes.set('/', { path: '/', perms: [], source: 'No rights on the home folder' });
  return [...nodes.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/** Rights that apply to `path`: the closest configured parent wins, like SFTPGo. */
export function permsFor(nodes: AccessNode[], path: string): { node: AccessNode; perms: Permission[] } {
  const p = normPath(path);
  let best = nodes.find((n) => n.path === '/')!;
  for (const n of nodes) {
    if ((p === n.path || p.startsWith(n.path === '/' ? '/' : n.path + '/')) && n.path.length >= best.path.length) best = n;
  }
  return { node: best, perms: best.perms };
}

export const can = (perms: Permission[], what: string) =>
  perms.includes('*') ||
  perms.includes(what as Permission) ||
  (what === 'delete' && perms.includes('delete_files') && perms.includes('delete_dirs')) ||
  (what === 'rename' && perms.includes('rename_files') && perms.includes('rename_dirs'));

/* ---------- Additions for the user page "effective access" view ---------- */

export interface MountRef {
  space: string;
  path: string;
  /** "the user" or the group name. */
  from: string;
  kind: 'user' | 'primary' | 'secondary';
  /** False when SFTPGo ignores this mount (another one already uses the path, or a secondary group mounts "/"). */
  used: boolean;
}

export interface ResolvedAccessNode extends AccessNode {
  /** Set when the path has no rights of its own: SFTPGo then uses those of the closest parent that has some. */
  inheritedFrom?: string;
}

export interface AccessAnalysis {
  nodes: ResolvedAccessNode[];
  /** Every mount the user gets, in the order SFTPGo applies them (user, primary group, secondary groups). */
  mounts: MountRef[];
  /** Groups that could not be read: the rights and spaces they give are missing from `nodes`. */
  unreadableGroups: string[];
}

/**
 * `effectiveAccess` plus the rules SFTPGo applies on top of it
 * (internal/dataprovider/user.go, applyGroupSettings and GetPermissionsForPath):
 *   - a path without its own permission entry uses the closest parent entry, so a space
 *     mounted "without rights" actually inherits those of "/" (or of a parent path);
 *   - the primary group's "/" entry replaces the user's;
 *   - mounts: the user's own win, then the primary group, then secondary groups in order;
 *     a secondary group can't mount "/";
 *   - %username% and %role% are replaced in group paths.
 */
export async function analyzeAccess(user: User): Promise<AccessAnalysis> {
  const render = (p: string) => normPath(p.split('%username%').join(user.username ?? '').split('%role%').join(user.role ?? ''));
  const applied = (user.groups ?? []).filter((g) => groupApplies(g.type));
  const ordered = [...applied.filter((g) => g.type === 1).slice(0, 1), ...applied.filter((g) => g.type === 2)];
  const [base, groups] = await Promise.all([
    effectiveAccess(user),
    Promise.all(ordered.map((g) => api.get<Group>(`/groups/${encodeURIComponent(g.name ?? '')}`).catch(() => null))),
  ]);
  const unreadableGroups = ordered.filter((_, i) => !groups[i]).map((g) => g.name ?? '');

  // mounts, first one wins per path
  const mounts: MountRef[] = [];
  const taken = new Set<string>();
  const addMount = (vf: VirtualFolder, from: string, kind: MountRef['kind']) => {
    const path = kind === 'user' ? normPath(vf.virtual_path) : render(vf.virtual_path);
    const used = !(kind === 'secondary' && path === '/') && !taken.has(path);
    if (used) taken.add(path);
    mounts.push({ space: vf.name ?? '', path, from, kind, used });
  };
  for (const vf of user.virtual_folders ?? []) addMount(vf, 'the user', 'user');
  ordered.forEach((m, i) => {
    const g = groups[i];
    for (const vf of g?.virtual_folders ?? []) addMount(vf, g?.name ?? m.name ?? '', m.type === 1 ? 'primary' : 'secondary');
  });
  const winner = new Map(mounts.filter((m) => m.used).map((m) => [m.path, m]));

  // nodes: render placeholders, fix the spaces and the primary group's "/"
  const byPath = new Map<string, ResolvedAccessNode>();
  for (const n of base) {
    const path = render(n.path);
    if (!byPath.has(path)) byPath.set(path, { ...n, path });
  }
  const primary = ordered[0]?.type === 1 ? groups[0] : null;
  const primaryRoot = primary?.user_settings?.permissions?.['/'] as Permission[] | undefined;
  if (primary && primaryRoot?.length) byPath.set('/', { ...byPath.get('/')!, path: '/', perms: primaryRoot, source: `Through group ${primary.name}` });
  for (const n of byPath.values()) n.space = winner.get(n.path)?.space;
  for (const m of winner.values()) {
    if (!byPath.has(m.path)) {
      byPath.set(m.path, {
        path: m.path,
        space: m.space,
        perms: [],
        source: m.kind === 'user' ? 'Mounted, but no rights set' : `Mounted by group ${m.from}, no rights set`,
      });
    }
  }

  // inheritance: only paths with their own entry count as parents
  const explicit = [...byPath.values()].filter((n) => n.perms.length);
  for (const n of byPath.values()) {
    if (n.perms.length || n.path === '/') continue;
    let parent: ResolvedAccessNode | undefined;
    for (const e of explicit) {
      const isParent = e.path === '/' || n.path.startsWith(e.path + '/');
      if (isParent && (!parent || e.path.length > parent.path.length)) parent = e;
    }
    if (parent) {
      n.perms = parent.perms;
      n.inheritedFrom = parent.path;
      n.source = `Inherited from ${parent.path}`;
    }
  }

  const nodes = [...byPath.values()].sort((a, b) => a.path.localeCompare(b.path));
  return { nodes, mounts, unreadableGroups };
}

/** True when `perms` grants `what`, also for SFTPGo's split permissions (delete_files, rename_dirs…). */
export function grants(perms: Permission[], what: string) {
  return (
    can(perms, what) ||
    (what.startsWith('delete_') && can(perms, 'delete')) ||
    (what.startsWith('rename_') && can(perms, 'rename'))
  );
}

/** The smallest role that keeps everything `perms` allows and adds `needed`. */
export function smallestRoleWith(perms: Permission[], needed: string[]): Role {
  const want = [...new Set<string>([...(perms.includes('*') ? ['*'] : perms), ...needed])];
  return ROLES.find((r) => want.every((p) => grants(r.perms, p))) ?? roleById('full');
}
