import { forwardRef, useMemo, useRef, useState } from 'react';
import type { ClipboardEvent, KeyboardEvent, ReactNode } from 'react';
import { X } from 'lucide-react';
import { Field, useField } from './Field';
import { cx, mergeRefs } from './utils';
import './TagInput.css';

export interface TagInputProps {
  values: string[];
  onChange: (values: string[]) => void;
  /** Return an error message to reject a value, or null to accept it. */
  validate?: (value: string) => string | null;
  /** Normalise a value before validation (e.g. lowercase). */
  transform?: (value: string) => string;
  allowDuplicates?: boolean;
  duplicateMessage?: (value: string) => string;
  maxTags?: number;
  placeholder?: string;
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  mono?: boolean;
  size?: 'sm' | 'md';
  id?: string;
  name?: string;
  className?: string;
  removeLabel?: (value: string) => string;
  'aria-label'?: string;
}

const SPLIT = /[\s,;]+/;

/** Free-text chips: Enter, comma or paste adds; Backspace on an empty field removes the last chip. */
export const TagInput = forwardRef<HTMLInputElement, TagInputProps>(function TagInput(
  {
    values,
    onChange,
    validate,
    transform,
    allowDuplicates = false,
    duplicateMessage = (v) => `« ${v} » est déjà dans la liste`,
    maxTags,
    placeholder = 'Ajouter…',
    label,
    hint,
    error,
    required,
    disabled,
    mono,
    size = 'md',
    id,
    name,
    className,
    removeLabel = (v) => `Retirer ${v}`,
    'aria-label': ariaLabel,
  },
  ref,
) {
  const [draft, setDraft] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mergedRef = useMemo(() => mergeRefs<HTMLInputElement>(inputRef, ref), [ref]);
  const shownError = localError ?? error;
  const f = useField({ id, hint, error: shownError, prefix: 'tags' });
  const full = maxTags != null && values.length >= maxTags;

  /** Adds raw values; returns the rejected text (kept in the field). */
  const add = (raw: string[]): void => {
    const next = [...values];
    const rejected: string[] = [];
    let firstError: string | null = null;
    for (const r of raw) {
      let v = r.trim();
      if (!v) continue;
      if (transform) v = transform(v);
      let msg: string | null = null;
      if (maxTags != null && next.length >= maxTags) msg = `Maximum ${maxTags} éléments`;
      else if (!allowDuplicates && next.includes(v)) msg = duplicateMessage(v);
      else if (validate) msg = validate(v);
      if (msg) {
        rejected.push(r.trim());
        firstError ??= msg;
      } else next.push(v);
    }
    if (next.length !== values.length) onChange(next);
    setDraft(rejected.join(', '));
    setLocalError(firstError);
  };

  const remove = (i: number) => {
    onChange(values.filter((_, k) => k !== i));
    setLocalError(null);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === ';') {
      if (draft.trim()) {
        e.preventDefault();
        add([draft]);
      } else if (e.key !== 'Enter') e.preventDefault();
    } else if (e.key === 'Backspace' && draft === '' && values.length && !disabled) {
      e.preventDefault();
      onChange(values.slice(0, -1));
      setLocalError(null);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!SPLIT.test(text.trim())) return;
    e.preventDefault();
    add((draft + text).split(SPLIT));
  };

  return (
    <Field id={f.id} label={label} hint={hint} error={shownError} required={required} className={className}>
      <div
        className={cx(
          'c-control c-tags',
          size === 'sm' && 'c-control--sm',
          mono && 'c-control--mono',
          f.invalid && 'is-invalid',
          disabled && 'is-disabled',
        )}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
      >
        {values.map((v, i) => (
          <span key={`${v}-${i}`} className="c-tag">
            <span className="c-tag__text">{v}</span>
            <button
              type="button"
              className="c-tag__remove"
              aria-label={removeLabel(v)}
              disabled={disabled}
              onClick={() => remove(i)}
            >
              <X size={12} strokeWidth={2} aria-hidden="true" />
            </button>
          </span>
        ))}
        <input
          ref={mergedRef}
          id={f.id}
          type="text"
          className="c-control__input c-tags__input"
          value={draft}
          placeholder={full ? '' : placeholder}
          disabled={disabled || full}
          aria-label={label == null ? ariaLabel : undefined}
          aria-invalid={f.invalid || undefined}
          aria-describedby={f.describedBy}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.target.value);
            if (localError) setLocalError(null);
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={() => {
            if (draft.trim()) add([draft]);
          }}
        />
      </div>
      {name && values.map((v) => <input key={v} type="hidden" name={name} value={v} />)}
    </Field>
  );
});
