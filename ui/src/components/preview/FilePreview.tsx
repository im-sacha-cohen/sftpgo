import { useEffect, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Download, FileAudio, FileImage, FileQuestion, FileText, FileVideo, Maximize2, Minimize2, X } from 'lucide-react';
import { Button, EmptyState, IconButton, Spinner } from '@/components/ui';
import { formatBytes } from '@/lib/format';
import { streamingReady, streamUrl } from '@/lib/stream';
import { MediaPlayer } from './MediaPlayer';
import { BLOB_MAX, MIME, TEXT_MAX, extOf, type PreviewKind } from './kinds';
import './FilePreview.css';

export interface FilePreviewProps {
  /** Full path of the file. */
  path: string;
  size: number;
  kind: PreviewKind;
  /** Downloads the file through the API; `range` asks for part of it. */
  fetchFile: (signal: AbortSignal, range?: string) => Promise<Response>;
  /** API endpoint + query used to stream audio/video, e.g. ['/user/files', { path }]. */
  stream?: [string, Record<string, string>];
  onClose: () => void;
  onDownload: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  /** e.g. "3 / 12" */
  position?: string;
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'text'; text: string; truncated: boolean }
  | { status: 'url'; url: string };

const KIND_ICON: Record<PreviewKind, typeof FileText> = {
  audio: FileAudio,
  video: FileVideo,
  image: FileImage,
  pdf: FileText,
  text: FileText,
};

function baseName(p: string) {
  const i = p.replace(/\/+$/, '').lastIndexOf('/');
  return i < 0 ? p : p.slice(i + 1);
}

function parentOf(p: string) {
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.slice(0, i);
}

function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Page layout with an optional preview panel on the right. The list stays
 * usable while a file is open (music keeps playing while you browse); under
 * 900px the panel covers the page.
 */
export function PreviewLayout({ panel, children }: { panel: ReactNode; children: ReactNode }) {
  return (
    <div className={panel ? 'fp-layout has-panel' : 'fp-layout'}>
      <div className="fp-layout__main">{children}</div>
      {panel}
    </div>
  );
}

/** Side panel showing one file: custom audio/video player, images, PDFs and text. */
export function FilePreview({ path, size, kind, fetchFile, stream, onClose, onDownload, onPrev, onNext, position }: FilePreviewProps) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [mediaError, setMediaError] = useState(false);
  const [wide, setWide] = useState(false);
  const name = baseName(path);
  const media = kind === 'audio' || kind === 'video';
  const Icon = KIND_ICON[kind];

  useEffect(() => {
    const ctrl = new AbortController();
    let objectUrl: string | null = null;
    setState({ status: 'loading' });
    setMediaError(false);
    (async () => {
      try {
        if (media && stream && (await streamingReady())) {
          if (!ctrl.signal.aborted) setState({ status: 'url', url: streamUrl(stream[0], stream[1]) });
          return;
        }
        if (kind === 'text') {
          const truncated = size > TEXT_MAX;
          const res = await fetchFile(ctrl.signal, truncated ? `bytes=0-${TEXT_MAX - 1}` : undefined);
          const text = await res.text();
          if (!ctrl.signal.aborted) setState({ status: 'text', text, truncated });
          return;
        }
        if (size > BLOB_MAX) {
          setState({ status: 'error', message: `This file is too large to open here (${formatBytes(size, 'en')}). Download it instead.` });
          return;
        }
        const raw = await (await fetchFile(ctrl.signal)).blob();
        // Force an explicit type: never let the browser sniff HTML out of a blob.
        objectUrl = URL.createObjectURL(new Blob([raw], { type: MIME[extOf(path)] ?? 'application/octet-stream' }));
        if (!ctrl.signal.aborted) setState({ status: 'url', url: objectUrl });
      } catch (e) {
        if (!ctrl.signal.aborted) setState({ status: 'error', message: message(e) });
      }
    })();
    return () => {
      ctrl.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // fetchFile/stream change identity on every render of the parent; the path is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, kind, size]);

  // Esc closes; ←/→ move between files. Ignored while typing, inside the
  // player (it uses the arrows to seek) or when a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.defaultPrevented || document.querySelector('.c-dialog-root')) return;
      if (t?.closest('input, textarea, select, [contenteditable], .mp, [role="menu"]')) return;
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight' && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPrev, onNext, onClose]);

  const url = state.status === 'url' ? state.url : null;

  return (
    <aside className={wide ? 'fp-panel is-wide' : 'fp-panel'} aria-label={`Preview of ${name}`}>
      <header className="fp-panel__head">
        <span className={`fp-panel__icon fp-panel__icon--${kind}`} aria-hidden="true">
          <Icon size={18} strokeWidth={1.8} />
        </span>
        <div className="fp-panel__titles">
          <h2 className="fp-panel__name">{name}</h2>
          <p className="fp-panel__meta mono">
            {parentOf(path)} · {formatBytes(size, 'en')}
          </p>
        </div>
        <IconButton
          className="fp-panel__wide"
          icon={wide ? Minimize2 : Maximize2}
          label={wide ? 'Narrow panel' : 'Widen panel'}
          variant="ghost"
          size="sm"
          onClick={() => setWide((w) => !w)}
        />
        <IconButton icon={X} label="Close preview" variant="ghost" size="sm" onClick={onClose} />
      </header>

      <div className={`fp-panel__body fp fp--${kind}`}>
        {state.status === 'loading' && <Spinner label="Loading" />}
        {state.status === 'error' && <EmptyState compact icon={FileQuestion} title="Can’t open this file" description={state.message} />}
        {state.status === 'text' && (
          <div className="fp__text-wrap">
            {state.truncated && <p className="fp__note">Showing the first {formatBytes(TEXT_MAX, 'en')}. Download the file to see all of it.</p>}
            <pre className="fp__text mono">{state.text}</pre>
          </div>
        )}
        {url && kind === 'image' && <img src={url} alt={name} className="fp__img" />}
        {url && kind === 'pdf' && <iframe src={url} className="fp__pdf" title={name} />}
        {url && media && mediaError && (
          <EmptyState
            compact
            icon={FileQuestion}
            title="This browser can’t play this file"
            description="The format or codec isn’t supported here. Download the file to open it with another app."
          />
        )}
        {url && media && !mediaError && (
          <MediaPlayer
            key={url}
            kind={kind as 'audio' | 'video'}
            src={url}
            title={name.replace(/\.[^.]+$/, '')}
            subtitle={extOf(name).toUpperCase()}
            onEnded={kind === 'audio' ? onNext : undefined}
            onError={() => setMediaError(true)}
          />
        )}
      </div>

      <footer className="fp-panel__foot">
        {(onPrev || onNext || position) && (
          <div className="fp-nav">
            <IconButton icon={ChevronLeft} label="Previous file" variant="ghost" size="sm" disabled={!onPrev} onClick={onPrev} />
            {position && <span className="fp-nav__pos mono">{position}</span>}
            <IconButton icon={ChevronRight} label="Next file" variant="ghost" size="sm" disabled={!onNext} onClick={onNext} />
          </div>
        )}
        <Button variant="secondary" size="sm" icon={Download} onClick={onDownload}>
          Download
        </Button>
      </footer>
    </aside>
  );
}
