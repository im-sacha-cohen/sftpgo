import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Folder, FolderLock, Search, Settings2, User as UserIcon, UserX } from 'lucide-react';
import { api } from '@/api/client';
import type { User } from '@/api/types';
import { Page, PageHeader } from '@/app/PageHeader';
import { Button, cx, EmptyState, Input, Skeleton, Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatBytes } from '@/lib/format';
import { fetchAll, useSpaces, type SpaceFolder } from '@/pages/spaces/api';
import { errMessage } from '@/pages/userfiles/FsBrowser';
import { Explorer } from '@/pages/client/Explorer';
import { DriveLayout, FolderTree, NewButton, SideTitle } from '@/pages/client/Drive';
import { actAsClient, actAsToken, FilesClientProvider, spaceClient } from '@/pages/client/fsclient';
import '@/pages/client/client.css';
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

  if (kind === 'u' && name) {
    return (
      <Page>
        <ActAs key={name} name={name} dir={dir} />
      </Page>
    );
  }

  if (kind === 's' && name) {
    return (
      <Page>
        <SpaceFiles key={name} name={name} dir={dir} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title="Files" subtitle="Everything stored on the server: each person’s own files and each shared space." />
      <DriveLayout label="People and spaces" sidebar={<Sidebar kind={kind} name={name} />}>
        <section aria-label="Explorer">
          <Overview />
        </section>
      </DriveLayout>
    </Page>
  );
}

/* ---------------------------------------------------------------- */

/**
 * A person's own files, opened as that person: the administrator gets a short
 * token limited to files and shares (POST /users/{username}/impersonate) and
 * the same explorer as the user's "My files" runs with it.
 */
function ActAs({ name, dir }: { name: string; dir: string }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const token = useQuery({
    queryKey: ['act-as', name],
    queryFn: () => actAsToken(name),
    retry: false,
    staleTime: Infinity,
    gcTime: 0,
  });
  const client = useMemo(() => (token.data ? actAsClient(name, token.data) : null), [name, token.data]);
  const toRoute = (d: string) => route('u', name, d);
  const sidebar = (tree: boolean) => (
    <>
      {tree && <NewButton />}
      <Sidebar kind="u" name={name}>
        {tree && <FolderTree rootLabel={name} rootIcon={UserIcon} current={dir} route={toRoute} />}
      </Sidebar>
    </>
  );

  if (!client) {
    return (
      <DriveLayout label="People and spaces" sidebar={sidebar(false)}>
        {token.isError ? (
          <EmptyState
            icon={UserX}
            title={`You can’t open ${name}’s files`}
            description={errMessage(token.error)}
            action={<Button onClick={() => navigate('/browse')}>All people and spaces</Button>}
          />
        ) : (
          <div className="browse-loading">
            <Spinner label={`Opening ${name}’s files`} />
          </div>
        )}
      </DriveLayout>
    );
  }

  return (
    <FilesClientProvider client={client}>
      <DriveLayout label="People and spaces" sidebar={sidebar(true)}>
        <Explorer
          dir={dir}
          route={toRoute}
          rootLabel={name}
          actionsInSidebar
          onChanged={() => void qc.invalidateQueries({ queryKey: ['users', 'browse'] })}
          context={
            <>
              <UserIcon size={15} aria-hidden="true" />
              <span>
                Own files of <strong>{name}</strong>
                {client.perms.includes('write-disabled') ? ' · read only' : ' · you act as this user, their permissions and quota apply'}
              </span>
              <span className="files-context__fill" />
              {can('view_users') && (
                <Button size="sm" variant="ghost" icon={Settings2} onClick={() => navigate(`/users/${enc(name)}`)}>
                  Account and access
                </Button>
              )}
            </>
          }
        />
      </DriveLayout>
    </FilesClientProvider>
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

function Sidebar({ kind, name, children }: { kind: Kind | null; name: string; children?: ReactNode }) {
  const { can, session } = useAuth();
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
    // The open person shows their folder tree in place of the plain item.
    if (current && k === 'u' && children) return <li key={`${k}:${n}`}>{children}</li>;
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
    <>
      <Input
        aria-label="Filter people and spaces"
        placeholder="Find a person or a space"
        prefix={<Search size={15} aria-hidden="true" />}
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {can('view_users') && (
        <div className="browse__group">
          <SideTitle count={people.data?.length ?? ''}>People</SideTitle>
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

      {can('manage_folders') && !session?.role && (
        <div className="browse__group">
          <SideTitle count={spaces.data?.length ?? ''}>Spaces</SideTitle>
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
    </>
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

/**
 * The files of a space, in the same explorer as a person's files. The
 * administrator's own session is used (admin routes /folders/{name}/fs/…).
 */
function SpaceFiles({ name, dir }: { name: string; dir: string }) {
  const { can, session } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  // Changing files needs change_users, for spaces too.
  const writable = can('edit_users');
  const client = useMemo(() => spaceClient(name, writable), [name, writable]);
  const toRoute = (d: string) => route('s', name, d);
  const allowed = can('manage_folders') && !session?.role;

  if (!allowed) {
    return (
      <DriveLayout label="People and spaces" sidebar={<Sidebar kind="s" name={name} />}>
        <EmptyState
          icon={FolderLock}
          title="You can’t open spaces"
          description={session?.role ? 'Administrators limited to a role can’t open the files of spaces.' : 'This needs the “manage_folders” permission.'}
        />
      </DriveLayout>
    );
  }

  // Writes go through a synthetic user: refresh the space's used size quietly.
  const onChanged = () => {
    if (!can('quota_scans')) return;
    void api
      .post(`/quotas/folders/${enc(name)}/scan`)
      .catch(() => undefined)
      .finally(() => window.setTimeout(() => qc.invalidateQueries({ queryKey: ['folders'] }), 1500));
  };

  return (
    <FilesClientProvider client={client}>
      <DriveLayout
        label="People and spaces"
        sidebar={
          <>
            {writable && <NewButton />}
            <Sidebar kind="s" name={name}>
              <FolderTree rootLabel={name} rootIcon={Folder} current={dir} route={toRoute} />
            </Sidebar>
          </>
        }
      >
        <Explorer
          dir={dir}
          route={toRoute}
          rootLabel={name}
          actionsInSidebar={writable}
          onChanged={onChanged}
          context={
            <>
              <Folder size={15} aria-hidden="true" />
              <span>
                Shared space <strong>{name}</strong>
                {writable ? ' · everyone who has access sees these files' : ' · read only'}
              </span>
              <span className="files-context__fill" />
              <Button size="sm" variant="ghost" icon={Settings2} onClick={() => navigate(`/spaces/${enc(name)}`)}>
                Who has access
              </Button>
            </>
          }
        />
      </DriveLayout>
    </FilesClientProvider>
  );
}
