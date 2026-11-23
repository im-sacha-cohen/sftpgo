import { forwardRef, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Input } from './Input';
import type { InputProps } from './Input';
import { clamp } from './utils';
import './NumberInput.css';

export interface NumberInputProps
  extends Omit<InputProps, 'value' | 'defaultValue' | 'onChange' | 'type' | 'min' | 'max' | 'step' | 'suffix'> {
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  /** Step for the buttons and arrow keys (Shift / PageUp ×10). Default 1. */
  step?: number;
  /** Unit shown after the value ("Mo", "s", "%"). */
  unit?: ReactNode;
  /** Decimal places kept (default: inferred from `step`). */
  precision?: number;
  decrementLabel?: string;
  incrementLabel?: string;
}

function decimals(n: number) {
  const s = String(n);
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

/** Numeric field with custom −/+ steppers (no native number input). */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  {
    value,
    onChange,
    min,
    max,
    step = 1,
    unit,
    precision,
    decrementLabel = 'Diminuer',
    incrementLabel = 'Augmenter',
    disabled,
    readOnly,
    onBlur,
    onFocus,
    onKeyDown,
    ...rest
  },
  ref,
) {
  const prec = precision ?? decimals(step);
  const format = (v: number | null) => (v == null || Number.isNaN(v) ? '' : String(Number(v.toFixed(prec))));
  const [draft, setDraft] = useState(() => format(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(format(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, prec]);

  const lo = min ?? -Infinity;
  const hi = max ?? Infinity;
  const round = (n: number) => Number(n.toFixed(prec));

  const parse = (s: string): number | null | 'invalid' => {
    const t = s.replace(/\s/g, '').replace(',', '.');
    if (t === '' || t === '-') return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : 'invalid';
  };

  const commit = (n: number | null) => {
    onChange(n);
    setDraft(format(n));
  };

  const stepBy = (dir: 1 | -1, mult = 1) => {
    if (disabled || readOnly) return;
    const base = value ?? (dir > 0 ? (Number.isFinite(lo) ? lo - step : 0) : Number.isFinite(hi) ? hi + step : 0);
    commit(round(clamp(base + dir * step * mult, lo, hi)));
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        stepBy(1, e.shiftKey ? 10 : 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        stepBy(-1, e.shiftKey ? 10 : 1);
        break;
      case 'PageUp':
        e.preventDefault();
        stepBy(1, 10);
        break;
      case 'PageDown':
        e.preventDefault();
        stepBy(-1, 10);
        break;
      case 'Home':
        if (Number.isFinite(lo)) {
          e.preventDefault();
          commit(lo);
        }
        break;
      case 'End':
        if (Number.isFinite(hi)) {
          e.preventDefault();
          commit(hi);
        }
        break;
      default:
    }
  };

  const atMin = value != null && value <= lo;
  const atMax = value != null && value >= hi;

  return (
    <Input
      ref={ref}
      type="text"
      inputMode={prec > 0 || (min ?? 0) < 0 ? 'decimal' : 'numeric'}
      role="spinbutton"
      aria-valuenow={value ?? undefined}
      aria-valuemin={min}
      aria-valuemax={max}
      autoComplete="off"
      disabled={disabled}
      readOnly={readOnly}
      value={draft}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = parse(text);
        if (n !== 'invalid') onChange(n);
      }}
      onFocus={(e) => {
        focused.current = true;
        onFocus?.(e);
      }}
      onBlur={(e) => {
        focused.current = false;
        const n = parse(draft);
        if (n === 'invalid') setDraft(format(value));
        else if (n === null) commit(null);
        else commit(round(clamp(n, lo, hi)));
        onBlur?.(e);
      }}
      onKeyDown={handleKey}
      {...rest}
      controlClassName="c-num"
      suffix={
        <>
          {unit != null && <span className="c-num__unit">{unit}</span>}
          <span className="c-num__steppers">
            <button
              type="button"
              tabIndex={-1}
              className="c-num__step"
              aria-label={decrementLabel}
              disabled={disabled || readOnly || atMin}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => stepBy(-1)}
            >
              <Minus size={13} strokeWidth={2} aria-hidden="true" />
            </button>
            <button
              type="button"
              tabIndex={-1}
              className="c-num__step"
              aria-label={incrementLabel}
              disabled={disabled || readOnly || atMax}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => stepBy(1)}
            >
              <Plus size={13} strokeWidth={2} aria-hidden="true" />
            </button>
          </span>
        </>
      }
    />
  );
});
