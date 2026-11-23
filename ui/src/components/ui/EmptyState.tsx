import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx } from './utils';
import './EmptyState.css';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  /** Usually a Button. */
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, compact, className }: EmptyStateProps) {
  return (
    <div className={cx('c-empty', compact && 'c-empty--compact', className)}>
      {Icon && (
        <div className="c-empty__icon" aria-hidden="true">
          <Icon size={20} strokeWidth={1.7} />
        </div>
      )}
      <div className="c-empty__title">{title}</div>
      {description != null && <div className="c-empty__desc">{description}</div>}
      {action != null && <div className="c-empty__action">{action}</div>}
    </div>
  );
}

export interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  /** Pill/circle shape. */
  circle?: boolean;
  /** Render N text lines (last one shorter). */
  lines?: number;
  className?: string;
  style?: CSSProperties;
}

/** Loading placeholder (decorative, aria-hidden). */
export function Skeleton({ width, height = 12, circle, lines, className, style }: SkeletonProps) {
  if (lines && lines > 1) {
    return (
      <div className={cx('c-skel-lines', className)} aria-hidden="true" style={style}>
        {Array.from({ length: lines }, (_, i) => (
          <span key={i} className="c-skel" style={{ height, width: i === lines - 1 ? '60%' : '100%' }} />
        ))}
      </div>
    );
  }
  return (
    <span
      className={cx('c-skel', circle && 'c-skel--circle', className)}
      aria-hidden="true"
      style={{ width: width ?? (circle ? height : '100%'), height, ...style }}
    />
  );
}
