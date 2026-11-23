import type { MutableRefObject, Ref, RefCallback } from 'react';

/** Join class names, skipping falsy values. */
export function cx(...parts: Array<string | false | null | undefined | 0>): string {
  return parts.filter(Boolean).join(' ');
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

export const isMac: boolean =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

/** Lowercase + strip accents, for search/type-ahead. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as MutableRefObject<T | null>).current = value;
}

export function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): RefCallback<T> {
  return (node) => {
    for (const r of refs) assignRef(r, node);
  };
}

/** True for a key press that types a character (used for type-ahead). */
export function isPrintableKey(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
}

/**
 * Next enabled index in a list, moving by `dir` from `cur`.
 * `cur = -1` with dir 1 gives the first enabled item; `cur = list.length` with dir -1 the last.
 */
export function nextEnabledIndex(
  list: ReadonlyArray<{ disabled?: boolean }>,
  cur: number,
  dir: 1 | -1,
  wrap = true,
): number {
  const n = list.length;
  if (!n) return -1;
  let i = cur;
  for (let k = 0; k < n + 1; k++) {
    i += dir;
    if (i >= n) {
      if (!wrap) return cur >= 0 && cur < n ? cur : -1;
      i = 0;
    }
    if (i < 0) {
      if (!wrap) return cur >= 0 && cur < n ? cur : -1;
      i = n - 1;
    }
    if (!list[i].disabled) return i;
  }
  return -1;
}

/** Find the item matching a type-ahead buffer, starting after `from`. */
export function findTypeaheadMatch(
  labels: string[],
  query: string,
  from: number,
  disabled?: boolean[],
): number {
  if (!query) return -1;
  const q = normalizeText(query);
  // Same char repeated ("sss") cycles through items starting with that char.
  const single = q.length > 1 && q.split('').every((c) => c === q[0]) ? q[0] : null;
  const n = labels.length;
  const start = single ? from + 1 : Math.max(from, 0);
  for (let k = 0; k < n; k++) {
    const i = (start + k + n) % n;
    if (disabled?.[i]) continue;
    const l = normalizeText(labels[i]);
    if (l.startsWith(single ?? q)) return i;
  }
  return -1;
}

const MOD_MAC: Record<string, string> = { mod: '⌘', meta: '⌘', cmd: '⌘', ctrl: '⌃', alt: '⌥', option: '⌥', shift: '⇧' };
const MOD_PC: Record<string, string> = { mod: 'Ctrl', meta: 'Win', cmd: 'Ctrl', ctrl: 'Ctrl', alt: 'Alt', option: 'Alt', shift: 'Maj' };
const NAMED_KEYS: Record<string, string> = {
  enter: '↵',
  return: '↵',
  escape: 'Esc',
  esc: 'Esc',
  arrowup: '↑',
  up: '↑',
  arrowdown: '↓',
  down: '↓',
  arrowleft: '←',
  left: '←',
  arrowright: '→',
  right: '→',
  backspace: '⌫',
  delete: 'Suppr',
  space: 'Espace',
  tab: 'Tab',
};

/**
 * Format a shortcut for display. "mod+s" → "⌘S" on macOS, "Ctrl+S" elsewhere.
 * Strings without "+" are returned as-is (except named keys like "escape").
 */
export function formatShortcut(combo: string): string {
  const trimmed = combo.trim();
  if (!trimmed.includes('+') || trimmed.length < 3) {
    return NAMED_KEYS[trimmed.toLowerCase()] ?? (trimmed.length === 1 ? trimmed.toUpperCase() : trimmed);
  }
  const parts = trimmed.split('+').map((p) => p.trim()).filter(Boolean);
  const labels = parts.map((p, i) => {
    const low = p.toLowerCase();
    if (i < parts.length - 1) return (isMac ? MOD_MAC : MOD_PC)[low] ?? p;
    return NAMED_KEYS[low] ?? (p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1));
  });
  return isMac ? labels.join('') : labels.join('+');
}

/** Scroll `el` into view inside the scrollable `container` without touching ancestors. */
export function scrollIntoContainer(container: HTMLElement, el: HTMLElement): void {
  const top = el.offsetTop;
  const bottom = top + el.offsetHeight;
  if (top < container.scrollTop) container.scrollTop = top - 4;
  else if (bottom > container.scrollTop + container.clientHeight)
    container.scrollTop = bottom - container.clientHeight + 4;
}

export const numberFormatter = (locale = 'fr-FR') => new Intl.NumberFormat(locale);
