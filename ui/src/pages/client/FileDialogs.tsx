import { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Copy } from 'lucide-react';
import { Button, Drawer, Input, Modal, SegmentedControl } from '@/components/ui';
import type { DirEntry } from '@/api/types';
import { useCommon, useT } from '@/lib/i18n';
import { errMsg, isWithin, joinPath } from './api';
import { filesDict } from './i18n';
import { PathBrowser } from './PathBrowser';

interface NameModalProps {
  title: string;
  label: string;
  initial: string;
  confirmLabel: string;
  /** Entries of the current folder, to reject duplicates. */
  existing: Map<string, DirEntry>;
  /** Pre-select the name without its extension. */
  selectBase?: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<void>;
}

/** Single-field modal used for "new folder" and "rename". */
export function NameModal({ title, label, initial, confirmLabel, existing, selectBase, onClose, onSubmit }: NameModalProps) {
  const t = useT(filesDict);
  const c = useCommon();
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dot = initial.lastIndexOf('.');
    const id = window.setTimeout(() => {
      el.focus();
      el.setSelectionRange(0, selectBase && dot > 0 ? dot : initial.length);
    }, 30);
    return () => window.clearTimeout(id);
  }, [initial, selectBase]);

  const trimmed = name.trim();
  const invalid = !trimmed || trimmed.includes('/') || trimmed === '.' || trimmed === '..';
  const duplicate = trimmed !== initial && existing.has(trimmed);

  const submit = async () => {
    if (invalid) {
      setError(t('invalidName'));
      return;
    }
    if (duplicate) {
      setError(t('exists'));
      return;
    }
    if (trimmed === initial) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(trimmed);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      size="sm"
      initialFocusRef={ref}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {c('cancel')}
          </Button>
          <Button variant="primary" loading={busy} disabled={!trimmed} onClick={() => void submit()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Input
          ref={ref}
          label={label}
          value={name}
          mono
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          error={error ?? (trimmed && duplicate ? t('exists') : undefined)}
        />
      </form>
    </Modal>
  );
}

interface MoveCopyProps {
  dir: string;
  names: string[];
  initialMode: 'move' | 'copy';
  onClose: () => void;
  onSubmit: (mode: 'move' | 'copy', dest: string) => Promise<void>;
}

/** Drawer with a folder browser to pick the destination of a move or copy. */
export function MoveCopyDrawer({ dir, names, initialMode, onClose, onSubmit }: MoveCopyProps) {
  const t = useT(filesDict);
  const c = useCommon();
  const [mode, setMode] = useState(initialMode);
  const [dest, setDest] = useState(dir);
  const [busy, setBusy] = useState(false);
  const sources = names.map((n) => joinPath(dir, n));
  const intoSelf = sources.some((s) => isWithin(dest, s));
  const same = dest === dir;
  const blocked = same || intoSelf;

  const submit = async () => {
    if (blocked) return;
    setBusy(true);
    try {
      await onSubmit(mode, dest);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      size="md"
      title={t(mode === 'move' ? 'moveTitle' : 'copyTitle', { n: names.length })}
      description={<span className="mono files-drawer-names">{names.join(', ')}</span>}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {c('cancel')}
          </Button>
          <Button variant="primary" icon={mode === 'move' ? ArrowRightLeft : Copy} loading={busy} disabled={blocked} onClick={() => void submit()}>
            {t(mode === 'move' ? 'moveHere' : 'copyHere')}
          </Button>
        </>
      }
    >
      <div className="files-movecopy">
        <SegmentedControl
          aria-label={t('moveCopy')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'move', label: t('move'), icon: ArrowRightLeft },
            { value: 'copy', label: t('copy'), icon: Copy },
          ]}
        />
        <div className="files-movecopy__dest">
          <span className="muted">{t('destination')}</span>
          <code className="mono">{dest}</code>
        </div>
        <PathBrowser dir={dest} onDirChange={setDest} disabled={(p) => sources.includes(p)} />
        {same && <p className="files-movecopy__warn">{t('sameDir')}</p>}
        {!same && intoSelf && <p className="files-movecopy__warn">{t('intoSelf')}</p>}
      </div>
    </Drawer>
  );
}
