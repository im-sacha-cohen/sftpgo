import { useEffect, useRef } from 'react';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { IconButton } from './Button';
import { getFocusable, trapTabKey, useFocusReturn, useScrollLock, useStableId } from './hooks';
import { cx } from './utils';
import './Modal.css';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Actions row (buttons are right-aligned). */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Element focused on open (default: first focusable in body/footer). */
  initialFocusRef?: RefObject<HTMLElement>;
  closeOnOverlayClick?: boolean;
  hideCloseButton?: boolean;
  closeLabel?: string;
  className?: string;
}

type ShellProps = ModalProps & { variant: 'modal' | 'drawer' };

function DialogShell({
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  initialFocusRef,
  closeOnOverlayClick = true,
  hideCloseButton = false,
  closeLabel = 'Fermer',
  className,
  variant,
}: ShellProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useStableId('dlg-title');
  const descId = useStableId('dlg-desc');

  useScrollLock(true);
  useFocusReturn(true);

  useEffect(() => {
    // Priority: explicit ref, [autofocus], first text field, first focusable, the panel itself.
    const focusables = contentRef.current ? getFocusable(contentRef.current) : [];
    const target =
      initialFocusRef?.current ??
      focusables.find((el) => el.hasAttribute('autofocus') || el.hasAttribute('data-autofocus')) ??
      focusables.find((el) => (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && !el.readOnly) ??
      focusables[0] ??
      panelRef.current;
    target?.focus({ preventScroll: true });
    // Only on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !e.defaultPrevented) {
      e.preventDefault();
      e.stopPropagation();
      onClose();
      return;
    }
    trapTabKey(e, panelRef.current);
  };

  return createPortal(
    <div className={cx('c-dialog-root', `c-dialog-root--${variant}`)}>
      <div className="c-overlay" aria-hidden="true" onClick={closeOnOverlayClick ? onClose : undefined} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description != null ? descId : undefined}
        tabIndex={-1}
        className={cx('c-dialog', `c-dialog--${variant}`, `c-dialog--${size}`, className)}
        onKeyDown={onKeyDown}
      >
        <header className="c-dialog__header">
          <div className="c-dialog__heading">
            <h2 id={titleId} className="c-dialog__title">
              {title}
            </h2>
            {description != null && (
              <p id={descId} className="c-dialog__desc">
                {description}
              </p>
            )}
          </div>
          {!hideCloseButton && (
            <IconButton icon={X} label={closeLabel} size="sm" tooltip={false} onClick={onClose} className="c-dialog__close" />
          )}
        </header>
        <div ref={contentRef} className="c-dialog__content">
          {children != null && <div className="c-dialog__body">{children}</div>}
          {footer != null && <footer className="c-dialog__footer">{footer}</footer>}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Centered dialog: portal, focus trap, Esc, focus restore, scroll lock. */
export function Modal(props: ModalProps) {
  return props.open ? <DialogShell {...props} variant="modal" /> : null;
}

/** Same API as Modal, slides in from the right. */
export function Drawer(props: ModalProps) {
  return props.open ? <DialogShell {...props} variant="drawer" /> : null;
}
