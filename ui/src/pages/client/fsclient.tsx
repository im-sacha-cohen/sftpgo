// Who the file screens talk to the user API as. A user uses their own session;
// an administrator "acts as" a user with a short token from
// POST /users/{username}/impersonate, limited to files and shares. The same
// screens (explorer, share dialog, uploads, viewer) work in both cases.
import { createContext, useContext, type ReactNode } from 'react';
import { ApiError, api, decodeJwt, getSession, request, type RequestOptions } from '@/api/client';

export interface FilesClient {
  /** Cache-key part: "self" or "as:<username>". */
  id: string;
  /** Account whose files these are. */
  username: string;
  /** Set when an administrator acts as `username`. */
  actingAs?: string;
  /** Web client restrictions of the token ("write-disabled", "shares-disabled"…). */
  perms: string[];
  request<T = unknown>(path: string, opts?: RequestOptions): Promise<T>;
  /** Bearer token for requests made outside `request` (XHR uploads, streaming). */
  token(): Promise<string>;
}

export const selfClient: FilesClient = {
  id: 'self',
  get username() {
    return getSession()?.username ?? '';
  },
  get perms() {
    const s = getSession();
    return s?.kind === 'user' ? s.permissions : [];
  },
  request: (path, opts) => request(path, opts),
  token: async () => {
    const s = getSession();
    if (!s || s.expiresAt <= Date.now()) throw new ApiError(401, 'Session expired');
    return s.token;
  },
};

interface ActAsToken {
  token: string;
  expiresAt: number;
  perms: string[];
}

const tokens = new Map<string, Promise<ActAsToken>>();
/** Ask for a new token this long before the current one expires. */
const MARGIN = 60_000;

async function fetchActAsToken(username: string): Promise<ActAsToken> {
  const body = await api.post<{ access_token: string; expires_at: string }>(`/users/${encodeURIComponent(username)}/impersonate`);
  const claims = decodeJwt(body.access_token);
  return {
    token: body.access_token,
    expiresAt: Date.parse(body.expires_at) || Date.now() + 10 * 60_000,
    perms: (claims.permissions as string[] | undefined) ?? [],
  };
}

/** Token to act as `username`, cached until shortly before it expires. */
export async function actAsToken(username: string, fresh = false): Promise<ActAsToken> {
  const cached = tokens.get(username);
  if (cached && !fresh) {
    try {
      const t = await cached;
      if (t.expiresAt - MARGIN > Date.now()) return t;
    } catch {
      /* ask again below */
    }
  }
  const p = fetchActAsToken(username);
  tokens.set(username, p);
  p.catch(() => tokens.delete(username));
  return p;
}

/** Last token obtained for `username`, if still valid (synchronous, for the streaming worker). */
export async function currentActAsToken(username: string) {
  try {
    return (await actAsToken(username)).token;
  } catch {
    return null;
  }
}

export function forgetActAsTokens() {
  tokens.clear();
}

/** A client acting as `username`; `first` is the token already fetched (its permissions). */
export function actAsClient(username: string, first: ActAsToken): FilesClient {
  const send = async <T,>(path: string, opts: RequestOptions | undefined, retry: boolean): Promise<T> => {
    const t = await actAsToken(username);
    try {
      return await request<T>(path, { ...opts, bearer: t.token });
    } catch (e) {
      // The user was edited (the token is tied to the account) or it expired: get a new one once.
      if (retry && e instanceof ApiError && e.status === 401) {
        await actAsToken(username, true);
        return send<T>(path, opts, false);
      }
      throw e;
    }
  };
  return {
    id: `as:${username}`,
    username,
    actingAs: username,
    perms: first.perms,
    request: (path, opts) => send(path, opts, true),
    token: async () => (await actAsToken(username)).token,
  };
}

const Ctx = createContext<FilesClient>(selfClient);

export function FilesClientProvider({ client, children }: { client: FilesClient; children: ReactNode }) {
  return <Ctx.Provider value={client}>{children}</Ctx.Provider>;
}

export function useFilesClient() {
  return useContext(Ctx);
}
