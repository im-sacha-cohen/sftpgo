import { ApiError } from '@/api/client';
import type { MemberKind } from './model';

/* ---------- words ---------- */

/** Where the files of a space live, in plain words. */
export function storageWords(provider: number | undefined) {
  switch (provider ?? 0) {
    case 1:
      return 'On Amazon S3';
    case 2:
      return 'On Google Cloud';
    case 3:
      return 'On Azure';
    case 4:
      return 'Encrypted on this server';
    case 5:
      return 'On another SFTP server';
    case 6:
      return 'On an HTTP server';
    default:
      return 'On this server';
  }
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** ["a", "b", "c"] → "a, b and c". */
export function joinWords(words: string[]) {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** "4 people and 1 group have access" / "Nobody has access yet". */
export function accessSentence(people: number, groups: number) {
  if (!people && !groups) return 'Nobody has access yet';
  const parts: string[] = [];
  if (people) parts.push(plural(people, 'person', 'people'));
  if (groups) parts.push(plural(groups, 'group', 'groups'));
  return `${joinWords(parts)} ${people + groups === 1 ? 'has' : 'have'} access`;
}

/** SFTPGo errors come as ApiError(message, detail). */
export function errorText(err: unknown) {
  if (err instanceof ApiError) return err.detail && err.detail !== err.message ? `${err.message}: ${err.detail}` : err.message;
  return err instanceof Error ? err.message : String(err);
}

/** Validates the path where members find the space. */
export function pathError(p: string): string | null {
  const v = p.trim();
  if (!v) return 'Enter a path.';
  if (!v.startsWith('/')) return 'The path must start with “/”.';
  if (v.split('/').some((s) => s === '..' || s === '.')) return 'The path can’t contain “..” or “.”.';
  if (v.replace(/\/+/g, '/') === '/') return 'Pick a folder, not the root “/”.';
  return null;
}

/* ---------- avatar ---------- */

function initials(name: string) {
  const parts = name.split(/[\s._@~-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] ?? name).slice(0, 2).toUpperCase() || '?';
}

function tint(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 4;
}

/** Initials; round for users, rounded square for groups. */
export function MemberAvatar({ name, kind }: { name: string; kind: MemberKind }) {
  return (
    <span className={`spaces-avatar spaces-avatar--${kind} spaces-avatar--t${tint(name)}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
