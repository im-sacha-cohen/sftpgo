// Plain-language dates for the end-user screens ("Aujourd’hui, 10:42", "31 oct.").
import type { Lang } from '@/lib/i18n';

const locale = (lang: Lang) => (lang === 'fr' ? 'fr-FR' : 'en-GB');

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** "Aujourd’hui, 10:42" · "Hier, 09:15" · "31 oct." · "31 oct. 2024". */
export function friendlyDate(
  value: number | string | null | undefined,
  lang: Lang,
  words: { today: (time: string) => string; yesterday: (time: string) => string },
) {
  if (value === null || value === undefined || value === '' || value === 0) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const time = new Intl.DateTimeFormat(locale(lang), { hour: '2-digit', minute: '2-digit' }).format(d);
  const day = startOfDay(d);
  const today = startOfDay(now);
  if (day === today) return words.today(time);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  if (day === yesterday) return words.yesterday(time);
  const opts: Intl.DateTimeFormatOptions =
    d.getFullYear() === now.getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat(locale(lang), opts).format(d);
}

/** "12 décembre 2026" (long, no time). */
export function longDate(ms: number, lang: Lang) {
  return new Intl.DateTimeFormat(locale(lang), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(ms));
}
