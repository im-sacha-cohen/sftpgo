import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox } from 'lucide-react';
import { Checkbox } from './Checkbox';
import { EmptyState, Skeleton } from './EmptyState';
import { cx } from './utils';
import './DataTable.css';

export interface Column<T> {
  id: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  sortable?: boolean;
  width?: number | string;
  minWidth?: number | string;
  align?: 'left' | 'center' | 'right';
  /** Monospace cell content. */
  mono?: boolean;
  className?: string;
}

export type SortDirection = 'asc' | 'desc';
export type SortState = { id: string; dir: SortDirection } | null;

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectionChange?: (selected: Set<string>) => void;
  sort?: SortState;
  /** Called with the next sort: asc → desc → null (unsorted). */
  onSortChange?: (sort: SortState) => void;
  loading?: boolean;
  /** Skeleton rows shown while loading (default 6). */
  skeletonRows?: number;
  empty?: ReactNode;
  onRowClick?: (row: T) => void;
  /** Limit height: the body scrolls and the header stays sticky. */
  maxHeight?: number | string;
  dense?: boolean;
  rowClassName?: (row: T) => string | undefined;
  className?: string;
  'aria-label'?: string;
  selectAllLabel?: string;
  selectRowLabel?: (row: T) => string;
}

const INTERACTIVE = 'button, a, input, textarea, label, [role="checkbox"], [role="switch"], [role="menuitem"], [role="option"]';

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  selectable = false,
  selected,
  onSelectionChange,
  sort,
  onSortChange,
  loading = false,
  skeletonRows = 6,
  empty,
  onRowClick,
  maxHeight,
  dense,
  rowClassName,
  className,
  'aria-label': ariaLabel,
  selectAllLabel = 'Tout sélectionner',
  selectRowLabel = () => 'Sélectionner la ligne',
}: DataTableProps<T>) {
  const sel = selected ?? new Set<string>();
  const keys = rows.map(rowKey);
  const selCount = keys.filter((k) => sel.has(k)).length;
  const all = keys.length > 0 && selCount === keys.length;
  const some = selCount > 0 && !all;
  const colCount = columns.length + (selectable ? 1 : 0);

  const toggleAll = (checked: boolean) => {
    const next = new Set(sel);
    for (const k of keys) {
      if (checked) next.add(k);
      else next.delete(k);
    }
    onSelectionChange?.(next);
  };
  const toggleRow = (k: string, checked: boolean) => {
    const next = new Set(sel);
    if (checked) next.add(k);
    else next.delete(k);
    onSelectionChange?.(next);
  };

  const nextSort = (id: string): SortState => {
    if (!sort || sort.id !== id) return { id, dir: 'asc' };
    if (sort.dir === 'asc') return { id, dir: 'desc' };
    return null;
  };

  const cellStyle = (c: Column<T>): CSSProperties => ({
    width: c.width,
    minWidth: c.minWidth,
    textAlign: c.align,
  });

  const onRowClickGuard = (e: MouseEvent<HTMLTableRowElement>, row: T) => {
    const target = e.target as HTMLElement;
    const hit = target.closest(INTERACTIVE);
    if (hit && hit !== e.currentTarget) return;
    if (window.getSelection()?.toString()) return;
    onRowClick?.(row);
  };

  return (
    <div className={cx('c-table-wrap', className)} style={{ maxHeight }}>
      <table className={cx('c-table', dense && 'c-table--dense')} aria-label={ariaLabel} aria-busy={loading || undefined}>
        <thead>
          <tr>
            {selectable && (
              <th className="c-table__check" scope="col">
                <Checkbox
                  checked={all}
                  indeterminate={some}
                  onChange={toggleAll}
                  aria-label={selectAllLabel}
                  disabled={loading || !rows.length}
                />
              </th>
            )}
            {columns.map((c) => {
              const sorted = sort?.id === c.id ? sort.dir : null;
              const SortIcon = sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ChevronsUpDown;
              return (
                <th
                  key={c.id}
                  scope="col"
                  style={cellStyle(c)}
                  className={c.className}
                  aria-sort={sorted ? (sorted === 'asc' ? 'ascending' : 'descending') : c.sortable ? 'none' : undefined}
                >
                  {c.sortable ? (
                    <button
                      type="button"
                      className={cx('c-table__sort', sorted && 'is-sorted', c.align === 'right' && 'is-right')}
                      onClick={() => onSortChange?.(nextSort(c.id))}
                    >
                      <span>{c.header}</span>
                      <SortIcon size={13} strokeWidth={2} aria-hidden="true" className="c-table__sort-icon" />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading &&
            Array.from({ length: skeletonRows }, (_, i) => (
              <tr key={`sk-${i}`} className="c-table__skeleton">
                {selectable && (
                  <td className="c-table__check">
                    <Skeleton width={16} height={16} />
                  </td>
                )}
                {columns.map((c, ci) => (
                  <td key={c.id} style={cellStyle(c)}>
                    <Skeleton height={10} width={`${45 + ((i * 7 + ci * 13) % 45)}%`} />
                  </td>
                ))}
              </tr>
            ))}

          {!loading && rows.length === 0 && (
            <tr className="c-table__empty-row">
              <td colSpan={colCount} className="c-table__empty">
                {empty ?? <EmptyState icon={Inbox} title="Aucun élément" compact />}
              </td>
            </tr>
          )}

          {!loading &&
            rows.map((row, ri) => {
              const k = keys[ri];
              const isSel = sel.has(k);
              return (
                <tr
                  key={k}
                  className={cx(isSel && 'is-selected', onRowClick && 'is-clickable', rowClassName?.(row))}
                  onClick={onRowClick ? (e) => onRowClickGuard(e, row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter' && e.target === e.currentTarget) onRowClick(row);
                        }
                      : undefined
                  }
                >
                  {selectable && (
                    <td className="c-table__check">
                      <Checkbox checked={isSel} onChange={(v) => toggleRow(k, v)} aria-label={selectRowLabel(row)} />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.id} style={cellStyle(c)} className={cx(c.mono && 'is-mono', c.className)}>
                      {c.cell(row, ri)}
                    </td>
                  ))}
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
