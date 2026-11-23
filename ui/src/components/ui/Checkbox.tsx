import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { Check, Minus } from 'lucide-react';
import { useStableId } from './hooks';
import { cx } from './utils';
import './Checkbox.css';

export interface CheckboxProps {
  checked: boolean;
  /** Mixed state (e.g. "select all" with a partial selection). Clicking checks everything. */
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  /** Renders a hidden input for native form posts. */
  name?: string;
  value?: string;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

/** Custom checkbox (role=checkbox, Space toggles). */
export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  {
    checked,
    indeterminate = false,
    onChange,
    label,
    description,
    disabled,
    id: idProp,
    name,
    value,
    className,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledby,
    'aria-describedby': ariaDescribedby,
  },
  ref,
) {
  const id = useStableId('check', idProp);
  const descId = `${id}-desc`;
  const state = indeterminate ? 'mixed' : checked;
  return (
    <div className={cx('c-check', disabled && 'is-disabled', className)}>
      <button
        ref={ref}
        id={id}
        type="button"
        role="checkbox"
        aria-checked={state}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-describedby={cx(ariaDescribedby, description != null && descId) || undefined}
        disabled={disabled}
        className="c-check__box"
        onClick={() => onChange(indeterminate ? true : !checked)}
        onKeyDown={(e) => {
          // Checkboxes toggle with Space only.
          if (e.key === 'Enter') e.preventDefault();
        }}
      >
        {indeterminate ? (
          <Minus size={12} strokeWidth={3} aria-hidden="true" />
        ) : checked ? (
          <Check size={12} strokeWidth={3} aria-hidden="true" />
        ) : null}
      </button>
      {(label != null || description != null) && (
        <div className="c-check__text">
          {label != null && (
            <label htmlFor={id} className="c-check__label">
              {label}
            </label>
          )}
          {description != null && (
            <div id={descId} className="c-check__desc">
              {description}
            </div>
          )}
        </div>
      )}
      {name && checked && <input type="hidden" name={name} value={value ?? 'on'} />}
    </div>
  );
});
