import { useRef } from 'react';
import type { HTMLAttributes, KeyboardEvent, ReactNode } from 'react';
import { cx, nextEnabledIndex } from './utils';
import './Tabs.css';

export interface TabItem<T extends string = string> {
  id: T;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Prefix for tab/panel ids; enables aria-controls to <TabPanel idBase=… id=…>. */
  idBase?: string;
  className?: string;
  'aria-label'?: string;
}

export const tabId = (idBase: string, id: string) => `${idBase}-tab-${id}`;
export const tabPanelId = (idBase: string, id: string) => `${idBase}-panel-${id}`;

/** Underline tabs (role=tablist, arrows/Home/End move and activate). */
export function Tabs<T extends string>({ tabs, value, onChange, idBase, className, 'aria-label': ariaLabel }: TabsProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const list = tabs.map((t) => ({ disabled: t.disabled }));
  const current = tabs.findIndex((t) => t.id === value);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const focusedIdx = refs.current.findIndex((el) => el === document.activeElement);
    const from = focusedIdx >= 0 ? focusedIdx : current;
    let next = -1;
    if (e.key === 'ArrowRight') next = nextEnabledIndex(list, from, 1);
    else if (e.key === 'ArrowLeft') next = nextEnabledIndex(list, from, -1);
    else if (e.key === 'Home') next = nextEnabledIndex(list, -1, 1);
    else if (e.key === 'End') next = nextEnabledIndex(list, list.length, -1);
    if (next < 0) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(tabs[next].id);
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className={cx('c-tabs', className)} onKeyDown={onKeyDown}>
      {tabs.map((t, i) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={idBase ? tabId(idBase, t.id) : undefined}
            aria-controls={idBase ? tabPanelId(idBase, t.id) : undefined}
            aria-selected={selected}
            tabIndex={selected || (current < 0 && i === 0) ? 0 : -1}
            disabled={t.disabled}
            className="c-tab"
            onClick={() => onChange(t.id)}
          >
            <span>{t.label}</span>
            {t.count != null && <span className="c-tab__count">{t.count.toLocaleString('fr-FR')}</span>}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps extends HTMLAttributes<HTMLDivElement> {
  idBase: string;
  /** Tab id this panel belongs to. */
  id: string;
  children: ReactNode;
}

/** Panel paired with <Tabs idBase>. Render only the active one, or all with `hidden`. */
export function TabPanel({ idBase, id, children, className, ...rest }: TabPanelProps) {
  return (
    <div
      role="tabpanel"
      id={tabPanelId(idBase, id)}
      aria-labelledby={tabId(idBase, id)}
      tabIndex={0}
      className={cx('c-tabpanel', className)}
      {...rest}
    >
      {children}
    </div>
  );
}
