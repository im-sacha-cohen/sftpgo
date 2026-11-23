import { cloneElement, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, MouseEvent, ReactElement, ReactNode, Ref } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Kbd } from './Kbd';
import { Popover } from './Popover';
import { useStableId, useTypeahead } from './hooks';
import type { Placement } from './usePosition';
import { cx, findTypeaheadMatch, isPrintableKey, mergeRefs, nextEnabledIndex } from './utils';
import './Menu.css';

export interface MenuAction {
  label: ReactNode;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  /** Shortcut hint, e.g. "mod+d" or "Suppr". Display only. */
  kbd?: string;
  disabled?: boolean;
  /** Text used for type-ahead when `label` is not a string. */
  textValue?: string;
}

export type MenuItem = MenuAction | 'separator';

export interface MenuProps {
  /** Element that opens the menu (Button, IconButton…). It must forward its ref. */
  trigger: ReactElement;
  items: MenuItem[];
  placement?: Placement;
  className?: string;
  minWidth?: number;
  'aria-label'?: string;
}

/** Dropdown menu (role=menu): arrows, Home/End, type-ahead, Esc returns focus to the trigger. */
export function Menu({ trigger, items, placement = 'bottom-start', className, minWidth = 180, 'aria-label': ariaLabel }: MenuProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const triggerRef = useRef<HTMLElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useStableId('menu');
  const typeahead = useTypeahead();

  const nav = items.map((it) => ({ disabled: it === 'separator' || !!it.disabled }));
  const texts = items.map((it) =>
    it === 'separator' ? '' : (it.textValue ?? (typeof it.label === 'string' ? it.label : '')),
  );

  const openMenu = (where: 'first' | 'last') => {
    setActive(where === 'first' ? nextEnabledIndex(nav, -1, 1) : nextEnabledIndex(nav, nav.length, -1));
    setOpen(true);
  };
  const close = (focusTrigger: boolean) => {
    setOpen(false);
    setActive(-1);
    if (focusTrigger) triggerRef.current?.focus({ preventScroll: true });
  };

  useEffect(() => {
    if (open && active >= 0) itemRefs.current[active]?.focus({ preventScroll: true });
  }, [open, active]);

  const childRef = (trigger as unknown as { ref?: Ref<HTMLElement> }).ref;
  const ref = useMemo(() => mergeRefs<HTMLElement>(triggerRef, childRef), [childRef]);
  const tp = trigger.props as {
    onClick?: (e: MouseEvent<HTMLElement>) => void;
    onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  };

  const triggerEl = cloneElement(trigger, {
    ref,
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? menuId : undefined,
    onClick: (e: MouseEvent<HTMLElement>) => {
      tp.onClick?.(e);
      if (e.defaultPrevented) return;
      if (open) close(false);
      else openMenu('first');
    },
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      tp.onKeyDown?.(e);
      if (e.defaultPrevented) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        openMenu('first');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        openMenu('last');
      }
    },
  });

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((c) => nextEnabledIndex(nav, c, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((c) => nextEnabledIndex(nav, c < 0 ? nav.length : c, -1));
        break;
      case 'Home':
        e.preventDefault();
        setActive(nextEnabledIndex(nav, -1, 1));
        break;
      case 'End':
        e.preventDefault();
        setActive(nextEnabledIndex(nav, nav.length, -1));
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case 'Tab':
        close(true);
        break;
      default:
        if (isPrintableKey(e) && e.key !== ' ') {
          const idx = findTypeaheadMatch(texts, typeahead(e.key), active, nav.map((n) => n.disabled));
          if (idx >= 0) setActive(idx);
        }
    }
  };

  return (
    <>
      {triggerEl}
      <Popover
        anchorRef={triggerRef}
        open={open}
        onClose={() => close(false)}
        placement={placement}
        closeOnAncestorScroll
        id={menuId}
        role="menu"
        aria-label={ariaLabel}
        aria-orientation="vertical"
        className={cx('c-menu', className)}
        style={{ minWidth }}
        onKeyDown={onMenuKeyDown}
      >
        {items.map((it, i) => {
          if (it === 'separator') return <div key={`sep-${i}`} role="separator" className="c-menu__sep" />;
          const Icon = it.icon;
          return (
            <button
              key={i}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-disabled={it.disabled || undefined}
              className={cx('c-menu__item', it.danger && 'is-danger')}
              onMouseMove={() => {
                if (!it.disabled && active !== i) setActive(i);
              }}
              onClick={() => {
                if (it.disabled) return;
                close(true);
                it.onSelect();
              }}
            >
              {Icon ? (
                <Icon size={15} strokeWidth={1.8} aria-hidden="true" className="c-menu__icon" />
              ) : null}
              <span className="c-menu__label">{it.label}</span>
              {it.kbd && <Kbd className="c-menu__kbd">{it.kbd}</Kbd>}
            </button>
          );
        })}
      </Popover>
    </>
  );
}
