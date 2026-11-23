import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode, Ref } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Field, useField } from './Field';
import { Popover } from './Popover';
import { useTypeahead } from './hooks';
import type { Placement } from './usePosition';
import {
  cx,
  findTypeaheadMatch,
  isPrintableKey,
  mergeRefs,
  nextEnabledIndex,
  normalizeText,
  scrollIntoContainer,
} from './utils';
import './Select.css';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
}

export interface SelectProps<T extends string> {
  options: SelectOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  placeholder?: string;
  /** Adds a search box in the popover that filters options. */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyLabel?: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
  mono?: boolean;
  id?: string;
  /** Renders a hidden input for native form posts. */
  name?: string;
  className?: string;
  placement?: Placement;
  triggerRef?: Ref<HTMLButtonElement>;
  'aria-label'?: string;
}

export function filterOptions<O extends { label: string }>(options: O[], query: string): O[] {
  const q = normalizeText(query);
  if (!q) return options;
  return options.filter((o) => normalizeText(o.label).includes(q));
}

/** Custom single select: button trigger + listbox in a popover. */
export function Select<T extends string>(props: SelectProps<T>) {
  const {
    options,
    value,
    onChange,
    placeholder = 'Sélectionner…',
    searchable = false,
    searchPlaceholder = 'Rechercher…',
    emptyLabel = 'Aucun résultat',
    label,
    hint,
    error,
    required,
    disabled,
    size = 'md',
    mono,
    id,
    name,
    className,
    placement = 'bottom-start',
    triggerRef,
    'aria-label': ariaLabel,
  } = props;
  const f = useField({ id, hint, error, prefix: 'select' });
  const listId = `${f.id}-listbox`;
  const optId = (i: number) => `${f.id}-opt-${i}`;

  const btnRef = useRef<HTMLButtonElement>(null);
  const mergedBtnRef = useMemo(() => mergeRefs<HTMLButtonElement>(btnRef, triggerRef), [triggerRef]);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const suppressClick = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const typeahead = useTypeahead();

  const visible = useMemo(
    () => (searchable ? filterOptions(options, query) : options),
    [options, query, searchable],
  );
  const selected = options.find((o) => o.value === value) ?? null;

  const openList = (o?: { query?: string; activeIndex?: number }) => {
    if (disabled) return;
    const q = o?.query ?? '';
    const list = searchable ? filterOptions(options, q) : options;
    let idx = o?.activeIndex ?? list.findIndex((x) => x.value === value);
    if (idx < 0 || list[idx]?.disabled) idx = nextEnabledIndex(list, -1, 1);
    setQuery(q);
    setActive(idx);
    setOpen(true);
  };

  const close = (focusTrigger: boolean) => {
    setOpen(false);
    setQuery('');
    if (focusTrigger) btnRef.current?.focus({ preventScroll: true });
  };

  const commit = (i: number) => {
    const o = visible[i];
    if (!o || o.disabled) return;
    onChange(o.value);
    close(true);
  };

  // Focus the search box when opening.
  useEffect(() => {
    if (open && searchable) searchRef.current?.focus({ preventScroll: true });
  }, [open, searchable]);

  // Keep the active option visible.
  useEffect(() => {
    if (!open || active < 0) return;
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (list && el) scrollIntoContainer(list, el);
  }, [open, active, visible]);

  /** Navigation keys shared by the trigger (non-searchable) and the search box. Returns true if handled. */
  const handleListKey = (e: KeyboardEvent<HTMLElement>, fromSearch: boolean): boolean => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((c) => nextEnabledIndex(visible, c, 1, false));
        return true;
      case 'ArrowUp':
        e.preventDefault();
        setActive((c) => nextEnabledIndex(visible, c < 0 ? visible.length : c, -1, false));
        return true;
      case 'PageDown':
        e.preventDefault();
        setActive((c) => {
          let i = c;
          for (let k = 0; k < 8; k++) i = nextEnabledIndex(visible, i, 1, false);
          return i;
        });
        return true;
      case 'PageUp':
        e.preventDefault();
        setActive((c) => {
          let i = c;
          for (let k = 0; k < 8; k++) i = nextEnabledIndex(visible, i, -1, false);
          return i;
        });
        return true;
      case 'Home':
        if (fromSearch) return false;
        e.preventDefault();
        setActive(nextEnabledIndex(visible, -1, 1));
        return true;
      case 'End':
        if (fromSearch) return false;
        e.preventDefault();
        setActive(nextEnabledIndex(visible, visible.length, -1));
        return true;
      case 'Enter':
        e.preventDefault();
        if (active >= 0) commit(active);
        return true;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close(true);
        return true;
      case 'Tab':
        // Return focus to the trigger; the browser then moves on from there.
        close(fromSearch);
        return true;
      default:
        return false;
    }
  };

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        openList();
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        openList({ activeIndex: e.key === 'Home' ? nextEnabledIndex(options, -1, 1) : nextEnabledIndex(options, options.length, -1) });
      } else if (isPrintableKey(e) && e.key !== ' ') {
        e.preventDefault();
        if (searchable) openList({ query: e.key });
        else {
          const q = typeahead(e.key);
          const from = options.findIndex((o) => o.value === value);
          const idx = findTypeaheadMatch(
            options.map((o) => o.label),
            q,
            from,
            options.map((o) => !!o.disabled),
          );
          openList(idx >= 0 ? { activeIndex: idx } : undefined);
        }
      }
      // Enter / Space fall through to the click handler.
      return;
    }
    if (searchable) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      suppressClick.current = true;
      if (active >= 0) commit(active);
      return;
    }
    if (handleListKey(e, false)) return;
    if (isPrintableKey(e)) {
      const q = typeahead(e.key);
      const idx = findTypeaheadMatch(
        visible.map((o) => o.label),
        q,
        active,
        visible.map((o) => !!o.disabled),
      );
      if (idx >= 0) setActive(idx);
    }
  };

  const SelectedIcon = selected?.icon;

  return (
    <Field id={f.id} label={label} hint={hint} error={error} required={required} className={className}>
      <button
        ref={mergedBtnRef}
        id={f.id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && !searchable && active >= 0 ? optId(active) : undefined}
        aria-labelledby={label != null ? `${f.labelId} ${f.id}` : undefined}
        aria-label={label == null ? ariaLabel : undefined}
        aria-describedby={f.describedBy}
        aria-invalid={f.invalid || undefined}
        aria-required={required || undefined}
        disabled={disabled}
        className={cx(
          'c-control c-select-trigger',
          size === 'sm' && 'c-control--sm',
          mono && 'c-control--mono',
          f.invalid && 'is-invalid',
          disabled && 'is-disabled',
        )}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          if (open) close(true);
          else openList();
        }}
        onKeyUp={(e) => {
          if (e.key === ' ' || e.key === 'Enter') window.setTimeout(() => (suppressClick.current = false));
        }}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="c-select-trigger__value c-control__value">
          {selected ? (
            <>
              {SelectedIcon && <SelectedIcon size={15} strokeWidth={1.8} aria-hidden="true" className="c-select-trigger__icon" />}
              <span className="c-select-trigger__text">{selected.label}</span>
            </>
          ) : (
            <span className="c-select-trigger__placeholder">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" className="c-select-trigger__chevron" />
      </button>
      {name && <input type="hidden" name={name} value={value ?? ''} />}

      <Popover
        anchorRef={btnRef}
        open={open}
        onClose={() => close(false)}
        placement={placement}
        matchWidth
        closeOnAncestorScroll
        className="c-select-pop"
      >
        {searchable && (
          <div className="c-listbox-search">
            <Search size={14} strokeWidth={1.8} aria-hidden="true" />
            <input
              ref={searchRef}
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={active >= 0 ? optId(active) : undefined}
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              autoComplete="off"
              spellCheck={false}
              className="c-listbox-search__input"
              value={query}
              onChange={(e) => {
                const q = e.target.value;
                setQuery(q);
                setActive(nextEnabledIndex(filterOptions(options, q), -1, 1));
              }}
              onKeyDown={(e) => {
                handleListKey(e, true);
              }}
            />
          </div>
        )}
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-labelledby={label != null ? f.labelId : undefined}
          aria-label={label == null ? ariaLabel : undefined}
          className={cx('c-listbox', mono && 'is-mono')}
        >
          {visible.length === 0 && (
            <li role="presentation" className="c-listbox__empty">
              {emptyLabel}
            </li>
          )}
          {visible.map((o, i) => {
            const Icon = o.icon;
            const isSel = o.value === value;
            return (
              <li
                key={o.value}
                id={optId(i)}
                role="option"
                data-index={i}
                data-active={i === active || undefined}
                aria-selected={isSel}
                aria-disabled={o.disabled || undefined}
                className="c-option"
                onMouseMove={() => {
                  if (!o.disabled && active !== i) setActive(i);
                }}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit(i)}
              >
                {Icon && <Icon size={15} strokeWidth={1.8} aria-hidden="true" className="c-option__icon" />}
                <span className="c-option__text">
                  <span className="c-option__label">{o.label}</span>
                  {o.description != null && <span className="c-option__desc">{o.description}</span>}
                </span>
                <Check
                  size={15}
                  strokeWidth={2}
                  aria-hidden="true"
                  className="c-option__check"
                  style={{ visibility: isSel ? 'visible' : 'hidden' }}
                />
              </li>
            );
          })}
        </ul>
      </Popover>
    </Field>
  );
}
