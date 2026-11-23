import { useCallback, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useIsoLayoutEffect } from './hooks';

export type Side = 'top' | 'bottom' | 'left' | 'right';
export type Align = 'start' | 'center' | 'end';
export type Placement = Side | `${Side}-start` | `${Side}-end`;

export interface UsePositionOptions {
  enabled: boolean;
  placement?: Placement;
  /** Gap between anchor and floating element (px). */
  offset?: number;
  /** Minimum distance to the viewport edges (px). */
  padding?: number;
  /** Floating element is at least as wide as the anchor. */
  matchWidth?: boolean;
  /** Flip to the opposite side when there is not enough room. */
  flip?: boolean;
}

export interface ComputedPosition {
  top: number;
  left: number;
  side: Side;
  align: Align;
  /** Room available on the chosen side, to cap the floating height. */
  maxHeight: number;
  maxWidth: number;
}

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

function clampRange(v: number, min: number, max: number) {
  return Math.max(min, Math.min(v, max));
}

/** Pure positioning math: place `size` next to `anchor`, flip and shift inside the viewport. */
export function computePosition(
  anchor: DOMRect,
  size: { width: number; height: number },
  placement: Placement,
  offset = 6,
  padding = 8,
  flip = true,
  viewport: { width: number; height: number } = {
    width: document.documentElement.clientWidth,
    height: window.innerHeight,
  },
): ComputedPosition {
  const [s, a] = placement.split('-') as [Side, Align | undefined];
  const align: Align = a ?? 'center';
  const vw = viewport.width;
  const vh = viewport.height;
  const space: Record<Side, number> = {
    top: anchor.top - offset - padding,
    bottom: vh - anchor.bottom - offset - padding,
    left: anchor.left - offset - padding,
    right: vw - anchor.right - offset - padding,
  };
  let side = s;
  if (flip) {
    const need = side === 'top' || side === 'bottom' ? size.height : size.width;
    if (space[side] < need && space[OPPOSITE[side]] > space[side]) side = OPPOSITE[side];
  }
  let top: number;
  let left: number;
  let maxHeight: number;
  let maxWidth: number;
  if (side === 'top' || side === 'bottom') {
    maxHeight = Math.max(0, space[side]);
    maxWidth = vw - padding * 2;
    const h = Math.min(size.height, maxHeight);
    top = side === 'bottom' ? anchor.bottom + offset : anchor.top - offset - h;
    left =
      align === 'start'
        ? anchor.left
        : align === 'end'
          ? anchor.right - size.width
          : anchor.left + anchor.width / 2 - size.width / 2;
    left = clampRange(left, padding, vw - size.width - padding);
  } else {
    maxWidth = Math.max(0, space[side]);
    maxHeight = vh - padding * 2;
    left = side === 'right' ? anchor.right + offset : anchor.left - offset - size.width;
    top =
      align === 'start'
        ? anchor.top
        : align === 'end'
          ? anchor.bottom - size.height
          : anchor.top + anchor.height / 2 - size.height / 2;
    top = clampRange(top, padding, vh - size.height - padding);
  }
  return { top, left, side, align, maxHeight, maxWidth };
}

/**
 * Positions `floatingRef` (rendered with position: fixed) next to `anchorRef`.
 * Writes top/left/min-width and the `--c-avail-h` CSS variable directly on the element
 * (no re-render on scroll), sets `data-side` and `data-placed`, and follows scroll/resize.
 */
export function usePosition(
  anchorRef: RefObject<HTMLElement>,
  floatingRef: RefObject<HTMLElement>,
  opts: UsePositionOptions,
): { side: Side | null; update: () => void } {
  const { enabled, placement = 'bottom-start', offset = 6, padding = 8, matchWidth = false, flip = true } = opts;
  const [side, setSide] = useState<Side | null>(null);
  const frame = useRef(0);

  const update = useCallback(() => {
    const a = anchorRef.current;
    const f = floatingRef.current;
    if (!a || !f) return;
    const rect = a.getBoundingClientRect();
    f.style.removeProperty('--c-avail-h');
    if (matchWidth) f.style.minWidth = `${Math.round(rect.width)}px`;
    const p = computePosition(rect, { width: f.offsetWidth, height: f.offsetHeight }, placement, offset, padding, flip);
    f.style.setProperty('--c-avail-h', `${Math.max(64, Math.floor(p.maxHeight))}px`);
    f.style.top = `${Math.round(p.top)}px`;
    f.style.left = `${Math.round(p.left)}px`;
    f.dataset.side = p.side;
    f.dataset.placed = 'true';
    setSide((prev) => (prev === p.side ? prev : p.side));
  }, [anchorRef, floatingRef, placement, offset, padding, matchWidth, flip]);

  useIsoLayoutEffect(() => {
    if (!enabled) return;
    update();
    const schedule = (e?: Event) => {
      const f = floatingRef.current;
      if (e && e.target instanceof Node && f?.contains(e.target)) return;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(update);
    };
    const onResize = () => schedule();
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', onResize);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => schedule()) : null;
    if (anchorRef.current) ro?.observe(anchorRef.current);
    if (floatingRef.current) ro?.observe(floatingRef.current);
    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, [enabled, update]);

  return { side, update };
}
