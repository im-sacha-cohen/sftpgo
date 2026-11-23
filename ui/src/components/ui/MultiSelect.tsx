import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { Button } from './Button';
import { Field, useField } from './Field';
import { Popover } from './Popover';
import { filterOptions } from './Select';
import type { SelectOption } from './Select';
import type { Placement } from './usePosition';
import { cx, isPrintableKey, nextEnabledIndex, scrollIntoContainer } from './utils';
import './Select.css';

export interface MultiSelectProps<T extends string> {
  options: SelectOption<T>[];
  values: T[];
  onChange: (values: T[]) => void;
  placeholder?: string;
  /** Search box in the popover (default true). */
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyLabel?: string;
  clearLabel?: string;
  /** Text for the selection count in the footer. */
  countLabel?: (n: number) => string;
  /** Max chips shown in the trigger before "+N" (default 3). */
  maxChips?: number;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md';
  mono?: boolean;
  id?: string;
  name?: string;
  className?: string;
  placement?: Placement;
  'aria-label'?: string;
}

/** Multiple choice among known options; chips in the trigger, checkable listbox in a popover. */
export function MultiSelect<T extends string>(props: MultiSelectProps<T>) {
  const {
    options,
    values,
    onChange,
    placeholder = 'Sélectionner…',
    searchable = true,
    searchPlaceholder = 'Rechercher…',
    emptyLabel = 'Aucun résultat',
    clearLabel = 'Effacer',
    countLabel = (n: number) => (n > 1 ? `${n} sélectionnés` : `${n} sélectionné`),
    maxChips = 3,
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
    'aria-label': ariaLabel,
  } = props;
  const f = useField({ id, hint, error, prefix: 'mselect' });
  const listId = `${f.id}-listbox`;
  const optId = (i: number) => `${f.id}-opt-${i}`;
  const btnRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const suppressClick = useRef(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);

  const set = useMemo(() => new Set<string>(values), [values]);
  const visible = useMemo(() => (searchable ? filterOptions(options, query) : options), [options, query, searchable]);
  const selectedOptions = options.filter((o) => set.has(o.value));

  const openList = () => {
    if (disabled) return;
    setQuery('');
    setActive(nextEnabledIndex(options, -1, 1));
    setOpen(true);
  };
  const close = (focusTrigger: boolean) => {
    setOpen(false);
    setQuery('');
    if (focusTrigger) btnRef.current?.focus({ preventScroll: true });
  };
  const toggle = (i: number) => {
    const o = visible[i];
    if (!o || o.disabled) return;
    onChange(set.has(o.value) ? values.filter((v) => v !== o.value) : [...values, o.value]);
  };

  useEffect(() => {
    if (open && searchable) searchRef.current?.focus({ preventScroll: true });
  }, [open, searchable]);

  useEffect(() => {
    if (!open || active < 0) return;
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (list && el) scrollIntoContainer(list, el);
  }, [open, active, visible]);

  const handleListKey = (e: KeyboardEvent<HTMLElement>, fromSearch: boolean) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((c) => nextEnabledIndex(visible, c, 1, false));
        return true;
      case 'ArrowUp':
        e.preventDefault();
        setActive((c) => nextEnabledIndex(visible, c < 0 ? visible.length : c, -1, false));
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
        if (active >= 0) toggle(active);
        return true;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close(true);
        return true;
      case 'Tab':
        close(fromSearch);
        return true;
      default:
        return false;
    }
  };

  const chips = selectedOptions.slice(0, maxChips);
  const more = selectedOptions.length - chips.length;

  return (
    <Field id={f.id} label={label} hint={hint} error={error} required={required} className={className}>
      <button
        ref={btnRef}
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
        onKeyDown={(e) => {
          if (disabled) return;
          if (!open) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              openList();
            } else if (searchable && isPrintableKey(e) && e.key !== ' ') {
              e.preventDefault();
              openList();
              setQuery(e.key);
              setActive(nextEnabledIndex(filterOptions(options, e.key), -1, 1));
            }
            return;
          }
          if (searchable) return;
          if (e.key === ' ') {
            e.preventDefault();
            suppressClick.current = true;
            if (active >= 0) toggle(active);
            return;
          }
          if (e.key === 'Enter') suppressClick.current = true;
          handleListKey(e, false);
        }}
      >
        {selectedOptions.length ? (
          <span className={cx('c-ms-chips', mono && 'c-control--mono')}>
            {chips.map((o) => (
              <span key={o.value} className="c-ms-chip" style={mono ? { fontFamily: 'var(--mono)' } : undefined}>
                {o.label}
              </span>
            ))}
            {more > 0 && <span className="c-ms-more">+{more}</span>}
          </span>
        ) : (
          <span className="c-select-trigger__value">
            <span className="c-select-trigger__placeholder">{placeholder}</span>
          </span>
        )}
        <ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" className="c-select-trigger__chevron" />
      </button>
      {name && values.map((v) => <input key={v} type="hidden" name={name} value={v} />)}

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
          aria-multiselectable="true"
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
            const isSel = set.has(o.value);
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
                onClick={() => {
                  setActive(i);
                  toggle(i);
                }}
              >
                <span className="c-option__box" aria-hidden="true">
                  {isSel && <Check size={12} strokeWidth={3} />}
                </span>
                {Icon && <Icon size={15} strokeWidth={1.8} aria-hidden="true" className="c-option__icon" />}
                <span className="c-option__text">
                  <span className="c-option__label">{o.label}</span>
                  {o.description != null && <span className="c-option__desc">{o.description}</span>}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="c-listbox-footer">
          <span aria-live="polite">{countLabel(values.length)}</span>
          <Button
            size="sm"
            variant="ghost"
            disabled={!values.length}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange([])}
          >
            {clearLabel}
          </Button>
        </div>
      </Popover>
    </Field>
  );
}
