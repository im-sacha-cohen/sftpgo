import { Fragment, type ReactNode } from 'react';
import type { FilesystemConfig, User } from '@/api/types';
import { formatBytes, formatRelative } from '@/lib/format';
import type { Lang } from '@/lib/i18n';
import type { UsersKey } from './i18n';
import { userState, type UserState } from './model';

/** Same signature as the `t` returned by `useT(dict)`. */
export type TFn = (key: UsersKey, vars?: Record<string, string | number>) => string;

const localeOf = (lang: Lang) => (lang === 'fr' ? 'fr-FR' : 'en-GB');

/* ---------- avatar ---------- */

export function initials(name: string) {
  const parts = name.split(/[\s._@~-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] ?? name).slice(0, 2).toUpperCase() || '?';
}

function tint(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h % 5;
}

export function UserAvatar({ name, size = 40 }: { name: string; size?: 40 | 52 }) {
  return (
    <span className={`users-avatar users-avatar--${tint(name)} users-avatar--${size}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}

/* ---------- rich templates ---------- */

/** Fills "{x}" placeholders of a translated template with React nodes. */
export function rich(template: string, vars: Record<string, ReactNode>): ReactNode {
  const out: ReactNode[] = [];
  const re = /\{(\w+)\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(template))) {
    if (m.index > last) out.push(template.slice(last, m.index));
    out.push(<Fragment key={i++}>{m[1] in vars ? vars[m[1]] : m[0]}</Fragment>);
    last = m.index + m[0].length;
  }
  if (last < template.length) out.push(template.slice(last));
  return out;
}

/** "a", "a et b", "a, b et c". */
export function joinWords(items: string[], and: string) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
}

/* ---------- storage ---------- */

export function providerName(t: TFn, fs: FilesystemConfig | undefined) {
  switch (fs?.provider ?? 0) {
    case 1:
      return fs?.s3config?.endpoint ? t('prov_s3compat') : t('prov_s3');
    case 2:
      return t('prov_gcs');
    case 3:
      return t('prov_azure');
    case 4:
      return t('prov_crypt');
    case 5:
      return t('prov_sftp');
    case 6:
      return t('prov_http');
    default:
      return t('prov_local');
  }
}

/**
 * Used / total in the unit of the total: (41 GiB, 50 GiB) → "41 Go", "50".
 * Falls back to two full values when the used part would round to zero.
 */
export function sizePair(used: number, total: number, lang: Lang): { used: string; total: string } {
  const units = lang === 'fr' ? ['o', 'Ko', 'Mo', 'Go', 'To', 'Po'] : ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let v = total;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const div = 1024 ** i;
  const u = used / div;
  if (used > 0 && u < 0.05) return { used: formatBytes(used, lang), total: formatBytes(total, lang) };
  const nf = (x: number) =>
    new Intl.NumberFormat(localeOf(lang), { maximumFractionDigits: i === 0 || x >= 10 ? 0 : 1 }).format(x);
  return { used: `${nf(u)} ${units[i]}`, total: nf(total / div) };
}

/** "Amazon S3 · 41 Go sur 50", "Ce serveur · 3 Go", … */
export function storageLine(t: TFn, u: User, lang: Lang) {
  const prov = providerName(t, u.filesystem);
  const used = u.used_quota_size ?? 0;
  if (u.quota_size) {
    const p = sizePair(used, u.quota_size, lang);
    return t('storOf', { prov, used: p.used, total: p.total });
  }
  if (!used) return prov;
  return t('storUsed', { prov, used: formatBytes(used, lang) });
}

/* ---------- status ---------- */

export type RowTone = 'ok' | 'muted' | 'warn' | 'bad';

const ROW_TONE: Record<UserState, RowTone> = {
  connected: 'ok',
  active: 'muted',
  never: 'muted',
  expiring: 'warn',
  expired: 'bad',
  disabled: 'bad',
};

export function shortDate(ms: number, lang: Lang) {
  return new Intl.DateTimeFormat(localeOf(lang), { day: '2-digit', month: '2-digit' }).format(new Date(ms));
}

export function longDate(ms: number, lang: Lang) {
  return new Intl.DateTimeFormat(localeOf(lang), { dateStyle: 'long' }).format(new Date(ms));
}

/** "10:41" today, "22/11 10:41" otherwise. */
export function clockTime(ms: number, lang: Lang) {
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  return new Intl.DateTimeFormat(localeOf(lang), {
    ...(sameDay ? {} : { day: '2-digit', month: '2-digit' }),
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function rowStatus(t: TFn, u: User, online: boolean, lang: Lang): { tone: RowTone; label: string } {
  const st = userState(u, online);
  const tone = ROW_TONE[st];
  switch (st) {
    case 'connected':
      return { tone, label: t('rowOnline') };
    case 'disabled':
      return { tone, label: t('rowDisabled') };
    case 'expired':
      return { tone, label: t('rowExpired', { date: shortDate(u.expiration_date!, lang) }) };
    case 'expiring':
      return { tone, label: t('rowExpires', { date: shortDate(u.expiration_date!, lang) }) };
    case 'never':
      return { tone, label: t('rowNever') };
    default:
      return { tone, label: t('rowSeen', { when: formatRelative(u.last_login, lang) }) };
  }
}

export function StatusLine({ tone, label, pulse }: { tone: RowTone; label: ReactNode; pulse?: boolean }) {
  return (
    <span className={`users-st users-st--${tone}`}>
      <span className={pulse ? 'users-st__dot is-pulse' : 'users-st__dot'} aria-hidden="true" />
      <span className="users-st__label">{label}</span>
    </span>
  );
}
