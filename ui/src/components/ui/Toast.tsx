import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { IconButton } from './Button';
import { cx } from './utils';
import './Toast.css';

export type ToastTone = 'ok' | 'warn' | 'bad' | 'neutral';

export interface ToastOptions {
  title: ReactNode;
  description?: ReactNode;
  tone?: ToastTone;
  /** Auto-dismiss delay in ms (default 5000, 8000 for "bad"). 0 keeps it until closed. */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastOptions {
  id: string;
}

export type ToastFn = ((opts: ToastOptions) => string) & {
  toast: (opts: ToastOptions) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastFn | null>(null);

const ICONS: Record<ToastTone, LucideIcon> = { ok: CircleCheck, warn: TriangleAlert, bad: CircleX, neutral: Info };

let seq = 0;

/** Renders the toast stack (bottom-right) and provides `useToast()`. Mount once near the root. */
export function ToastProvider({ children, max = 5 }: { children: ReactNode; max?: number }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (opts: ToastOptions) => {
      const id = `toast-${++seq}`;
      setItems((list) => [...list, { ...opts, id }].slice(-max));
      return id;
    },
    [max],
  );
  const api = useMemo<ToastFn>(() => Object.assign((o: ToastOptions) => push(o), { toast: push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="c-toasts" role="region" aria-label="Notifications">
            <div className="c-toasts__live" aria-live="polite" aria-relevant="additions">
              {items.map((t) => (
                <Toast key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
              ))}
            </div>
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

function Toast({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const tone = item.tone ?? 'neutral';
  const Icon = ICONS[tone];
  const duration = item.duration ?? (tone === 'bad' ? 8000 : 5000);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(duration);
  const startedAt = useRef(0);

  useEffect(() => {
    if (!duration || paused) return;
    startedAt.current = Date.now();
    const t = window.setTimeout(onDismiss, remaining.current);
    return () => {
      window.clearTimeout(t);
      remaining.current -= Date.now() - startedAt.current;
    };
  }, [paused, duration, onDismiss]);

  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={cx('c-toast', `c-toast--${tone}`)}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon size={17} strokeWidth={1.9} aria-hidden="true" className="c-toast__icon" />
      <div className="c-toast__body">
        <div className="c-toast__title">{item.title}</div>
        {item.description != null && <div className="c-toast__desc">{item.description}</div>}
        {item.action && (
          <button
            type="button"
            className="c-toast__action"
            onClick={() => {
              item.action?.onClick();
              onDismiss();
            }}
          >
            {item.action.label}
          </button>
        )}
      </div>
      <IconButton icon={X} label="Fermer la notification" size="sm" tooltip={false} className="c-toast__close" onClick={onDismiss} />
    </div>
  );
}

/**
 * `const { toast } = useToast(); toast({ title: 'Utilisateur créé', tone: 'ok' })`.
 * The returned value is also callable directly: `const toast = useToast(); toast({...})`.
 */
export function useToast(): ToastFn {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
