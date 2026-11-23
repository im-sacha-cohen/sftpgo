import type { Lang } from './i18n';

const locale = (lang: Lang) => (lang === 'fr' ? 'fr-FR' : 'en-GB');

/** 1536 → "1,5 Ko" (fr) / "1.5 KB" (en). Binary units, like SFTPGo. */
export function formatBytes(bytes: number | null | undefined, lang: Lang = 'fr', digits = 1): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '—';
  const units = lang === 'fr' ? ['o', 'Ko', 'Mo', 'Go', 'To', 'Po'] : ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let i = 0;
  let v = Math.abs(bytes);
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const n = new Intl.NumberFormat(locale(lang), { maximumFractionDigits: i === 0 ? 0 : digits }).format(v);
  return `${bytes < 0 ? '-' : ''}${n} ${units[i]}`;
}

export function formatNumber(n: number | null | undefined, lang: Lang = 'fr') {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat(locale(lang)).format(n);
}

/** Unix ms (SFTPGo timestamps) → "23/11/2026 10:42". 0 / undefined → "—". */
export function formatDate(ms: number | string | null | undefined, lang: Lang = 'fr', withTime = true) {
  if (ms === null || ms === undefined || ms === 0 || ms === '') return '—';
  const d = typeof ms === 'string' ? new Date(ms) : new Date(ms);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(locale(lang), {
    dateStyle: 'short',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(d);
}

/** "il y a 2 min", "dans 6 j"… */
export function formatRelative(ms: number | null | undefined, lang: Lang = 'fr') {
  if (!ms) return '—';
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: 'auto', style: 'short' });
  const table: [number, Intl.RelativeTimeFormatUnit][] = [
    [60_000, 'second'],
    [3_600_000, 'minute'],
    [86_400_000, 'hour'],
    [2_592_000_000, 'day'],
    [31_536_000_000, 'month'],
    [Infinity, 'year'],
  ];
  const div: Record<string, number> = { second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000, month: 2_592_000_000, year: 31_536_000_000 };
  for (const [limit, unit] of table) {
    if (abs < limit) return rtf.format(Math.round(diff / div[unit]), unit);
  }
  return '—';
}

/** Seconds → "2 h 13 min" */
export function formatDuration(seconds: number, lang: Lang = 'fr') {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const parts: string[] = [];
  if (h) parts.push(`${h} h`);
  if (m) parts.push(`${m} min`);
  if (!h && (r || !m)) parts.push(`${r} s`);
  return lang === 'fr' ? parts.join(' ') : parts.join(' ').replace(' h', 'h');
}

/** Bytes per second → "4,2 Mo/s" */
export function formatSpeed(bps: number, lang: Lang = 'fr') {
  return `${formatBytes(bps, lang)}/s`;
}

export const GiB = 1024 * 1024 * 1024;
export const MiB = 1024 * 1024;
