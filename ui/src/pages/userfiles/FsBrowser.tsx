import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Download, File, FileAudio, FileImage, FileText, FileVideo, Folder, FolderLock } from 'lucide-react';
import { DataTable, EmptyState, IconButton, useToast } from '@/components/ui';
import { ApiError, api, request } from '@/api/client';
import type { DirEntry } from '@/api/types';
import { formatBytes, formatRelative } from '@/lib/format';
import { FilePreview, PreviewLayout } from '@/components/preview/FilePreview';
import { previewKind, type PreviewKind } from '@/components/preview/kinds';
import './userfiles.css';

/**
 * Read-only file browser over an admin "fs" API (`<base>/dirs` and
 * `<base>/files`): used for users' files and for virtual folders.
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
}

export function FsBrowser({ base, cacheKey, dir, route, rootLabel = 'Home' }: FsBrowserProps) {
  const navigate = useNavigate();
  const toast = useToast();
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
          empty={<EmptyState icon={Folder} title="This folder is empty" />}
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
                isDir(e) ? null : (
                  <IconButton icon={Download} label={`Download ${e.name}`} variant="ghost" size="sm" onClick={() => void download(join(dir, e.name ?? ''))} />
                ),
            },
          ]}
        />
      )}
    </PreviewLayout>
  );
}
