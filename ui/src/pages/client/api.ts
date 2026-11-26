// Helpers for the end-user ("Mon espace") screens: paths, downloads, uploads
// and the web client restrictions carried by the user JWT.
import { ApiError, buildUrl, setSession } from '@/api/client';
import type { DirEntry, Share } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { config } from '@/lib/config';
import { useFilesClient, type FilesClient } from './fsclient';

/* ---------- Paths ---------- */

/** "/a/b" + "c" → "/a/b/c" */
export function joinPath(dir: string, name: string) {
  return dir === '/' ? `/${name}` : `${dir}/${name}`;
}

export function parentPath(p: string) {
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.slice(0, i);
}

export function baseName(p: string) {
  return p.slice(p.lastIndexOf('/') + 1) || '/';
}

/** "/a/b" → ["a", "b"] */
export function splitPath(p: string) {
  return p.split('/').filter(Boolean);
}

/** Router path for a directory: each segment is URI-encoded (spaces, #, %, unicode). */
export function filesRoute(dir: string) {
  const segs = splitPath(dir);
  return segs.length ? `/files/${segs.map(encodeURIComponent).join('/')}` : '/files';
}

/** Reverse of filesRoute, from the router location pathname. */
export function dirFromPathname(pathname: string) {
  const rest = pathname.replace(/^\/files\/?/, '');
  const segs = rest
    .split('/')
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
  return '/' + segs.join('/');
}

/** True when `p` is `dir` or inside it. */
export function isWithin(p: string, dir: string) {
  return p === dir || p.startsWith(dir === '/' ? '/' : `${dir}/`);
}

/* ---------- Directory entries ---------- */

const MODE_DIR = 2147483648;
const MODE_SYMLINK = 134217728;

export function isDir(e: DirEntry) {
  return ((e.mode ?? 0) & MODE_DIR) !== 0;
}

export function isSymlink(e: DirEntry) {
  return ((e.mode ?? 0) & MODE_SYMLINK) !== 0;
}

export function entryTime(e: DirEntry) {
  return e.last_modified ? Date.parse(e.last_modified) || 0 : 0;
}

export const dirKey = (fc: FilesClient, dir: string) => ['user-dirs', fc.id, dir] as const;

export function listDir(fc: FilesClient, dir: string, signal?: AbortSignal) {
  return fc.request<DirEntry[] | null>('/user/dirs', { query: { path: dir }, signal }).then((r) => r ?? []);
}

/* ---------- Downloads ---------- */

function filenameFromDisposition(h: string | null) {
  if (!h) return null;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(h);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* fall through */
    }
  }
  const plain = /filename\s*=\s*"([^"]*)"/.exec(h) ?? /filename\s*=\s*([^;]+)/.exec(h);
  return plain ? plain[1].trim() : null;
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Fetches a file with the bearer token (an <a href> cannot carry it). */
export async function fetchFile(fc: FilesClient, path: string, signal?: AbortSignal, range?: string) {
  return fc.request<Response>('/user/files', { query: { path }, raw: true, signal, headers: range ? { Range: range } : undefined });
}

export async function downloadFile(fc: FilesClient, path: string) {
  const res = await fetchFile(fc, path);
  const blob = await res.blob();
  saveBlob(blob, filenameFromDisposition(res.headers.get('Content-Disposition')) ?? baseName(path));
}

export async function downloadZip(fc: FilesClient, paths: string[]) {
  const res = await fc.request<Response>('/user/streamzip', { method: 'POST', body: paths, raw: true });
  const blob = await res.blob();
  saveBlob(blob, filenameFromDisposition(res.headers.get('Content-Disposition')) ?? 'download.zip');
}

/* ---------- Upload (XHR for progress events) ---------- */

export interface UploadHandle {
  promise: Promise<void>;
  abort: () => void;
}

export class UploadAborted extends Error {}

/** Uploads one file to `path` (full file path), creating missing parents. */
export function uploadFile(fc: FilesClient, path: string, file: File, onProgress: (loaded: number) => void): UploadHandle {
  const xhr = new XMLHttpRequest();
  let aborted = false;
  const promise = new Promise<void>((resolve, reject) => {
    fc.token().then(
      (token) => {
        if (aborted) {
          reject(new UploadAborted('aborted'));
          return;
        }
        send(token);
      },
      (e) => reject(e),
    );
    const send = (token: string) => {
    xhr.open('POST', buildUrl(fc.api('/user/files/upload'), { path, mkdir_parents: 'true' }));
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    if (file.lastModified) xhr.setRequestHeader('X-SFTPGO-MTIME', String(file.lastModified));
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(file.size);
        resolve();
        return;
      }
      let message = xhr.statusText || `HTTP ${xhr.status}`;
      let detail = '';
      try {
        const body = JSON.parse(xhr.responseText);
        detail = body.error ?? '';
        message = body.message || body.error || message;
      } catch {
        /* not JSON */
      }
      if (xhr.status === 401 && !fc.actingAs) setSession(null, 'expired');
      reject(new ApiError(xhr.status, message, detail));
    };
    xhr.onerror = () => reject(new ApiError(0, 'Network error'));
    xhr.onabort = () => reject(new UploadAborted('aborted'));
    xhr.send(file);
    };
  });
  return {
    promise,
    abort: () => {
      aborted = true;
      xhr.abort();
    },
  };
}

/* ---------- Shares ---------- */

export const REDACTED = '[**redacted**]';

/** Share scope as stored by SFTPGo (3 = read-write is not in the OpenAPI enum). */
export type Scope = 1 | 2 | 3;
export type UserShare = Omit<Share, 'scope'> & { scope?: Scope };

/** Web client base ("/web"): the console lives at <webBase>/console. */
export function webBase() {
  const b = config.consoleBase.replace(/\/+$/, '');
  if (b.endsWith('/console')) return b.slice(0, -'/console'.length);
  return '/web';
}

export function shareUrl(id: string) {
  return `${window.location.origin}${webBase()}/client/pubshares/${encodeURIComponent(id)}`;
}

export const sharesKey = ['user-shares'] as const;
export const sharesKeyFor = (fc: FilesClient) => ['user-shares', fc.id] as const;

const RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
// / \ : * ? " < > | plus control and invisible format characters.
const INVALID_NAME_CHARS = new RegExp('[/\\\\:*?"<>|\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028-\\u202e\\u2060-\\u2064\\ufeff]', 'g');

/** A share name SFTPGo accepts (no / \ : * ? " < > |, no control chars, max 255), derived from a label. */
export function shareNameFrom(label: string) {
  let n = label.replace(INVALID_NAME_CHARS, '_').trim();
  if (!n || n === '.' || n === '..') n = 'partage';
  if (RESERVED_NAMES.test(n.split('.')[0])) n = `_${n}`;
  return n.slice(0, 255);
}

/** Random password without look-alike characters (crypto RNG). */
export function generatePassword(length = 16) {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const out: string[] = [];
  const buf = new Uint32Array(length * 2);
  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (const v of buf) {
      // Rejection sampling keeps the distribution uniform.
      if (v < Math.floor(0x1_0000_0000 / alphabet.length) * alphabet.length) out.push(alphabet[v % alphabet.length]);
      if (out.length === length) break;
    }
  }
  return out.join('');
}

export function shareExpired(s: UserShare) {
  return !!s.expires_at && s.expires_at < Date.now();
}

export function shareExhausted(s: UserShare) {
  return !!s.max_tokens && (s.used_tokens ?? 0) >= s.max_tokens;
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for non-secure contexts.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}

/* ---------- Web client restrictions ---------- */

/** Restrictions from the user's JWT (`filters.web_client`). */
export function useClientPerms() {
  const { session } = useAuth();
  const fc = useFilesClient();
  const p = fc.id !== 'self' ? fc.perms : session?.kind === 'user' ? session.permissions : [];
  return {
    write: !p.includes('write-disabled'),
    shares: !p.includes('shares-disabled'),
    /** Spaces have no server-side copy and no zip download. */
    copy: !p.includes('copy-disabled'),
    zip: !p.includes('zip-disabled'),
    sharesNoPassword: !p.includes('shares-without-password-disabled'),
    password: !p.includes('password-change-disabled'),
    mfa: !p.includes('mfa-disabled'),
    info: !p.includes('info-change-disabled'),
    publicKeys: !p.includes('publickey-change-disabled'),
    apiKeyAuth: !p.includes('api-key-auth-change-disabled'),
  };
}

export function errMsg(e: unknown) {
  if (e instanceof ApiError) return e.detail && e.detail !== e.message ? `${e.message} — ${e.detail}` : e.message;
  return e instanceof Error ? e.message : String(e);
}

export function isIpOrCidr(v: string) {
  const [ip, mask, extra] = v.split('/');
  if (extra !== undefined) return false;
  const v4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(ip);
  const v6 = !v4 && ip.includes(':') && /^[0-9a-fA-F:.]+$/.test(ip) && (ip.match(/::/g)?.length ?? 0) <= 1;
  if (!v4 && !v6) return false;
  if (mask === undefined) return true;
  if (!/^\d{1,3}$/.test(mask)) return false;
  return Number(mask) <= (v4 ? 32 : 128);
}
