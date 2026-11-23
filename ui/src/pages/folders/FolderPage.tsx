import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, MoreHorizontal, RefreshCw, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  Input,
  KeyValue,
  Menu,
  SaveBar,
  Skeleton,
  useConfirm,
  useToast,
} from '@/components/ui';
import { Columns, Page, PageHeader } from '@/app/PageHeader';
import { useCommands } from '@/app/layout-context';
import { api, ApiError } from '@/api/client';
import type { BaseVirtualFolder, FolderQuotaScan } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { formatBytes, formatDate, formatNumber, formatRelative } from '@/lib/format';
import { useCommon, useLang, useT } from '@/lib/i18n';
import { useGroupsByFolder } from './api';
import { dict, type FoldersKey } from './i18n';
import { countFolderChanges, emptyFolderDraft, folderFromDraft, providerIcon, toFolderDraft, type FolderDraft } from './model';
import { StorageEditor } from './StorageEditor';
import './folders.css';

const enc = encodeURIComponent;

export default function FolderPage() {
  const { name = 'new' } = useParams();
  const isNew = name === 'new';
  const t = useT(dict);
  const tc = useCommon();
  const { lang } = useLang();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const { can } = useAuth();
  const allowed = can('manage_folders');

  const query = useQuery({
    queryKey: ['folders', name],
    queryFn: ({ signal }) => api.get<BaseVirtualFolder>(`/folders/${enc(name)}`, undefined, signal),
    enabled: allowed && !isNew,
  });
  const groups = useGroupsByFolder(allowed && !isNew && can('manage_groups'));
  const scans = useQuery({
    queryKey: ['folders', 'scans'],
    queryFn: ({ signal }) => api.get<FolderQuotaScan[]>('/quotas/folders/scans', undefined, signal),
    enabled: allowed && !isNew && can('quota_scans'),
    refetchInterval: (q) => ((q.state.data ?? []).some((s) => s.name === name) ? 1500 : false),
  });
  const scanning = (scans.data ?? []).some((s) => s.name === name);

  // Refresh the usage once a scan of this folder ends.
  const [wasScanning, setWasScanning] = useState(false);
  useEffect(() => {
    if (scanning) setWasScanning(true);
    else if (wasScanning) {
      setWasScanning(false);
      qc.invalidateQueries({ queryKey: ['folders'] });
    }
  }, [scanning, wasScanning, qc]);

  const [initial, setInitial] = useState<FolderDraft>(emptyFolderDraft);
  const [draft, setDraft] = useState<FolderDraft>(emptyFolderDraft);
  const [errors, setErrors] = useState<{ name?: string; path?: string }>({});
  const loadedKey = query.data ? JSON.stringify(query.data) : '';
  useEffect(() => {
    if (isNew) {
      const d = emptyFolderDraft();
      setInitial(d);
      setDraft(d);
    } else if (query.data) {
      const d = toFolderDraft(query.data);
      setInitial(d);
      setDraft(d);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, loadedKey]);

  const changes = useMemo(() => (isNew ? 0 : countFolderChanges(initial, draft)), [initial, draft, isNew]);

  const save = useMutation({
    mutationFn: () => {
      const body = folderFromDraft(draft);
      return isNew ? api.post('/folders', body) : api.put(`/folders/${enc(name)}`, body);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['folders'] });
      toast({ title: isNew ? t('created') : tc('saved'), tone: 'ok' });
      if (isNew) navigate(`/folders/${enc(draft.name.trim())}`, { replace: true });
      else setInitial(draft);
    },
    onError: (e: Error) => toast({ title: tc('error'), description: e.message, tone: 'bad' }),
  });

  const scan = useMutation({
    mutationFn: () => api.post(`/quotas/folders/${enc(name)}/scan`),
    onSuccess: () => {
      toast({ title: t('scanStarted'), tone: 'ok' });
      qc.invalidateQueries({ queryKey: ['folders', 'scans'] });
      // Small folders are scanned before the next poll: refresh the usage shortly after.
      window.setTimeout(() => qc.invalidateQueries({ queryKey: ['folders'] }), 1500);
    },
    onError: (e: Error) => toast({ title: tc('error'), description: e.message, tone: 'bad' }),
  });

  const remove = useMutation({
    mutationFn: () => api.del(`/folders/${enc(name)}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['folders'] });
      toast({ title: tc('deleted'), tone: 'ok' });
      navigate('/folders');
    },
    onError: (e: Error) => toast({ title: tc('error'), description: e.message, tone: 'bad' }),
  });

  const onSave = () => {
    const e: typeof errors = {};
    if (!draft.name.trim()) e.name = t('nameRequired');
    if ((draft.filesystem.provider === 0 || draft.filesystem.provider === 4) && !draft.mapped_path.trim()) e.path = t('mappedPathRequired');
    setErrors(e);
    if (Object.keys(e).length === 0) save.mutate();
  };
  const onDelete = async () => {
    if (await confirm({ title: tc('confirmDelete', { name }), message: t('deleteFolderMsg'), confirmLabel: tc('delete'), danger: true }))
      remove.mutate();
  };

  useCommands(
    allowed && !isNew
      ? [
          { id: 'folder:scan', label: `${t('scanQuota')} · ${name}`, group: t('title'), icon: RefreshCw, run: () => scan.mutate() },
          { id: 'folder:delete', label: `${t('deleteFolder')} · ${name}`, group: t('title'), icon: Trash2, run: onDelete },
        ]
      : [],
  );

  const crumbs = [{ label: t('accounts') }, { label: t('title'), to: '/folders' }];

  if (!allowed) {
    return (
      <Page>
        <PageHeader title={t('title')} crumbs={crumbs} />
        <EmptyState icon={FolderOpen} title={tc('forbidden')} description={t('forbidden')} />
      </Page>
    );
  }
  if (!isNew && query.error) {
    const nf = query.error instanceof ApiError && query.error.status === 404;
    return (
      <Page>
        <PageHeader title={name} crumbs={crumbs} />
        <EmptyState
          icon={FolderOpen}
          title={nf ? tc('notFound') : t('loadError')}
          description={nf ? t('notFound', { name }) : (query.error as Error).message}
          action={<Button onClick={() => navigate('/folders')}>{tc('back')}</Button>}
        />
      </Page>
    );
  }

  const f = query.data;
  const Icon = providerIcon(draft.filesystem.provider);
  const users = f?.users ?? [];
  const grps = groups.data?.get(name) ?? [];

  const main = (
    <>
      <Card title={t('general')}>
        <div className="fld-grid">
          <Input
            label={tc('name')}
            required
            mono
            disabled={!isNew}
            autoFocus={isNew}
            placeholder={t('namePh')}
            hint={isNew ? t('nameHint') : undefined}
            error={errors.name}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <Input
            label={tc('description')}
            placeholder={t('descriptionPh')}
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          />
        </div>
      </Card>
      <Card title={t('storage')}>
        <StorageEditor
          fs={draft.filesystem}
          onChange={(fs) => setDraft({ ...draft, filesystem: fs })}
          mappedPath={draft.mapped_path}
          onMappedPathChange={(v) => setDraft({ ...draft, mapped_path: v })}
          mappedPathError={errors.path}
        />
      </Card>
    </>
  );

  const side = isNew ? null : (
    <>
      <Card
        title={t('quota')}
        actions={
          can('quota_scans') ? (
            <Button size="sm" icon={RefreshCw} loading={scan.isPending || scanning} onClick={() => scan.mutate()}>
              {scanning ? t('scanning') : t('scanQuota')}
            </Button>
          ) : undefined
        }
      >
        <KeyValue
          labelWidth={150}
          items={[
            { label: t('usedSize'), value: formatBytes(f?.used_quota_size ?? 0, lang), mono: true },
            { label: t('usedFiles'), value: formatNumber(f?.used_quota_files ?? 0, lang), mono: true },
            {
              label: t('lastScan'),
              value: f?.last_quota_update ? `${formatDate(f.last_quota_update, lang)} · ${formatRelative(f.last_quota_update, lang)}` : tc('never'),
            },
          ]}
        />
        <p className="fld-hint fld-hint--spaced">{t('quotaHint')}</p>
      </Card>
      <Card title={t('usedByTitle')}>
        <div className="fld-usedby">
          <span className="fld-label">{t('users')}</span>
          {users.length ? (
            <div className="fld-chips">
              {users.map((u) => (
                <Link key={u} to={`/users/${enc(u)}`} className="fld-chiplink">
                  <Badge mono>{u}</Badge>
                </Link>
              ))}
            </div>
          ) : (
            <span className="fld-muted">{t('noUsers')}</span>
          )}
          {can('manage_groups') && (
            <>
              <span className="fld-label">{t('groups')}</span>
              {grps.length ? (
                <div className="fld-chips">
                  {grps.map((g) => (
                    <Link key={g} to={`/groups/${enc(g)}`} className="fld-chiplink">
                      <Badge tone="accent" mono>
                        {g}
                      </Badge>
                    </Link>
                  ))}
                </div>
              ) : (
                <span className="fld-muted">{t('noGroups')}</span>
              )}
            </>
          )}
        </div>
      </Card>
    </>
  );

  return (
    <Page>
      <PageHeader
        title={isNew ? t('newFolder') : name}
        crumbs={crumbs}
        leading={
          <span className="fld-icon" aria-hidden="true">
            <Icon size={20} />
          </span>
        }
        subtitle={
          isNew ? undefined : (
            <>
              {t(`p${draft.filesystem.provider}` as FoldersKey)}
              {f ? ` · ${formatBytes(f.used_quota_size ?? 0, lang)}` : ''}
              {draft.description ? ` · ${draft.description}` : ''}
            </>
          )
        }
        actions={
          !isNew ? (
            <Menu
              aria-label={tc('more')}
              placement="bottom-end"
              items={[
                ...(can('quota_scans') ? [{ label: t('scanQuota'), icon: RefreshCw, onSelect: () => scan.mutate() }, 'separator' as const] : []),
                { label: t('deleteFolder'), icon: Trash2, danger: true, onSelect: onDelete },
              ]}
              trigger={<IconButton icon={MoreHorizontal} label={tc('more')} variant="secondary" />}
            />
          ) : undefined
        }
      />
      {!isNew && query.isLoading ? (
        <Skeleton height={420} />
      ) : side ? (
        <Columns main={main} side={side} />
      ) : (
        <div className="fld-body">{main}</div>
      )}
      <SaveBar
        dirtyCount={isNew ? (draft.name.trim() ? 1 : 0) : changes}
        message={isNew ? t('unsavedNew') : t('unsaved', { n: changes })}
        cancelLabel={tc('cancel')}
        saveLabel={isNew ? tc('create') : tc('save')}
        onCancel={() => (isNew ? navigate('/folders') : setDraft(initial))}
        onSave={onSave}
        saving={save.isPending}
      />
    </Page>
  );
}
