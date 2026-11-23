import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { CornerDownLeft, Search } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Kbd } from './Kbd';
import { useFocusReturn, useScrollLock, useStableId } from './hooks';
import { cx, normalizeText, scrollIntoContainer } from './utils';
import './Modal.css';
import './CommandPalette.css';

export interface Command {
  id: string;
  label: string;
  group?: string;
  icon?: LucideIcon;
  /** Display-only shortcut, e.g. "g u" or "mod+n". */
  shortcut?: string;
  keywords?: string[];
  description?: string;
  run: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
  placeholder?: string;
  emptyLabel?: string;
  /** Max results shown when filtering (default 50). */
  limit?: number;
}

function matchScore(hay: string, needle: string): number | null {
  const idx = hay.indexOf(needle);
  if (idx === 0) return 100;
  if (idx > 0) return /[\s\-_/.:]/.test(hay[idx - 1]) ? 80 : 60;
  // Subsequence match ("pacm" → "partenaire-acme"), penalised by gaps.
  let from = 0;
  let last = -1;
  let gaps = 0;
  for (const ch of needle) {
    const f = hay.indexOf(ch, from);
    if (f < 0) return null;
    if (last >= 0) gaps += f - last - 1;
    last = f;
    from = f + 1;
  }
  return Math.max(1, 40 - gaps);
}

/** Fuzzy-ish score: every token must match the label (or, at half weight, group/keywords). */
export function scoreCommand(cmd: Pick<Command, 'label' | 'group' | 'keywords' | 'description'>, query: string): number | null {
  const tokens = normalizeText(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;
  const label = normalizeText(cmd.label);
  const extra = normalizeText([cmd.group, cmd.description, ...(cmd.keywords ?? [])].filter(Boolean).join(' '));
  let total = 0;
  for (const t of tokens) {
    const s = matchScore(label, t);
    if (s != null) {
      total += s;
      continue;
    }
    const s2 = matchScore(extra, t);
    if (s2 == null) return null;
    total += s2 / 2;
  }
  return total;
}

/** ⌘K-style palette: search, grouped results, ↑↓ / Enter. */
export function CommandPalette(props: CommandPaletteProps) {
  return props.open ? <PaletteInner {...props} /> : null;
}

function PaletteInner({ onClose, commands, placeholder = 'Rechercher une page, une action…', emptyLabel = 'Aucun résultat', limit = 50 }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const baseId = useStableId('cmdk');
  const listId = `${baseId}-list`;
  const optId = (i: number) => `${baseId}-opt-${i}`;

  useScrollLock(true);
  useFocusReturn(true);
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  /** Results grouped by `group` (in order of first appearance), flattened for keyboard navigation. */
  const { flat, groups } = useMemo(() => {
    let results: Command[];
    if (!query.trim()) results = commands;
    else {
      results = commands
        .map((c, i) => ({ c, i, s: scoreCommand(c, query) }))
        .filter((x): x is { c: Command; i: number; s: number } => x.s != null)
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .slice(0, limit)
        .map((x) => x.c);
    }
    const order: string[] = [];
    const byGroup = new Map<string, Command[]>();
    for (const c of results) {
      const g = c.group ?? '';
      if (!byGroup.has(g)) {
        byGroup.set(g, []);
        order.push(g);
      }
      byGroup.get(g)!.push(c);
    }
    const grouped = order.map((g) => ({ name: g, items: byGroup.get(g)! }));
    return { groups: grouped, flat: grouped.flatMap((g) => g.items) };
  }, [commands, query, limit]);

  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (list && el) scrollIntoContainer(list, el);
  }, [active, flat]);

  const run = (cmd: Command | undefined) => {
    if (!cmd) return;
    onClose();
    // Run after the palette unmounts so focus is restored first.
    window.setTimeout(() => cmd.run(), 0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = flat.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (n) setActive((a) => (a + 1) % n);
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (n) setActive((a) => (a - 1 + n) % n);
        break;
      case 'PageDown':
        e.preventDefault();
        if (n) setActive((a) => Math.min(n - 1, a + 8));
        break;
      case 'PageUp':
        e.preventDefault();
        if (n) setActive((a) => Math.max(0, a - 8));
        break;
      case 'Enter':
        e.preventDefault();
        run(flat[active]);
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        onClose();
        break;
      case 'Tab':
        e.preventDefault();
        break;
      default:
    }
  };

  let index = -1;
  return createPortal(
    <div className="c-dialog-root c-cmdk-root">
      <div className="c-overlay" aria-hidden="true" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="Palette de commandes" className="c-cmdk" onKeyDown={onKeyDown}>
        <div className="c-cmdk__search">
          <Search size={16} strokeWidth={1.8} aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={flat.length ? optId(active) : undefined}
            aria-label={placeholder}
            placeholder={placeholder}
            autoComplete="off"
            spellCheck={false}
            className="c-cmdk__input"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
          />
          <Kbd combo={false}>Esc</Kbd>
        </div>
        <div ref={listRef} id={listId} role="listbox" aria-label="Résultats" className="c-cmdk__list">
          {flat.length === 0 && <div className="c-cmdk__empty">{emptyLabel}</div>}
          {groups.map((g, gi) => (
            <Fragment key={g.name || '_'}>
              <div role="group" aria-labelledby={g.name ? `${baseId}-g-${gi}` : undefined} className="c-cmdk__group">
                {g.name && (
                  <div id={`${baseId}-g-${gi}`} role="presentation" className="c-cmdk__group-label">
                    {g.name}
                  </div>
                )}
                {g.items.map((c) => {
                  index += 1;
                  const i = index;
                  const Icon = c.icon;
                  return (
                    <div
                      key={c.id}
                      id={optId(i)}
                      role="option"
                      aria-selected={i === active}
                      data-index={i}
                      className={cx('c-cmdk__item', i === active && 'is-active')}
                      onMouseMove={() => {
                        if (active !== i) setActive(i);
                      }}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => run(c)}
                    >
                      {Icon ? (
                        <Icon size={16} strokeWidth={1.8} aria-hidden="true" className="c-cmdk__icon" />
                      ) : (
                        <span className="c-cmdk__icon" aria-hidden="true" />
                      )}
                      <span className="c-cmdk__label">
                        {c.label}
                        {c.description && <span className="c-cmdk__desc">{c.description}</span>}
                      </span>
                      {c.shortcut && <Kbd>{c.shortcut}</Kbd>}
                      {i === active && <CornerDownLeft size={14} aria-hidden="true" className="c-cmdk__enter" />}
                    </div>
                  );
                })}
              </div>
            </Fragment>
          ))}
        </div>
        <div className="c-cmdk__foot" aria-hidden="true">
          <span>
            <Kbd combo={false}>↑</Kbd>
            <Kbd combo={false}>↓</Kbd> naviguer
          </span>
          <span>
            <Kbd combo={false}>↵</Kbd> ouvrir
          </span>
          <span>
            <Kbd combo={false}>Esc</Kbd> fermer
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
