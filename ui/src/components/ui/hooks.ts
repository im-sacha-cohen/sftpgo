import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react';
import { isMac } from './utils';

export const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** A DOM-safe id (no colons). Uses `provided` when given. */
export function useStableId(prefix = 'c', provided?: string): string {
  const id = useId();
  return provided ?? `${prefix}-${id.replace(/:/g, '')}`;
}

/** Stable function identity that always calls the latest `fn`. */
export function useEventCallback<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useIsoLayoutEffect(() => {
    ref.current = fn;
  });
  return useCallback((...args: A) => ref.current(...args), []);
}

/** Controlled/uncontrolled state helper. */
export function useControllableState<T>(opts: {
  value?: T;
  defaultValue: T;
  onChange?: (v: T) => void;
}): [T, (v: T) => void] {
  const [inner, setInner] = useState<T>(opts.defaultValue);
  const controlled = opts.value !== undefined;
  const value = controlled ? (opts.value as T) : inner;
  const notify = useEventCallback((v: T) => opts.onChange?.(v));
  const set = useCallback(
    (v: T) => {
      if (!controlled) setInner(v);
      notify(v);
    },
    [controlled, notify],
  );
  return [value, set];
}

/** Calls `handler` on pointerdown outside every element in `refs`. */
export function useOutsideClick(
  refs: ReadonlyArray<RefObject<HTMLElement>>,
  handler: (e: PointerEvent) => void,
  enabled = true,
): void {
  const cb = useEventCallback(handler);
  const refsRef = useRef(refs);
  refsRef.current = refs;
  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (refsRef.current.some((r) => r.current?.contains(t))) return;
      cb(e);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [enabled, cb]);
}

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  space: ' ',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
  return: 'enter',
  del: 'delete',
  plus: '+',
};

type KeyLike = {
  key: string;
  code?: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
};

/** Match a keyboard event against "mod+k", "shift+?", "escape", "ctrl+alt+p"… (mod = ⌘ on macOS, Ctrl elsewhere). */
export function matchHotkey(e: KeyLike, combo: string): boolean {
  const parts = combo
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return false;
  const rawKey = parts[parts.length - 1];
  const key = KEY_ALIASES[rawKey] ?? rawKey;
  const mods = new Set(parts.slice(0, -1));
  const mod = mods.has('mod');
  const wantMeta = mods.has('meta') || mods.has('cmd') || (mod && isMac);
  const wantCtrl = mods.has('ctrl') || (mod && !isMac);
  const wantAlt = mods.has('alt') || mods.has('option');
  if (e.metaKey !== wantMeta || e.ctrlKey !== wantCtrl || e.altKey !== wantAlt) return false;
  const isSymbol = key.length === 1 && !/[a-z0-9]/.test(key);
  if (!isSymbol && e.shiftKey !== mods.has('shift')) return false;
  if (e.key.toLowerCase() === key) return true;
  if (key.length === 1 && /[a-z]/.test(key) && e.code === `Key${key.toUpperCase()}`) return true;
  if (key.length === 1 && /[0-9]/.test(key) && e.code === `Digit${key}`) return true;
  return false;
}

export function isEditableTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export interface HotkeyOptions {
  enabled?: boolean;
  /** Also fire while typing in an input/textarea (default false). */
  allowInInputs?: boolean;
  preventDefault?: boolean;
}

/** Global keyboard shortcut, active while the component is mounted. */
export function useHotkey(
  combo: string | string[],
  handler: (e: KeyboardEvent) => void,
  opts: HotkeyOptions = {},
): void {
  const { enabled = true, allowInInputs = false, preventDefault = true } = opts;
  const cb = useEventCallback(handler);
  const key = Array.isArray(combo) ? combo.join('\n') : combo;
  useEffect(() => {
    if (!enabled) return;
    const combos = key.split('\n');
    const onKey = (e: KeyboardEvent) => {
      if (!allowInInputs && isEditableTarget(e.target)) return;
      if (combos.some((c) => matchHotkey(e, c))) {
        if (preventDefault) e.preventDefault();
        cb(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [key, enabled, allowInInputs, preventDefault, cb]);
}

let scrollLocks = 0;
let savedBodyStyle: { overflow: string; paddingRight: string } | null = null;

/** Locks body scroll while `active` (ref-counted, compensates scrollbar width). */
export function useScrollLock(active: boolean): void {
  useIsoLayoutEffect(() => {
    if (!active) return;
    const body = document.body;
    if (scrollLocks === 0) {
      const sbw = window.innerWidth - document.documentElement.clientWidth;
      savedBodyStyle = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
      body.style.overflow = 'hidden';
      if (sbw > 0) body.style.paddingRight = `${sbw}px`;
    }
    scrollLocks++;
    return () => {
      scrollLocks--;
      if (scrollLocks === 0 && savedBodyStyle) {
        body.style.overflow = savedBodyStyle.overflow;
        body.style.paddingRight = savedBodyStyle.paddingRight;
        savedBodyStyle = null;
      }
    };
  }, [active]);
}

/** Remembers the focused element when `active` becomes true and restores it afterwards. */
export function useFocusReturn(active: boolean): void {
  useIsoLayoutEffect(() => {
    if (!active) return;
    const prev = document.activeElement as HTMLElement | null;
    return () => {
      if (prev && prev !== document.body && document.contains(prev)) prev.focus({ preventScroll: true });
    };
  }, [active]);
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex], [contenteditable="true"]';

export function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.tabIndex >= 0 && !el.closest('[inert]') && el.getClientRects().length > 0,
  );
}

/** Keeps Tab / Shift+Tab inside `root`. Call from the container's onKeyDown. */
export function trapTabKey(e: ReactKeyboardEvent, root: HTMLElement | null): void {
  if (e.key !== 'Tab' || !root) return;
  const activeEl = document.activeElement;
  // Focus is inside a portaled child (e.g. a popover opened from the dialog): let it handle Tab.
  if (activeEl && activeEl !== root && !root.contains(activeEl)) return;
  const items = getFocusable(root);
  if (!items.length) {
    e.preventDefault();
    root.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && (activeEl === first || activeEl === root)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && activeEl === last) {
    e.preventDefault();
    first.focus();
  }
}

/** Accumulates typed characters for type-ahead; resets after `timeout` ms. */
export function useTypeahead(timeout = 600): (char: string) => string {
  const buf = useRef('');
  const timer = useRef<number>();
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return useCallback(
    (char: string) => {
      window.clearTimeout(timer.current);
      buf.current += char.toLowerCase();
      timer.current = window.setTimeout(() => {
        buf.current = '';
      }, timeout);
      return buf.current;
    },
    [timeout],
  );
}
