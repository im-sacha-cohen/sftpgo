import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Download, File, FileAudio, FileImage, FileText, FileVideo, Folder, FolderLock, Search, User as UserIcon } from 'lucide-react';
import { Badge, DataTable, EmptyState, IconButton, Input, useToast } from '@/components/ui';
import { Page, PageHeader } from '@/app/PageHeader';
import { ApiError, api, request } from '@/api/client';
import type { DirEntry, User } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { formatBytes, formatRelative } from '@/lib/format';
import { FilePreview } from '@/components/preview/FilePreview';
import { previewKind, type PreviewKind } from '@/components/preview/kinds';
import './userfiles.css';

// Read-only browser over a user's files for administrators holding the
// view_user_files permission (GET /users/{username}/fs/dirs|files).

const MODE_DIR = 0x80000000;
const isDir = (e: DirEntry) => ((e.mode ?? 0) & MODE_DIR) !== 0;
const join = (dir: string, name: string) => (dir === '/' ? `/${name}` : `${dir}/${name}`);
const fsBase = (username: string) => `/users/${encodeURIComponent(username)}/fs`;
const browseRoute = (username: string, dir: string) =>
  `/user-files/${encodeURIComponent(username)}${dir === '/' ? '' : dir.split('/').map(encodeURIComponent).join('/')}`;

const KIND_ICON: Record<PreviewKind, typeof File> = {
  audio: FileAudio,
  video: FileVideo,
  image: FileImage,
  pdf: FileText,
  text: FileText,
};

function errMessage(e: unknown) {
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

export default function UserFilesPage() {
  const { can } = useAuth();
  const { username } = useParams();
  if (!can('view_user_files')) {
    return (
      <Page>
        <PageHeader title="User files" />
        <EmptyState
          icon={FolderLock}
          title="You can’t open users’ files"
          description="This needs the “view_user_files” permission on your administrator account."
        />
      </Page>
    );
  }
  return username ? <Browser username={username} /> : <UserPicker />;
}

function UserPicker() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const users = useQuery({ queryKey: ['users', 'all'], queryFn: () => api.get<User[]>('/users', { limit: 500, order: 'ASC' }) });
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = users.data ?? [];
    return q ? list.filter((u) => `${u.username} ${u.email ?? ''} ${u.description ?? ''}`.toLowerCase().includes(q)) : list;
  }, [users.data, filter]);

  return (
    <Page>
      <PageHeader title="User files" subtitle="Pick an account to browse, view and play its files. Access is read-only." />
      <div className="ufiles-toolbar">
        <Input
          aria-label="Filter users"
          placeholder="Filter users"
          prefix={<Search size={15} aria-hidden="true" />}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          wrapperClassName="ufiles-filter"
        />
      </div>
      {users.error ? (
        <EmptyState icon={UserIcon} title="Can’t load users" description={errMessage(users.error)} />
      ) : (
        <DataTable<User>
          aria-label="Users"
          rows={rows}
          rowKey={(u) => u.username ?? ''}
          loading={users.isLoading}
          onRowClick={(u) => navigate(browseRoute(u.username ?? '', '/'))}
          empty={<EmptyState icon={UserIcon} title={filter ? 'No matching user' : 'No users yet'} />}
          columns={[
            {
              id: 'user',
              header: 'User',
              cell: (u) => (
                <span className="ufiles-user">
                  <span className="mono">{u.username}</span>
                  {(u.email || u.description) && <span className="muted">{u.email || u.description}</span>}
                </span>
              ),
            },
            { id: 'role', header: 'Role', cell: (u) => (u.role ? <Badge mono>{u.role}</Badge> : <span className="muted">—</span>) },
            { id: 'used', header: 'Used', align: 'right', cell: (u) => <span className="mono">{formatBytes(u.used_quota_size ?? 0, 'en')}</span> },
            { id: 'files', header: 'Files', align: 'right', cell: (u) => <span className="mono">{(u.used_quota_files ?? 0).toLocaleString('en')}</span> },
          ]}
        />
      )}
    </Page>
  );
}

function Browser({ username }: { username: string }) {
  const navigate = useNavigate();
  const toast = useToast();
  const params = useParams();
  const dir = '/' + (params['*'] ?? '').split('/').filter(Boolean).join('/');
  const [open, setOpen] = useState<string | null>(null);

  const listing = useQuery({
    queryKey: ['user-files', username, dir],
    queryFn: ({ signal }) => api.get<DirEntry[]>(`${fsBase(username)}/dirs`, { path: dir }, signal),
  });

  const entries = useMemo(() => {
    const list = [...(listing.data ?? [])];
    list.sort((a, b) => Number(isDir(b)) - Number(isDir(a)) || (a.name ?? '').localeCompare(b.name ?? '', 'en', { numeric: true }));
    return list;
  }, [listing.data]);
  const viewable = useMemo(() => entries.filter((e) => !isDir(e) && previewKind(e.name ?? '')), [entries]);

  const fetchFile = (path: string, signal?: AbortSignal, range?: string) =>
    request<Response>(`${fsBase(username)}/files`, { query: { path }, raw: true, signal, headers: range ? { Range: range } : undefined });

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
    if (isDir(e)) navigate(browseRoute(username, path));
    else if (previewKind(e.name ?? '')) setOpen(e.name ?? null);
    else void download(path);
  };

  const parts = dir.split('/').filter(Boolean);
  const index = open ? viewable.findIndex((e) => e.name === open) : -1;
  const current = index >= 0 ? viewable[index] : null;

  return (
    <Page>
      <PageHeader
        title={<span className="mono">{username}</span>}
        docTitle={`Files of ${username}`}
        subtitle="Read-only. Opening a file counts as a download for this user."
        crumbs={[{ label: 'User files', to: '/user-files' }]}
      />
      <nav className="ufiles-path" aria-label="Folder path">
        <Link to={browseRoute(username, '/')} className="ufiles-path__seg">
          Home
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
                <Link to={browseRoute(username, to)} className="ufiles-path__seg mono">
                  {p}
                </Link>
              )}
            </span>
          );
        })}
      </nav>

      {listing.error ? (
        <EmptyState icon={FolderLock} title="Can’t open this folder" description={errMessage(listing.error)} />
      ) : (
        <DataTable<DirEntry>
          aria-label={`Contents of ${dir}`}
          rows={entries}
          rowKey={(e) => e.name ?? ''}
          loading={listing.isLoading}
          onRowClick={openEntry}
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

      {current && (
        <FilePreview
          path={join(dir, current.name ?? '')}
          size={current.size ?? 0}
          kind={previewKind(current.name ?? '')!}
          fetchFile={(signal, range) => fetchFile(join(dir, current.name ?? ''), signal, range)}
          stream={[`${fsBase(username)}/files`, { path: join(dir, current.name ?? '') }]}
          onClose={() => setOpen(null)}
          onDownload={() => void download(join(dir, current.name ?? ''))}
          onPrev={index > 0 ? () => setOpen(viewable[index - 1].name ?? null) : undefined}
          onNext={index < viewable.length - 1 ? () => setOpen(viewable[index + 1].name ?? null) : undefined}
          position={`${index + 1} / ${viewable.length}`}
        />
      )}
    </Page>
  );
}
