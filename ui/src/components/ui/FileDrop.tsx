import { useRef, useState } from 'react';
import type { DragEvent, ReactNode } from 'react';
import { Upload } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from './Button';
import { useStableId } from './hooks';
import { cx } from './utils';
import './FileDrop.css';

export interface FileDropProps {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  /** Same syntax as the native `accept` attribute (".json,application/json", "image/*"). */
  accept?: string;
  label: ReactNode;
  hint?: ReactNode;
  browseLabel?: string;
  disabled?: boolean;
  icon?: LucideIcon;
  compact?: boolean;
  className?: string;
}

function matchesAccept(file: File, accept?: string): boolean {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return accept
    .split(',')
    .map((a) => a.trim().toLowerCase())
    .filter(Boolean)
    .some((a) => {
      if (a.startsWith('.')) return name.endsWith(a);
      if (a.endsWith('/*')) return type.startsWith(a.slice(0, -1));
      return type === a;
    });
}

/** Dashed drop zone with a custom "Parcourir" button (hidden native file input). */
export function FileDrop({
  onFiles,
  multiple = false,
  accept,
  label,
  hint,
  browseLabel = 'Parcourir',
  disabled,
  icon: Icon = Upload,
  compact,
  className,
}: FileDropProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const hintId = useStableId('drop-hint');

  const emit = (list: FileList | null) => {
    if (!list || disabled) return;
    let files = Array.from(list).filter((f) => matchesAccept(f, accept));
    if (!multiple) files = files.slice(0, 1);
    if (files.length) onFiles(files);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (disabled || !Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    if (!over) setOver(true);
  };

  return (
    <div
      className={cx('c-drop', over && 'is-over', disabled && 'is-disabled', compact && 'c-drop--compact', className)}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        emit(e.dataTransfer.files);
      }}
    >
      <div className="c-drop__icon" aria-hidden="true">
        <Icon size={18} strokeWidth={1.8} />
      </div>
      <div className="c-drop__text">
        <div className="c-drop__label">{label}</div>
        {hint != null && (
          <div id={hintId} className="c-drop__hint">
            {hint}
          </div>
        )}
      </div>
      <Button
        size="sm"
        disabled={disabled}
        aria-describedby={hint != null ? hintId : undefined}
        onClick={() => inputRef.current?.click()}
      >
        {browseLabel}
      </Button>
      <input
        ref={inputRef}
        type="file"
        hidden
        tabIndex={-1}
        multiple={multiple}
        accept={accept}
        onChange={(e) => {
          emit(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
