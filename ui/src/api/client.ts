import { config } from '@/lib/config';

export type SessionKind = 'admin' | 'user';

export interface Session {
  kind: SessionKind;
  username: string;
  token: string;
  /** Unix ms */
  expiresAt: number;
  /** Admin permissions from the JWT ("*" means all). Empty for users. */
  permissions: string[];
  /** SFTPGo role the account is bound to (admins limited to a role, users in a role). */
  role?: string;
}

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, message: string, detail = '') {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

const STORAGE_KEY = 'sftpgo-console-session';
let session: Session | null = readStoredSession();
const listeners = new Set<(s: Session | null, reason?: 'expired') => void>();

function readStoredSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Session;
    return s.expiresAt > Date.now() ? s : null;
  } catch {
    return null;
  }
}

export function getSession() {
  return session;
}

export function setSession(s: Session | null, reason?: 'expired') {
  session = s;
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable: keep the session in memory only */
  }
  listeners.forEach((l) => l(s, reason));
}

// Keep tabs in sync: a login or logout in another tab applies here too.
window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return;
  const next = readStoredSession();
  if (next?.token === session?.token) return;
  session = next;
  listeners.forEach((l) => l(next));
});

export function onSessionChange(l: (s: Session | null, reason?: 'expired') => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function decodeJwt(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '='))
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    return JSON.parse(json);
  } catch {
    return {};
  }
}

function basicAuth(username: string, password: string) {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return 'Basic ' + btoa(bin);
}

async function parseError(res: Response): Promise<ApiError> {
  let message = res.statusText || `HTTP ${res.status}`;
  let detail = '';
  try {
    const body = await res.json();
    detail = body.error ?? '';
    message = body.message || body.error || message;
  } catch {
    /* not JSON */
  }
  return new ApiError(res.status, message, detail);
}

/** Obtains a JWT. Throws ApiError(401) on bad credentials or missing/invalid OTP. */
export async function login(kind: SessionKind, username: string, password: string, otp?: string) {
  const headers: Record<string, string> = { Authorization: basicAuth(username, password) };
  if (otp) headers['X-SFTPGO-OTP'] = otp;
  const res = await fetch(`${config.apiBase}${kind === 'admin' ? '/token' : '/user/token'}`, { headers });
  if (!res.ok) throw await parseError(res);
  const body = (await res.json()) as { access_token: string; expires_at: string };
  const claims = decodeJwt(body.access_token);
  const s: Session = {
    kind,
    username: (claims.username as string) ?? username,
    token: body.access_token,
    expiresAt: Date.parse(body.expires_at) || Date.now() + 15 * 60_000,
    permissions: (claims.permissions as string[]) ?? [],
    role: (claims.role as string) || undefined,
  };
  setSession(s);
  return s;
}

/**
 * Signs in without asking whether the account is an administrator or a user:
 * the kinds in `order` are tried one after the other and the first one that
 * accepts the credentials wins. A 403 (banned address, protocol denied…) stops
 * the loop, as does anything that is not an authentication failure.
 */
export async function loginAny(order: SessionKind[], username: string, password: string, otp?: string) {
  let last: unknown = new ApiError(401, 'Unauthorized');
  for (const kind of order) {
    try {
      return await login(kind, username, password, otp);
    } catch (err) {
      last = err;
      if (!(err instanceof ApiError) || err.status !== 401) throw err;
    }
  }
  throw last;
}

/** POST to an endpoint that needs no session (password reset). Throws ApiError on failure. */
export async function publicPost<T = { message?: string }>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${config.apiBase}${path}`, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await parseError(res);
  return (await res.json().catch(() => ({}))) as T;
}

export async function logout() {
  const s = session;
  if (s) {
    try {
      await fetch(`${config.apiBase}${s.kind === 'admin' ? '/logout' : '/user/logout'}`, {
        headers: { Authorization: `Bearer ${s.token}` },
      });
    } catch {
      /* ignore */
    }
  }
  setSession(null);
}

export type Query = Record<string, string | number | boolean | undefined | null | string[]>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Query;
  body?: unknown;
  /** Send this as the raw body (FormData, Blob, File…) instead of JSON. */
  rawBody?: BodyInit;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Return the Response instead of parsing JSON (downloads). */
  raw?: boolean;
}

export function buildUrl(path: string, query?: Query) {
  const url = `${config.apiBase}${path}`;
  if (!query) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => qs.append(k, x));
    else qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `${url}?${s}` : url;
}

export async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const s = session;
  if (!s) throw new ApiError(401, 'Not authenticated');
  if (s.expiresAt <= Date.now()) {
    setSession(null, 'expired');
    throw new ApiError(401, 'Session expired');
  }
  const headers: Record<string, string> = { Authorization: `Bearer ${s.token}`, ...opts.headers };
  let body: BodyInit | undefined = opts.rawBody;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(buildUrl(path, opts.query), {
    method: opts.method ?? 'GET',
    headers,
    body,
    signal: opts.signal,
  });
  if (res.status === 401) {
    setSession(null, 'expired');
    throw await parseError(res);
  }
  if (!res.ok) throw await parseError(res);
  if (opts.raw) return res as unknown as T;
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: Query) => request<T>(path, { method: 'POST', body, query }),
  put: <T>(path: string, body?: unknown, query?: Query) => request<T>(path, { method: 'PUT', body, query }),
  patch: <T>(path: string, body?: unknown, query?: Query) => request<T>(path, { method: 'PATCH', body, query }),
  del: <T>(path: string, query?: Query) => request<T>(path, { method: 'DELETE', query }),
};

/** True when the admin session holds the given permission (or "*"). */
export function can(permission: string) {
  const s = session;
  if (!s || s.kind !== 'admin') return false;
  return s.permissions.includes('*') || s.permissions.includes(permission);
}
