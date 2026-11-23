import type { ReactNode } from 'react';
import type { Tone } from './Badge';
import { cx } from './utils';
import './FilterChips.css';

export interface FilterChip<T extends string = string> {
  id: T;
  label: ReactNode;
  count?: number;
  /** Coloured dot before the label. */
  tone?: Tone;
}

export interface FilterChipsProps<T extends string> {
  chips: FilterChip<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  'aria-label'?: string;
}

/** Row of pill toggles for quick filters; the active one is inverted. */
export function FilterChips<T extends string>({ chips, value, onChange, className, 'aria-label': ariaLabel }: FilterChipsProps<T>) {
  return (
    <div role="group" aria-label={ariaLabel} className={cx('c-chips', className)}>
      {chips.map((c) => (
        <button
          key={c.id}
          type="button"
          aria-pressed={c.id === value}
          className="c-chip"
          onClick={() => onChange(c.id)}
        >
          {c.tone && <span className={cx('c-chip__dot', `c-chip__dot--${c.tone}`)} aria-hidden="true" />}
          <span>{c.label}</span>
          {c.count != null && <span className="c-chip__count">{c.count.toLocaleString('fr-FR')}</span>}
        </button>
      ))}
    </div>
  );
}
