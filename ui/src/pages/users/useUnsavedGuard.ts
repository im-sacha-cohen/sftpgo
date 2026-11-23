import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';
import { useConfirm } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { dict } from './i18n';

/**
 * Asks for confirmation (custom dialog) before leaving a page with unsaved changes:
 * in-app navigation through react-router's blocker, tab close through beforeunload.
 * Returns `allowNext()` to let one navigation through (after a save/create).
 */
export function useUnsavedGuard(dirtyCount: number) {
  const t = useT(dict);
  const confirm = useConfirm();
  const bypass = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      !bypass.current && dirtyCount > 0 && currentLocation.pathname !== nextLocation.pathname,
  );

  const asking = useRef(false);
  useEffect(() => {
    if (blocker.state !== 'blocked' || asking.current) return;
    asking.current = true;
    const b = blocker;
    void confirm({
      title: t('unsavedTitle'),
      message: t('unsavedMsg', { n: dirtyCount }),
      confirmLabel: t('leave'),
      cancelLabel: t('stay'),
      danger: true,
    }).then((ok) => {
      asking.current = false;
      if (ok) b.proceed?.();
      else b.reset?.();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocker.state]);

  useEffect(() => {
    if (dirtyCount === 0) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirtyCount]);

  return {
    allowNext: () => {
      bypass.current = true;
      setTimeout(() => (bypass.current = false), 0);
    },
  };
}
