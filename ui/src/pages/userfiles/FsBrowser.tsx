import { useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Download, File, FileAudio, FileImage, FileText, FileVideo, Folder, FolderLock, FolderPlus, MoreHorizontal, Pencil, Trash2, Upload } from 'lucide-react';
import { Button, DataTable, EmptyState, IconButton, Input, Menu, Modal, useConfirm, useToast } from '@/components/ui';
import { ApiError, api, request } from '@/api/client';
import type { DirEntry } from '@/api/types';
import { formatBytes, formatRelative } from '@/lib/format';
import { FilePreview, PreviewLayout } from '@/components/preview/FilePreview';
import { previewKind, type PreviewKind } from '@/components/preview/kinds';
import './userfiles.css';

/**
 * File browser over an admin "fs" API (`<base>/dirs` and `<base>/files`): used
 * for users' files (read-only) and for virtual folders. Pass `writable` to
 * enable upload, new folder, rename and delete (`<base>/files/upload`,
 * POST/DELETE `<base>/dirs`, DELETE `<base>/files`, `<base>/file-actions/move`).
 */

const MODE_DIR = 0x80000000;
const isDir = (e: DirEntry) => ((e.mode ?? 0) & MODE_DIR) !== 0;
const join = (dir: string, name: string) => (dir === '/' ? `/${name}` : `${dir}/${name}`);

const KIND_ICON: Record<PreviewKind, typeof File> = {
  audio: FileAudio,
  video: FileVideo,
  image: FileImage,
  pdf: FileText,
  text: FileText,
};

export function errMessage(e: unknown) {
  if (e instanceof ApiError) return e.detail ? `${e.message}: ${e.detail}` : e.message;
  return e instanceof Error ? e.message : String(e);
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export interface FsBrowserProps {
  /** API prefix, e.g. `/users/alice/fs` or `/folders/archive/fs`. */
  base: string;
  /** Query-key prefix for caching, e.g. ['user-files', 'alice']. */
  cacheKey: string[];
  /** Current directory ("/" = root). */
  dir: string;
  /** Console route for a directory. */
  route: (dir: string) => string;
  rootLabel?: string;
  /** Enables the write actions. */
  writable?: boolean;
  /** Called after any change (e.g. to rescan the quota). */
  onChanged?: () => void;
}

type Dialog = { kind: 'mkdir' } | { kind: 'rename'; entry: DirEntry } | null;

export function FsBrowser({ base, cacheKey, dir, route, rootLabel = 'Home', writable = false, onChanged }: FsBrowserProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [dialogName, setDialogName] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: cacheKey });
    onChanged?.();
  };

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setUploading({ done: 0, total: files.length });
    let failed = 0;
    for (const [i, f] of files.entries()) {
      try {
        await request(`${base}/files/upload`, {
          method: 'POST',
          query: { path: join(dir, f.name), mkdir_parents: 'true' },
          rawBody: f,
          headers: { 'Content-Type': 'application/octet-stream', 'X-SFTPGO-MTIME': String(f.lastModified) },
        });
      } catch (e) {
        failed++;
        toast({ title: `Couldn’t upload ${f.name}`, description: errMessage(e), tone: 'bad' });
      }
      setUploading({ done: i + 1, total: files.length });
    }
    setUploading(null);
    if (failed < files.length) toast({ title: files.length - failed === 1 ? 'File uploaded' : `${files.length - failed} files uploaded`, tone: 'ok' });
    refresh();
  };

  const remove = async (e: DirEntry) => {
    const folder = isDir(e);
    const ok = await confirm({
      title: `Delete “${e.name}”?`,
      message: folder ? 'The folder and everything inside it will be deleted. This cannot be undone.' : 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    try {
      await request(`${base}/${folder ? 'dirs' : 'files'}`, { method: 'DELETE', query: { path: join(dir, e.name ?? '') } });
      toast({ title: 'Deleted', tone: 'ok' });
      refresh();
    } catch (err) {
      toast({ title: 'Couldn’t delete', description: errMessage(err), tone: 'bad' });
    }
  };

  const submitDialog = async () => {
    const name = dialogName.trim();
    if (!dialog || !name || name.includes('/')) return;
    setBusy(true);
    try {
      if (dialog.kind === 'mkdir') {
        await request(`${base}/dirs`, { method: 'POST', query: { path: join(dir, name) } });
        toast({ title: 'Folder created', tone: 'ok' });
      } else {
        await request(`${base}/file-actions/move`, {
          method: 'POST',
          query: { path: join(dir, dialog.entry.name ?? ''), target: join(dir, name) },
        });
        toast({ title: 'Renamed', tone: 'ok' });
      }
      setDialog(null);
      refresh();
    } catch (err) {
      toast({ title: dialog.kind === 'mkdir' ? 'Couldn’t create the folder' : 'Couldn’t rename', description: errMessage(err), tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  const dropProps = writable
    ? {
        onDragOver: (e: DragEvent) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDragOver(true);
        },
        onDragLeave: (e: DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
        },
        onDrop: (e: DragEvent) => {
          e.preventDefault();
          setDragOver(false);
          void upload(Array.from(e.dataTransfer.files));
        },
      }
    : {};
  // The open file is kept by full path so it stays open (and keeps playing) while browsing.
  const [open, setOpen] = useState<{ path: string; size: number } | null>(null);

  const listing = useQuery({
    queryKey: [...cacheKey, dir],
    queryFn: ({ signal }) => api.get<DirEntry[]>(`${base}/dirs`, { path: dir }, signal),
  });

  const entries = useMemo(() => {
    const list = [...(listing.data ?? [])];
    list.sort((a, b) => Number(isDir(b)) - Number(isDir(a)) || (a.name ?? '').localeCompare(b.name ?? '', 'en', { numeric: true }));
    return list;
  }, [listing.data]);
  const viewable = useMemo(() => entries.filter((e) => !isDir(e) && previewKind(e.name ?? '')), [entries]);

  const fetchFile = (path: string, signal?: AbortSignal, range?: string) =>
    request<Response>(`${base}/files`, { query: { path }, raw: true, signal, headers: range ? { Range: range } : undefined });

  const download = async (path: string) => {
    try {
      const res = await fetchFile(path);
      saveBlob(await res.blob(), path.slice(path.lastIndexOf('/') + 1));
    } catch (e) {
      toast({ title: 'Download failed', description: errMessage(e), tone: 'bad' });
    }
  };

  const openEntry = (e: DirEntry) => {
    const path = join(dir, e.name ?? '');
    if (isDir(e)) navigate(route(path));
    else if (previewKind(e.name ?? '')) setOpen({ path, size: e.size ?? 0 });
    else void download(path);
  };

  const parts = dir.split('/').filter(Boolean);
  const index = open ? viewable.findIndex((e) => join(dir, e.name ?? '') === open.path) : -1;
  const openAt = (i: number) => setOpen({ path: join(dir, viewable[i].name ?? ''), size: viewable[i].size ?? 0 });

  return (
    <PreviewLayout
      panel={
        open && (
          <FilePreview
            path={open.path}
            size={open.size}
            kind={previewKind(open.path)!}
            fetchFile={(signal, range) => fetchFile(open.path, signal, range)}
            stream={[`${base}/files`, { path: open.path }]}
            onClose={() => setOpen(null)}
            onDownload={() => void download(open.path)}
            onPrev={index > 0 ? () => openAt(index - 1) : undefined}
            onNext={index >= 0 && index < viewable.length - 1 ? () => openAt(index + 1) : undefined}
            position={index >= 0 ? `${index + 1} / ${viewable.length}` : undefined}
          />
        )
      }
    >
      <div className={dragOver ? 'ufiles-drop is-over' : 'ufiles-drop'} {...dropProps}>
      <div className="ufiles-bar">
      <nav className="ufiles-path" aria-label="Folder path">
        <Link to={route('/')} className="ufiles-path__seg">
          {rootLabel}
        </Link>
        {parts.map((p, i) => {
          const to = '/' + parts.slice(0, i + 1).join('/');
          return (
            <span key={to} className="ufiles-path__item">
              <ChevronRight size={14} aria-hidden="true" />
              {i === parts.length - 1 ? (
                <span className="ufiles-path__seg mono" aria-current="page">
                  {p}
                </span>
              ) : (
                <Link to={route(to)} className="ufiles-path__seg mono">
                  {p}
                </Link>
              )}
            </span>
          );
        })}
      </nav>
      {writable && (
        <div className="ufiles-actions">
          <Button icon={FolderPlus} onClick={() => (setDialogName(''), setDialog({ kind: 'mkdir' }))}>
            New folder
          </Button>
          <Button variant="primary" icon={Upload} loading={!!uploading} onClick={() => fileInput.current?.click()}>
            {uploading ? `Uploading ${uploading.done}/${uploading.total}` : 'Upload files'}
          </Button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = '';
              void upload(files);
            }}
          />
        </div>
      )}
      </div>

      {listing.error && dir === '/' && listing.error instanceof ApiError && listing.error.status === 404 ? (
        <EmptyState
          icon={Folder}
          title="Nothing stored here yet"
          description="The storage location doesn’t exist yet. It is created the first time someone uploads into it."
        />
      ) : listing.error ? (
        <EmptyState icon={FolderLock} title="Can’t open this folder" description={errMessage(listing.error)} />
      ) : (
        <DataTable<DirEntry>
          aria-label={`Contents of ${dir}`}
          rows={entries}
          rowKey={(e) => e.name ?? ''}
          loading={listing.isLoading}
          onRowClick={openEntry}
          rowClassName={(e) => (open && join(dir, e.name ?? '') === open.path ? 'ufiles-row--open' : undefined)}
          empty={
            <EmptyState
              icon={Folder}
              title="This folder is empty"
              description={writable ? 'Drop files here or use “Upload files”.' : undefined}
            />
          }
          columns={[
            {
              id: 'name',
              header: 'Name',
              cell: (e) => {
                const kind = previewKind(e.name ?? '');
                const Icon = isDir(e) ? Folder : kind ? KIND_ICON[kind] : File;
                return (
                  <span className={isDir(e) ? 'ufiles-name is-dir' : 'ufiles-name'}>
                    <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
                    <span className="mono">{e.name}</span>
                  </span>
                );
              },
            },
            { id: 'size', header: 'Size', align: 'right', cell: (e) => <span className="mono muted">{isDir(e) ? '—' : formatBytes(e.size ?? 0, 'en')}</span> },
            {
              id: 'modified',
              header: 'Modified',
              cell: (e) => <span className="muted">{e.last_modified ? formatRelative(Date.parse(e.last_modified), 'en') : '—'}</span>,
            },
            {
              id: 'actions',
              header: <span className="sr-only">Actions</span>,
              align: 'right',
              cell: (e) =>
                writable ? (
                  <Menu
                    placement="bottom-end"
                    trigger={<IconButton icon={MoreHorizontal} label={`Actions for ${e.name}`} variant="ghost" size="sm" />}
                    items={[
                      ...(isDir(e) ? [] : [{ label: 'Download', icon: Download, onSelect: () => void download(join(dir, e.name ?? '')) }]),
                      { label: 'Rename', icon: Pencil, onSelect: () => (setDialogName(e.name ?? ''), setDialog({ kind: 'rename', entry: e })) },
                      'separator' as const,
                      { label: 'Delete', icon: Trash2, danger: true, onSelect: () => void remove(e) },
                    ]}
                  />
                ) : isDir(e) ? null : (
                  <IconButton icon={Download} label={`Download ${e.name}`} variant="ghost" size="sm" onClick={() => void download(join(dir, e.name ?? ''))} />
                ),
            },
          ]}
        />
      )}
      {writable && dragOver && <div className="ufiles-drop__hint">Drop files to upload them here</div>}
      </div>
      {dialog && (
        <Modal
          open
          size="sm"
          onClose={() => setDialog(null)}
          title={dialog.kind === 'mkdir' ? 'New folder' : `Rename “${dialog.entry.name}”`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button variant="primary" loading={busy} disabled={!dialogName.trim() || dialogName.includes('/')} onClick={() => void submitDialog()}>
                {dialog.kind === 'mkdir' ? 'Create' : 'Rename'}
              </Button>
            </>
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submitDialog();
            }}
          >
            <Input
              label="Name"
              value={dialogName}
              autoFocus
              mono
              error={dialogName.includes('/') ? 'A name can’t contain “/”.' : undefined}
              onFocus={(e) => {
                // Preselect the name without its extension, like a file manager.
                const v = e.currentTarget.value;
                const dot = v.lastIndexOf('.');
                e.currentTarget.setSelectionRange(0, dot > 0 ? dot : v.length);
              }}
              onChange={(e) => setDialogName(e.target.value)}
            />
          </form>
        </Modal>
      )}
    </PreviewLayout>
  );
}
