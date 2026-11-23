import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx, nextEnabledIndex } from './utils';
import './SegmentedControl.css';

export interface SegmentedOption<T extends string = string> {
  value: T;
  label: ReactNode;
  count?: number;
  icon?: LucideIcon;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  /** Stretch segments to fill the width. */
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

/** Compact single choice (role=radiogroup, arrow keys move and select). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  fullWidth,
  disabled,
  className,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledby,
}: SegmentedControlProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const list = options.map((o) => ({ disabled: disabled || o.disabled }));
  const selectedIndex = options.findIndex((o) => o.value === value);
  const tabStop = selectedIndex >= 0 ? selectedIndex : nextEnabledIndex(list, -1, 1);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let dir: 1 | -1 | 0 = 0;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') dir = 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') dir = -1;
    let next = -1;
    if (dir) next = nextEnabledIndex(list, tabStop, dir);
    else if (e.key === 'Home') next = nextEnabledIndex(list, -1, 1);
    else if (e.key === 'End') next = nextEnabledIndex(list, list.length, -1);
    if (next < 0) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(options[next].value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledby}
      className={cx('c-seg', `c-seg--${size}`, fullWidth && 'c-seg--full', disabled && 'is-disabled', className)}
      onKeyDown={onKeyDown}
    >
      {options.map((o, i) => {
        const Icon = o.icon;
        const checked = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={i === tabStop ? 0 : -1}
            disabled={disabled || o.disabled}
            className="c-seg__item"
            onClick={() => onChange(o.value)}
          >
            {Icon && <Icon size={14} strokeWidth={1.8} aria-hidden="true" />}
            <span>{o.label}</span>
            {o.count != null && <span className="c-seg__count">{o.count.toLocaleString('fr-FR')}</span>}
          </button>
        );
      })}
    </div>
  );
}
