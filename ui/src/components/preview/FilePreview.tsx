import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileQuestion, Music } from 'lucide-react';
import { Button, EmptyState, IconButton, Modal, Spinner } from '@/components/ui';
import { formatBytes } from '@/lib/format';
import { streamingReady, streamUrl } from '@/lib/stream';
import { BLOB_MAX, MIME, TEXT_MAX, extOf, type PreviewKind } from './kinds';
import './FilePreview.css';

export interface FilePreviewProps {
  /** Full path shown under the title. */
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
  | { status: 'url'; url: string; streamed: boolean };

function baseName(p: string) {
  const i = p.replace(/\/+$/, '').lastIndexOf('/');
  return i < 0 ? p : p.slice(i + 1);
}

function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** Viewer for one file: streams audio/video, shows images, PDFs and text. */
export function FilePreview({ path, size, kind, fetchFile, stream, onClose, onDownload, onPrev, onNext, position }: FilePreviewProps) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [mediaError, setMediaError] = useState(false);
  const name = baseName(path);
  const media = kind === 'audio' || kind === 'video';

  useEffect(() => {
    const ctrl = new AbortController();
    let objectUrl: string | null = null;
    setState({ status: 'loading' });
    setMediaError(false);
    (async () => {
      try {
        if (media && stream && (await streamingReady())) {
          if (!ctrl.signal.aborted) setState({ status: 'url', url: streamUrl(stream[0], stream[1]), streamed: true });
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
        if (!ctrl.signal.aborted) setState({ status: 'url', url: objectUrl, streamed: false });
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

  // ←/→ move between files, unless a field or the media element has the focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest('input, textarea, audio, video, [contenteditable]')) return;
      if (e.key === 'ArrowLeft' && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight' && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPrev, onNext]);

  const url = state.status === 'url' ? state.url : null;
  const unsupported = (
    <EmptyState
      compact
      icon={FileQuestion}
      title="This browser can’t play this file"
      description="The format or codec isn’t supported here. Download the file to open it with another app."
    />
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={<span className="mono">{name}</span>}
      description={<span className="mono">{`${path} · ${formatBytes(size, 'en')}`}</span>}
      className="fp-modal"
      footer={
        <>
          {(onPrev || onNext) && (
            <div className="fp-nav">
              <IconButton icon={ChevronLeft} label="Previous file" variant="ghost" disabled={!onPrev} onClick={onPrev} />
              {position && <span className="fp-nav__pos mono">{position}</span>}
              <IconButton icon={ChevronRight} label="Next file" variant="ghost" disabled={!onNext} onClick={onNext} />
            </div>
          )}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" icon={Download} onClick={onDownload}>
            Download
          </Button>
        </>
      }
    >
      <div className={`fp fp--${kind}`}>
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
        {url && kind === 'video' &&
          (mediaError ? (
            unsupported
          ) : (
            <video key={url} src={url} controls autoPlay playsInline className="fp__video" onError={() => setMediaError(true)} />
          ))}
        {url && kind === 'audio' &&
          (mediaError ? (
            unsupported
          ) : (
            <div className="fp__audio">
              <span className="fp__audio-art" aria-hidden="true">
                <Music size={40} strokeWidth={1.5} />
              </span>
              <span className="fp__audio-name">{name}</span>
              <audio key={url} src={url} controls autoPlay onError={() => setMediaError(true)} onEnded={onNext} />
              {onNext && <span className="fp__note">The next file plays when this one ends.</span>}
            </div>
          ))}
      </div>
    </Modal>
  );
}
