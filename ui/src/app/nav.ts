import {
  Activity,
  FileClock,
  FolderTree,
  HardDrive,
  KeyRound,
  LayoutDashboard,
  ListFilter,
  type LucideIcon,
  Settings2,
  Share2,
  Shield,
  ShieldCheck,
  User,
  UserCog,
  Users,
  Workflow,
  Wrench,
  Zap,
  Folder,
  CircleUser,
} from 'lucide-react';
import type { Dict } from '@/lib/i18n';

export interface NavItem {
  /** i18n key in navDict */
  key: keyof typeof navDict.fr;
  to: string;
  icon: LucideIcon;
  /** Admin permission needed to see the entry (any of). Omit = always visible. */
  perms?: string[];
}

export interface NavGroup {
  key: keyof typeof navDict.fr;
  items: NavItem[];
}

export const navDict = {
  fr: {
    gServer: 'Serveur',
    gAccounts: 'Comptes',
    gStorage: 'Stockage',
    gAutomation: 'Automatisation',
    gSecurity: 'Sécurité',
    gSystem: 'Système',
    gMySpace: 'Mon espace',
    overview: 'Vue d’ensemble',
    connections: 'Connexions',
    events: 'Journal',
    users: 'Utilisateurs',
    groups: 'Groupes',
    admins: 'Administrateurs',
    roles: 'Rôles',
    apikeys: 'Clés d’API',
    folders: 'Dossiers virtuels',
    rules: 'Règles',
    actions: 'Actions',
    defender: 'Defender',
    iplists: 'Listes IP',
    maintenance: 'Maintenance',
    settings: 'Réglages serveur',
    files: 'Mes fichiers',
    shares: 'Mes partages',
    account: 'Mon compte',
    activity: 'Activité',
    foldersShort: 'Dossiers',
    settingsMenu: 'Réglages et sécurité',
  },
  en: {
    gServer: 'Server',
    gAccounts: 'Accounts',
    gStorage: 'Storage',
    gAutomation: 'Automation',
    gSecurity: 'Security',
    gSystem: 'System',
    gMySpace: 'My space',
    overview: 'Overview',
    connections: 'Connections',
    events: 'Event log',
    users: 'Users',
    groups: 'Groups',
    admins: 'Administrators',
    roles: 'Roles',
    apikeys: 'API keys',
    folders: 'Virtual folders',
    rules: 'Rules',
    actions: 'Actions',
    defender: 'Defender',
    iplists: 'IP lists',
    maintenance: 'Maintenance',
    settings: 'Server settings',
    files: 'My files',
    shares: 'My shares',
    account: 'My account',
    activity: 'Activity',
    foldersShort: 'Folders',
    settingsMenu: 'Settings and security',
  },
} satisfies Dict;

export const adminNav: NavGroup[] = [
  {
    key: 'gServer',
    items: [
      { key: 'overview', to: '/overview', icon: LayoutDashboard, perms: ['view_status'] },
      { key: 'connections', to: '/connections', icon: Activity, perms: ['view_conns'] },
      { key: 'events', to: '/events', icon: FileClock, perms: ['view_events'] },
    ],
  },
  {
    key: 'gAccounts',
    items: [
      { key: 'users', to: '/users', icon: User, perms: ['view_users', 'add_users', 'edit_users'] },
      { key: 'groups', to: '/groups', icon: Users, perms: ['manage_groups'] },
      { key: 'admins', to: '/admins', icon: UserCog, perms: ['manage_admins'] },
      { key: 'roles', to: '/roles', icon: ShieldCheck, perms: ['manage_roles'] },
      { key: 'apikeys', to: '/apikeys', icon: KeyRound, perms: ['manage_apikeys'] },
    ],
  },
  {
    key: 'gStorage',
    items: [{ key: 'folders', to: '/folders', icon: FolderTree, perms: ['manage_folders'] }],
  },
  {
    key: 'gAutomation',
    items: [
      { key: 'rules', to: '/rules', icon: Zap, perms: ['manage_event_rules'] },
      { key: 'actions', to: '/actions', icon: Workflow, perms: ['manage_event_rules'] },
    ],
  },
  {
    key: 'gSecurity',
    items: [
      { key: 'defender', to: '/defender', icon: Shield, perms: ['view_defender', 'manage_defender'] },
      { key: 'iplists', to: '/iplists', icon: ListFilter, perms: ['manage_ip_lists'] },
    ],
  },
  {
    key: 'gSystem',
    items: [
      { key: 'maintenance', to: '/maintenance', icon: Wrench, perms: ['manage_system', 'quota_scans'] },
      { key: 'settings', to: '/settings', icon: Settings2, perms: ['manage_system'] },
    ],
  },
];

export const userNav: NavGroup[] = [
  {
    key: 'gMySpace',
    items: [
      { key: 'files', to: '/files', icon: Folder },
      { key: 'shares', to: '/shares', icon: Share2 },
      { key: 'account', to: '/account', icon: CircleUser },
    ],
  },
];

export const storageIcon = HardDrive;

/**
 * Design v2: only a few entries live in the top bar; everything else sits in
 * the "Réglages" menu. `as` renames an entry in the bar (overview → Activité).
 */
export const adminPrimary: { to: string; as?: keyof typeof navDict.fr }[] = [
  { to: '/users' },
  { to: '/groups' },
  { to: '/folders', as: 'foldersShort' },
  { to: '/overview', as: 'activity' },
];
