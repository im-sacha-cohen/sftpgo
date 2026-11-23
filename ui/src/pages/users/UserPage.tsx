import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, MoreHorizontal, Power, PowerOff, ScanLine, ShieldOff, Trash2, UserRound } from 'lucide-react';
import { ApiError } from '@/api/client';
import type { User } from '@/api/types';
import { Page, PageHeader } from '@/app/PageHeader';
import { usePageCommands } from './usePageCommands';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Input,
  Menu,
  SaveBar,
  Skeleton,
  StatusDot,
  Tabs,
  useConfirm,
  useToast,
  type MenuItem,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { useCommon, useLang, useT } from '@/lib/i18n';
import { useFolders, useGroups, useLiveConnections, useRoles, userApi, useUser } from './api';
import { dict } from './i18n';
import { clone, cloneUser, countChanges, emptyUser, toDraft, toPayload } from './model';
import { protoLabel } from './parts';
import { AccessTab, LimitsTab, SecurityTab, StorageTab } from './user/EditTabs';
import { OverviewTab } from './user/OverviewTab';
import { useUnsavedGuard } from './useUnsavedGuard';
import './users.css';

type TabId = 'overview' | 'access' | 'storage' | 'limits' | 'security';

const NAME_RE = /^[a-zA-Z0-9\-_.~]+$/;

/** Fields the server manages: never counted as changes. */
const IGNORED = [
  'id',
  'has_password',
  'created_at',
  'updated_at',
  'last_login',
  'first_upload',
  'first_download',
  'last_password_change',
  'used_quota_size',
  'used_quota_files',
  'last_quota_update',
  'used_upload_data_transfer',
  'used_download_data_transfer',
  'filters.totp_config',
  'filters.recovery_codes',
];

export default function UserPage() {
  const t = useT(dict);
  const c = useCommon();
  const { lang } = useLang();
  const { can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const params = useParams<{ username: string }>();
  const [search] = useSearchParams();
  const isNew = params.username === 'new';
  const cloneFrom = isNew ? search.get('clone') : null;
  const sourceName = isNew ? cloneFrom ?? undefined : params.username;

  const source = useUser(sourceName);
  const groupsQ = useGroups();
  const foldersQ = useFolders();
  const rolesQ = useRoles();
  const connsQ = useLiveConnections();

  const [base, setBase] = useState<User | null>(null);
  const [draft, setDraft] = useState<User | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('overview');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});

  const key = `${params.username}|${cloneFrom ?? ''}`;
  const reset = useCallback(
    (u: User, k: string) => {
      const b = isNew ? (cloneFrom ? cloneUser(u) : u) : toDraft(u);
      setBase(b);
      setDraft(clone(b));
      setLoadedKey(k);
      setErrors({});
    },
    [isNew, cloneFrom],
  );

  // initialise the draft once per route (not on background refetches)
  useEffect(() => {
    if (loadedKey === key) return;
    if (isNew && !cloneFrom) reset(emptyUser(), key);
    else if (source.data) reset(source.data, key);
  }, [key, loadedKey, isNew, cloneFrom, source.data, reset]);

  const ready = draft && base && loadedKey === key;
  const changes = ready ? countChanges(base, draft, IGNORED) : 0;
  const dirty = isNew ? (ready ? Math.max(1, changes) : 0) : changes;
  const guard = useUnsavedGuard(ready && (!isNew || changes > 0) ? dirty : 0);

  const readOnly = isNew ? !can('add_users') : !can('edit_users');
  const username = isNew ? draft?.username ?? '' : params.username ?? '';
  const conns = useMemo(
    () => (connsQ.data ?? []).filter((x) => !isNew && x.username === params.username),
    [connsQ.data, isNew, params.username],
  );

  const set = useCallback((patch: Partial<User>) => setDraft((d) => (d ? { ...d, ...patch } : d)), []);

  const validate = (d: User) => {
    const e: Record<string, string> = {};
    if (isNew) {
      if (!d.username) e.username = t('required');
      else if (!NAME_RE.test(d.username)) e.username = t('usernameInvalid');
    }
    if (!d.permissions?.['/']) e.permissions = t('rootRequired');
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) e.email = t('emailInvalid');
    const fs = d.filesystem?.provider ?? 0;
    if ((fs === 0 || fs === 4) && d.home_dir && !d.home_dir.startsWith('/') && !/^[a-zA-Z]:[\\/]/.test(d.home_dir))
      e.home_dir = t('pathInvalid');
    return e;
  };

  /** Puts an API validation message next to the field when it obviously belongs to one. */
  const fieldFromError = (msg: string): [string, TabId] | null => {
    const m = msg.toLowerCase();
    if (/(s3|gcs|azblob|sftp|http|crypt)config|access_secret|passphrase|bucket|region|credentials|endpoint/.test(m))
      return ['filesystem', 'storage'];
    if (m.includes('home_dir') || m.includes('home dir')) return ['home_dir', 'storage'];
    if (m.includes('password')) return ['password', 'security'];
    if (m.includes('email')) return ['email', 'security'];
    if (m.includes('username')) return ['username', tab];
    if (m.includes('permission')) return ['permissions', 'access'];
    if (m.includes('public key')) return ['public_keys', 'security'];
    if (m.includes('folder') || m.includes('virtual')) return ['virtual_folders', 'storage'];
    return null;
  };

  const save = async () => {
    if (!draft || saving || readOnly) return;
    const e = validate(draft);
    setErrors(e);
    if (Object.keys(e).length) {
      if (e.username) setTab((x) => x);
      else if (e.permissions) setTab('access');
      else if (e.email) setTab('security');
      else if (e.home_dir) setTab('storage');
      toast({ title: Object.values(e)[0]!, tone: 'bad' });
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await userApi.create(toPayload(draft, true));
        await qc.invalidateQueries({ queryKey: ['users'] });
        toast({ title: t('created'), tone: 'ok' });
        guard.allowNext();
        navigate(`/users/${encodeURIComponent(created?.username ?? draft.username!)}`, { replace: true });
      } else {
        await userApi.update(toPayload(draft, false));
        await qc.invalidateQueries({ queryKey: ['users', 'all'] });
        const fresh = await source.refetch();
        if (fresh.data) reset(fresh.data, key);
        toast({ title: c('saved'), tone: 'ok' });
      }
    } catch (err) {
      const msg = err instanceof ApiError ? (err.detail && err.detail !== err.message ? `${err.message} · ${err.detail}` : err.message) : String(err);
      const hit = fieldFromError(msg);
      if (hit) {
        setErrors({ [hit[0]]: msg });
        setTab(hit[1]);
      }
      toast({ title: c('error'), description: msg, tone: 'bad' });
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    if (base) {
      setDraft(clone(base));
      setErrors({});
    }
  };

  const toggleStatus = async () => {
    if (!source.data) return;
    const next = source.data.status === 0 ? 1 : 0;
    if (next === 0) {
      const ok = await confirm({
        title: t('disableConfirm', { name: username }),
        message: t('disableMsg'),
        confirmLabel: t('disable'),
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await userApi.setStatus(source.data, next);
      setBase((b) => (b ? { ...b, status: next } : b));
      setDraft((d) => (d ? { ...d, status: next } : d));
      qc.setQueryData<User>(['users', 'one', username], (u) => (u ? { ...u, status: next } : u));
      await qc.invalidateQueries({ queryKey: ['users', 'all'] });
      toast({ title: next ? t('bulkEnabled', { n: 1 }) : t('bulkDisabled', { n: 1 }), tone: 'ok' });
    } catch (err) {
      toast({ title: c('error'), description: (err as Error).message, tone: 'bad' });
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: c('confirmDelete', { name: username }),
      message: t('confirmBulkDeleteMsg'),
      confirmLabel: c('delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await userApi.remove(username);
      qc.removeQueries({ queryKey: ['users', 'one', username] });
      await qc.invalidateQueries({ queryKey: ['users', 'all'] });
      toast({ title: c('deleted'), tone: 'ok' });
      guard.allowNext();
      navigate('/users');
    } catch (err) {
      toast({ title: c('error'), description: (err as Error).message, tone: 'bad' });
    }
  };

  const reset2fa = async () => {
    const ok = await confirm({
      title: t('reset2faConfirm', { name: username }),
      message: t('reset2faMsg'),
      confirmLabel: t('reset2fa'),
      danger: true,
    });
    if (!ok) return;
    try {
      await userApi.disable2fa(username);
      const fresh = await source.refetch();
      // keep unsaved edits, only refresh the 2FA state
      if (fresh.data) {
        const totp = fresh.data.filters?.totp_config;
        setBase((b) => (b ? { ...b, filters: { ...b.filters, totp_config: totp } } : b));
        setDraft((d) => (d ? { ...d, filters: { ...d.filters, totp_config: totp } } : d));
      }
      toast({ title: t('reset2faDone'), tone: 'ok' });
    } catch (err) {
      toast({ title: c('error'), description: (err as Error).message, tone: 'bad' });
    }
  };

  const quotaScan = async () => {
    try {
      await userApi.quotaScan(username);
      toast({ title: t('quotaScanStarted'), tone: 'ok' });
      setTimeout(() => void qc.invalidateQueries({ queryKey: ['users', 'one', username] }), 1500);
    } catch (err) {
      toast({ title: c('error'), description: (err as Error).message, tone: 'bad' });
    }
  };

  usePageCommands(
    isNew
      ? []
      : [
          ...(can('add_users')
            ? [{ id: 'user:clone', label: t('duplicate'), group: username, icon: Copy, run: () => navigate(`/users/new?clone=${encodeURIComponent(username)}`) }]
            : []),
          ...(can('quota_scans') ? [{ id: 'user:scan', label: t('quotaScan'), group: username, icon: ScanLine, run: () => void quotaScan() }] : []),
        ],
  );

  /* ---------- render ---------- */

  const crumbs = [{ label: t('crumbAccounts') }, { label: t('userCrumb'), to: '/users' }];

  if (!isNew || cloneFrom) {
    if (source.isError) {
      const notFound = source.error instanceof ApiError && source.error.status === 404;
      return (
        <Page>
          <PageHeader title={sourceName ?? ''} crumbs={crumbs} />
          <EmptyState
            icon={UserRound}
            title={notFound ? c('notFound') : c('error')}
            description={notFound ? t('userNotFound') : (source.error as Error).message}
            action={<Button onClick={() => navigate('/users')}>{c('back')}</Button>}
          />
        </Page>
      );
    }
  }

  if (!ready || !draft || !base) {
    return (
      <Page>
        <PageHeader title={isNew ? t('newTitle') : params.username ?? ''} crumbs={crumbs} />
        <Card>
          <Skeleton lines={6} />
        </Card>
      </Page>
    );
  }

  const live = conns[0];
  const primaryGroup = (draft.groups ?? []).find((g) => g.type === 1)?.name;
  const tfaEnabled = !!(base.filters?.totp_config as { enabled?: boolean } | undefined)?.enabled;

  const subtitle = isNew
    ? cloneFrom
      ? t('cloneOf', { name: cloneFrom })
      : undefined
    : [
        draft.description,
        primaryGroup ? t('groupX', { name: primaryGroup }) : null,
        base.created_at ? t('createdOn', { date: formatDate(base.created_at, lang, false) }) : null,
      ]
        .filter(Boolean)
        .join(' · ');

  const menuItems: MenuItem[] = [
    ...(can('quota_scans') ? [{ label: t('quotaScan'), icon: ScanLine, onSelect: () => void quotaScan() }] : []),
    ...(tfaEnabled && can('disable_mfa') ? [{ label: t('reset2fa'), icon: ShieldOff, onSelect: () => void reset2fa() }] : []),
  ];
  if (can('del_users')) {
    if (menuItems.length) menuItems.push('separator');
    menuItems.push({ label: c('delete'), icon: Trash2, danger: true, onSelect: () => void remove() });
  }

  const tabProps = { draft, base, isNew, set, readOnly, groups: groupsQ.data, errors };

  return (
    <Page>
      <PageHeader
        crumbs={crumbs}
        docTitle={isNew ? t('newTitle') : username}
        leading={
          <span className="users-head-icon" aria-hidden="true">
            <UserRound size={20} strokeWidth={1.7} />
          </span>
        }
        title={
          isNew ? (
            t('newTitle')
          ) : (
            <>
              <span className="users-head-title">{username}</span>
              {live ? (
                <StatusDot tone="ok" pulse label={t('stConnectedVia', { proto: protoLabel(live.protocol) })} />
              ) : base.status === 0 ? (
                <Badge tone="neutral">{t('stDisabled')}</Badge>
              ) : null}
            </>
          )
        }
        subtitle={subtitle}
        actions={
          !isNew && (
            <>
              {can('add_users') && (
                <Button icon={Copy} onClick={() => navigate(`/users/new?clone=${encodeURIComponent(username)}`)}>
                  {t('duplicate')}
                </Button>
              )}
              {can('edit_users') && (
                <Button icon={base.status === 0 ? Power : PowerOff} onClick={() => void toggleStatus()}>
                  {base.status === 0 ? t('enable') : t('disable')}
                </Button>
              )}
              {menuItems.length > 0 && (
                <Menu
                  aria-label={c('more')}
                  placement="bottom-end"
                  trigger={<IconButton icon={MoreHorizontal} label={c('more')} variant="secondary" />}
                  items={menuItems}
                />
              )}
            </>
          )
        }
      >
        <Tabs<TabId>
          className="users-tabs-row"
          aria-label={username}
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: t('tabOverview') },
            { id: 'access', label: t('tabAccess') },
            { id: 'storage', label: t('tabStorage') },
            { id: 'limits', label: t('tabLimits') },
            { id: 'security', label: t('tabSecurity') },
          ]}
        />
      </PageHeader>

      {isNew && (
        <Card>
          <div className="users-grid">
            <Input
              label={t('usernameLabel')}
              hint={t('usernameHint')}
              required
              mono
              autoFocus
              autoComplete="off"
              value={draft.username ?? ''}
              error={errors.username}
              disabled={readOnly}
              onChange={(e) => {
                set({ username: e.target.value });
                if (errors.username) setErrors((x) => ({ ...x, username: undefined }));
              }}
            />
            <Input
              label={t('description')}
              value={draft.description ?? ''}
              disabled={readOnly}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>
        </Card>
      )}

      {errors.permissions && tab === 'access' && <p className="users-error">{errors.permissions}</p>}
      {errors.virtual_folders && tab === 'storage' && <p className="users-error">{errors.virtual_folders}</p>}
      {errors.filesystem && tab === 'storage' && <p className="users-error">{errors.filesystem}</p>}
      {errors.public_keys && tab === 'security' && <p className="users-error">{errors.public_keys}</p>}

      <div role="tabpanel" aria-label={tab}>
        {tab === 'overview' && <OverviewTab user={draft} isNew={isNew} conns={conns} groups={groupsQ.data} />}
        {tab === 'access' && (
          <AccessTab
            {...tabProps}
            saved={isNew ? undefined : source.data}
            dirty={dirty > 0}
            onReload={async () => {
              const fresh = await source.refetch();
              if (fresh.data) reset(fresh.data, key);
              await qc.invalidateQueries({ queryKey: ['users', 'all'] });
            }}
          />
        )}
        {tab === 'storage' && (
          <StorageTab
            {...tabProps}
            folders={foldersQ.data}
            canListFolders={can('manage_folders')}
            canListGroups={can('manage_groups')}
          />
        )}
        {tab === 'limits' && <LimitsTab {...tabProps} />}
        {tab === 'security' && <SecurityTab {...tabProps} roles={rolesQ.data} onReset2fa={() => void reset2fa()} />}
      </div>

      {!readOnly && (
        <SaveBar
          dirtyCount={dirty}
          message={isNew ? t('createBarMsg') : t('saveBarMsg', { n: dirty })}
          saveLabel={isNew ? c('create') : c('save')}
          cancelLabel={c('cancel')}
          saving={saving}
          onCancel={isNew ? () => navigate('/users') : cancel}
          onSave={() => void save()}
        />
      )}
    </Page>
  );
}
