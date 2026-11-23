import { forwardRef, useEffect, useMemo, useRef } from 'react';
import type { HTMLAttributes, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useEventCallback, useOutsideClick } from './hooks';
import { usePosition } from './usePosition';
import type { Placement } from './usePosition';
import { cx, mergeRefs } from './utils';
import './Popover.css';

export interface PopoverProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Element the popover is attached to. */
  anchorRef: RefObject<HTMLElement>;
  open: boolean;
  onClose: () => void;
  placement?: Placement;
  offset?: number;
  /** Popover is at least as wide as the anchor. */
  matchWidth?: boolean;
  flip?: boolean;
  closeOnOutsideClick?: boolean;
  /** Close on Escape pressed inside the popover (default true). */
  closeOnEsc?: boolean;
  /** Close when a scroll container holding the anchor (or the page) scrolls. */
  closeOnAncestorScroll?: boolean;
  children: ReactNode;
}

/**
 * Floating panel rendered in a portal on document.body, positioned next to `anchorRef`
 * (flip + shift, follows scroll and resize). Styled as a raised surface.
 */
export const Popover = forwardRef<HTMLDivElement, PopoverProps>(function Popover(props, ref) {
  const {
    anchorRef,
    open,
    onClose,
    placement = 'bottom-start',
    offset = 6,
    matchWidth = false,
    flip = true,
    closeOnOutsideClick = true,
    closeOnEsc = true,
    closeOnAncestorScroll = false,
    className,
    children,
    onKeyDown,
    ...rest
  } = props;
  const localRef = useRef<HTMLDivElement>(null);
  const merged = useMemo(() => mergeRefs<HTMLDivElement>(localRef, ref), [ref]);
  const close = useEventCallback(onClose);

  usePosition(anchorRef, localRef, { enabled: open, placement, offset, matchWidth, flip });
  useOutsideClick([localRef, anchorRef], () => close(), open && closeOnOutsideClick);

  useEffect(() => {
    if (!open || !closeOnAncestorScroll) return;
    const onScroll = (e: Event) => {
      const anchor = anchorRef.current;
      const t = e.target;
      if (!anchor) return;
      if (t === document || (t instanceof Node && t !== localRef.current && !localRef.current?.contains(t) && t.contains(anchor))) {
        close();
      }
    };
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [open, closeOnAncestorScroll, anchorRef, close]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={merged}
      className={cx('c-popover', className)}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if (!e.defaultPrevented && closeOnEsc && e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
      }}
      {...rest}
    >
      {children}
    </div>,
    document.body,
  );
});
