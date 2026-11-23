import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, MoreHorizontal, Plus, Search, Upload, UserRound } from 'lucide-react';
import type { User } from '@/api/types';
import { Page, PageHeader } from '@/app/PageHeader';
import { usePageCommands } from './usePageCommands';
import { Button, EmptyState, FilterChips, IconButton, Input, Menu, Skeleton, useToast, type MenuItem } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useCommon, useLang, useT } from '@/lib/i18n';
import { downloadJson, useLiveConnections, useUsers } from './api';
import { dict } from './i18n';
import { ImportUsersModal } from './ImportUsersModal';
import { rowStatus, StatusLine, storageLine, UserAvatar } from './listParts';
import { connectionsByUser } from './model';
import { UserSummaryPanel } from './UserSummaryPanel';
import './users.css';

type FilterId = 'all' | 'online' | 'disabled';

const PAGE_SIZE = 100;
const PANEL_ID = 'users-summary';

/** Strips server-managed fields before exporting. */
function forExport(u: User): User {
  const c: User = { ...u };
  delete c.id;
  delete c.has_password;
  return c;
}

export default function UsersPage() {
  const t = useT(dict);
  const c = useCommon();
  const { lang } = useLang();
  const { can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const users = useUsers();
  const conns = useLiveConnections();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterId>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [importOpen, setImportOpen] = useState(false);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const canAdd = can('add_users');
  const online = useMemo(() => connectionsByUser(conns.data), [conns.data]);
  const all = useMemo(() => users.data ?? [], [users.data]);

  const onlineCount = useMemo(() => all.filter((u) => online.has(u.username ?? '')).length, [all, online]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = all;
    if (filter === 'online') list = list.filter((u) => online.has(u.username ?? ''));
    if (filter === 'disabled') list = list.filter((u) => u.status === 0);
    if (q) {
      list = list.filter((u) =>
        [u.username, u.description, u.email, ...(u.filters?.additional_emails ?? [])].some((s) => s?.toLowerCase().includes(q)),
      );
    }
    return [...list].sort((a, b) => (a.username ?? '').localeCompare(b.username ?? ''));
  }, [all, filter, search, online]);

  // selection: ?u=<username>, defaults to the first row
  const wanted = params.get('u');
  const selIndex = Math.max(
    0,
    rows.findIndex((u) => u.username === wanted),
  );
  const selected: User | undefined = rows[selIndex];
  const visible = rows.slice(0, Math.max(limit, selIndex + 1));

  const select = (u: User, opts?: { focus?: boolean; reveal?: boolean }) => {
    const name = u.username ?? '';
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set('u', name);
        return p;
      },
      { replace: true },
    );
    if (opts?.focus) rowRefs.current.get(name)?.focus();
    if (opts?.reveal) {
      // when the panel is stacked under the list (narrow screens), bring it into view
      const panel = panelRef.current;
      const list = listRef.current;
      if (panel && list && panel.getBoundingClientRect().top >= list.getBoundingClientRect().bottom - 1) {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        panel.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      }
    }
  };

  const open = (u: User) => navigate(`/users/${encodeURIComponent(u.username ?? '')}`);

  const onRowKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1;
    switch (e.key) {
      case 'ArrowDown':
        next = Math.min(index + 1, visible.length - 1);
        break;
      case 'ArrowUp':
        next = Math.max(index - 1, 0);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = visible.length - 1;
        break;
      case 'Enter':
        e.preventDefault();
        open(visible[index]);
        return;
      default:
        return;
    }
    e.preventDefault();
    if (visible[next]) select(visible[next], { focus: true });
  };

  const exportAll = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJson(`sftpgo-users-${stamp}.json`, { users: all.map(forExport) });
    toast({ title: t('exported', { n: all.length }), tone: 'ok' });
  };

  usePageCommands([
    ...(canAdd ? [{ id: 'users:new', label: t('addUser'), group: t('title'), icon: Plus, run: () => navigate('/users/new') }] : []),
    ...(canAdd ? [{ id: 'users:import', label: t('importTitle'), group: t('title'), icon: Upload, run: () => setImportOpen(true) }] : []),
    { id: 'users:export', label: t('cmdExport'), group: t('title'), icon: Download, run: exportAll },
  ]);

  const menuItems: MenuItem[] = [
    ...(canAdd ? [{ label: c('import'), icon: Upload, onSelect: () => setImportOpen(true) }] : []),
    { label: t('exportAll'), icon: Download, disabled: !all.length, onSelect: exportAll },
  ];

  const accounts = all.length === 1 ? t('accountsOne') : t('accountsMany', { n: all.length.toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB') });
  const subtitle = users.data
    ? onlineCount
      ? t('onlineSome', { accounts, n: onlineCount })
      : t('onlineNone', { accounts })
    : c('loading');

  const filtered = filter !== 'all' || search.trim() !== '';
  const resetFilters = () => {
    setFilter('all');
    setSearch('');
  };

  let body;
  if (users.isLoading) {
    body = (
      <div className="users-listcard" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="users-row users-row--skeleton">
            <Skeleton circle width={40} height={40} />
            <div className="users-row__id">
              <Skeleton width="45%" height={14} />
              <Skeleton width="70%" height={12} />
            </div>
          </div>
        ))}
      </div>
    );
  } else if (users.isError) {
    body = (
      <div className="users-listcard">
        <EmptyState
          icon={UserRound}
          title={c('error')}
          description={users.error instanceof Error ? users.error.message : undefined}
          action={<Button onClick={() => void users.refetch()}>{c('retry')}</Button>}
        />
      </div>
    );
  } else if (!rows.length) {
    body = (
      <div className="users-listcard">
        {filtered ? (
          <EmptyState icon={Search} title={t('emptyFiltered')} action={<Button onClick={resetFilters}>{t('resetFilters')}</Button>} />
        ) : (
          <EmptyState
            icon={UserRound}
            title={t('emptyTitle')}
            description={t('emptyText')}
            action={
              canAdd ? (
                <Button variant="primary" icon={Plus} onClick={() => navigate('/users/new')}>
                  {t('addUser')}
                </Button>
              ) : undefined
            }
          />
        )}
      </div>
    );
  } else {
    body = (
      <div className="users-split">
        <div className="users-listcard" ref={listRef}>
          <p className="sr-only" id="users-list-hint">
            {t('listKeysHint')}
          </p>
          <ul className="users-list" aria-label={t('title')}>
            {visible.map((u, i) => {
              const name = u.username ?? '';
              const isSel = selected?.username === name;
              const isOnline = online.has(name);
              const st = rowStatus(t, u, isOnline, lang);
              return (
                <li key={name}>
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) rowRefs.current.set(name, el);
                      else rowRefs.current.delete(name);
                    }}
                    className="users-row"
                    aria-current={isSel ? 'true' : undefined}
                    aria-controls={PANEL_ID}
                    aria-describedby={isSel ? 'users-list-hint' : undefined}
                    tabIndex={isSel ? 0 : -1}
                    onClick={() => select(u, { reveal: true })}
                    onDoubleClick={() => open(u)}
                    onKeyDown={(e) => onRowKey(e, i)}
                  >
                    <UserAvatar name={name} />
                    <span className="users-row__id">
                      <span className="users-row__name">{name}</span>
                      {u.description && <span className="users-row__desc">{u.description}</span>}
                    </span>
                    <span className="users-row__storage">{storageLine(t, u, lang)}</span>
                    <span className="users-row__status">
                      <StatusLine tone={st.tone} label={st.label} pulse={isOnline} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {rows.length > visible.length && (
            <div className="users-list__more">
              <Button variant="ghost" size="sm" onClick={() => setLimit(visible.length + PAGE_SIZE)}>
                {t('showMore', { n: Math.min(PAGE_SIZE, rows.length - visible.length) })}
              </Button>
            </div>
          )}
        </div>
        <aside className="users-split__side" ref={panelRef}>
          {selected && <UserSummaryPanel id={PANEL_ID} user={selected} conns={online.get(selected.username ?? '') ?? []} />}
        </aside>
      </div>
    );
  }

  return (
    <Page>
      <div className="users-v2">
        <PageHeader
          title={t('title')}
          crumbs={[{ label: t('crumbAccounts') }]}
          subtitle={subtitle}
          actions={
            <>
              <div className="users-v2__search">
                <Input
                  type="search"
                  prefix={<Search size={16} aria-hidden="true" />}
                  placeholder={t('searchShort')}
                  aria-label={c('search')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Menu
                aria-label={c('actions')}
                placement="bottom-end"
                trigger={<IconButton icon={MoreHorizontal} label={c('more')} variant="secondary" />}
                items={menuItems}
              />
              {canAdd && (
                <Button variant="primary" icon={Plus} onClick={() => navigate('/users/new')}>
                  {t('addUser')}
                </Button>
              )}
            </>
          }
        />

        <FilterChips<FilterId>
          aria-label={t('filterLabel')}
          value={filter}
          onChange={setFilter}
          chips={[
            { id: 'all', label: t('fltAll') },
            { id: 'online', label: t('fltOnline') },
            { id: 'disabled', label: t('fltDisabled') },
          ]}
        />

        {body}
      </div>

      {canAdd && <ImportUsersModal open={importOpen} onClose={() => setImportOpen(false)} existing={all} />}
    </Page>
  );
}
