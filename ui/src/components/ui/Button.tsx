import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Kbd } from './Kbd';
import { Spinner } from './Spinner';
import { Tooltip } from './Tooltip';
import type { Placement } from './usePosition';
import { cx } from './utils';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  /** Shows a spinner and disables the button. */
  loading?: boolean;
  /** Key hint shown at the end, e.g. "mod+s" (→ ⌘S / Ctrl+S) or "N". */
  kbd?: string;
  /** Full width. */
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    icon: Icon,
    iconRight: IconRight,
    loading = false,
    kbd,
    block,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const iconSize = size === 'sm' ? 14 : 16;
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'c-btn',
        `c-btn--${variant}`,
        `c-btn--${size}`,
        block && 'c-btn--block',
        loading && 'is-loading',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Spinner size={iconSize} label={null} />
      ) : Icon ? (
        <Icon size={iconSize} strokeWidth={1.8} aria-hidden="true" />
      ) : null}
      {children != null && children !== false && <span className="c-btn__label">{children}</span>}
      {IconRight && <IconRight size={iconSize} strokeWidth={1.8} aria-hidden="true" />}
      {kbd && <Kbd className="c-btn__kbd">{kbd}</Kbd>}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'icon' | 'iconRight' | 'kbd' | 'block'> {
  icon: LucideIcon;
  /** Accessible name, also shown in the tooltip. */
  label: string;
  /** Show the tooltip (default true). */
  tooltip?: boolean;
  tooltipPlacement?: Placement;
}

/** Icon-only button with aria-label and a custom tooltip. Defaults to the ghost variant. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, tooltip = true, tooltipPlacement = 'top', variant = 'ghost', size = 'md', className, loading, ...rest },
  ref,
) {
  const iconSize = size === 'sm' ? 15 : 16;
  const btn = (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cx('c-btn', `c-btn--${variant}`, `c-btn--${size}`, 'c-btn--icon', loading && 'is-loading', className)}
      aria-busy={loading || undefined}
      {...rest}
      disabled={rest.disabled || loading}
    >
      {loading ? (
        <Spinner size={iconSize} label={null} />
      ) : (
        <Icon size={iconSize} strokeWidth={1.8} aria-hidden="true" />
      )}
    </button>
  );
  if (!tooltip) return btn;
  return (
    <Tooltip content={label} placement={tooltipPlacement} describeChild={false}>
      {btn}
    </Tooltip>
  );
});
