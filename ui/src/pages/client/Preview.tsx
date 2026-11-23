import { useEffect, useState } from 'react';
import { Download, FileQuestion } from 'lucide-react';
import { Button, EmptyState, Modal, Spinner } from '@/components/ui';
import { useCommon, useLang, useT } from '@/lib/i18n';
import { formatBytes } from '@/lib/format';
import { baseName, errMsg, fetchFile } from './api';
import { filesDict } from './i18n';

export type PreviewKind = 'image' | 'pdf' | 'text' | 'video' | 'audio';

const IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg'];
const VIDEO = ['mp4', 'webm', 'ogv', 'mov', 'm4v'];
const AUDIO = ['mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac'];
const TEXT = [
  'txt', 'md', 'markdown', 'log', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'env',
  'xml', 'html', 'htm', 'css', 'scss', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'go', 'py', 'rb', 'rs', 'java', 'kt',
  'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'sql', 'properties', 'gradle', 'tf',
  'dockerfile', 'makefile', 'gitignore', 'pem', 'pub', 'crt', 'srt', 'vtt', 'rst', 'tex',
];

const TEXT_MAX = 1024 * 1024;
const MEDIA_MAX = 50 * 1024 * 1024;
const MIME: Record<string, string> = {
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  m4v: 'video/mp4',
  ogv: 'video/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
};

function ext(name: string) {
  const lower = name.toLowerCase();
  const i = lower.lastIndexOf('.');
  return i < 0 ? lower : lower.slice(i + 1);
}

/** Preview type for a file, or null when it should just be downloaded. */
export function previewKind(name: string, size: number): PreviewKind | null {
  const e = ext(name);
  if (TEXT.includes(e)) return size <= TEXT_MAX ? 'text' : null;
  if (size > MEDIA_MAX) return null;
  if (IMAGE.includes(e)) return 'image';
  if (e === 'pdf') return 'pdf';
  if (VIDEO.includes(e)) return 'video';
  if (AUDIO.includes(e)) return 'audio';
  return null;
}

interface PreviewProps {
  path: string;
  size: number;
  kind: PreviewKind;
  onClose: () => void;
  onDownload: () => void;
}

export function PreviewModal({ path, size, kind, onClose, onDownload }: PreviewProps) {
  const t = useT(filesDict);
  const c = useCommon();
  const { lang } = useLang();
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    let objectUrl: string | null = null;
    setUrl(null);
    setText(null);
    setError(null);
    (async () => {
      try {
        const res = await fetchFile(path, ctrl.signal);
        if (kind === 'text') {
          setText(await res.text());
        } else {
          const raw = await res.blob();
          // Force a safe, explicit type: never let the browser sniff HTML out of a blob.
          const blob = new Blob([raw], { type: MIME[ext(path)] ?? 'application/octet-stream' });
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      } catch (e) {
        if (!ctrl.signal.aborted) setError(errMsg(e));
      }
    })();
    return () => {
      ctrl.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, kind]);

  const loading = !error && url === null && text === null;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={<span className="mono">{baseName(path)}</span>}
      description={<span className="mono">{`${path} · ${formatBytes(size, lang)}`}</span>}
      className="files-preview-modal"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {c('close')}
          </Button>
          <Button variant="primary" icon={Download} onClick={onDownload}>
            {t('download')}
          </Button>
        </>
      }
    >
      <div className={`files-preview files-preview--${kind}`}>
        {loading && <Spinner label={c('loading')} />}
        {error && <EmptyState compact icon={FileQuestion} title={c('error')} description={error} />}
        {text !== null && <pre className="files-preview__text mono">{text}</pre>}
        {url && kind === 'image' && <img src={url} alt={baseName(path)} className="files-preview__img" />}
        {url && kind === 'pdf' && <iframe src={url} className="files-preview__pdf" aria-label={baseName(path)} />}
        {url && kind === 'video' && <video src={url} controls className="files-preview__img" />}
        {url && kind === 'audio' && <audio src={url} controls />}
      </div>
    </Modal>
  );
}
