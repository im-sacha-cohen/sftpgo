// Which files the Console can open in its viewer, shared by the user files
// page and the admin "User files" browser.

export type PreviewKind = 'image' | 'pdf' | 'text' | 'video' | 'audio';

// No SVG: an SVG can hold scripts, and a preview blob shares the Console's
// origin, so opening it as a page would let it read the session.
const IMAGE = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico'];
const VIDEO = ['mp4', 'webm', 'ogv', 'mov', 'm4v', 'mkv'];
const AUDIO = ['mp3', 'wav', 'ogg', 'oga', 'opus', 'flac', 'm4a', 'aac', 'weba'];
const TEXT = [
  'txt', 'md', 'markdown', 'log', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml', 'toml', 'ini', 'conf', 'cfg', 'env',
  'xml', 'html', 'htm', 'css', 'scss', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'go', 'py', 'rb', 'rs', 'java', 'kt',
  'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'sql', 'properties', 'gradle', 'tf',
  'dockerfile', 'makefile', 'gitignore', 'pem', 'pub', 'crt', 'srt', 'vtt', 'rst', 'tex',
];

/** Text is read whole; beyond this the first part only is shown. */
export const TEXT_MAX = 2 * 1024 * 1024;
/** Images, PDFs and (without streaming) media are downloaded whole up to this size. */
export const BLOB_MAX = 100 * 1024 * 1024;

export const MIME: Record<string, string> = {
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
  mkv: 'video/x-matroska',
  ogv: 'video/ogg',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  weba: 'audio/webm',
};

export function extOf(name: string) {
  const lower = name.toLowerCase();
  const i = lower.lastIndexOf('.');
  return i < 0 ? lower : lower.slice(i + 1);
}

/** Viewer type for a file name, or null when it can only be downloaded. */
export function previewKind(name: string): PreviewKind | null {
  const e = extOf(name);
  if (TEXT.includes(e)) return 'text';
  if (IMAGE.includes(e)) return 'image';
  if (e === 'pdf') return 'pdf';
  if (VIDEO.includes(e)) return 'video';
  if (AUDIO.includes(e)) return 'audio';
  return null;
}
