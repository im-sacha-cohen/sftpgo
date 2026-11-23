import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, CornerLeftUp, File, Folder, Home, Plus, Check } from 'lucide-react';
import { EmptyState, IconButton, Skeleton } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { baseName, dirKey, errMsg, isDir, joinPath, listDir, parentPath, splitPath } from './api';
import { filesDict } from './i18n';

interface PathBrowserProps {
  /** Directory being browsed. */
  dir: string;
  onDirChange: (dir: string) => void;
  /** List files too (folders only otherwise). */
  showFiles?: boolean;
  /** When set, each row gets an "add" button. */
  onPick?: (path: string) => void;
  /** Already picked paths (shows a check instead of the add button). */
  picked?: string[];
  /** Folders that cannot be entered (e.g. the folders being moved). */
  disabled?: (path: string) => boolean;
  pickLabel?: string;
}

/** Compact folder browser used by the move/copy drawer and the share editor. */
export function PathBrowser({ dir, onDirChange, showFiles, onPick, picked = [], disabled, pickLabel }: PathBrowserProps) {
  const t = useT(filesDict);
  const q = useQuery({ queryKey: dirKey(dir), queryFn: ({ signal }) => listDir(dir, signal) });
  const rows = useMemo(() => {
    const all = (q.data ?? []).filter((e) => showFiles || isDir(e));
    return all.sort((a, b) => Number(isDir(b)) - Number(isDir(a)) || (a.name ?? '').localeCompare(b.name ?? '', undefined, { numeric: true }));
  }, [q.data, showFiles]);
  const segs = splitPath(dir);

  return (
    <div className="files-picker">
      <nav className="files-crumbs files-crumbs--compact" aria-label={t('destination')}>
        <button type="button" className="files-crumbs__seg" onClick={() => onDirChange('/')}>
          <Home size={13} aria-hidden="true" />
          <span className="sr-only">{t('root')}</span>
        </button>
        {segs.map((s, i) => (
          <span key={i} className="files-crumbs__item">
            <ChevronRight size={12} aria-hidden="true" className="files-crumbs__sep" />
            <button type="button" className="files-crumbs__seg mono" onClick={() => onDirChange('/' + segs.slice(0, i + 1).join('/'))}>
              {s}
            </button>
          </span>
        ))}
      </nav>
      <ul className="files-picker__list">
        {dir !== '/' && (
          <li>
            <button type="button" className="files-picker__row" onClick={() => onDirChange(parentPath(dir))}>
              <CornerLeftUp size={14} aria-hidden="true" />
              <span className="mono">..</span>
            </button>
          </li>
        )}
        {q.isLoading &&
          Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="files-picker__skeleton">
              <Skeleton height={10} width={`${40 + i * 12}%`} />
            </li>
          ))}
        {q.isError && (
          <li>
            <EmptyState compact title={t('loadError')} description={errMsg(q.error)} />
          </li>
        )}
        {!q.isLoading && !q.isError && rows.length === 0 && (
          <li className="files-picker__empty muted">{t('emptyRO')}</li>
        )}
        {rows.map((e) => {
          const name = e.name ?? '';
          const p = joinPath(dir, name);
          const folder = isDir(e);
          const off = disabled?.(p) ?? false;
          const isPicked = picked.includes(p);
          return (
            <li key={name} className="files-picker__item">
              <button
                type="button"
                className="files-picker__row"
                disabled={off || !folder}
                onClick={() => folder && onDirChange(p)}
              >
                {folder ? <Folder size={14} aria-hidden="true" className="files-icon--dir" /> : <File size={14} aria-hidden="true" />}
                <span className="mono files-picker__name">{name}</span>
              </button>
              {onPick &&
                (isPicked ? (
                  <Check size={14} className="files-picker__picked" aria-label={baseName(p)} />
                ) : (
                  <IconButton icon={Plus} size="sm" label={`${pickLabel ?? '+'} ${name}`} onClick={() => onPick(p)} />
                ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
