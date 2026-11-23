import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from './Button';
import { Select } from './Select';
import { cx } from './utils';
import './DataTable.css';

export interface PaginationProps {
  /** 1-based page number. */
  page: number;
  pageSize: number;
  /** Total number of rows, when known. */
  total?: number;
  /** When the total is unknown: is there a next page? */
  hasMore?: boolean;
  onPageChange: (page: number) => void;
  /** Shows a page-size selector when both are set. */
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
  /** Rows on the current page (improves the range when the total is unknown). */
  pageCount?: number;
  locale?: string;
  className?: string;
}

export function Pagination({
  page,
  pageSize,
  total,
  hasMore,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
  pageCount,
  locale = 'fr-FR',
  className,
}: PaginationProps) {
  const nf = new Intl.NumberFormat(locale);
  const pages = total != null ? Math.max(1, Math.ceil(total / pageSize)) : null;
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total != null ? Math.min(page * pageSize, total) : (page - 1) * pageSize + (pageCount ?? pageSize);
  const canPrev = page > 1;
  const canNext = pages != null ? page < pages : !!hasMore;

  return (
    <nav className={cx('c-pager', className)} aria-label="Pagination">
      <div className="c-pager__range" aria-live="polite">
        <strong>
          {nf.format(from)}–{nf.format(to)}
        </strong>
        {total != null && <> sur {nf.format(total)}</>}
      </div>
      <div className="c-pager__controls">
        {pageSizeOptions && onPageSizeChange && (
          <>
            <span>Lignes</span>
            <Select
              size="sm"
              className="c-pager__size"
              aria-label="Lignes par page"
              value={String(pageSize)}
              options={pageSizeOptions.map((n) => ({ value: String(n), label: String(n) }))}
              onChange={(v) => onPageSizeChange(Number(v))}
              placement="top-start"
            />
          </>
        )}
        <IconButton icon={ChevronLeft} label="Page précédente" size="sm" variant="secondary" disabled={!canPrev} onClick={() => onPageChange(page - 1)} />
        <span className="c-pager__page">{pages != null ? `${page} / ${pages}` : `Page ${page}`}</span>
        <IconButton icon={ChevronRight} label="Page suivante" size="sm" variant="secondary" disabled={!canNext} onClick={() => onPageChange(page + 1)} />
      </div>
    </nav>
  );
}
