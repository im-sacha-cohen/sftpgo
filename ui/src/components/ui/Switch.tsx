import { forwardRef } from 'react';
import type { ReactNode } from 'react';
import { useStableId } from './hooks';
import { cx } from './utils';
import './Switch.css';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
  size?: 'sm' | 'md';
  /** "end": text on the left, switch pushed to the right (settings rows). Default "start". */
  labelPosition?: 'start' | 'end';
  name?: string;
  className?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
}

/** On/off toggle (role=switch). */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  {
    checked,
    onChange,
    label,
    description,
    disabled,
    id: idProp,
    size = 'md',
    labelPosition = 'start',
    name,
    className,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedby,
  },
  ref,
) {
  const id = useStableId('switch', idProp);
  const descId = `${id}-desc`;
  return (
    <div
      className={cx(
        'c-switch',
        `c-switch--${size}`,
        labelPosition === 'end' && 'c-switch--end',
        disabled && 'is-disabled',
        className,
      )}
    >
      <button
        ref={ref}
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        aria-describedby={cx(ariaDescribedby, description != null && descId) || undefined}
        disabled={disabled}
        className="c-switch__track"
        onClick={() => onChange(!checked)}
      >
        <span className="c-switch__thumb" aria-hidden="true" />
      </button>
      {(label != null || description != null) && (
        <div className="c-switch__text">
          {label != null && (
            <label htmlFor={id} className="c-switch__label">
              {label}
            </label>
          )}
          {description != null && (
            <div id={descId} className="c-switch__desc">
              {description}
            </div>
          )}
        </div>
      )}
      {name && <input type="hidden" name={name} value={checked ? 'true' : 'false'} />}
    </div>
  );
});
