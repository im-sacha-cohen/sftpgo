import type { ReactNode } from 'react';
import { Button } from './Button';
import { useHotkey } from './hooks';
import { cx } from './utils';
import './SaveBar.css';

export interface SaveBarProps {
  dirtyCount: number;
  /** Replaces the default "N modifications non enregistrées". */
  message?: ReactNode;
  onCancel: () => void;
  onSave: () => void;
  saving?: boolean;
  cancelLabel?: string;
  saveLabel?: string;
  /** Hide the bar when there is nothing to save (default true). */
  hideWhenClean?: boolean;
  className?: string;
}

/**
 * Sticky "unsaved changes" bar. Registers ⌘S / Ctrl+S while mounted (even in inputs)
 * and prevents the browser "save page" dialog.
 */
export function SaveBar({
  dirtyCount,
  message,
  onCancel,
  onSave,
  saving = false,
  cancelLabel = 'Annuler',
  saveLabel = 'Enregistrer',
  hideWhenClean = true,
  className,
}: SaveBarProps) {
  useHotkey(
    'mod+s',
    () => {
      if (!saving && dirtyCount > 0) onSave();
    },
    { allowInInputs: true },
  );

  if (hideWhenClean && dirtyCount <= 0 && !saving) return null;
  const n = dirtyCount;
  const text = message ?? (n > 1 ? `${n} modifications non enregistrées` : `${n} modification non enregistrée`);

  return (
    <div className={cx('c-savebar', className)} role="region" aria-label="Modifications non enregistrées">
      <span className="c-savebar__dot" aria-hidden="true" />
      <span className="c-savebar__msg" aria-live="polite">
        {text}
      </span>
      <div className="c-savebar__actions">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          {cancelLabel}
        </Button>
        <Button size="sm" variant="primary" onClick={onSave} loading={saving} disabled={n <= 0} kbd="mod+s">
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
