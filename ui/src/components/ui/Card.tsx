import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './utils';
import './Card.css';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode;
  description?: ReactNode;
  /** Right side of the header (buttons, menu). */
  actions?: ReactNode;
  footer?: ReactNode;
  /** Pad the body (default true). Set false for edge-to-edge tables/lists. */
  padded?: boolean;
  children?: ReactNode;
}

export function Card({ title, description, actions, footer, padded = true, className, children, ...rest }: CardProps) {
  const hasHeader = title != null || actions != null || description != null;
  return (
    <section className={cx('c-card', className)} {...rest}>
      {hasHeader && (
        <header className="c-card__header">
          <div className="c-card__heading">
            {title != null && <h3 className="c-card__title">{title}</h3>}
            {description != null && <p className="c-card__desc">{description}</p>}
          </div>
          {actions != null && <div className="c-card__actions">{actions}</div>}
        </header>
      )}
      <div className={cx('c-card__body', padded && 'is-padded')}>{children}</div>
      {footer != null && <footer className="c-card__footer">{footer}</footer>}
    </section>
  );
}

export interface KeyValueItem {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
  key?: string;
}

export interface KeyValueProps {
  items: KeyValueItem[];
  /** 1 (default) or 2 columns of pairs. */
  columns?: 1 | 2;
  /** Width of the label column (default 160px). */
  labelWidth?: number | string;
  className?: string;
}

/** Definition list of label/value pairs. */
export function KeyValue({ items, columns = 1, labelWidth = 160, className }: KeyValueProps) {
  return (
    <dl
      className={cx('c-kv', columns === 2 && 'c-kv--2', className)}
      style={{ ['--c-kv-label' as string]: typeof labelWidth === 'number' ? `${labelWidth}px` : labelWidth }}
    >
      {items.map((it, i) => (
        <div key={it.key ?? i} className="c-kv__row">
          <dt className="c-kv__label">{it.label}</dt>
          <dd className={cx('c-kv__value', it.mono && 'is-mono')}>{it.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
