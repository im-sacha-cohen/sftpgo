import type { ReactNode } from 'react';
import { clamp, cx } from './utils';
import './ProgressBar.css';

export interface ProgressBarProps {
  value: number;
  max?: number;
  /** "auto": ≥90 % bad, ≥80 % warn, else accent. */
  tone?: 'auto' | 'accent' | 'ok' | 'warn' | 'bad' | 'neutral';
  size?: 'sm' | 'md';
  /** Accessible name (required when no visible label is associated). */
  label?: string;
  /** Show the percentage on the right. */
  showValue?: boolean;
  /** Custom text on the right instead of the percentage (e.g. "8,2 Go / 10 Go"). */
  valueText?: ReactNode;
  className?: string;
}

export function ProgressBar({
  value,
  max = 100,
  tone = 'auto',
  size = 'md',
  label,
  showValue,
  valueText,
  className,
}: ProgressBarProps) {
  const pct = max > 0 ? clamp((value / max) * 100, 0, 100) : 0;
  const t = tone === 'auto' ? (pct >= 90 ? 'bad' : pct >= 80 ? 'warn' : 'accent') : tone;
  return (
    <div className={cx('c-progress', `c-progress--${size}`, className)}>
      <div
        className="c-progress__track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${Math.round(pct)} %`}
      >
        <div className={cx('c-progress__fill', `c-progress__fill--${t}`)} style={{ width: `${pct}%` }} />
      </div>
      {(showValue || valueText != null) && (
        <span className="c-progress__value">{valueText ?? `${Math.round(pct)} %`}</span>
      )}
    </div>
  );
}
