import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Copy, MoreHorizontal, ShieldAlert, Trash2, UsersRound } from 'lucide-react';
import { ApiError } from '@/api/client';
import type { Group, GroupUserSettings, User } from '@/api/types';
import { Columns, Page, PageHeader } from '@/app/PageHeader';
import { usePageCommands } from '@/pages/users/usePageCommands';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  IconButton,
  Input,
  KeyValue,
  Menu,
  NumberInput,
  SaveBar,
  SegmentedControl,
  Skeleton,
  Tabs,
  useConfirm,
  useToast,
  type Column,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatBytes, formatDate, formatRelative } from '@/lib/format';
import { useCommon, useLang, useT } from '@/lib/i18n';
import { groupApi, useFolders, useGroup, useLiveConnections, useUsers } from '@/pages/users/api';
import { NetworkCard, PatternsCard, ProtocolsCard } from '@/pages/users/editors/FiltersSection';
import { LimitsEditor } from '@/pages/users/editors/LimitsEditor';
import { PermissionMatrix } from '@/pages/users/editors/PermissionMatrix';
import { StorageEditor } from '@/pages/users/editors/StorageEditor';
import { VirtualFoldersEditor } from '@/pages/users/editors/VirtualFoldersEditor';
import { dict as usersDict, type UsersKey } from '@/pages/users/i18n';
import { allowedProtocols, clone, connectionsByUser, countChanges, PROTOCOL_LABEL, PROVIDER_KEY, storageLocation } from '@/pages/users/model';
import { UserStatus } from '@/pages/users/parts';
import { useUnsavedGuard } from '@/pages/users/useUnsavedGuard';
import '@/pages/users/users.css';
import { dict } from './i18n';
import { cloneGroup, emptyGroup, GROUP_IGNORED, toGroupDraft, toGroupPayload } from './model';

type TabId = 'overview' | 'settings' | 'folders';
type Section = 'access' | 'storage' | 'limits';

const NAME_RE = /^[a-zA-Z0-9\-_.~]+$/;

interface Member {
  user: User;
  type: number;
}

export default function GroupPage() {
  const t = useT(dict);
  const tu = useT(usersDict);
  const c = useCommon();
  const { lang } = useLang();
  const { can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const params = useParams<{ name: string }>();
  const [search] = useSearchParams();
  const isNew = params.name === 'new';
  const cloneFrom = isNew ? search.get('clone') : null;
  const sourceName = isNew ? cloneFrom ?? undefined : params.name;
  const allowed = can('manage_groups');

  const source = useGroup(sourceName);
  const usersQ = useUsers();
  const foldersQ = useFolders();
  const connsQ = useLiveConnections();

  const [base, setBase] = useState<Group | null>(null);
  const [draft, setDraft] = useState<Group | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>('overview');
  const [section, setSection] = useState<Section>('access');
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  const key = `${params.name}|${cloneFrom ?? ''}`;
  const reset = useCallback(
    (g: Group, k: string) => {
      const b = isNew ? (cloneFrom ? cloneGroup(g) : g) : toGroupDraft(g);
      setBase(b);
      setDraft(clone(b));
      setLoadedKey(k);
      setNameError(null);
    },
    [isNew, cloneFrom],
  );

  useEffect(() => {
    if (loadedKey === key) return;
    if (isNew && !cloneFrom) reset(emptyGroup(), key);
    else if (source.data) reset(source.data, key);
  }, [key, loadedKey, isNew, cloneFrom, source.data, reset]);

  const ready = !!draft && !!base && loadedKey === key;
  const changes = ready ? countChanges(base, draft, GROUP_IGNORED) : 0;
  const dirty = isNew ? (ready ? Math.max(1, changes) : 0) : changes;
  const guard = useUnsavedGuard(ready && (!isNew || changes > 0) ? dirty : 0);
  const name = isNew ? draft?.name ?? '' : params.name ?? '';

  const online = useMemo(() => connectionsByUser(connsQ.data), [connsQ.data]);
  const members: Member[] = useMemo(() => {
    if (isNew) return [];
    const out: Member[] = [];
    for (const u of usersQ.data ?? []) {
      const m = u.groups?.find((g) => g.name === params.name);
      if (m) out.push({ user: u, type: m.type ?? 2 });
    }
    return out;
  }, [usersQ.data, isNew, params.name]);

  const set = useCallback((patch: Partial<Group>) => setDraft((d) => (d ? { ...d, ...patch } : d)), []);
  const setUS = useCallback(
    (patch: Partial<GroupUserSettings>) =>
      setDraft((d) => (d ? { ...d, user_settings: { ...d.user_settings, ...patch } } : d)),
    [],
  );

  const save = async () => {
    if (!draft || saving) return;
    if (isNew) {
      const err = !draft.name ? t('required') : !NAME_RE.test(draft.name) ? t('nameInvalid') : null;
      setNameError(err);
      if (err) {
        toast({ title: err, tone: 'bad' });
        return;
      }
    }
    setSaving(true);
    try {
      if (isNew) {
        const created = await groupApi.create(toGroupPayload(draft));
        await qc.invalidateQueries({ queryKey: ['groups'] });
        toast({ title: t('created'), tone: 'ok' });
        guard.allowNext();
        navigate(`/groups/${encodeURIComponent(created?.name ?? draft.name!)}`, { replace: true });
      } else {
        await groupApi.update(toGroupPayload(draft));
        await qc.invalidateQueries({ queryKey: ['groups', 'all'] });
        // members inherit these settings: refresh cached users too
        await qc.invalidateQueries({ queryKey: ['users'] });
        const fresh = await source.refetch();
        if (fresh.data) reset(fresh.data, key);
        toast({ title: c('saved'), tone: 'ok' });
      }
    } catch (err) {
      const msg = err instanceof ApiError ? (err.detail && err.detail !== err.message ? `${err.message} · ${err.detail}` : err.message) : String(err);
      if (/name/i.test(msg) && isNew) setNameError(msg);
      toast({ title: c('error'), description: msg, tone: 'bad' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: c('confirmDelete', { name }),
      message: t('confirmDeleteMsg'),
      confirmLabel: c('delete'),
      danger: true,
    });
    if (!ok) return;
    try {
      await groupApi.remove(name);
      qc.removeQueries({ queryKey: ['groups', 'one', name] });
      await qc.invalidateQueries({ queryKey: ['groups', 'all'] });
      toast({ title: c('deleted'), tone: 'ok' });
      guard.allowNext();
      navigate('/groups');
    } catch (err) {
      toast({ title: c('error'), description: (err as Error).message, tone: 'bad' });
    }
  };

  usePageCommands(
    !isNew && allowed
      ? [{ id: 'group:clone', label: t('duplicate'), group: name, icon: Copy, run: () => navigate(`/groups/new?clone=${encodeURIComponent(name)}`) }]
      : [],
  );

  const crumbs = [{ label: t('crumbAccounts') }, { label: t('title'), to: '/groups' }];

  if (!allowed) {
    return (
      <Page>
        <PageHeader title={t('title')} crumbs={crumbs} />
        <EmptyState icon={ShieldAlert} title={c('forbidden')} description={t('forbidden')} />
      </Page>
    );
  }
  if (sourceName && source.isError) {
    const notFound = source.error instanceof ApiError && source.error.status === 404;
    return (
      <Page>
        <PageHeader title={sourceName} crumbs={crumbs} />
        <EmptyState
          icon={UsersRound}
          title={notFound ? c('notFound') : c('error')}
          description={notFound ? t('notFoundText') : (source.error as Error).message}
          action={<Button onClick={() => navigate('/groups')}>{c('back')}</Button>}
        />
      </Page>
    );
  }
  if (!ready || !draft || !base) {
    return (
      <Page>
        <PageHeader title={isNew ? t('newTitle') : params.name ?? ''} crumbs={crumbs} />
        <Card>
          <Skeleton lines={6} />
        </Card>
      </Page>
    );
  }

  const us = draft.user_settings ?? {};
  const baseUs = base.user_settings ?? {};
  const typeLabel = (type: number) => (type === 1 ? tu('gtPrimary') : type === 3 ? tu('gtMembership') : tu('gtSecondary'));

  const memberColumns: Column<Member>[] = [
    {
      id: 'user',
      header: tu('colUser'),
      cell: (m) => (
        <div className="users-cell-user">
          <span className="users-cell-user__name">{m.user.username}</span>
          {m.user.description && <span className="users-cell-user__desc">{m.user.description}</span>}
        </div>
      ),
    },
    {
      id: 'type',
      header: t('memberType'),
      cell: (m) => <Badge tone={m.type === 1 ? 'accent' : 'neutral'}>{typeLabel(m.type)}</Badge>,
    },
    {
      id: 'last',
      header: tu('colLastLogin'),
      cell: (m) => <span className="muted users-small">{m.user.last_login ? formatRelative(m.user.last_login, lang) : c('never')}</span>,
    },
    { id: 'status', header: tu('colStatus'), cell: (m) => <UserStatus user={m.user} conns={online.get(m.user.username ?? '')} /> },
  ];

  const deniedProtos = us.filters?.denied_protocols ?? [];
  const inheritedItems = [
    {
      label: tu('permTitle'),
      value: Object.keys(us.permissions ?? {}).length ? (
        <span className="mono">{Object.keys(us.permissions ?? {}).join(', ')}</span>
      ) : (
        t('sNone')
      ),
    },
    {
      label: tu('storage'),
      value: us.filesystem?.provider ? (
        <span>
          {tu(`be_${PROVIDER_KEY[us.filesystem.provider]}` as UsersKey)}{' '}
          <span className="mono muted">{storageLocation(us.filesystem, us.home_dir)}</span>
        </span>
      ) : us.home_dir ? (
        <span className="mono">{us.home_dir}</span>
      ) : (
        t('sNone')
      ),
    },
    {
      label: tu('protocolsTitle'),
      value: deniedProtos.length
        ? allowedProtocols(us.filters)
            .map((p) => PROTOCOL_LABEL[p])
            .join(', ') || '—'
        : t('sNone'),
    },
    { label: tu('quotaTitle'), value: us.quota_size ? formatBytes(us.quota_size, lang) : t('sNone') },
    { label: tu('allowedIp'), value: us.filters?.allowed_ip?.length ? <span className="mono">{us.filters.allowed_ip.join(', ')}</span> : t('sNone') },
    { label: tu('vfTitle'), value: String(draft.virtual_folders?.length ?? 0) },
  ];

  return (
    <Page>
      <PageHeader
        crumbs={crumbs}
        docTitle={isNew ? t('newTitle') : name}
        leading={
          <span className="users-head-icon" aria-hidden="true">
            <UsersRound size={20} strokeWidth={1.7} />
          </span>
        }
        title={isNew ? t('newTitle') : <span className="users-head-title">{name}</span>}
        subtitle={
          isNew
            ? cloneFrom
              ? t('cloneOf', { name: cloneFrom })
              : undefined
            : [draft.description, t('membersCount', { n: members.length }), base.created_at ? t('createdOn', { date: formatDate(base.created_at, lang, false) }) : null]
                .filter(Boolean)
                .join(' · ')
        }
        actions={
          !isNew && (
            <>
              <Button icon={Copy} onClick={() => navigate(`/groups/new?clone=${encodeURIComponent(name)}`)}>
                {t('duplicate')}
              </Button>
              <Menu
                aria-label={c('more')}
                placement="bottom-end"
                trigger={<IconButton icon={MoreHorizontal} label={c('more')} variant="secondary" />}
                items={[{ label: c('delete'), icon: Trash2, danger: true, onSelect: () => void remove() }]}
              />
            </>
          )
        }
      >
        <Tabs<TabId>
          className="users-tabs-row"
          aria-label={name}
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'overview', label: t('tabOverview'), count: isNew ? undefined : members.length },
            { id: 'settings', label: t('tabSettings') },
            { id: 'folders', label: t('tabFolders'), count: draft.virtual_folders?.length || undefined },
          ]}
        />
      </PageHeader>

      {tab === 'overview' && (
        <Columns
          main={
            <>
              <Card title={t('identity')}>
                <div className="users-grid">
                  {isNew && (
                    <Input
                      label={t('nameLabel')}
                      hint={t('nameHint')}
                      required
                      mono
                      autoFocus
                      autoComplete="off"
                      value={draft.name ?? ''}
                      error={nameError}
                      onChange={(e) => {
                        set({ name: e.target.value });
                        setNameError(null);
                      }}
                    />
                  )}
                  <Input label={c('description')} value={draft.description ?? ''} onChange={(e) => set({ description: e.target.value })} />
                </div>
              </Card>
              {!isNew && (
                <Card title={t('members')} description={t('addMember')}>
                  <DataTable<Member>
                    aria-label={t('members')}
                    columns={memberColumns}
                    rows={members}
                    rowKey={(m) => m.user.username ?? ''}
                    loading={usersQ.isLoading}
                    dense
                    onRowClick={(m) => navigate(`/users/${encodeURIComponent(m.user.username!)}`)}
                    empty={<EmptyState compact icon={UsersRound} title={t('noMembers')} />}
                  />
                </Card>
              )}
            </>
          }
          side={
            <Card title={t('inherited')}>
              <KeyValue labelWidth={120} items={inheritedItems} />
            </Card>
          }
        />
      )}

      {tab === 'settings' && (
        <div className="users-stack">
          <p className="muted users-small">{t('settingsHint')}</p>
          <div>
            <SegmentedControl<Section>
              value={section}
              onChange={setSection}
              options={[
                { value: 'access', label: t('secAccess') },
                { value: 'storage', label: t('secStorage') },
                { value: 'limits', label: t('secLimits') },
              ]}
            />
          </div>
          {section === 'access' && (
            <Columns
              main={
                <>
                  <Card title={tu('permTitle')}>
                    <PermissionMatrix
                      value={us.permissions ?? {}}
                      initial={isNew ? undefined : baseUs.permissions ?? {}}
                      requireRoot={false}
                      onChange={(permissions) => setUS({ permissions })}
                    />
                  </Card>
                  <PatternsCard value={us.filters ?? {}} onChange={(filters) => setUS({ filters })} />
                </>
              }
              side={
                <>
                  <ProtocolsCard value={us.filters ?? {}} onChange={(filters) => setUS({ filters })} />
                  <NetworkCard value={us.filters ?? {}} onChange={(filters) => setUS({ filters })} />
                </>
              }
            />
          )}
          {section === 'storage' && (
            <Card title={tu('backendTitle')}>
              <StorageEditor
                context="group"
                fs={us.filesystem ?? { provider: 0 }}
                homeDir={us.home_dir}
                onChange={(filesystem) => setUS({ filesystem })}
                onHomeDirChange={(home_dir) => setUS({ home_dir })}
              />
            </Card>
          )}
          {section === 'limits' && (
            <LimitsEditor
              value={us}
              onChange={(p) => setUS(p as Partial<GroupUserSettings>)}
              validity={
                <NumberInput
                  label={t('expiresIn')}
                  min={0}
                  value={us.expires_in ? us.expires_in : null}
                  placeholder="—"
                  onChange={(v) => setUS({ expires_in: v ?? 0 })}
                />
              }
            />
          )}
        </div>
      )}

      {tab === 'folders' && (
        <Card title={tu('vfTitle')}>
          <VirtualFoldersEditor
            value={draft.virtual_folders ?? []}
            folders={foldersQ.data}
            canList={can('manage_folders')}
            onChange={(virtual_folders) => set({ virtual_folders })}
          />
        </Card>
      )}

      <SaveBar
        dirtyCount={dirty}
        message={isNew ? t('createBarMsg') : t('saveBarMsg', { n: dirty })}
        saveLabel={isNew ? c('create') : c('save')}
        cancelLabel={c('cancel')}
        saving={saving}
        onCancel={isNew ? () => navigate('/groups') : () => base && setDraft(clone(base))}
        onSave={() => void save()}
      />
    </Page>
  );
}
