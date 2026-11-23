import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Folder, FolderLock, Search, Settings2, User as UserIcon } from 'lucide-react';
import { api } from '@/api/client';
import type { User } from '@/api/types';
import { Page, PageHeader } from '@/app/PageHeader';
import { Button, cx, EmptyState, Input, Skeleton, useConfirm, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatBytes } from '@/lib/format';
import { fetchAll, useSpaces, type SpaceFolder } from '@/pages/spaces/api';
import { analyzeAccess, setUserAccess } from '@/pages/spaces/model';
import { errMessage, FsBrowser, type MountedSpace } from '@/pages/userfiles/FsBrowser';
import './browse.css';

// Every file on the server in one place: each person's home and each space,
// with the explorer of the selected one. Writes on a home are made as that
// user (their permissions and quota apply); writes on a space go through the
// folder and its quota is rescanned afterwards.

type Kind = 'u' | 's';

const enc = encodeURIComponent;
const route = (kind: Kind, name: string, dir = '/') =>
  `/browse/${kind}/${enc(name)}${dir === '/' ? '' : dir.split('/').map(enc).join('/')}`;

export default function BrowsePage() {
  const { can } = useAuth();
  const params = useParams();
  const kind = (params.kind === 'u' || params.kind === 's' ? params.kind : null) as Kind | null;
  const name = params.name ?? '';
  const dir = '/' + (params['*'] ?? '').split('/').filter(Boolean).join('/');

  if (!can('view_user_files')) {
    return (
      <Page>
        <PageHeader title="Files" />
        <EmptyState
          icon={FolderLock}
          title="You can’t open the files"
          description="This needs the “view_user_files” permission on your administrator account."
        />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title="Files" subtitle="Everything stored on the server: each person’s own files and each shared space." />
      <div className={cx('browse', kind && name && 'has-selection')}>
        <Sidebar kind={kind} name={name} />
        <section className="browse__main" aria-label="Explorer">
          {kind && name ? <Explorer key={`${kind}:${name}`} kind={kind} name={name} dir={dir} /> : <Overview />}
        </section>
      </div>
    </Page>
  );
}

/* ---------------------------------------------------------------- */

function usePeople() {
  const { can } = useAuth();
  return useQuery({
    queryKey: ['users', 'browse'],
    queryFn: ({ signal }) => fetchAll<User>('/users', signal),
    enabled: can('view_users'),
  });
}

function Sidebar({ kind, name }: { kind: Kind | null; name: string }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const people = usePeople();
  const spaces = useSpaces();
  const q = filter.trim().toLowerCase();
  const match = (...words: (string | undefined)[]) => !q || words.join(' ').toLowerCase().includes(q);

  const users = useMemo(() => (people.data ?? []).filter((u) => match(u.username, u.email, u.description)), [people.data, q]); // eslint-disable-line react-hooks/exhaustive-deps
  const folders = useMemo(() => (spaces.data ?? []).filter((f) => match(f.name, f.description)), [spaces.data, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const item = (k: Kind, n: string, meta: string, icon: typeof Folder) => {
    const Icon = icon;
    const current = kind === k && name === n;
    return (
      <li key={`${k}:${n}`}>
        <button type="button" className={cx('browse-item', current && 'is-current')} aria-current={current || undefined} onClick={() => navigate(route(k, n))}>
          <span className={cx('browse-item__icon', k === 's' && 'is-space')} aria-hidden="true">
            <Icon size={16} strokeWidth={1.9} />
          </span>
          <span className="browse-item__text">
            <span className="browse-item__name">{n}</span>
            <span className="browse-item__meta">{meta}</span>
          </span>
        </button>
      </li>
    );
  };

  return (
    <aside className="browse__side" aria-label="People and spaces">
      <Input
        aria-label="Filter people and spaces"
        placeholder="Find a person or a space"
        prefix={<Search size={15} aria-hidden="true" />}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {can('view_users') && (
        <div className="browse__group">
          <h2 className="browse__group-title">
            People <span className="browse__count">{people.data?.length ?? ''}</span>
          </h2>
          {people.isLoading ? (
            <Skeleton lines={4} />
          ) : people.isError ? (
            <p className="browse__error">{errMessage(people.error)}</p>
          ) : users.length ? (
            <ul className="browse__list">
              {users.map((u) =>
                item('u', u.username ?? '', `${formatBytes(u.used_quota_size ?? 0, 'en')} · ${u.description || u.email || 'Own files'}`, UserIcon),
              )}
            </ul>
          ) : (
            <p className="browse__empty">{q ? 'No match' : 'No users yet'}</p>
          )}
        </div>
      )}

      {can('manage_folders') && (
        <div className="browse__group">
          <h2 className="browse__group-title">
            Spaces <span className="browse__count">{spaces.data?.length ?? ''}</span>
          </h2>
          {spaces.isLoading ? (
            <Skeleton lines={3} />
          ) : spaces.isError ? (
            <p className="browse__error">{errMessage(spaces.error)}</p>
          ) : folders.length ? (
            <ul className="browse__list">
              {folders.map((f) => item('s', f.name ?? '', `${formatBytes(f.used_quota_size ?? 0, 'en')} · ${sharedWith(f)}`, Folder))}
            </ul>
          ) : (
            <p className="browse__empty">{q ? 'No match' : 'No spaces yet'}</p>
          )}
        </div>
      )}
    </aside>
  );
}

function sharedWith(f: SpaceFolder) {
  const n = (f.users?.length ?? 0) + (f.groups?.length ?? 0);
  return n === 0 ? 'Shared with nobody' : n === 1 ? 'Shared with 1' : `Shared with ${n}`;
}

/* ---------------------------------------------------------------- */

function Overview() {
  const { can } = useAuth();
  const people = usePeople();
  const spaces = useSpaces();
  const homes = (people.data ?? []).reduce((s, u) => s + (u.used_quota_size ?? 0), 0);
  const shared = (spaces.data ?? []).reduce((s, f) => s + (f.used_quota_size ?? 0), 0);
  const files = (people.data ?? []).reduce((s, u) => s + (u.used_quota_files ?? 0), 0) + (spaces.data ?? []).reduce((s, f) => s + (f.used_quota_files ?? 0), 0);
  const loading = people.isLoading || spaces.isLoading;
  return (
    <div className="browse-overview">
      <div className="browse-overview__stats">
        {can('view_users') && <Stat label="In people’s own files" value={loading ? '…' : formatBytes(homes, 'en')} hint={count(people.data?.length ?? 0, 'person', 'people')} />}
        {can('manage_folders') && <Stat label="In shared spaces" value={loading ? '…' : formatBytes(shared, 'en')} hint={count(spaces.data?.length ?? 0, 'space', 'spaces')} />}
        <Stat label="Files in total" value={loading ? '…' : files.toLocaleString('en')} hint="As of the last quota update" />
      </div>
      <EmptyState icon={Folder} title="Pick a person or a space" description="Its files open here. You can create folders, upload, rename, move and delete." />
    </div>
  );
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="browse-stat">
      <span className="browse-stat__label">{label}</span>
      <span className="browse-stat__value">{value}</span>
      <span className="browse-stat__hint">{hint}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function Explorer({ kind, name, dir }: { kind: Kind; name: string; dir: string }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const isSpace = kind === 's';

  // Spaces shown inside a person's files: they look like folders but can only be removed from the files.
  const mounts = useQuery({
    queryKey: ['users', name, 'mounts'],
    queryFn: async () => {
      const user = await api.get<User>(`/users/${enc(name)}`);
      const a = await analyzeAccess(user);
      const map = new Map<string, MountedSpace>();
      for (const m of a.mounts)
        if (m.used && m.path !== '/')
          map.set(m.path, { space: m.space, removable: m.kind === 'user', via: m.kind === 'user' ? 'Given directly' : `Through group ${m.from}` });
      return map;
    },
    enabled: !isSpace && can('view_users'),
  });
  const unmount = async (path: string, m: MountedSpace) => {
    const ok = await confirm({
      title: `Remove “${m.space}” from ${name}’s files?`,
      message: `${name} won’t see ${path} any more. The files of the space stay where they are.`,
      confirmLabel: 'Remove access',
      danger: true,
    });
    if (!ok) return;
    try {
      await setUserAccess(name, m.space, null, null);
      await qc.invalidateQueries({ queryKey: ['users'] });
      await qc.invalidateQueries({ queryKey: ['folders'] });
      await qc.invalidateQueries({ queryKey: ['user-files', name] });
      toast({ title: `${name} no longer has access to ${m.space}`, tone: 'ok' });
    } catch (err) {
      toast({ title: 'Couldn’t remove the access', description: errMessage(err), tone: 'bad' });
    }
  };

  if (isSpace && !can('manage_folders')) {
    return <EmptyState icon={FolderLock} title="You can’t open spaces" description="This needs the “manage_folders” permission." />;
  }

  const writable = isSpace ? true : can('edit_users');
  const settingsTo = isSpace ? `/spaces/${enc(name)}` : `/users/${enc(name)}`;
  const onChanged = () => {
    if (isSpace) {
      // Writes go through a synthetic user: refresh the space's used size quietly.
      if (!can('quota_scans')) return;
      void api
        .post(`/quotas/folders/${enc(name)}/scan`)
        .catch(() => undefined)
        .finally(() => window.setTimeout(() => qc.invalidateQueries({ queryKey: ['folders'] }), 1500));
    } else {
      void qc.invalidateQueries({ queryKey: ['users', 'browse'] });
    }
  };

  return (
    <div className="browse-explorer">
      <Button size="sm" variant="ghost" icon={ArrowLeft} className="browse-explorer__back" onClick={() => navigate('/browse')}>
        All people and spaces
      </Button>
      <div className="browse-explorer__head">
        <span className={cx('browse-item__icon', 'is-lg', isSpace && 'is-space')} aria-hidden="true">
          {isSpace ? <Folder size={20} strokeWidth={1.9} /> : <UserIcon size={20} strokeWidth={1.9} />}
        </span>
        <div className="browse-explorer__titles">
          <h2 className="browse-explorer__title mono">{name}</h2>
          <p className="browse-explorer__sub">
            {isSpace
              ? 'Shared space. Everyone who has access sees these files.'
              : writable
                ? 'Their own files. Changes are made as this person: their permissions and quota apply.'
                : 'Their own files. Read-only.'}
          </p>
        </div>
        <Button size="sm" variant="secondary" icon={Settings2} onClick={() => navigate(settingsTo)}>
          {isSpace ? 'Who has access' : 'Account and access'}
        </Button>
      </div>
      <FsBrowser
        base={`/${isSpace ? 'folders' : 'users'}/${enc(name)}/fs`}
        cacheKey={[isSpace ? 'folder-files' : 'user-files', name]}
        dir={dir}
        route={(d) => route(kind, name, d)}
        rootLabel={isSpace ? name : 'Home'}
        writable={writable}
        onChanged={onChanged}
        mounts={isSpace ? undefined : mounts.data}
        onUnmount={can('edit_users') ? (p, m) => void unmount(p, m) : undefined}
      />
    </div>
  );
}
