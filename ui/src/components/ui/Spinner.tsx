import { cx } from './utils';
import './Spinner.css';

export interface SpinnerProps {
  size?: number;
  /** Text announced to screen readers. `null` renders a decorative spinner. */
  label?: string | null;
  className?: string;
}

export function Spinner({ size = 16, label = 'Chargement…', className }: SpinnerProps) {
  const svg = (
    <svg
      className={cx('c-spinner', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.22" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
  if (!label) return svg;
  return (
    <span role="status" className="c-spinner-wrap">
      {svg}
      <span className="sr-only">{label}</span>
    </span>
  );
}
