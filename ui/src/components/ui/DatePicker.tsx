import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Button, IconButton } from './Button';
import { Field, useField } from './Field';
import { Popover } from './Popover';
import { trapTabKey, useStableId } from './hooks';
import type { Placement } from './usePosition';
import { clamp, cx } from './utils';
import './DatePicker.css';

export interface DatePickerLabels {
  placeholder: string;
  dialog: string;
  today: string;
  now: string;
  clear: string;
  clearDate: string;
  prevMonth: string;
  nextMonth: string;
  time: string;
  hours: string;
  minutes: string;
  done: string;
}

const DEFAULT_LABELS: DatePickerLabels = {
  placeholder: 'Choisir une date',
  dialog: 'Choisir une date',
  today: "Aujourd'hui",
  now: 'Maintenant',
  clear: 'Effacer',
  clearDate: 'Effacer la date',
  prevMonth: 'Mois précédent',
  nextMonth: 'Mois suivant',
  time: 'Heure',
  hours: 'Heures',
  minutes: 'Minutes',
  done: 'Valider',
};

export interface DatePickerProps {
  value: Date | null;
  onChange: (value: Date | null) => void;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  min?: Date;
  max?: Date;
  /** Show a clear button (default false). */
  clearable?: boolean;
  /** Also pick hours and minutes. */
  withTime?: boolean;
  /** BCP 47 locale for month/day names and formatting (default "fr-FR"). Weeks start on Monday. */
  locale?: string;
  placeholder?: string;
  size?: 'sm' | 'md';
  id?: string;
  /** Hidden input with the ISO string, for native form posts. */
  name?: string;
  className?: string;
  placement?: Placement;
  labels?: Partial<DatePickerLabels>;
  'aria-label'?: string;
}

/* ---- date helpers (local time) ---- */
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d: Date, n: number) => {
  const t = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return new Date(t.getFullYear(), t.getMonth(), Math.min(d.getDate(), last));
};
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Monday = 0 … Sunday = 6 */
const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function monthGrid(month: Date): Date[][] {
  const first = startOfMonth(month);
  const start = addDays(first, -weekdayIndex(first));
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, w * 7 + i)));
  return weeks;
}

/** Date (and optional time) picker with a custom calendar popover. */
export function DatePicker({
  value,
  onChange,
  label,
  hint,
  error,
  required,
  disabled,
  min,
  max,
  clearable = false,
  withTime = false,
  locale = 'fr-FR',
  placeholder,
  size = 'md',
  id,
  name,
  className,
  placement = 'bottom-start',
  labels: labelsProp,
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const L = { ...DEFAULT_LABELS, ...labelsProp };
  const f = useField({ id, hint, error, prefix: 'date' });
  const monthLabelId = useStableId('cal-month');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const shouldFocusGrid = useRef(false);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => startOfMonth(value ?? new Date()));
  const [focused, setFocused] = useState(() => startOfDay(value ?? new Date()));

  const fmt = useMemo(() => {
    const display = new Intl.DateTimeFormat(
      locale,
      withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' },
    );
    const full = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const month = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' });
    const wdShort = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const wdLong = new Intl.DateTimeFormat(locale, { weekday: 'long' });
    // 2024-01-01 is a Monday.
    const weekdays = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(2024, 0, 1 + i);
      return { short: capitalize(wdShort.format(d).replace(/\.$/, '')), long: wdLong.format(d) };
    });
    return { display, full, month, weekdays };
  }, [locale, withTime]);

  const minDay = min ? startOfDay(min).getTime() : -Infinity;
  const maxDay = max ? startOfDay(max).getTime() : Infinity;
  const isDisabledDay = (d: Date) => {
    const t = startOfDay(d).getTime();
    return t < minDay || t > maxDay;
  };
  const clampDay = (d: Date) => new Date(clamp(startOfDay(d).getTime(), minDay, maxDay));

  const openCalendar = () => {
    if (disabled) return;
    const base = clampDay(value ?? new Date());
    setFocused(base);
    setView(startOfMonth(base));
    shouldFocusGrid.current = true;
    setOpen(true);
  };
  const close = (focusTrigger: boolean) => {
    setOpen(false);
    if (focusTrigger) triggerRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (!open || !shouldFocusGrid.current) return;
    shouldFocusGrid.current = false;
    gridRef.current?.querySelector<HTMLElement>(`[data-day="${dayKey(focused)}"]`)?.focus({ preventScroll: true });
  }, [open, focused, view]);

  const withTimeOf = (day: Date, src: Date | null) =>
    new Date(day.getFullYear(), day.getMonth(), day.getDate(), src ? src.getHours() : 0, src ? src.getMinutes() : 0);

  const selectDay = (day: Date) => {
    if (isDisabledDay(day)) return;
    setFocused(startOfDay(day));
    if (day.getMonth() !== view.getMonth()) setView(startOfMonth(day));
    onChange(withTime ? withTimeOf(day, value) : startOfDay(day));
    if (!withTime) close(true);
  };

  const moveFocus = (next: Date) => {
    setFocused(startOfDay(next));
    setView(startOfMonth(next));
    shouldFocusGrid.current = true;
  };

  const onGridKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next: Date | null = null;
    switch (e.key) {
      case 'ArrowLeft':
        next = addDays(focused, -1);
        break;
      case 'ArrowRight':
        next = addDays(focused, 1);
        break;
      case 'ArrowUp':
        next = addDays(focused, -7);
        break;
      case 'ArrowDown':
        next = addDays(focused, 7);
        break;
      case 'Home':
        next = addDays(focused, -weekdayIndex(focused));
        break;
      case 'End':
        next = addDays(focused, 6 - weekdayIndex(focused));
        break;
      case 'PageUp':
        next = addMonths(focused, e.shiftKey ? -12 : -1);
        break;
      case 'PageDown':
        next = addMonths(focused, e.shiftKey ? 12 : 1);
        break;
      default:
    }
    if (next) {
      e.preventDefault();
      moveFocus(next);
    }
  };

  const navMonth = (delta: number) => {
    const v = addMonths(view, delta);
    setView(startOfMonth(v));
    setFocused(startOfDay(addMonths(focused, delta)));
  };

  const setTime = (h: number, m: number) => {
    const base = value ?? focused;
    onChange(new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m));
  };

  const today = startOfDay(new Date());
  const weeks = monthGrid(view);
  const displayText = value ? fmt.display.format(value) : null;

  return (
    <Field id={f.id} label={label} hint={hint} error={error} required={required} className={className}>
      <div className={cx('c-date', clearable && value && !disabled && 'has-clear')}>
        <button
          ref={triggerRef}
          id={f.id}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-labelledby={label != null ? `${f.labelId} ${f.id}` : undefined}
          aria-label={label == null ? ariaLabel : undefined}
          aria-describedby={f.describedBy}
          aria-invalid={f.invalid || undefined}
          aria-required={required || undefined}
          disabled={disabled}
          className={cx(
            'c-control c-date__trigger',
            size === 'sm' && 'c-control--sm',
            f.invalid && 'is-invalid',
            disabled && 'is-disabled',
          )}
          onClick={() => (open ? close(true) : openCalendar())}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && !open) {
              e.preventDefault();
              openCalendar();
            }
          }}
        >
          <Calendar size={15} strokeWidth={1.8} aria-hidden="true" className="c-date__icon" />
          <span className={cx('c-date__value', !displayText && 'is-placeholder')}>
            {displayText ?? placeholder ?? L.placeholder}
          </span>
        </button>
        {clearable && value && !disabled && (
          <IconButton
            icon={X}
            label={L.clearDate}
            size="sm"
            className="c-date__clear"
            onClick={() => {
              onChange(null);
              triggerRef.current?.focus();
            }}
          />
        )}
      </div>
      {name && <input type="hidden" name={name} value={value ? value.toISOString() : ''} />}

      <Popover
        anchorRef={triggerRef}
        open={open}
        onClose={() => close(false)}
        placement={placement}
        closeOnAncestorScroll
        role="dialog"
        aria-modal="false"
        aria-label={L.dialog}
        className="c-cal"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close(true);
            return;
          }
          trapTabKey(e, e.currentTarget);
        }}
      >
        <div className="c-cal__head">
          <IconButton icon={ChevronLeft} label={L.prevMonth} size="sm" onClick={() => navMonth(-1)} />
          <div id={monthLabelId} className="c-cal__title" aria-live="polite">
            {capitalize(fmt.month.format(view))}
          </div>
          <IconButton icon={ChevronRight} label={L.nextMonth} size="sm" onClick={() => navMonth(1)} />
        </div>

        <div ref={gridRef} role="grid" aria-labelledby={monthLabelId} className="c-cal__grid" onKeyDown={onGridKeyDown}>
          <div role="row" className="c-cal__row">
            {fmt.weekdays.map((w) => (
              <div key={w.long} role="columnheader" className="c-cal__wd">
                <span aria-hidden="true">{w.short}</span>
                <span className="sr-only">{w.long}</span>
              </div>
            ))}
          </div>
          {weeks.map((week) => (
            <div key={dayKey(week[0])} role="row" className="c-cal__row">
              {week.map((day) => {
                const isSel = !!value && sameDay(day, value);
                const outside = day.getMonth() !== view.getMonth();
                const dis = isDisabledDay(day);
                const isFocus = sameDay(day, focused);
                return (
                  <div key={dayKey(day)} role="gridcell" aria-selected={isSel}>
                    <button
                      type="button"
                      data-day={dayKey(day)}
                      tabIndex={isFocus ? 0 : -1}
                      aria-label={fmt.full.format(day)}
                      aria-current={sameDay(day, today) ? 'date' : undefined}
                      aria-disabled={dis || undefined}
                      className={cx(
                        'c-cal__day',
                        outside && 'is-outside',
                        isSel && 'is-selected',
                        sameDay(day, today) && 'is-today',
                        dis && 'is-disabled',
                      )}
                      onClick={() => selectDay(day)}
                    >
                      {day.getDate()}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {withTime && (
          <div className="c-cal__time">
            <span className="c-cal__time-label">{L.time}</span>
            <TimeField
              hours={value ? value.getHours() : 0}
              minutes={value ? value.getMinutes() : 0}
              onChange={setTime}
              hoursLabel={L.hours}
              minutesLabel={L.minutes}
            />
          </div>
        )}

        <div className="c-cal__foot">
          <Button
            size="sm"
            variant="ghost"
            disabled={isDisabledDay(today)}
            onClick={() => {
              if (withTime) {
                const now = new Date();
                now.setSeconds(0, 0);
                onChange(now);
                moveFocus(now);
              } else selectDay(today);
            }}
          >
            {withTime ? L.now : L.today}
          </Button>
          <span className="c-cal__spacer" />
          {clearable && value && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onChange(null);
                close(true);
              }}
            >
              {L.clear}
            </Button>
          )}
          {withTime && (
            <Button size="sm" variant="primary" onClick={() => close(true)}>
              {L.done}
            </Button>
          )}
        </div>
      </Popover>
    </Field>
  );
}

/* ---- Time segments: two numeric text fields (HH : MM), no native time input ---- */
interface TimeFieldProps {
  hours: number;
  minutes: number;
  onChange: (h: number, m: number) => void;
  hoursLabel: string;
  minutesLabel: string;
}

function TimeField({ hours, minutes, onChange, hoursLabel, minutesLabel }: TimeFieldProps) {
  return (
    <div className="c-time">
      <TimeSegment value={hours} max={23} label={hoursLabel} onChange={(h) => onChange(h, minutes)} />
      <span className="c-time__sep" aria-hidden="true">
        :
      </span>
      <TimeSegment value={minutes} max={59} label={minutesLabel} onChange={(m) => onChange(hours, m)} />
    </div>
  );
}

function TimeSegment({ value, max, label, onChange }: { value: number; max: number; label: string; onChange: (v: number) => void }) {
  const [draft, setDraft] = useState(pad(value));
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(pad(value));
  }, [value]);
  const set = (v: number) => {
    const n = ((v % (max + 1)) + max + 1) % (max + 1);
    onChange(n);
    setDraft(pad(n));
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      role="spinbutton"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      maxLength={2}
      className="c-time__seg"
      value={draft}
      onFocus={(e) => {
        editing.current = true;
        e.currentTarget.select();
      }}
      onBlur={() => {
        editing.current = false;
        const n = parseInt(draft, 10);
        if (Number.isNaN(n)) setDraft(pad(value));
        else set(clamp(n, 0, max));
      }}
      onChange={(e) => {
        const t = e.target.value.replace(/\D/g, '').slice(0, 2);
        setDraft(t);
        const n = parseInt(t, 10);
        if (!Number.isNaN(n) && n <= max) onChange(n);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          set(value + 1);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          set(value - 1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
          e.currentTarget.focus();
        }
      }}
    />
  );
}
