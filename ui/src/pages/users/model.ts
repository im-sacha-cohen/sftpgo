import type {
  BaseUserFilters,
  ConnectionStatus,
  FilesystemConfig,
  FsProviders,
  Group,
  GroupMapping,
  LoginMethods,
  Permission,
  Secret,
  SupportedProtocols,
  User,
} from '@/api/types';

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

export type PermMap = Record<string, Permission[]>;

/** Permissions shown by default in the matrix (the rest behind "Toutes les permissions"). */
export const COMMON_PERMS: Permission[] = ['list', 'download', 'upload', 'overwrite', 'rename', 'delete', 'create_dirs'];
export const EXTRA_PERMS: Permission[] = [
  'delete_files',
  'delete_dirs',
  'rename_files',
  'rename_dirs',
  'create_symlinks',
  'chmod',
  'chown',
  'chtimes',
  'copy',
];
export const ALL_PERMS: Permission[] = [...COMMON_PERMS, ...EXTRA_PERMS];

export const PROTOCOLS: SupportedProtocols[] = ['SSH', 'FTP', 'DAV', 'HTTP'];
export const PROTOCOL_LABEL: Record<SupportedProtocols, string> = {
  SSH: 'SFTP',
  FTP: 'FTP',
  DAV: 'WebDAV',
  HTTP: 'HTTP',
};

export const LOGIN_METHODS: LoginMethods[] = [
  'publickey',
  'password',
  'password-over-SSH',
  'keyboard-interactive',
  'publickey+password',
  'publickey+keyboard-interactive',
  'TLSCertificate',
  'TLSCertificate+password',
];

export const PROVIDERS: FsProviders[] = [0, 1, 2, 3, 4, 5, 6];
export const PROVIDER_KEY: Record<FsProviders, string> = {
  0: 'local',
  1: 's3',
  2: 'gcs',
  3: 'azure',
  4: 'crypt',
  5: 'sftp',
  6: 'http',
};

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

export function clone<T>(v: T): T {
  return v === undefined ? v : (JSON.parse(JSON.stringify(v)) as T);
}

/** Sorted paths, "/" first. */
export function sortPaths(paths: string[]) {
  return [...paths].sort((a, b) => (a === '/' ? -1 : b === '/' ? 1 : a.localeCompare(b)));
}

export function allowedProtocols(filters?: BaseUserFilters | null): SupportedProtocols[] {
  const denied = new Set(filters?.denied_protocols ?? []);
  return PROTOCOLS.filter((p) => !denied.has(p));
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const IPV6 = /^[0-9a-f:]+(:\d{1,3}(\.\d{1,3}){3})?$/i;

/** Accepts an IP or a CIDR network (IPv4/IPv6). */
export function isIpOrCidr(value: string) {
  const v = value.trim();
  const [ip, mask, ...rest] = v.split('/');
  if (rest.length) return false;
  const is4 = IPV4.test(ip);
  const is6 = !is4 && ip.includes(':') && IPV6.test(ip) && (ip.match(/::/g) ?? []).length <= 1;
  if (!is4 && !is6) return false;
  if (mask === undefined) return true;
  if (!/^\d{1,3}$/.test(mask)) return false;
  const m = Number(mask);
  return is4 ? m <= 32 : m <= 128;
}

/** SFTPGo expects networks in CIDR notation: a bare IP becomes /32 or /128. */
export function toCidr(value: string) {
  const v = value.trim();
  if (v.includes('/')) return v;
  return v.includes(':') ? `${v}/128` : `${v}/32`;
}

export function isAbsPath(p: string) {
  return p.startsWith('/');
}

export function cleanVirtualPath(p: string) {
  let v = p.trim();
  if (!v.startsWith('/')) v = '/' + v;
  v = v.replace(/\/+/g, '/');
  if (v.length > 1 && v.endsWith('/')) v = v.slice(0, -1);
  return v;
}

/** Strong random password (no ambiguous characters). */
export function generatePassword(length = 20) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_.!@#%';
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => chars[n % chars.length]).join('');
}

/* ------------------------------------------------------------------ */
/* Secrets                                                             */
/* ------------------------------------------------------------------ */

/** A secret already stored server side (kept as received to leave it unchanged). */
export function isStoredSecret(s?: Secret | null) {
  return !!s && !!s.status && s.status !== 'Plain';
}

export function plainSecret(payload: string): Secret {
  return { status: 'Plain', payload };
}

const SECRET_FIELDS: Record<string, string[]> = {
  s3config: ['access_secret', 'sse_customer_key'],
  gcsconfig: ['credentials'],
  azblobconfig: ['account_key', 'sas_url'],
  cryptconfig: ['passphrase'],
  sftpconfig: ['password', 'private_key', 'key_passphrase'],
  httpconfig: ['password', 'api_key'],
};

/** Removes stored (encrypted) secrets: used when cloning, they cannot be re-posted. */
export function stripStoredSecrets(fs?: FilesystemConfig): FilesystemConfig | undefined {
  if (!fs) return fs;
  const out = clone(fs) as Record<string, Record<string, unknown> | undefined>;
  for (const [cfg, fields] of Object.entries(SECRET_FIELDS)) {
    const c = out[cfg];
    if (!c) continue;
    for (const f of fields) if (isStoredSecret(c[f] as Secret)) c[f] = {};
  }
  return out as FilesystemConfig;
}

/* ------------------------------------------------------------------ */
/* Diff                                                                */
/* ------------------------------------------------------------------ */

function isEmptyish(v: unknown): boolean {
  if (v === undefined || v === null || v === '' || v === 0 || v === false) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.values(v as object).every(isEmptyish);
  return false;
}

/** Recursively drops "empty" values so that `undefined`, `0`, `[]`, `{}`… compare equal. */
export function normalize(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as object).sort()) {
      const x = normalize((v as Record<string, unknown>)[k]);
      if (!isEmptyish(x)) out[k] = x;
    }
    return out;
  }
  return v;
}

/** Number of changed leaves between two objects (arrays count as one leaf). */
export function countChanges(a: unknown, b: unknown, ignore: string[] = []): number {
  const na = normalize(a);
  const nb = normalize(b);
  const walk = (x: unknown, y: unknown, path: string): number => {
    if (ignore.includes(path)) return 0;
    const xo = x && typeof x === 'object' && !Array.isArray(x);
    const yo = y && typeof y === 'object' && !Array.isArray(y);
    if (xo || yo) {
      const xr = (xo ? x : {}) as Record<string, unknown>;
      const yr = (yo ? y : {}) as Record<string, unknown>;
      const keys = new Set([...Object.keys(xr), ...Object.keys(yr)]);
      let n = 0;
      keys.forEach((k) => (n += walk(xr[k], yr[k], path ? `${path}.${k}` : k)));
      return n;
    }
    return JSON.stringify(x ?? null) === JSON.stringify(y ?? null) ? 0 : 1;
  };
  return walk(na, nb, '');
}

/** True when both values are the same once normalised. */
export function sameValue(a: unknown, b: unknown) {
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

export function emptyUser(): User {
  return {
    status: 1,
    username: '',
    description: '',
    email: '',
    password: '',
    home_dir: '',
    permissions: { '/': ['*'] },
    public_keys: [],
    groups: [],
    virtual_folders: [],
    filters: {},
    filesystem: { provider: 0 },
  };
}

/** Prepares a user loaded from the API for editing (and for the dirty comparison). */
export function toDraft(u: User): User {
  const d = clone(u);
  d.permissions = d.permissions ?? {};
  d.filters = d.filters ?? {};
  d.filesystem = d.filesystem ?? { provider: 0 };
  d.groups = d.groups ?? [];
  d.virtual_folders = d.virtual_folders ?? [];
  d.public_keys = d.public_keys ?? [];
  return d;
}

/** Builds a "new user" draft from an existing one (?clone=). */
export function cloneUser(u: User): User {
  const d = toDraft(u);
  delete d.id;
  delete d.created_at;
  delete d.updated_at;
  delete d.last_login;
  delete d.first_download;
  delete d.first_upload;
  delete d.last_password_change;
  delete d.used_quota_size;
  delete d.used_quota_files;
  delete d.last_quota_update;
  delete d.used_upload_data_transfer;
  delete d.used_download_data_transfer;
  delete d.has_password;
  d.username = '';
  d.password = '';
  d.home_dir = '';
  if (d.filters) {
    delete d.filters.totp_config;
    delete d.filters.recovery_codes;
  }
  d.filesystem = stripStoredSecrets(d.filesystem);
  d.virtual_folders = (d.virtual_folders ?? []).map((v) => ({
    name: v.name,
    virtual_path: v.virtual_path,
    quota_size: v.quota_size,
    quota_files: v.quota_files,
    subpath: v.subpath,
  }));
  return d;
}

/** Body sent to POST/PUT: drop read-only fields, empty password means "keep". */
export function toPayload(d: User, isNew: boolean): User {
  const out = clone(d);
  if (!out.password) delete out.password;
  delete out.has_password;
  if (!isNew) {
    delete out.used_quota_size;
    delete out.used_quota_files;
  }
  out.public_keys = (out.public_keys ?? []).map((k) => k.trim()).filter(Boolean);
  out.virtual_folders = (out.virtual_folders ?? []).map((v) => ({
    name: v.name,
    virtual_path: v.virtual_path,
    quota_size: v.quota_size ?? 0,
    quota_files: v.quota_files ?? 0,
    ...(v.subpath ? { subpath: v.subpath } : {}),
  }));
  return out;
}

export type UserState = 'connected' | 'disabled' | 'expired' | 'expiring' | 'never' | 'active';

export const DAY = 86_400_000;

export function userState(u: User, online: boolean, now = Date.now()): UserState {
  if (u.status === 0) return 'disabled';
  if (online) return 'connected';
  if (u.expiration_date && u.expiration_date < now) return 'expired';
  if (u.expiration_date && u.expiration_date - now < 30 * DAY) return 'expiring';
  if (!u.last_login) return 'never';
  return 'active';
}

export function quotaRatio(u: Pick<User, 'quota_size' | 'used_quota_size'>) {
  if (!u.quota_size) return null;
  return (u.used_quota_size ?? 0) / u.quota_size;
}

function lastSegments(p: string, n = 2) {
  const parts = p.split(/[\\/]/).filter(Boolean);
  if (parts.length <= n) return p;
  return '…/' + parts.slice(-n).join('/');
}

/** Short location of the storage: s3://bucket/prefix, gs://…, sftp://user@host/prefix, …/users/name */
export function storageLocation(fs: FilesystemConfig | undefined, homeDir?: string, full = false): string {
  const p = fs?.provider ?? 0;
  const join = (a: string, b?: string) => (b ? `${a}/${b.replace(/^\/+/, '').replace(/\/+$/, '')}` : a);
  switch (p) {
    case 1:
      return join(`s3://${fs?.s3config?.bucket ?? ''}`, fs?.s3config?.key_prefix);
    case 2:
      return join(`gs://${fs?.gcsconfig?.bucket ?? ''}`, fs?.gcsconfig?.key_prefix);
    case 3:
      return join(`az://${fs?.azblobconfig?.container ?? ''}`, fs?.azblobconfig?.key_prefix);
    case 5: {
      const c = fs?.sftpconfig;
      return join(`sftp://${c?.username ? c.username + '@' : ''}${c?.endpoint ?? ''}`, c?.prefix);
    }
    case 6:
      return fs?.httpconfig?.endpoint ?? '';
    default:
      return homeDir ? (full ? homeDir : lastSegments(homeDir)) : '';
  }
}

/** Effective permissions inherited from groups, per path. */
export interface InheritedPerm {
  path: string;
  perms: Permission[];
  group: string;
  /** "/" of a primary group replaces the user's own "/". */
  overrides: boolean;
}

export function inheritedPermissions(own: PermMap, mappings: GroupMapping[], groups: Group[]): InheritedPerm[] {
  const out: InheritedPerm[] = [];
  const seen = new Set<string>();
  // the primary group is merged first, then secondary groups
  const ordered = [...mappings].filter((m) => m.type === 1 || m.type === 2).sort((a, b) => (a.type ?? 3) - (b.type ?? 3));
  for (const m of ordered) {
    const g = groups.find((x) => x.name === m.name);
    const perms = g?.user_settings?.permissions ?? {};
    for (const [path, p] of Object.entries(perms)) {
      if (path === '/') {
        if (m.type === 1) out.push({ path, perms: p, group: m.name ?? '', overrides: true });
        continue;
      }
      if (own[path] || seen.has(path)) continue;
      seen.add(path);
      out.push({ path, perms: p, group: m.name ?? '', overrides: false });
    }
  }
  return out;
}

/** Union of the permissions granted on every path. */
export function permissionUnion(perms: PermMap | undefined): Set<Permission> {
  const s = new Set<Permission>();
  Object.values(perms ?? {}).forEach((list) => list.forEach((p) => s.add(p)));
  return s;
}

export function hasPerm(list: Permission[] | undefined, p: Permission) {
  if (!list) return false;
  if (list.includes('*')) return true;
  if (list.includes(p)) return true;
  if (p === 'delete' || p === 'rename') return list.includes(`${p}_files` as Permission) && list.includes(`${p}_dirs` as Permission);
  if ((p === 'delete_files' || p === 'delete_dirs') && list.includes('delete')) return true;
  if ((p === 'rename_files' || p === 'rename_dirs') && list.includes('rename')) return true;
  return false;
}

/** Online connections indexed by username. */
export function connectionsByUser(conns: ConnectionStatus[] | undefined) {
  const map = new Map<string, ConnectionStatus[]>();
  for (const c of conns ?? []) {
    if (!c.username) continue;
    const list = map.get(c.username) ?? [];
    list.push(c);
    map.set(c.username, list);
  }
  return map;
}

/** Bytes ↔ (value, unit) for the quota inputs. */
export type SizeUnit = 'MB' | 'GB' | 'TB';
export const UNIT_BYTES: Record<SizeUnit, number> = { MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 };

export function splitBytes(bytes: number | undefined): { value: number | null; unit: SizeUnit } {
  if (!bytes) return { value: null, unit: 'GB' };
  if (bytes % UNIT_BYTES.TB === 0) return { value: bytes / UNIT_BYTES.TB, unit: 'TB' };
  if (bytes >= UNIT_BYTES.GB) return { value: Math.round((bytes / UNIT_BYTES.GB) * 100) / 100, unit: 'GB' };
  return { value: Math.round((bytes / UNIT_BYTES.MB) * 100) / 100, unit: 'MB' };
}
