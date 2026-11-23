import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';
import { cx, formatShortcut } from './utils';
import './Kbd.css';

export interface KbdProps extends HTMLAttributes<HTMLElement> {
  /** Raw text, or a combo like "mod+k" when `combo` is true. */
  children: string;
  /** Format `children` as a shortcut ("mod+s" → "⌘S" / "Ctrl+S"). Default true. */
  combo?: boolean;
}

/** Keyboard key hint. */
export const Kbd = forwardRef<HTMLElement, KbdProps>(function Kbd({ children, combo = true, className, ...rest }, ref) {
  return (
    <kbd ref={ref} className={cx('c-kbd', className)} {...rest}>
      {combo ? formatShortcut(children) : children}
    </kbd>
  );
});
