import { Children, cloneElement, useEffect, useMemo, useRef, useState } from 'react';
import type { FocusEvent, MouseEvent, PointerEvent, ReactElement, ReactNode, Ref } from 'react';
import { createPortal } from 'react-dom';
import { useStableId } from './hooks';
import { usePosition } from './usePosition';
import type { Placement } from './usePosition';
import { cx, mergeRefs } from './utils';
import './Tooltip.css';

export interface TooltipProps {
  content: ReactNode;
  /** A single element that accepts a ref and mouse/focus handlers. */
  children: ReactElement;
  /** Delay before showing, in ms (default 400). */
  delay?: number;
  placement?: Placement;
  disabled?: boolean;
  /** Add aria-describedby on the child (default true). Off when the content duplicates the accessible name. */
  describeChild?: boolean;
}

/** Custom tooltip shown on hover and keyboard focus (never the native `title`). */
export function Tooltip({ content, children, delay = 400, placement = 'top', disabled, describeChild = true }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number>();
  const id = useStableId('tip');
  const empty = content == null || content === '' || content === false;
  const visible = open && !disabled && !empty;

  usePosition(anchorRef, tipRef, { enabled: visible, placement, offset: 6 });

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [visible]);

  const child = Children.only(children);
  const childRef = (child as unknown as { ref?: Ref<HTMLElement> }).ref;
  const ref = useMemo(() => mergeRefs<HTMLElement>(anchorRef, childRef), [childRef]);
  const cp = child.props as Record<string, unknown> & {
    onMouseEnter?: (e: MouseEvent<HTMLElement>) => void;
    onMouseLeave?: (e: MouseEvent<HTMLElement>) => void;
    onFocus?: (e: FocusEvent<HTMLElement>) => void;
    onBlur?: (e: FocusEvent<HTMLElement>) => void;
    onPointerDown?: (e: PointerEvent<HTMLElement>) => void;
    'aria-describedby'?: string;
  };

  const show = () => {
    if (disabled || empty) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setOpen(false);
  };

  const trigger = cloneElement(child, {
    ref,
    onMouseEnter: (e: MouseEvent<HTMLElement>) => {
      cp.onMouseEnter?.(e);
      show();
    },
    onMouseLeave: (e: MouseEvent<HTMLElement>) => {
      cp.onMouseLeave?.(e);
      hide();
    },
    onFocus: (e: FocusEvent<HTMLElement>) => {
      cp.onFocus?.(e);
      let keyboard = true;
      try {
        keyboard = e.currentTarget.matches(':focus-visible');
      } catch {
        /* old browsers */
      }
      if (keyboard) show();
    },
    onBlur: (e: FocusEvent<HTMLElement>) => {
      cp.onBlur?.(e);
      hide();
    },
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      cp.onPointerDown?.(e);
      hide();
    },
    'aria-describedby': describeChild && visible ? cx(cp['aria-describedby'], id) : cp['aria-describedby'],
  });

  return (
    <>
      {trigger}
      {visible &&
        createPortal(
          <div ref={tipRef} id={id} role="tooltip" className="c-tooltip">
            {content}
          </div>,
          document.body,
        )}
    </>
  );
}
