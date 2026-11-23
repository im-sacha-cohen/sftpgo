import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  Activity,
  Ban,
  Cloud,
  Copy,
  Database,
  Download,
  Ellipsis,
  FolderTree,
  Globe,
  HardDrive,
  KeyRound,
  LogOut,
  Moon,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  Sun,
  Terminal,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  CommandPalette,
  ConfirmProvider,
  DataTable,
  DatePicker,
  Drawer,
  EmptyState,
  FileDrop,
  FilterChips,
  IconButton,
  Input,
  KeyValue,
  Kbd,
  Menu,
  Modal,
  MultiSelect,
  NumberInput,
  Pagination,
  PasswordInput,
  ProgressBar,
  RadioCards,
  SaveBar,
  SegmentedControl,
  Select,
  Skeleton,
  Spinner,
  StatusDot,
  Switch,
  TabPanel,
  Tabs,
  TagInput,
  Textarea,
  ToastProvider,
  Tooltip,
  useConfirm,
  useHotkey,
  useToast,
} from '@/components/ui';
import type { Column, Command, SelectOption, SortState } from '@/components/ui';
import './ComponentsDemo.css';

/* ------------------------------------------------------------------ */
/* Demo data                                                           */
/* ------------------------------------------------------------------ */

type Backend = 'local' | 's3' | 'gcs' | 'azure' | 'sftp';
type Status = 'active' | 'disabled' | 'expired';

interface DemoUser {
  username: string;
  status: Status;
  backend: Backend;
  usedMb: number;
  quotaMb: number;
  lastLogin: string | null;
  perms: string[];
}

const BACKEND_LABEL: Record<Backend, string> = {
  local: 'Disque local',
  s3: 'Amazon S3',
  gcs: 'Google Cloud Storage',
  azure: 'Azure Blob',
  sftp: 'SFTP distant',
};

const BACKEND_OPTIONS: SelectOption<Backend>[] = [
  { value: 'local', label: 'Disque local', description: '/srv/sftpgo/data', icon: HardDrive },
  { value: 's3', label: 'Amazon S3', description: 'Compatible MinIO, Wasabi, R2…', icon: Cloud },
  { value: 'gcs', label: 'Google Cloud Storage', icon: Cloud },
  { value: 'azure', label: 'Azure Blob', icon: Database },
  { value: 'sftp', label: 'SFTP distant', icon: Server },
  { value: 'http' as Backend, label: 'HTTP (bêta)', icon: Globe, disabled: true },
];

const PERMISSIONS: SelectOption[] = [
  { value: '*', label: 'Toutes les permissions' },
  { value: 'list', label: 'Lister' },
  { value: 'download', label: 'Télécharger' },
  { value: 'upload', label: 'Envoyer' },
  { value: 'overwrite', label: 'Écraser' },
  { value: 'delete', label: 'Supprimer' },
  { value: 'rename', label: 'Renommer' },
  { value: 'create_dirs', label: 'Créer des dossiers' },
  { value: 'create_symlinks', label: 'Créer des liens symboliques' },
  { value: 'chmod', label: 'Modifier les permissions (chmod)' },
  { value: 'chown', label: 'Modifier le propriétaire (chown)' },
  { value: 'chtimes', label: 'Modifier les dates' },
];

const GROUPS: SelectOption[] = [
  'partenaires',
  'comptabilite',
  'rh-paie',
  'ops-backup',
  'clients-eu',
  'clients-us',
  'audit-externe',
  'marketing',
  'logistique',
  'legal',
  'support-n2',
  'data-lake',
].map((g) => ({ value: g, label: g }));

const USERS: DemoUser[] = [
  { username: 'partenaire-acme', status: 'active', backend: 's3', usedMb: 9420, quotaMb: 10240, lastLogin: '2026-11-23T08:12:00', perms: ['list', 'download', 'upload'] },
  { username: 'compta-sage', status: 'active', backend: 'local', usedMb: 2100, quotaMb: 5120, lastLogin: '2026-11-22T17:40:00', perms: ['*'] },
  { username: 'backup-nas01', status: 'active', backend: 'azure', usedMb: 48200, quotaMb: 51200, lastLogin: '2026-11-23T03:00:00', perms: ['list', 'upload', 'overwrite'] },
  { username: 'edi-carrefour', status: 'disabled', backend: 'sftp', usedMb: 120, quotaMb: 2048, lastLogin: '2026-09-02T11:05:00', perms: ['list', 'download'] },
  { username: 'audit-kpmg', status: 'expired', backend: 'gcs', usedMb: 0, quotaMb: 1024, lastLogin: null, perms: ['list', 'download'] },
  { username: 'rh-paie', status: 'active', backend: 'local', usedMb: 640, quotaMb: 4096, lastLogin: '2026-11-21T09:30:00', perms: ['list', 'download', 'upload', 'delete'] },
  { username: 'logistique-geodis', status: 'active', backend: 's3', usedMb: 8350, quotaMb: 10240, lastLogin: '2026-11-23T07:55:00', perms: ['list', 'upload'] },
  { username: 'marketing-dam', status: 'active', backend: 'gcs', usedMb: 15300, quotaMb: 20480, lastLogin: '2026-11-20T15:12:00', perms: ['*'] },
];

const STATUS_TONE: Record<Status, 'ok' | 'neutral' | 'warn'> = { active: 'ok', disabled: 'neutral', expired: 'warn' };
const STATUS_LABEL: Record<Status, string> = { active: 'Actif', disabled: 'Désactivé', expired: 'Expiré' };

const IPV4_CIDR = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}(\/(3[0-2]|[12]?\d))?$/;
const IPV6_CIDR = /^[0-9a-f]{0,4}(:[0-9a-f]{0,4}){2,7}(\/(12[0-8]|1[01]\d|\d?\d))?$/i;
const validateIp = (v: string) => (IPV4_CIDR.test(v) || IPV6_CIDR.test(v) ? null : `« ${v} » n'est pas une adresse IP ou un CIDR valide`);
const validateExt = (v: string) => (/^\.[a-z0-9]{1,10}$/.test(v) ? null : 'Format attendu : .ext (ex. .csv)');
const validateEmail = (v: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : `« ${v} » n'est pas un e-mail valide`);

const fmtSize = (mb: number) =>
  mb >= 1024 ? `${(mb / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go` : `${mb.toLocaleString('fr-FR')} Mo`;
const fmtDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : '—';

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function ComponentsDemo() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <Demo />
      </ConfirmProvider>
    </ToastProvider>
  );
}

function Section({ id, title, description, children, actions }: { id: string; title: string; description?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <Card id={id} title={title} description={description} actions={actions}>
      {children}
    </Card>
  );
}

function Demo() {
  const { toast } = useToast();
  const confirm = useConfirm();

  /* Theme */
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  );
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  /* Command palette */
  const [paletteOpen, setPaletteOpen] = useState(false);
  useHotkey('mod+k', () => setPaletteOpen((o) => !o), { allowInInputs: true });

  /* Form state (also drives the SaveBar) */
  const initial = useMemo(
    () => ({
      username: 'partenaire-acme',
      email: 'sftp@acme.fr',
      homeDir: '/srv/sftpgo/data/partenaire-acme',
      description: 'Échanges EDI quotidiens avec ACME (factures, bons de livraison).',
      quota: 10240 as number | null,
      port: 2022 as number | null,
      maxSessions: 5 as number | null,
    }),
    [],
  );
  const [form, setForm] = useState(initial);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const dirtyCount = (Object.keys(initial) as Array<keyof typeof initial>).filter((k) => form[k] !== initial[k]).length + (password ? 1 : 0);
  const usernameError = /^[a-z0-9._-]+$/.test(form.username) ? undefined : 'Lettres minuscules, chiffres, « . », « _ » et « - » uniquement';

  /* Choices */
  const [mfa, setMfa] = useState(true);
  const [allowList, setAllowList] = useState(false);
  const [notify, setNotify] = useState(true);
  const [readOnly, setReadOnly] = useState(false);
  const [perms, setPerms] = useState<Record<string, boolean>>({ list: true, download: true, upload: false });
  const permKeys = ['list', 'download', 'upload'];
  const checkedCount = permKeys.filter((k) => perms[k]).length;
  const [protocol, setProtocol] = useState<'all' | 'sftp' | 'ftp' | 'webdav' | 'http'>('all');
  const [backend, setBackend] = useState<Backend | null>('s3');
  const [storage, setStorage] = useState<Backend | null>('s3');
  const [group, setGroup] = useState<string | null>(null);
  const [region, setRegion] = useState<string | null>('eu-west-3');
  const [selectedPerms, setSelectedPerms] = useState<string[]>(['list', 'download', 'upload']);
  const [groups, setGroups] = useState<string[]>(['partenaires', 'clients-eu']);
  const [ips, setIps] = useState<string[]>(['192.168.1.0/24', '10.8.0.12']);
  const [exts, setExts] = useState<string[]>(['.csv', '.xml', '.pdf']);
  const [emails, setEmails] = useState<string[]>(['ops@acme.fr']);
  const [expires, setExpires] = useState<Date | null>(new Date(2027, 0, 31));
  const [scheduled, setScheduled] = useState<Date | null>(null);

  /* Overlays */
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerUser, setDrawerUser] = useState<DemoUser | null>(null);

  /* Navigation */
  const [tab, setTab] = useState<'general' | 'storage' | 'acl' | 'limits'>('general');
  const [chip, setChip] = useState<'all' | Status>('all');

  /* Table */
  const [sort, setSort] = useState<SortState>({ id: 'username', dir: 'asc' });
  const [selected, setSelected] = useState<Set<string>>(new Set(['backup-nas01']));
  const [loading, setLoading] = useState(false);
  const [showEmpty, setShowEmpty] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const counts = useMemo(() => {
    const c = { all: USERS.length, active: 0, disabled: 0, expired: 0 };
    for (const u of USERS) c[u.status]++;
    return c;
  }, []);

  const rows = useMemo(() => {
    if (showEmpty) return [];
    let list = chip === 'all' ? USERS : USERS.filter((u) => u.status === chip);
    if (sort) {
      const dir = sort.dir === 'asc' ? 1 : -1;
      list = [...list].sort((a, b) => {
        switch (sort.id) {
          case 'quota':
            return (a.usedMb / a.quotaMb - b.usedMb / b.quotaMb) * dir;
          case 'lastLogin':
            return ((a.lastLogin ?? '') < (b.lastLogin ?? '') ? -1 : 1) * dir;
          default:
            return a.username.localeCompare(b.username) * dir;
        }
      });
    }
    return list;
  }, [chip, sort, showEmpty]);

  const deleteUser = async (u: DemoUser) => {
    const ok = await confirm({
      title: `Supprimer ${u.username} ?`,
      message: (
        <>
          L'utilisateur et sa configuration seront supprimés. Les fichiers stockés sur <strong>{BACKEND_LABEL[u.backend]}</strong> ne sont pas
          effacés.
        </>
      ),
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (ok) toast({ title: 'Utilisateur supprimé', description: u.username, tone: 'ok' });
  };

  const rowMenu = (u: DemoUser) => (
    <Menu
      aria-label={`Actions pour ${u.username}`}
      placement="bottom-end"
      trigger={<IconButton icon={Ellipsis} label="Actions" size="sm" />}
      items={[
        { label: 'Modifier', icon: Pencil, kbd: 'E', onSelect: () => setModalOpen(true) },
        { label: 'Dupliquer', icon: Copy, onSelect: () => toast({ title: `${u.username} dupliqué`, tone: 'ok' }) },
        { label: 'Exporter (JSON)', icon: Download, onSelect: () => toast({ title: 'Export lancé', tone: 'neutral' }) },
        { label: 'Déconnecter les sessions', icon: LogOut, disabled: u.status !== 'active', onSelect: () => toast({ title: 'Sessions fermées', tone: 'warn' }) },
        'separator',
        { label: 'Supprimer', icon: Trash2, danger: true, kbd: 'Suppr', onSelect: () => void deleteUser(u) },
      ]}
    />
  );

  const columns: Column<DemoUser>[] = [
    {
      id: 'username',
      header: 'Utilisateur',
      sortable: true,
      minWidth: 200,
      cell: (u) => (
        <span className="demo__user">
          <span className="demo__avatar" aria-hidden="true">
            {u.username.slice(0, 2)}
          </span>
          <span className="demo__mono">{u.username}</span>
        </span>
      ),
    },
    { id: 'status', header: 'Statut', cell: (u) => <StatusDot tone={STATUS_TONE[u.status]} label={STATUS_LABEL[u.status]} /> },
    { id: 'backend', header: 'Stockage', cell: (u) => <Badge tone={u.backend === 'local' ? 'neutral' : 'accent'}>{BACKEND_LABEL[u.backend]}</Badge> },
    {
      id: 'quota',
      header: 'Quota',
      sortable: true,
      minWidth: 200,
      cell: (u) => <ProgressBar value={u.usedMb} max={u.quotaMb} size="sm" label={`Quota de ${u.username}`} valueText={`${fmtSize(u.usedMb)} / ${fmtSize(u.quotaMb)}`} />,
    },
    { id: 'lastLogin', header: 'Dernière connexion', sortable: true, mono: true, cell: (u) => fmtDate(u.lastLogin) },
    { id: 'actions', header: <span className="sr-only">Actions</span>, align: 'right', width: 48, cell: (u) => rowMenu(u) },
  ];

  const commands: Command[] = [
    { id: 'go-users', label: 'Utilisateurs', group: 'Navigation', icon: Users, shortcut: 'G U', run: () => toast({ title: 'Navigation → Utilisateurs' }) },
    { id: 'go-folders', label: 'Dossiers virtuels', group: 'Navigation', icon: FolderTree, run: () => toast({ title: 'Navigation → Dossiers' }) },
    { id: 'go-conns', label: 'Connexions actives', group: 'Navigation', icon: Activity, keywords: ['sessions'], run: () => toast({ title: 'Navigation → Connexions' }) },
    { id: 'go-defender', label: 'Defender (IP bloquées)', group: 'Navigation', icon: Shield, keywords: ['ban', 'sécurité'], run: () => toast({ title: 'Navigation → Defender' }) },
    { id: 'go-settings', label: 'Paramètres serveur', group: 'Navigation', icon: Settings, run: () => toast({ title: 'Navigation → Paramètres' }) },
    { id: 'new-user', label: 'Créer un utilisateur', group: 'Actions', icon: UserPlus, shortcut: 'mod+shift+u', run: () => setModalOpen(true) },
    { id: 'new-key', label: 'Générer une clé API', group: 'Actions', icon: KeyRound, run: () => toast({ title: 'Clé API créée', tone: 'ok' }) },
    { id: 'theme', label: theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre', group: 'Préférences', icon: theme === 'dark' ? Sun : Moon, run: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) },
    ...USERS.map((u) => ({
      id: `user-${u.username}`,
      label: u.username,
      description: BACKEND_LABEL[u.backend],
      group: 'Utilisateurs',
      icon: Terminal,
      keywords: [u.backend],
      run: () => setDrawerUser(u),
    })),
  ];

  const sections = [
    ['buttons', 'Boutons'],
    ['inputs', 'Champs texte'],
    ['choices', 'Choix'],
    ['selects', 'Listes'],
    ['dates', 'Dates'],
    ['overlays', 'Superpositions'],
    ['nav', 'Navigation'],
    ['display', 'Affichage'],
    ['table', 'Tableau'],
    ['feedback', 'États'],
    ['files', 'Fichiers'],
  ];

  return (
    <div className="demo">
      <header className="demo__header">
        <div>
          <h1 className="demo__title">Composants</h1>
          <p className="demo__subtitle">Bibliothèque UI de SFTPGo Console — démo interne</p>
        </div>
        <div className="demo__toolbar">
          <Button variant="secondary" icon={Search} kbd="mod+k" onClick={() => setPaletteOpen(true)}>
            Rechercher
          </Button>
          <SegmentedControl
            aria-label="Thème"
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'dark', label: 'Sombre', icon: Moon },
              { value: 'light', label: 'Clair', icon: Sun },
            ]}
          />
        </div>
      </header>

      <nav className="demo__nav" aria-label="Sections">
        {sections.map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>

      <div className="demo__sections">
        {/* ---------------------------------------------------------- */}
        <Section id="buttons" title="Button · IconButton · Kbd · Tooltip">
          <div className="demo__stack">
            <div className="demo__row">
              <Button variant="primary" icon={UserPlus}>
                Nouvel utilisateur
              </Button>
              <Button icon={RefreshCw}>Actualiser</Button>
              <Button variant="ghost">Annuler</Button>
              <Button variant="danger" icon={Trash2}>
                Supprimer
              </Button>
              <Button variant="primary" kbd="mod+s">
                Enregistrer
              </Button>
              <Button loading>Synchronisation</Button>
              <Button disabled>Désactivé</Button>
            </div>
            <div className="demo__row">
              <Button size="sm" variant="primary" icon={Plus}>
                Ajouter
              </Button>
              <Button size="sm" icon={Download}>
                Exporter
              </Button>
              <Button size="sm" variant="ghost" kbd="N">
                Nouveau
              </Button>
              <IconButton icon={Pencil} label="Modifier" />
              <IconButton icon={Copy} label="Copier le chemin" variant="secondary" />
              <IconButton icon={Trash2} label="Supprimer" variant="danger" size="sm" />
              <Tooltip content="Clé SSH ed25519 ajoutée le 12/11/2026">
                <Badge tone="accent" mono tabIndex={0}>
                  ssh-ed25519
                </Badge>
              </Tooltip>
              <span className="demo__note">
                Raccourcis : <Kbd>mod+k</Kbd> <Kbd>shift+?</Kbd> <Kbd>escape</Kbd> <Kbd combo={false}>G U</Kbd>
              </span>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section id="inputs" title="Input · PasswordInput · NumberInput · Textarea · SaveBar" description="Modifiez un champ : la barre d'enregistrement apparaît (⌘S / Ctrl+S).">
          <div className="demo__grid">
            <Input
              label="Nom d'utilisateur"
              required
              mono
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              error={usernameError}
              hint="Identifiant de connexion SFTP/FTP"
            />
            <Input label="E-mail" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} prefix="@" />
            <PasswordInput label="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Laisser vide pour ne pas changer" autoComplete="new-password" />
            <Input
              label="Répertoire racine"
              mono
              value={form.homeDir}
              onChange={(e) => setForm({ ...form, homeDir: e.target.value })}
              prefix={<HardDrive size={14} aria-hidden="true" />}
            />
            <NumberInput label="Quota disque" unit="Mo" min={0} step={512} value={form.quota} onChange={(v) => setForm({ ...form, quota: v })} hint="0 = illimité" />
            <NumberInput label="Port SFTP" min={1} max={65535} value={form.port} onChange={(v) => setForm({ ...form, port: v })} />
            <NumberInput label="Sessions simultanées" min={0} max={100} value={form.maxSessions} onChange={(v) => setForm({ ...form, maxSessions: v })} size="sm" />
            <Input label="Recherche" type="search" size="sm" placeholder="Filtrer…" prefix={<Search size={14} aria-hidden="true" />} />
            <Input label="Désactivé" value="sftpgo.example.com" disabled />
          </div>
          <div style={{ marginTop: 'var(--sp-4)' }}>
            <Textarea
              label="Description"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              labelAside={`${form.description.length}/255`}
              maxLength={255}
              rows={3}
            />
          </div>
          <SaveBar
            dirtyCount={dirtyCount}
            saving={saving}
            onCancel={() => {
              setForm(initial);
              setPassword('');
            }}
            onSave={() => {
              setSaving(true);
              window.setTimeout(() => {
                setSaving(false);
                setForm(initial);
                setPassword('');
                toast({ title: 'Modifications enregistrées', description: `${dirtyCount} champ(s) mis à jour`, tone: 'ok' });
              }, 900);
            }}
          />
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section id="choices" title="Checkbox · Switch · SegmentedControl · RadioCards">
          <div className="demo__grid demo__grid--2">
            <div className="demo__stack">
              <div className="demo__label">Permissions sur /</div>
              <Checkbox
                label="Toutes"
                checked={checkedCount === permKeys.length}
                indeterminate={checkedCount > 0 && checkedCount < permKeys.length}
                onChange={(v) => setPerms(Object.fromEntries(permKeys.map((k) => [k, v])))}
              />
              <div className="demo__stack" style={{ paddingLeft: 24, gap: 'var(--sp-2)' }}>
                <Checkbox label="Lister" checked={!!perms.list} onChange={(v) => setPerms({ ...perms, list: v })} />
                <Checkbox label="Télécharger" checked={!!perms.download} onChange={(v) => setPerms({ ...perms, download: v })} />
                <Checkbox
                  label="Envoyer"
                  description="Autorise aussi la reprise des transferts interrompus"
                  checked={!!perms.upload}
                  onChange={(v) => setPerms({ ...perms, upload: v })}
                />
              </div>
              <Checkbox label="Créer des liens symboliques" checked={false} onChange={() => undefined} disabled />
            </div>
            <div className="demo__stack">
              <div className="demo__label">Sécurité</div>
              <Switch label="Authentification à deux facteurs" description="TOTP obligatoire pour l'interface web client" checked={mfa} onChange={setMfa} labelPosition="end" />
              <Switch label="Restreindre aux IP autorisées" checked={allowList} onChange={setAllowList} labelPosition="end" />
              <Switch label="Notifier par e-mail à chaque connexion" checked={notify} onChange={setNotify} labelPosition="end" size="sm" />
              <Switch label="Lecture seule (verrouillé)" checked={readOnly} onChange={setReadOnly} disabled labelPosition="end" />
            </div>
          </div>
          <div className="demo__stack" style={{ marginTop: 'var(--sp-5)' }}>
            <div className="demo__label">SegmentedControl</div>
            <div className="demo__row">
              <SegmentedControl
                aria-label="Protocole"
                value={protocol}
                onChange={setProtocol}
                options={[
                  { value: 'all', label: 'Tous', count: 128 },
                  { value: 'sftp', label: 'SFTP', count: 96 },
                  { value: 'ftp', label: 'FTP/S', count: 21 },
                  { value: 'webdav', label: 'WebDAV', count: 7 },
                  { value: 'http', label: 'HTTP', count: 4, disabled: true },
                ]}
              />
              <SegmentedControl
                aria-label="Période"
                size="sm"
                value="24h"
                onChange={() => undefined}
                options={[
                  { value: '1h', label: '1 h' },
                  { value: '24h', label: '24 h' },
                  { value: '7d', label: '7 j' },
                ]}
              />
            </div>
            <RadioCards
              label="Stockage"
              hint="Où les fichiers de l'utilisateur sont conservés"
              value={storage}
              onChange={setStorage}
              options={[
                { value: 'local', label: 'Disque local', description: 'Système de fichiers du serveur', icon: HardDrive },
                { value: 's3', label: 'Amazon S3', description: 'Ou compatible S3 (MinIO, R2…)', icon: Cloud },
                { value: 'gcs', label: 'Google Cloud', description: 'Bucket GCS avec compte de service', icon: Cloud },
                { value: 'azure', label: 'Azure Blob', description: 'Conteneur + SAS ou clé de compte', icon: Database },
                { value: 'sftp', label: 'SFTP distant', description: 'Proxy vers un autre serveur', icon: Network },
              ]}
            />
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section id="selects" title="Select · MultiSelect · TagInput">
          <div className="demo__grid">
            <Select label="Backend de stockage" options={BACKEND_OPTIONS} value={backend} onChange={setBackend} />
            <Select
              label="Groupe principal"
              searchable
              placeholder="Aucun groupe"
              options={GROUPS}
              value={group}
              onChange={setGroup}
              hint="Recherche + navigation clavier"
            />
            <Select
              label="Région S3"
              mono
              size="sm"
              value={region}
              onChange={setRegion}
              options={['eu-west-1', 'eu-west-3', 'eu-central-1', 'us-east-1', 'us-west-2', 'ap-southeast-1'].map((r) => ({ value: r, label: r }))}
            />
            <Select label="Avec erreur" options={BACKEND_OPTIONS} value={null} onChange={() => undefined} error="Choisissez un backend" required />
            <MultiSelect label="Permissions" options={PERMISSIONS} values={selectedPerms} onChange={setSelectedPerms} />
            <MultiSelect label="Groupes secondaires" options={GROUPS} values={groups} onChange={setGroups} maxChips={2} />
          </div>
          <div className="demo__grid demo__grid--2" style={{ marginTop: 'var(--sp-4)' }}>
            <TagInput
              label="IP autorisées"
              mono
              values={ips}
              onChange={setIps}
              validate={validateIp}
              placeholder="192.168.0.0/16, 2001:db8::/32…"
              hint="Entrée, virgule ou collage d'une liste"
            />
            <TagInput
              label="Extensions refusées"
              mono
              values={exts}
              onChange={setExts}
              validate={validateExt}
              transform={(v) => (v.startsWith('.') ? v : `.${v}`).toLowerCase()}
              placeholder=".exe"
            />
            <TagInput label="Destinataires des alertes" values={emails} onChange={setEmails} validate={validateEmail} placeholder="nom@domaine.fr" />
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section id="dates" title="DatePicker">
          <div className="demo__grid">
            <DatePicker
              label="Expiration du compte"
              value={expires}
              onChange={setExpires}
              clearable
              min={new Date()}
              hint="Les dates passées sont désactivées"
            />
            <DatePicker label="Tâche planifiée" value={scheduled} onChange={setScheduled} withTime clearable placeholder="Exécuter maintenant" />
            <DatePicker label="English locale" value={expires} onChange={setExpires} locale="en-GB" size="sm" />
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section id="overlays" title="Menu · Modal · Drawer · useConfirm · useToast · CommandPalette">
          <div className="demo__stack">
            <div className="demo__row">
              <Menu
                trigger={
                  <Button icon={Plus} iconRight={undefined}>
                    Créer…
                  </Button>
                }
                items={[
                  { label: 'Utilisateur', icon: UserPlus, kbd: 'mod+shift+u', onSelect: () => setModalOpen(true) },
                  { label: 'Dossier virtuel', icon: FolderTree, onSelect: () => toast({ title: 'Dossier virtuel' }) },
                  { label: 'Clé API', icon: KeyRound, onSelect: () => toast({ title: 'Clé API' }) },
                  'separator',
                  { label: 'Règle Defender', icon: Ban, disabled: true, onSelect: () => undefined },
                ]}
              />
              <Button onClick={() => setModalOpen(true)}>Ouvrir un modal</Button>
              <Button onClick={() => setDrawerUser(USERS[0])}>Ouvrir un drawer</Button>
              <Button variant="danger" icon={Trash2} onClick={() => void deleteUser(USERS[3])}>
                Confirmation
              </Button>
              <Button icon={Search} kbd="mod+k" onClick={() => setPaletteOpen(true)}>
                Palette
              </Button>
            </div>
            <div className="demo__row">
              <Button size="sm" onClick={() => toast({ title: 'Utilisateur créé', description: 'partenaire-acme peut se connecter en SFTP.', tone: 'ok' })}>
                Toast ok
              </Button>
              <Button size="sm" onClick={() => toast({ title: 'Quota presque atteint', description: 'backup-nas01 utilise 94 % de son espace.', tone: 'warn' })}>
                Toast warn
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  toast({
                    title: 'Échec de la connexion S3',
                    description: 'AccessDenied: s3:ListBucket sur arn:aws:s3:::acme-edi',
                    tone: 'bad',
                    action: { label: 'Réessayer', onClick: () => toast({ title: 'Nouvelle tentative…' }) },
                  })
                }
              >
                Toast bad
              </Button>
              <Button size="sm" onClick={() => toast({ title: 'Sauvegarde planifiée pour 03:00' })}>
                Toast neutre
              </Button>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section id="nav" title="Tabs · FilterChips · Pagination">
          <Tabs
            idBase="demo-tabs"
            aria-label="Sections de l'utilisateur"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: 'general', label: 'Général' },
              { id: 'storage', label: 'Stockage' },
              { id: 'acl', label: 'Permissions', count: 12 },
              { id: 'limits', label: 'Limites' },
            ]}
          />
          <TabPanel idBase="demo-tabs" id={tab} className="demo__panel">
            <p className="demo__note">
              Panneau « {tab} » — <Kbd>←</Kbd> <Kbd>→</Kbd> pour changer d'onglet.
            </p>
          </TabPanel>
          <div className="demo__stack" style={{ marginTop: 'var(--sp-5)' }}>
            <FilterChips
              aria-label="Filtrer par statut"
              value={chip}
              onChange={setChip}
              chips={[
                { id: 'all', label: 'Tous', count: counts.all },
                { id: 'active', label: 'Actifs', count: counts.active, tone: 'ok' },
                { id: 'disabled', label: 'Désactivés', count: counts.disabled, tone: 'neutral' },
                { id: 'expired', label: 'Expirés', count: counts.expired, tone: 'warn' },
              ]}
            />
            <Pagination page={page} pageSize={pageSize} total={1284} onPageChange={setPage} pageSizeOptions={[25, 50, 100]} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
            <Pagination page={2} pageSize={50} hasMore onPageChange={() => undefined} pageCount={50} />
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section id="display" title="Badge · StatusDot · ProgressBar · Card · KeyValue">
          <div className="demo__stack">
            <div className="demo__row">
              <Badge>local</Badge>
              <Badge tone="ok" dot>
                En ligne
              </Badge>
              <Badge tone="warn">Expire dans 3 j</Badge>
              <Badge tone="bad">Bloqué</Badge>
              <Badge tone="accent" mono>
                v2.6.4
              </Badge>
              <Badge tone="neutral" mono icon={KeyRound}>
                SHA256:9f3c…e1
              </Badge>
            </div>
            <div className="demo__row" style={{ gap: 'var(--sp-5)' }}>
              <StatusDot tone="ok" label="SFTP :2022" />
              <StatusDot tone="ok" label="12 connexions" pulse />
              <StatusDot tone="warn" label="FTP sans TLS" />
              <StatusDot tone="bad" label="WebDAV arrêté" />
              <StatusDot tone="neutral" label="HTTP désactivé" />
            </div>
            <div className="demo__grid">
              <ProgressBar value={42} label="Quota 42 %" showValue />
              <ProgressBar value={83} label="Quota 83 %" showValue />
              <ProgressBar value={9420} max={10240} label="Quota partenaire-acme" valueText="9,2 Go / 10 Go" />
            </div>
            <div className="demo__grid demo__grid--2">
              <Card
                title="partenaire-acme"
                description="Dernière connexion il y a 12 min"
                actions={<IconButton icon={Pencil} label="Modifier" size="sm" />}
              >
                <KeyValue
                  items={[
                    { label: 'Statut', value: <StatusDot tone="ok" label="Actif" /> },
                    { label: 'Stockage', value: 'Amazon S3 · eu-west-3' },
                    { label: 'Bucket', value: 's3://acme-edi/inbound', mono: true },
                    { label: 'Répertoire', value: '/srv/sftpgo/data/partenaire-acme', mono: true },
                    { label: 'Expiration', value: '31 janv. 2027' },
                  ]}
                />
              </Card>
              <Card title="Serveur" padded={false} footer={<Button size="sm" variant="ghost">Voir les journaux</Button>}>
                <div style={{ padding: '0 16px 12px' }}>
                  <KeyValue
                    columns={2}
                    labelWidth={90}
                    items={[
                      { label: 'Version', value: '2.6.4', mono: true },
                      { label: 'Uptime', value: '18 j 4 h' },
                      { label: 'SFTP', value: ':2022', mono: true },
                      { label: 'FTP', value: ':2121', mono: true },
                      { label: 'WebDAV', value: '—' },
                      { label: 'Data provider', value: 'PostgreSQL' },
                    ]}
                  />
                </div>
              </Card>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section
          id="table"
          title="DataTable"
          description="Tri, sélection, clic sur une ligne (ouvre le drawer), menu d'actions."
          actions={
            <div className="demo__row">
              <Switch size="sm" label="Chargement" checked={loading} onChange={setLoading} />
              <Switch size="sm" label="Vide" checked={showEmpty} onChange={setShowEmpty} />
            </div>
          }
        >
          <div className="demo__table-toolbar">
            <FilterChips
              aria-label="Statut"
              value={chip}
              onChange={setChip}
              chips={[
                { id: 'all', label: 'Tous', count: counts.all },
                { id: 'active', label: 'Actifs', count: counts.active },
                { id: 'disabled', label: 'Désactivés', count: counts.disabled },
                { id: 'expired', label: 'Expirés', count: counts.expired },
              ]}
            />
            <div className="demo__row">
              {selected.size > 0 && <span className="demo__note">{selected.size} sélectionné(s)</span>}
              <Button size="sm" variant="danger" icon={Trash2} disabled={!selected.size} onClick={() => setSelected(new Set())}>
                Supprimer
              </Button>
            </div>
          </div>
          <DataTable
            aria-label="Utilisateurs"
            columns={columns}
            rows={rows}
            rowKey={(u) => u.username}
            selectable
            selected={selected}
            onSelectionChange={setSelected}
            sort={sort}
            onSortChange={setSort}
            loading={loading}
            onRowClick={(u) => setDrawerUser(u)}
            maxHeight={420}
            selectRowLabel={(u) => `Sélectionner ${u.username}`}
            empty={
              <EmptyState
                icon={Users}
                title="Aucun utilisateur"
                description="Créez un premier compte pour permettre les transferts SFTP, FTP ou WebDAV."
                action={
                  <Button variant="primary" icon={UserPlus} onClick={() => setShowEmpty(false)}>
                    Créer un utilisateur
                  </Button>
                }
              />
            }
          />
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section id="feedback" title="EmptyState · Skeleton · Spinner">
          <div className="demo__grid demo__grid--2">
            <Card padded={false}>
              <EmptyState
                icon={Shield}
                title="Aucune IP bloquée"
                description="Le Defender n'a détecté aucune tentative suspecte ces dernières 24 h."
                action={<Button size="sm">Voir la configuration</Button>}
              />
            </Card>
            <div className="demo__stack">
              <div className="demo__row">
                <Skeleton circle height={32} />
                <div style={{ flex: 1 }}>
                  <Skeleton lines={2} />
                </div>
              </div>
              <Skeleton height={80} />
              <div className="demo__row">
                <Spinner />
                <span className="demo__note">Chargement des connexions…</span>
                <Spinner size={20} label="Synchronisation" />
              </div>
            </div>
          </div>
        </Section>

        {/* ---------------------------------------------------------- */}
        <Section id="files" title="FileDrop">
          <div className="demo__grid demo__grid--2">
            <FileDrop
              label="Importer une sauvegarde"
              hint="Fichier .json exporté depuis SFTPGo (dump complet)"
              accept=".json,application/json"
              onFiles={(files) => toast({ title: 'Fichier reçu', description: files.map((f) => f.name).join(', '), tone: 'ok' })}
            />
            <FileDrop
              compact
              multiple
              label="Clés publiques SSH"
              hint="Glissez un ou plusieurs fichiers .pub"
              accept=".pub"
              icon={KeyRound}
              onFiles={(files) => toast({ title: `${files.length} clé(s) ajoutée(s)`, tone: 'ok' })}
            />
          </div>
        </Section>
      </div>

      {/* ---- Overlays ---- */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nouvel utilisateur"
        description="Les champs marqués d'un astérisque sont obligatoires."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Annuler
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setModalOpen(false);
                toast({ title: 'Utilisateur créé', tone: 'ok' });
              }}
            >
              Créer
            </Button>
          </>
        }
      >
        <div className="demo__stack">
          <Input label="Nom d'utilisateur" required mono placeholder="partenaire-xyz" />
          <PasswordInput label="Mot de passe" required autoComplete="new-password" />
          <Select label="Backend" options={BACKEND_OPTIONS} value={backend} onChange={setBackend} />
          <MultiSelect label="Permissions" options={PERMISSIONS} values={selectedPerms} onChange={setSelectedPerms} />
          <DatePicker label="Expiration" value={expires} onChange={setExpires} clearable />
          <Switch label="Compte actif" checked onChange={() => undefined} />
        </div>
      </Modal>

      <Drawer
        open={!!drawerUser}
        onClose={() => setDrawerUser(null)}
        title={drawerUser?.username ?? ''}
        description={drawerUser ? BACKEND_LABEL[drawerUser.backend] : undefined}
        size="md"
        footer={
          <>
            <Button variant="danger" icon={Trash2} onClick={() => drawerUser && void deleteUser(drawerUser)}>
              Supprimer
            </Button>
            <Button variant="primary" icon={Pencil} onClick={() => setModalOpen(true)}>
              Modifier
            </Button>
          </>
        }
      >
        {drawerUser && (
          <div className="demo__stack">
            <KeyValue
              items={[
                { label: 'Statut', value: <StatusDot tone={STATUS_TONE[drawerUser.status]} label={STATUS_LABEL[drawerUser.status]} /> },
                { label: 'Stockage', value: BACKEND_LABEL[drawerUser.backend] },
                {
                  label: 'Quota',
                  value: <ProgressBar value={drawerUser.usedMb} max={drawerUser.quotaMb} valueText={`${fmtSize(drawerUser.usedMb)} / ${fmtSize(drawerUser.quotaMb)}`} label="Quota" />,
                },
                { label: 'Dernière connexion', value: fmtDate(drawerUser.lastLogin), mono: true },
                { label: 'Permissions', value: <div className="demo__row">{drawerUser.perms.map((p) => <Badge key={p} mono>{p}</Badge>)}</div> },
              ]}
            />
            <TagInput label="IP autorisées" mono values={ips} onChange={setIps} validate={validateIp} />
          </div>
        )}
      </Drawer>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </div>
  );
}
