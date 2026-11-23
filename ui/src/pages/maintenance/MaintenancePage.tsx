import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileJson, RotateCcw, ScanSearch, Wrench, X } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  DataTable,
  EmptyState,
  FileDrop,
  IconButton,
  SegmentedControl,
  Select,
  useConfirm,
  useToast,
} from '@/components/ui';
import { Columns, Page, PageHeader } from '@/app/PageHeader';
import { ApiError, request } from '@/api/client';
import { api } from '@/api/client';
import type { FolderQuotaScan, QuotaScan, RetentionCheck } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { formatBytes, formatRelative } from '@/lib/format';
import { useCommon, useLang, useT, type Dict } from '@/lib/i18n';
import './maintenance.css';

const SCOPES = ['users', 'groups', 'folders', 'admins', 'roles', 'api_keys', 'shares', 'actions', 'rules', 'ip_lists', 'configs'] as const;
type Scope = (typeof SCOPES)[number];

const dict = {
  fr: {
    title: 'Maintenance',
    crumb: 'Système',
    subtitle: 'Sauvegarde et restauration de la configuration, tâches de fond.',
    backup: 'Sauvegarde',
    backupText: 'Exporte la configuration en JSON (comptes, règles, listes…). Les fichiers des utilisateurs ne sont pas inclus.',
    allScopes: 'Tout inclure',
    download: 'Télécharger la sauvegarde',
    downloaded: 'Sauvegarde téléchargée',
    restore: 'Restauration',
    restoreText: 'Importe une sauvegarde JSON produite par SFTPGo.',
    dropLabel: 'Déposez un fichier de sauvegarde .json ou parcourez',
    invalidFile: 'Ce fichier n’est pas une sauvegarde SFTPGo valide.',
    mode: 'Objets existants',
    mode0: 'Mettre à jour',
    mode1: 'Conserver',
    mode2: 'Mettre à jour et déconnecter',
    scan: 'Recalcul des quotas',
    scan0: 'Aucun',
    scan1: 'Pour tous',
    scan2: 'Seulement si un quota est défini',
    restoreBtn: 'Restaurer',
    restoreConfirm: 'Restaurer {file} ?',
    restoreMsg: 'La configuration actuelle sera modifiée selon le mode choisi. Pensez à télécharger une sauvegarde avant.',
    restored: 'Sauvegarde restaurée',
    scans: 'Scans de quota en cours',
    scansEmpty: 'Aucun scan en cours',
    retention: 'Vérifications de rétention en cours',
    retentionEmpty: 'Aucune vérification en cours',
    kindUser: 'Utilisateur',
    kindFolder: 'Dossier',
    started: 'Démarré',
    forbidden: 'Vous n’avez pas la permission d’accéder à la maintenance.',
    s_users: 'Utilisateurs',
    s_groups: 'Groupes',
    s_folders: 'Dossiers virtuels',
    s_admins: 'Administrateurs',
    s_roles: 'Rôles',
    s_api_keys: 'Clés d’API',
    s_shares: 'Partages',
    s_actions: 'Actions',
    s_rules: 'Règles',
    s_ip_lists: 'Listes IP',
    s_configs: 'Réglages serveur',
  },
  en: {
    title: 'Maintenance',
    crumb: 'System',
    subtitle: 'Configuration backup and restore, background tasks.',
    backup: 'Backup',
    backupText: 'Exports the configuration as JSON (accounts, rules, lists…). User files are not included.',
    allScopes: 'Include everything',
    download: 'Download backup',
    downloaded: 'Backup downloaded',
    restore: 'Restore',
    restoreText: 'Imports a JSON backup produced by SFTPGo.',
    dropLabel: 'Drop a .json backup file or browse',
    invalidFile: 'This file is not a valid SFTPGo backup.',
    mode: 'Existing objects',
    mode0: 'Update',
    mode1: 'Keep',
    mode2: 'Update and disconnect',
    scan: 'Quota recalculation',
    scan0: 'None',
    scan1: 'For all',
    scan2: 'Only when a quota is set',
    restoreBtn: 'Restore',
    restoreConfirm: 'Restore {file}?',
    restoreMsg: 'The current configuration will be changed according to the selected mode. Download a backup first.',
    restored: 'Backup restored',
    scans: 'Quota scans in progress',
    scansEmpty: 'No scan in progress',
    retention: 'Retention checks in progress',
    retentionEmpty: 'No check in progress',
    kindUser: 'User',
    kindFolder: 'Folder',
    started: 'Started',
    forbidden: 'You do not have permission to access maintenance.',
    s_users: 'Users',
    s_groups: 'Groups',
    s_folders: 'Virtual folders',
    s_admins: 'Administrators',
    s_roles: 'Roles',
    s_api_keys: 'API keys',
    s_shares: 'Shares',
    s_actions: 'Actions',
    s_rules: 'Rules',
    s_ip_lists: 'IP lists',
    s_configs: 'Server settings',
  },
} satisfies Dict;
type K = keyof typeof dict.fr;

interface ScanRow {
  key: string;
  kind: 'user' | 'folder';
  name: string;
  start: number;
}

export default function MaintenancePage() {
  const t = useT(dict);
  const c = useCommon();
  const { lang } = useLang();
  const { can } = useAuth();
  const isSuper = can('*');
  const canScans = can('quota_scans');

  const userScans = useQuery({ queryKey: ['quota-scans', 'users'], queryFn: () => api.get<QuotaScan[]>('/quotas/users/scans'), enabled: canScans, refetchInterval: 5000 });
  const folderScans = useQuery({
    queryKey: ['quota-scans', 'folders'],
    queryFn: () => api.get<FolderQuotaScan[]>('/quotas/folders/scans'),
    enabled: canScans,
    refetchInterval: 5000,
  });
  const retention = useQuery({
    queryKey: ['retention-checks'],
    queryFn: () => api.get<RetentionCheck[]>('/retention/users/checks'),
    enabled: can('retention_checks') || isSuper,
    refetchInterval: 5000,
  });

  const scans: ScanRow[] = [
    ...(userScans.data ?? []).map((s) => ({ key: `u-${s.username}`, kind: 'user' as const, name: s.username ?? '', start: s.start_time ?? 0 })),
    ...(folderScans.data ?? []).map((s) => ({ key: `f-${s.name}`, kind: 'folder' as const, name: s.name ?? '', start: s.start_time ?? 0 })),
  ];

  if (!isSuper && !canScans) {
    return (
      <Page>
        <PageHeader title={t('title')} crumbs={[{ label: t('crumb') }]} />
        <EmptyState icon={Wrench} title={t('title')} description={t('forbidden')} />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title={t('title')} crumbs={[{ label: t('crumb') }]} subtitle={t('subtitle')} />
      <Columns
        main={
          isSuper ? (
            <>
              <BackupCard />
              <RestoreCard />
            </>
          ) : null
        }
        side={
          <>
            <Card title={t('scans')} padded={false}>
              <DataTable<ScanRow>
                rows={scans}
                rowKey={(r) => r.key}
                loading={userScans.isLoading}
                empty={<EmptyState icon={ScanSearch} title={t('scansEmpty')} />}
                columns={[
                  { id: 'kind', header: '', cell: (r) => <Badge>{r.kind === 'user' ? t('kindUser') : t('kindFolder')}</Badge> },
                  { id: 'name', header: c('name'), cell: (r) => <span className="mono">{r.name}</span> },
                  { id: 'start', header: t('started'), cell: (r) => <span className="muted">{formatRelative(r.start, lang)}</span> },
                ]}
              />
            </Card>
            <Card title={t('retention')} padded={false}>
              <DataTable<RetentionCheck>
                rows={retention.data ?? []}
                rowKey={(r) => r.username ?? ''}
                loading={retention.isLoading}
                empty={<EmptyState icon={ScanSearch} title={t('retentionEmpty')} />}
                columns={[
                  { id: 'name', header: c('name'), cell: (r) => <span className="mono">{r.username}</span> },
                  { id: 'start', header: t('started'), cell: (r) => <span className="muted">{formatRelative(r.start_time, lang)}</span> },
                ]}
              />
            </Card>
          </>
        }
      />
    </Page>
  );
}

function BackupCard() {
  const t = useT(dict);
  const c = useCommon();
  const toast = useToast();
  const [scopes, setScopes] = useState<Set<Scope>>(new Set(SCOPES));
  const [busy, setBusy] = useState(false);
  const all = scopes.size === SCOPES.length;

  const download = async () => {
    setBusy(true);
    try {
      const res = await request<Response>('/dumpdata', {
        query: { 'output-data': 1, indent: 1, scopes: all ? undefined : [...scopes].join(',') },
        raw: true,
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sftpgo-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: t('downloaded'), tone: 'ok' });
    } catch (err) {
      toast({ title: c('error'), description: err instanceof ApiError ? err.message : String(err), tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('backup')}>
      <div className="mnt-stack">
        <p className="muted">{t('backupText')}</p>
        <Checkbox checked={all} indeterminate={!all && scopes.size > 0} onChange={(v) => setScopes(new Set(v ? SCOPES : []))} label={t('allScopes')} />
        <div className="mnt-scopes">
          {SCOPES.map((s) => (
            <Checkbox
              key={s}
              checked={scopes.has(s)}
              onChange={(v) =>
                setScopes((cur) => {
                  const n = new Set(cur);
                  if (v) n.add(s);
                  else n.delete(s);
                  return n;
                })
              }
              label={t(`s_${s}` as K)}
            />
          ))}
        </div>
        <div>
          <Button variant="primary" icon={Download} loading={busy} disabled={scopes.size === 0} onClick={() => void download()}>
            {t('download')}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function RestoreCard() {
  const t = useT(dict);
  const c = useCommon();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [file, setFile] = useState<{ name: string; size: number; text: string; data: Record<string, unknown> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState('0');
  const [scan, setScan] = useState('0');
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    if (!file) return [];
    return SCOPES.map((s) => ({ s, n: Array.isArray(file.data[s]) ? (file.data[s] as unknown[]).length : 0 })).filter((x) => x.n > 0);
  }, [file]);

  const onFiles = async (files: File[]) => {
    setError(null);
    const f = files[0];
    if (!f) return;
    try {
      const text = await f.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid');
      setFile({ name: f.name, size: f.size, text, data });
    } catch {
      setFile(null);
      setError(t('invalidFile'));
    }
  };

  const restore = async () => {
    if (!file) return;
    if (!(await confirm({ title: t('restoreConfirm', { file: file.name }), message: t('restoreMsg'), confirmLabel: t('restoreBtn'), danger: true }))) return;
    setBusy(true);
    try {
      await request('/loaddata', {
        method: 'POST',
        query: { mode, 'scan-quota': scan },
        rawBody: file.text,
        headers: { 'Content-Type': 'application/json' },
      });
      toast({ title: t('restored'), tone: 'ok' });
      setFile(null);
      await qc.invalidateQueries();
    } catch (err) {
      toast({ title: c('error'), description: err instanceof ApiError ? err.message : String(err), tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  const { lang } = useLang();
  return (
    <Card title={t('restore')}>
      <div className="mnt-stack">
        <p className="muted">{t('restoreText')}</p>
        {!file ? (
          <FileDrop onFiles={(f) => void onFiles(f)} label={t('dropLabel')} />
        ) : (
          <div className="mnt-file">
            <FileJson size={18} aria-hidden="true" />
            <div className="mnt-file__info">
              <span className="mono">{file.name}</span>
              <span className="muted">
                {formatBytes(file.size, lang)} · {counts.map((x) => `${x.n} ${t(`s_${x.s}` as K).toLowerCase()}`).join(' · ')}
              </span>
            </div>
            <IconButton icon={X} label={c('remove')} variant="ghost" onClick={() => setFile(null)} />
          </div>
        )}
        {error && (
          <p className="mnt-error" role="alert">
            {error}
          </p>
        )}
        <div className="mnt-options">
          <div className="mnt-field">
            <span className="mnt-label">{t('mode')}</span>
            <SegmentedControl
              options={[
                { value: '0', label: t('mode0') },
                { value: '1', label: t('mode1') },
                { value: '2', label: t('mode2') },
              ]}
              value={mode}
              onChange={setMode}
            />
          </div>
          <Select
            label={t('scan')}
            value={scan}
            onChange={setScan}
            options={[
              { value: '0', label: t('scan0') },
              { value: '1', label: t('scan1') },
              { value: '2', label: t('scan2') },
            ]}
          />
        </div>
        <div>
          <Button variant="danger" icon={RotateCcw} loading={busy} disabled={!file} onClick={() => void restore()}>
            {t('restoreBtn')}
          </Button>
        </div>
      </div>
    </Card>
  );
}
