import { forwardRef } from 'react';
import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cx } from './utils';
import './Badge.css';

export type Tone = 'neutral' | 'ok' | 'warn' | 'bad' | 'accent';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  mono?: boolean;
  icon?: LucideIcon;
  /** Small dot before the text. */
  dot?: boolean;
  children: ReactNode;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { tone = 'neutral', mono, icon: Icon, dot, className, children, ...rest },
  ref,
) {
  return (
    <span ref={ref} className={cx('c-badge', `c-badge--${tone}`, mono && 'c-badge--mono', className)} {...rest}>
      {dot && <span className="c-badge__dot" aria-hidden="true" />}
      {Icon && <Icon size={12} strokeWidth={2} aria-hidden="true" />}
      {children}
    </span>
  );
});

export interface StatusDotProps {
  tone?: Tone;
  label: ReactNode;
  /** Keep the label for screen readers only. */
  hideLabel?: boolean;
  /** Soft pulsing halo (e.g. "live" connections). */
  pulse?: boolean;
  className?: string;
}

export function StatusDot({ tone = 'neutral', label, hideLabel, pulse, className }: StatusDotProps) {
  return (
    <span className={cx('c-status', className)}>
      <span className={cx('c-status__dot', `c-status__dot--${tone}`, pulse && 'is-pulse')} aria-hidden="true" />
      <span className={hideLabel ? 'sr-only' : 'c-status__label'}>{label}</span>
    </span>
  );
}
