import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FolderLock, Search, User as UserIcon } from 'lucide-react';
import { Badge, DataTable, EmptyState, Input } from '@/components/ui';
import { Page, PageHeader } from '@/app/PageHeader';
import { api } from '@/api/client';
import type { User } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { formatBytes } from '@/lib/format';
import { errMessage, FsBrowser } from './FsBrowser';
import './userfiles.css';

// Read-only browser over a user's files for administrators holding the
// view_user_files permission (GET /users/{username}/fs/dirs|files).

const fsBase = (username: string) => `/users/${encodeURIComponent(username)}/fs`;
const browseRoute = (username: string, dir: string) =>
  `/user-files/${encodeURIComponent(username)}${dir === '/' ? '' : dir.split('/').map(encodeURIComponent).join('/')}`;

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
  const params = useParams();
  const dir = '/' + (params['*'] ?? '').split('/').filter(Boolean).join('/');
  return (
    <Page>
      <PageHeader
        title={<span className="mono">{username}</span>}
        docTitle={`Files of ${username}`}
        subtitle="Read-only. Opening a file counts as a download for this user."
        crumbs={[{ label: 'User files', to: '/user-files' }]}
      />
      <FsBrowser base={fsBase(username)} cacheKey={['user-files', username]} dir={dir} route={(d) => browseRoute(username, d)} />
    </Page>
  );
}
