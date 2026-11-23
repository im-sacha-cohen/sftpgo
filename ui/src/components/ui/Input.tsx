import { forwardRef, useState } from 'react';
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { IconButton } from './Button';
import { Field, useField } from './Field';
import { cx } from './utils';

export type TextInputType = 'text' | 'password' | 'email' | 'search' | 'url' | 'tel';

interface FieldChrome {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Content on the right of the label row. */
  labelAside?: ReactNode;
  /** Class on the outer Field wrapper. */
  wrapperClassName?: string;
}

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix' | 'type'>,
    FieldChrome {
  type?: TextInputType;
  /** Rendered inside the box, before the text (icon, "https://"…). */
  prefix?: ReactNode;
  /** Rendered inside the box, after the text (unit, button…). */
  suffix?: ReactNode;
  /** JetBrains Mono for technical values (paths, keys, IPs). */
  mono?: boolean;
  size?: 'sm' | 'md';
  /** Class on the bordered box. */
  controlClassName?: string;
}

/** Text input with label/hint/error. Only text-like types are allowed. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    id: idProp,
    label,
    hint,
    error,
    labelAside,
    wrapperClassName,
    controlClassName,
    prefix,
    suffix,
    mono,
    size = 'md',
    className,
    required,
    disabled,
    type = 'text',
    'aria-describedby': ariaDescribedBy,
    ...rest
  },
  ref,
) {
  const f = useField({ id: idProp, hint, error, prefix: 'input' });
  return (
    <Field
      id={f.id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      labelAside={labelAside}
      className={wrapperClassName}
    >
      <div
        className={cx(
          'c-control',
          size === 'sm' && 'c-control--sm',
          mono && 'c-control--mono',
          f.invalid && 'is-invalid',
          disabled && 'is-disabled',
          controlClassName,
        )}
      >
        {prefix != null && <span className="c-control__affix">{prefix}</span>}
        <input
          ref={ref}
          id={f.id}
          type={type}
          className={cx('c-control__input', className)}
          required={required}
          disabled={disabled}
          aria-invalid={f.invalid || undefined}
          aria-describedby={cx(ariaDescribedBy, f.describedBy) || undefined}
          spellCheck={mono ? false : rest.spellCheck}
          {...rest}
        />
        {suffix != null && <span className="c-control__affix">{suffix}</span>}
      </div>
    </Field>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldChrome {
  mono?: boolean;
  controlClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    id: idProp,
    label,
    hint,
    error,
    labelAside,
    wrapperClassName,
    controlClassName,
    mono,
    className,
    required,
    disabled,
    rows = 4,
    'aria-describedby': ariaDescribedBy,
    ...rest
  },
  ref,
) {
  const f = useField({ id: idProp, hint, error, prefix: 'textarea' });
  return (
    <Field
      id={f.id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      labelAside={labelAside}
      className={wrapperClassName}
    >
      <div
        className={cx(
          'c-control c-control--textarea',
          mono && 'c-control--mono',
          f.invalid && 'is-invalid',
          disabled && 'is-disabled',
          controlClassName,
        )}
      >
        <textarea
          ref={ref}
          id={f.id}
          rows={rows}
          className={cx('c-control__input', className)}
          required={required}
          disabled={disabled}
          aria-invalid={f.invalid || undefined}
          aria-describedby={cx(ariaDescribedBy, f.describedBy) || undefined}
          spellCheck={mono ? false : rest.spellCheck}
          {...rest}
        />
      </div>
    </Field>
  );
});

export interface PasswordInputProps extends Omit<InputProps, 'type' | 'suffix'> {
  showLabel?: string;
  hideLabel?: string;
  defaultVisible?: boolean;
}

/** Password field with a show/hide toggle. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { showLabel = 'Afficher le mot de passe', hideLabel = 'Masquer le mot de passe', defaultVisible = false, disabled, ...rest },
  ref,
) {
  const [visible, setVisible] = useState(defaultVisible);
  return (
    <Input
      ref={ref}
      type={visible ? 'text' : 'password'}
      autoComplete="current-password"
      disabled={disabled}
      {...rest}
      suffix={
        <IconButton
          icon={visible ? EyeOff : Eye}
          label={visible ? hideLabel : showLabel}
          size="sm"
          className="c-control__iconbtn"
          aria-pressed={visible}
          disabled={disabled}
          onClick={() => setVisible((v) => !v)}
        />
      }
    />
  );
});
