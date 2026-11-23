import { useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Field, useField } from './Field';
import { nextEnabledIndex } from './utils';
import './RadioCards.css';

export interface RadioCardOption<T extends string = string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
}

export interface RadioCardsProps<T extends string> {
  options: RadioCardOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  /** Fixed number of columns. Default: auto-fill, min 180px per card. */
  columns?: number;
  id?: string;
  className?: string;
  'aria-label'?: string;
}

/** Grid of selectable cards (role=radiogroup, arrow keys move and select). */
export function RadioCards<T extends string>({
  options,
  value,
  onChange,
  label,
  hint,
  error,
  required,
  disabled,
  columns,
  id,
  className,
  'aria-label': ariaLabel,
}: RadioCardsProps<T>) {
  const f = useField({ id, hint, error, prefix: 'radiocards' });
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const list = options.map((o) => ({ disabled: disabled || o.disabled }));
  const selectedIndex = options.findIndex((o) => o.value === value);
  const tabStop = selectedIndex >= 0 && !list[selectedIndex].disabled ? selectedIndex : nextEnabledIndex(list, -1, 1);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = refs.current.findIndex((el) => el === document.activeElement);
    const from = current >= 0 ? current : tabStop;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = nextEnabledIndex(list, from, 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = nextEnabledIndex(list, from, -1);
    else if (e.key === 'Home') next = nextEnabledIndex(list, -1, 1);
    else if (e.key === 'End') next = nextEnabledIndex(list, list.length, -1);
    if (next < 0) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(options[next].value);
  };

  return (
    <Field id={f.id} label={label} hint={hint} error={error} required={required} labelElement="span" className={className}>
      <div
        id={f.id}
        role="radiogroup"
        aria-labelledby={label != null ? f.labelId : undefined}
        aria-label={label == null ? ariaLabel : undefined}
        aria-describedby={f.describedBy}
        aria-invalid={f.invalid || undefined}
        aria-required={required || undefined}
        className="c-rcards"
        style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
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
              className="c-rcard"
              onClick={() => onChange(o.value)}
            >
              <span className="c-rcard__head">
                {Icon && (
                  <span className="c-rcard__icon" aria-hidden="true">
                    <Icon size={16} strokeWidth={1.8} />
                  </span>
                )}
                <span className="c-rcard__label">{o.label}</span>
                <span className="c-rcard__radio" aria-hidden="true" />
              </span>
              {o.description != null && <span className="c-rcard__desc">{o.description}</span>}
            </button>
          );
        })}
      </div>
    </Field>
  );
}
