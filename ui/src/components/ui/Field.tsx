import type { ReactNode } from 'react';
import { CircleAlert } from 'lucide-react';
import { useStableId } from './hooks';
import { cx } from './utils';
import './Field.css';

/** Ids derived from a control id: `${id}-label`, `${id}-hint`, `${id}-error`. */
export function fieldIds(id: string) {
  return { labelId: `${id}-label`, hintId: `${id}-hint`, errorId: `${id}-error` };
}

/** Ids + aria wiring for a control rendered inside <Field>. */
export function useField(opts: { id?: string; hint?: ReactNode; error?: ReactNode; prefix?: string }) {
  const id = useStableId(opts.prefix ?? 'field', opts.id);
  const ids = fieldIds(id);
  const hasError = opts.error != null && opts.error !== false && opts.error !== '';
  const hasHint = opts.hint != null && opts.hint !== false && opts.hint !== '';
  return {
    id,
    ...ids,
    describedBy: hasError ? ids.errorId : hasHint ? ids.hintId : undefined,
    invalid: hasError,
  };
}

export interface FieldProps {
  /** Id of the control: the label is a <label htmlFor={id}>. */
  id?: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Content on the right of the label row (e.g. a link or counter). */
  labelAside?: ReactNode;
  /** Use "span" for groups (radiogroup…) labelled with aria-labelledby={`${id}-label`}. */
  labelElement?: 'label' | 'span';
  className?: string;
  children: ReactNode;
}

/** Label + control + hint/error. Every form control of the library renders inside one. */
export function Field({
  id,
  label,
  hint,
  error,
  required,
  labelAside,
  labelElement = 'label',
  className,
  children,
}: FieldProps) {
  const autoId = useStableId('field');
  const fid = id ?? autoId;
  const { labelId, hintId, errorId } = fieldIds(fid);
  const hasError = error != null && error !== false && error !== '';
  const hasHint = hint != null && hint !== false && hint !== '';
  const LabelTag = labelElement;
  return (
    <div className={cx('c-field', className)}>
      {(label != null || labelAside != null) && (
        <div className="c-field__label-row">
          {label != null && (
            <LabelTag
              id={labelId}
              className="c-field__label"
              {...(labelElement === 'label' ? { htmlFor: fid } : {})}
            >
              {label}
              {required && (
                <span className="c-field__req" aria-hidden="true">
                  *
                </span>
              )}
            </LabelTag>
          )}
          {labelAside != null && <div className="c-field__aside">{labelAside}</div>}
        </div>
      )}
      {children}
      {hasError ? (
        <div id={errorId} className="c-field__error">
          <CircleAlert size={13} strokeWidth={2} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : hasHint ? (
        <div id={hintId} className="c-field__hint">
          {hint}
        </div>
      ) : null}
    </div>
  );
}
