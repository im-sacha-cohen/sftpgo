import { useState, useSyncExternalStore } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, CircleAlert, RotateCcw, Trash2, Upload, X } from 'lucide-react';
import { IconButton, ProgressBar } from '@/components/ui';
import { useLang, useT } from '@/lib/i18n';
import { formatBytes } from '@/lib/format';
import { errMsg, joinPath, parentPath, UploadAborted, uploadFile } from './api';
import { filesDict } from './i18n';
import type { FilesClient } from './fsclient';

/*
 * Upload queue shared by every mount of the files page: transfers keep going
 * (and stay listed) when the user browses other folders.
 */

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error' | 'canceled';

export interface UploadItem {
  id: string;
  file: File;
  /** Full destination path. */
  path: string;
  /** Account the file goes to (the user, or a user an administrator acts as). */
  fc: FilesClient;
  loaded: number;
  status: UploadStatus;
  error?: string;
}

const CONCURRENCY = 3;
let items: UploadItem[] = [];
const aborts = new Map<string, () => void>();
const listeners = new Set<() => void>();
const doneListeners = new Set<(dir: string) => void>();
let seq = 0;

function emit() {
  items = [...items];
  listeners.forEach((l) => l());
}

function patch(id: string, p: Partial<UploadItem>) {
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return;
  items[i] = { ...items[i], ...p };
  emit();
}

function pump() {
  let running = items.filter((x) => x.status === 'uploading').length;
  for (const it of items) {
    if (running >= CONCURRENCY) break;
    if (it.status !== 'queued') continue;
    running++;
    start(it);
  }
}

function start(it: UploadItem) {
  patch(it.id, { status: 'uploading', loaded: 0, error: undefined });
  let last = 0;
  const h = uploadFile(it.fc, it.path, it.file, (loaded) => {
    // Throttle re-renders to ~10/s per file.
    const now = performance.now();
    if (now - last < 100 && loaded < it.file.size) return;
    last = now;
    patch(it.id, { loaded });
  });
  aborts.set(it.id, h.abort);
  h.promise
    .then(() => {
      patch(it.id, { status: 'done', loaded: it.file.size });
      doneListeners.forEach((l) => l(parentPath(it.path)));
    })
    .catch((e) => {
      if (e instanceof UploadAborted) patch(it.id, { status: 'canceled' });
      else patch(it.id, { status: 'error', error: errMsg(e) });
    })
    .finally(() => {
      aborts.delete(it.id);
      pump();
    });
}

export interface QueuedFile {
  file: File;
  /** Path relative to the target directory ("sub/dir/file.txt"), defaults to the file name. */
  relPath?: string;
}

export const uploads = {
  enqueue(fc: FilesClient, dir: string, files: QueuedFile[]) {
    for (const f of files) {
      items.push({ id: `u${++seq}`, fc, file: f.file, path: joinPath(dir, f.relPath ?? f.file.name), loaded: 0, status: 'queued' });
    }
    emit();
    pump();
  },
  cancel(id: string) {
    const a = aborts.get(id);
    if (a) a();
    else patch(id, { status: 'canceled' });
  },
  cancelAll() {
    for (const it of items) if (it.status === 'queued' || it.status === 'uploading') uploads.cancel(it.id);
  },
  retry(id: string) {
    patch(id, { status: 'queued', loaded: 0, error: undefined });
    pump();
  },
  clearFinished() {
    items = items.filter((x) => x.status === 'queued' || x.status === 'uploading');
    emit();
  },
  /** Called with the parent directory of each completed upload. */
  onUploaded(cb: (dir: string) => void) {
    doneListeners.add(cb);
    return () => {
      doneListeners.delete(cb);
    };
  },
};

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useUploads() {
  return useSyncExternalStore(subscribe, () => items);
}

/* ---------- Drag and drop with folders ---------- */

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) resolve(all);
        else {
          all.push(...batch);
          next();
        }
      }, reject);
    next();
  });
}

async function walk(entry: FileSystemEntry, prefix: string, out: QueuedFile[]) {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
    out.push({ file, relPath: prefix + file.name });
  } else if (entry.isDirectory) {
    const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader());
    for (const c of children) await walk(c, `${prefix}${entry.name}/`, out);
  }
}

/** Files of a drop event, folders included (their relative paths are kept). Call synchronously from the handler. */
export function filesFromDrop(dt: DataTransfer): Promise<QueuedFile[]> {
  const entries = Array.from(dt.items ?? [])
    .filter((i) => i.kind === 'file')
    .map((i) => i.webkitGetAsEntry?.() ?? null);
  if (!entries.length || entries.some((e) => !e)) {
    return Promise.resolve(Array.from(dt.files).map((file) => ({ file })));
  }
  return (async () => {
    const out: QueuedFile[] = [];
    for (const e of entries) await walk(e as FileSystemEntry, '', out);
    return out;
  })();
}

/* ---------- Panel ---------- */

export function UploadsPanel() {
  const t = useT(filesDict);
  const { lang } = useLang();
  const list = useUploads();
  const [collapsed, setCollapsed] = useState(false);
  if (!list.length) return null;
  const done = list.filter((x) => x.status === 'done').length;
  const active = list.some((x) => x.status === 'queued' || x.status === 'uploading');
  const finished = list.some((x) => x.status !== 'queued' && x.status !== 'uploading');
  const total = list.reduce((s, x) => s + x.file.size, 0);
  const loaded = list.reduce((s, x) => s + (x.status === 'done' ? x.file.size : x.loaded), 0);

  return (
    <section className="files-uploads" aria-label={t('uploads')}>
      <header className="files-uploads__head">
        <Upload size={14} aria-hidden="true" />
        <strong>{t('uploadsCount', { done, total: list.length })}</strong>
        <span className="files-uploads__spacer" />
        {active && <IconButton icon={X} size="sm" label={t('cancelAll')} onClick={() => uploads.cancelAll()} />}
        {finished && <IconButton icon={Trash2} size="sm" label={t('clearDone')} onClick={() => uploads.clearFinished()} />}
        <IconButton
          icon={collapsed ? ChevronUp : ChevronDown}
          size="sm"
          label={collapsed ? t('expand') : t('collapse')}
          onClick={() => setCollapsed((c) => !c)}
        />
      </header>
      {active && (
        <div className="files-uploads__total">
          <ProgressBar value={loaded} max={total || 1} size="sm" tone="accent" label={t('uploads')} />
        </div>
      )}
      {!collapsed && (
        <ul className="files-uploads__list">
          {list
            .slice()
            .reverse()
            .map((it) => (
              <li key={it.id} className={`files-upload is-${it.status}`}>
                <div className="files-upload__row">
                  <span className="files-upload__name mono">{it.path}</span>
                  {it.status === 'done' && <CheckCircle2 size={14} className="files-upload__ok" aria-label={t('done')} />}
                  {it.status === 'error' && <CircleAlert size={14} className="files-upload__bad" aria-label={t('failed')} />}
                  {(it.status === 'queued' || it.status === 'uploading') && (
                    <IconButton icon={X} size="sm" label={t('cancel')} onClick={() => uploads.cancel(it.id)} />
                  )}
                  {(it.status === 'error' || it.status === 'canceled') && (
                    <IconButton icon={RotateCcw} size="sm" label={t('retry')} onClick={() => uploads.retry(it.id)} />
                  )}
                </div>
                {it.status === 'uploading' && (
                  <ProgressBar value={it.loaded} max={it.file.size || 1} size="sm" tone="accent" label={it.file.name} />
                )}
                <div className="files-upload__meta">
                  {it.status === 'uploading'
                    ? `${formatBytes(it.loaded, lang)} / ${formatBytes(it.file.size, lang)}`
                    : it.status === 'error'
                      ? it.error
                      : `${t(it.status === 'queued' ? 'queued' : it.status === 'done' ? 'done' : 'canceled')} · ${formatBytes(it.file.size, lang)}`}
                </div>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
