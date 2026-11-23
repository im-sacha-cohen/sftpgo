import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from './Button';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title: ReactNode;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button; focus starts on "Annuler". */
  danger?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/** Provides `useConfirm()`. Mount once near the root (inside ToastProvider or not, order is free). */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ opts: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);
  const pending = useRef<((v: boolean) => void) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>(
    (opts) =>
      new Promise<boolean>((resolve) => {
        pending.current?.(false);
        pending.current = resolve;
        setState({ opts, resolve });
      }),
    [],
  );

  const settle = (v: boolean) => {
    state?.resolve(v);
    pending.current = null;
    setState(null);
  };

  const o = state?.opts;
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => settle(false)}
        title={o?.title ?? ''}
        size="sm"
        initialFocusRef={o?.danger ? cancelRef : confirmRef}
        footer={
          <>
            <Button ref={cancelRef} variant="ghost" onClick={() => settle(false)}>
              {o?.cancelLabel ?? 'Cancel'}
            </Button>
            <Button ref={confirmRef} variant={o?.danger ? 'danger' : 'primary'} onClick={() => settle(true)}>
              {o?.confirmLabel ?? 'Confirmer'}
            </Button>
          </>
        }
      >
        {o?.message != null && <div className="c-confirm__msg">{o.message}</div>}
      </Modal>
    </ConfirmContext.Provider>
  );
}

/** `const confirm = useConfirm(); if (await confirm({ title, message, danger: true })) …` */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx;
}
