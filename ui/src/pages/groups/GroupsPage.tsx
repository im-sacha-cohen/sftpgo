import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, Download, ExternalLink, MoreHorizontal, Plus, Search, ShieldAlert, Trash2, UsersRound, X } from 'lucide-react';
import type { Group } from '@/api/types';
import { Page, PageHeader } from '@/app/PageHeader';
import { usePageCommands } from '@/pages/users/usePageCommands';
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  IconButton,
  Input,
  Menu,
  useConfirm,
  useToast,
  type Column,
  type MenuItem,
  type SortState,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatBytes, formatRelative } from '@/lib/format';
import { useCommon, useLang, useT } from '@/lib/i18n';
import { downloadJson, groupApi, useGroups } from '@/pages/users/api';
import { PROVIDER_KEY } from '@/pages/users/model';
import { dict as usersDict, type UsersKey } from '@/pages/users/i18n';
import '@/pages/users/users.css';
import { dict } from './i18n';

function SettingsSummary({ g }: { g: Group }) {
  const t = useT(dict);
  const tu = useT(usersDict);
  const { lang } = useLang();
  const s = g.user_settings ?? {};
  const bits: string[] = [];
  const perms = Object.keys(s.permissions ?? {}).length;
  if (perms) bits.push(t('sPerms', { n: perms }));
  if (s.filesystem?.provider) bits.push(tu(`be_${PROVIDER_KEY[s.filesystem.provider]}` as UsersKey));
  if (s.quota_size) bits.push(t('sQuota', { q: formatBytes(s.quota_size, lang) }));
  if (s.filters?.denied_protocols?.length) bits.push(`−${s.filters.denied_protocols.join(', −')}`);
  if (s.filters?.allowed_ip?.length) bits.push(`${s.filters.allowed_ip.length} IP`);
  if (!bits.length) return <span className="muted users-small">{t('sNone')}</span>;
  return (
    <div className="users-pills">
      {bits.map((b) => (
        <span key={b} className="users-pill">
          {b}
        </span>
      ))}
    </div>
  );
}

export default function GroupsPage() {
  const t = useT(dict);
  const c = useCommon();
  const { lang } = useLang();
  const { can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const groups = useGroups();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ id: 'name', dir: 'asc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const allowed = can('manage_groups');

  const all = useMemo(() => groups.data ?? [], [groups.data]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q ? all.filter((g) => [g.name, g.description].some((s) => s?.toLowerCase().includes(q))) : all;
    if (sort) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      const key = (g: Group): string | number =>
        sort.id === 'members' ? g.users?.length ?? 0 : sort.id === 'updated' ? g.updated_at ?? 0 : sort.id === 'folders' ? g.virtual_folders?.length ?? 0 : g.name ?? '';
      list = [...list].sort((a, b) => {
        const ka = key(a);
        const kb = key(b);
        return (typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka).localeCompare(String(kb))) * dir;
      });
    }
    return list;
  }, [all, search, sort]);

  const members = useMemo(() => new Set(all.flatMap((g) => g.users ?? [])).size, [all]);
  const selectedGroups = all.filter((g) => selected.has(g.name ?? ''));

  const exportGroups = (list: Group[]) => {
    downloadJson(`sftpgo-groups-${new Date().toISOString().slice(0, 10)}.json`, {
      groups: list.map((g) => {
        const x = { ...g };
        delete x.id;
        return x;
      }),
    });
    toast({ title: t('exported', { n: list.length }), tone: 'ok' });
  };

  const remove = async (list: Group[]) => {
    const ok = await confirm({
      title: list.length === 1 ? c('confirmDelete', { name: list[0].name ?? '' }) : t('confirmBulkDelete', { n: list.length }),
      message: t('confirmDeleteMsg'),
      confirmLabel: c('delete'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    const results = await Promise.allSettled(list.map((g) => groupApi.remove(g.name!)));
    setBusy(false);
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    const done = results.length - failed.length;
    if (done) toast({ title: t('bulkDeleted', { n: done }), tone: 'ok' });
    if (failed.length) toast({ title: t('bulkFailed', { n: failed.length, msg: String(failed[0].reason?.message ?? '') }), tone: 'bad' });
    setSelected(new Set());
    await qc.invalidateQueries({ queryKey: ['groups'] });
  };

  usePageCommands(
    allowed
      ? [
          { id: 'groups:new', label: t('cmdNew'), group: t('title'), icon: Plus, run: () => navigate('/groups/new') },
          { id: 'groups:export', label: `${c('export')} · ${t('title')}`, group: t('title'), icon: Download, run: () => exportGroups(all) },
        ]
      : [],
  );

  const crumbs = [{ label: t('crumbAccounts') }];
  if (!allowed) {
    return (
      <Page>
        <PageHeader title={t('title')} crumbs={crumbs} />
        <EmptyState icon={ShieldAlert} title={c('forbidden')} description={t('forbidden')} />
      </Page>
    );
  }

  const columns: Column<Group>[] = [
    {
      id: 'name',
      header: t('colName'),
      sortable: true,
      minWidth: 180,
      cell: (g) => (
        <div className="users-cell-user">
          <span className="users-cell-user__name">{g.name}</span>
          {g.description && <span className="users-cell-user__desc">{g.description}</span>}
        </div>
      ),
    },
    {
      id: 'members',
      header: t('colMembers'),
      sortable: true,
      cell: (g) => (
        <div className="users-pills">
          {(g.users ?? []).slice(0, 3).map((u) => (
            <span key={u} className="users-pill">
              {u}
            </span>
          ))}
          {(g.users?.length ?? 0) > 3 && <Badge tone="neutral">+{(g.users?.length ?? 0) - 3}</Badge>}
          {!g.users?.length && <span className="muted users-small">0</span>}
        </div>
      ),
    },
    { id: 'settings', header: t('colSettings'), cell: (g) => <SettingsSummary g={g} /> },
    {
      id: 'folders',
      header: t('colFolders'),
      sortable: true,
      align: 'right',
      cell: (g) => <span className="mono users-small">{g.virtual_folders?.length ?? 0}</span>,
    },
    {
      id: 'updated',
      header: t('colUpdated'),
      sortable: true,
      cell: (g) => <span className="muted users-small">{formatRelative(g.updated_at, lang)}</span>,
    },
    {
      id: 'menu',
      header: <span className="sr-only">{c('actions')}</span>,
      width: 44,
      align: 'right',
      cell: (g) => {
        const items: MenuItem[] = [
          { label: t('open'), icon: ExternalLink, onSelect: () => navigate(`/groups/${encodeURIComponent(g.name!)}`) },
          { label: t('duplicate'), icon: Copy, onSelect: () => navigate(`/groups/new?clone=${encodeURIComponent(g.name!)}`) },
          'separator',
          { label: c('delete'), icon: Trash2, danger: true, onSelect: () => void remove([g]) },
        ];
        return (
          <Menu
            aria-label={c('actions')}
            placement="bottom-end"
            trigger={<IconButton size="sm" icon={MoreHorizontal} label={c('more')} tooltip={false} />}
            items={items}
          />
        );
      },
    },
  ];

  return (
    <Page>
      <PageHeader
        title={t('title')}
        crumbs={crumbs}
        subtitle={groups.data ? t('subtitle', { n: all.length, members }) : c('loading')}
        actions={
          <>
            <Button icon={Download} disabled={!all.length} onClick={() => exportGroups(selectedGroups.length ? selectedGroups : all)}>
              {c('export')}
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => navigate('/groups/new')}>
              {t('newGroup')}
            </Button>
          </>
        }
      />

      <div className="users-toolbar">
        <div className="users-toolbar__search">
          <Input
            size="sm"
            type="search"
            prefix={<Search size={14} aria-hidden="true" />}
            placeholder={t('searchPlaceholder')}
            aria-label={c('search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {selected.size > 0 && (
        <div className="users-bulk" role="toolbar" aria-label={t('selected', { n: selected.size })}>
          <span className="users-bulk__count">{t('selected', { n: selected.size })}</span>
          <Button size="sm" icon={Download} disabled={busy} onClick={() => exportGroups(selectedGroups)}>
            {c('export')}
          </Button>
          <Button size="sm" variant="danger" icon={Trash2} disabled={busy} onClick={() => void remove(selectedGroups)}>
            {c('delete')}
          </Button>
          <span className="users-grow" />
          <IconButton size="sm" icon={X} label={t('clearSelection')} onClick={() => setSelected(new Set())} />
        </div>
      )}

      <DataTable<Group>
        aria-label={t('title')}
        columns={columns}
        rows={rows}
        rowKey={(g) => g.name ?? ''}
        selectable
        selected={selected}
        onSelectionChange={setSelected}
        sort={sort}
        onSortChange={setSort}
        loading={groups.isLoading}
        onRowClick={(g) => navigate(`/groups/${encodeURIComponent(g.name!)}`)}
        empty={
          groups.isError ? (
            <EmptyState
              icon={UsersRound}
              title={c('error')}
              description={(groups.error as Error).message}
              action={<Button onClick={() => void groups.refetch()}>{c('retry')}</Button>}
            />
          ) : search.trim() ? (
            <EmptyState icon={Search} title={t('emptyFiltered')} />
          ) : (
            <EmptyState
              icon={UsersRound}
              title={t('emptyTitle')}
              description={t('emptyText')}
              action={
                <Button variant="primary" icon={Plus} onClick={() => navigate('/groups/new')}>
                  {t('newGroup')}
                </Button>
              }
            />
          )
        }
      />
    </Page>
  );
}
