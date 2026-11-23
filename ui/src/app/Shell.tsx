import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Check, LogOut, Moon, Search, Settings, Sun, SunMoon, User as UserIcon } from 'lucide-react';
import { Button, CommandPalette, IconButton, Kbd, Menu, Modal, PasswordInput, Input } from '@/components/ui';
import type { Session } from '@/api/client';
import { useAuth } from '@/lib/auth';
import { useT, type Dict } from '@/lib/i18n';
import { useTheme, type ThemePref } from '@/lib/theme';
import { adminNav, adminPrimary, navDict, userNav, type NavGroup } from './nav';
import { Logo } from './Logo';
import { useLayout, type Command } from './layout-context';
import './shell.css';

const dict = {
  fr: {
    searchPlaceholder: 'Rechercher ou lancer une commande…',
    searchShort: 'Rechercher',
    mainNav: 'Navigation principale',
    breadcrumb: 'Emplacement',
    openPalette: 'Ouvrir la palette de commandes',
    theme: 'Thème',
    themeDark: 'Sombre',
    themeLight: 'Clair',
    themeSystem: 'Système',
    language: 'English',
    logout: 'Se déconnecter',
    account: 'Mon compte',
    navigate: 'Aller à',
    general: 'Général',
    toggleMenu: 'Afficher ou masquer le menu',
    servicesOnline: '{n} services en ligne',
    servicesPartial: '{n}/{total} services en ligne',
    expiredTitle: 'Session expirée',
    expiredText: 'Pour continuer là où vous en étiez, confirmez le mot de passe de {user}.',
    password: 'Mot de passe',
    otp: 'Code de double authentification (si activée)',
    reconnect: 'Se reconnecter',
    badCredentials: 'Mot de passe ou code incorrect.',
    switchAccount: 'Changer de compte',
    kindAdmin: 'Administrateur',
    kindAdminLimited: 'Administrateur · rôle {role}',
    kindUser: 'Utilisateur',
    kindUserRole: 'Utilisateur · rôle {role}',
  },
  en: {
    searchPlaceholder: 'Search or run a command…',
    searchShort: 'Search',
    mainNav: 'Main navigation',
    breadcrumb: 'Location',
    openPalette: 'Open command palette',
    theme: 'Theme',
    themeDark: 'Dark',
    themeLight: 'Light',
    themeSystem: 'System',
    language: 'Français',
    logout: 'Sign out',
    account: 'My account',
    navigate: 'Go to',
    general: 'General',
    toggleMenu: 'Toggle menu',
    servicesOnline: '{n} services online',
    servicesPartial: '{n}/{total} services online',
    expiredTitle: 'Session expired',
    expiredText: 'To continue where you left off, confirm the password for {user}.',
    password: 'Password',
    otp: 'Two-factor code (if enabled)',
    reconnect: 'Sign in again',
    badCredentials: 'Wrong password or code.',
    switchAccount: 'Switch account',
    kindAdmin: 'Administrator',
    kindAdminLimited: 'Administrator · role {role}',
    kindUser: 'User',
    kindUserRole: 'User · role {role}',
  },
} satisfies Dict;

function visibleGroups(groups: NavGroup[], session: Session, can: (p: string) => boolean) {
  if (session.kind === 'user') {
    // web_client restrictions travel in the user token's permissions claim.
    const hidden = new Set<string>();
    if (session.permissions.includes('shares-disabled')) hidden.add('/shares');
    return groups.map((g) => ({ ...g, items: g.items.filter((i) => !hidden.has(i.to)) }));
  }
  return groups
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.perms || i.perms.some((p) => can(p))) }))
    .filter((g) => g.items.length > 0);
}

export function Shell() {
  const { session, can, logout, expired } = useAuth();
  const t = useT(dict);
  const tn = useT(navDict);
  const { pref, setPref } = useTheme();
  const { crumbs, pageCommands, paletteOpen, setPaletteOpen } = useLayout();
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPaletteOpen]);

  const groups = useMemo(
    () => (session ? visibleGroups(session.kind === 'admin' ? adminNav : userNav, session, can) : []),
    [session, can],
  );
  const allItems = useMemo(() => groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.key }))), [groups]);

  // Design v2: a handful of entries in the bar, the rest in the settings menu.
  const primary = useMemo(() => {
    if (session?.kind !== 'admin') return allItems.filter((i) => i.key !== 'account').map((i) => ({ item: i, label: tn(i.key) }));
    return adminPrimary
      .map((p) => {
        const item = allItems.find((i) => i.to === p.to);
        return item ? { item, label: tn(p.as ?? item.key) } : null;
      })
      .filter((x): x is NonNullable<typeof x> => !!x);
  }, [allItems, session?.kind, tn]);
  const secondary = useMemo(() => {
    if (session?.kind !== 'admin') return [];
    const inBar = new Set(primary.map((p) => p.item.to));
    return groups
      .map((g) => ({ key: g.key, items: g.items.filter((i) => !inBar.has(i.to)) }))
      .filter((g) => g.items.length > 0);
  }, [groups, primary, session?.kind]);

  const commands = useMemo<Command[]>(() => {
    const nav: Command[] = allItems.map((i) => ({
      id: `nav:${i.to}`,
      label: tn(i.key),
      group: t('navigate'),
      icon: i.icon,
      keywords: [tn(i.group)],
      run: () => navigate(i.to),
    }));
    const general: Command[] = [
      { id: 'theme:light', label: `${t('theme')} : ${t('themeLight')}`, group: t('general'), icon: Sun, run: () => setPref('light') },
      { id: 'theme:dark', label: `${t('theme')} : ${t('themeDark')}`, group: t('general'), icon: Moon, run: () => setPref('dark') },
      { id: 'theme:system', label: `${t('theme')} : ${t('themeSystem')}`, group: t('general'), icon: SunMoon, run: () => setPref('system') },
      { id: 'logout', label: t('logout'), group: t('general'), icon: LogOut, run: () => void logout().then(() => navigate('/login')) },
    ];
    return [...pageCommands, ...nav, ...general];
  }, [allItems, pageCommands, t, tn, navigate, setPref, logout]);

  if (!session) return null;

  const accountPath = session.kind === 'admin' ? '/profile' : '/account';
  const identity =
    session.kind === 'admin'
      ? session.role
        ? t('kindAdminLimited', { role: session.role })
        : t('kindAdmin')
      : session.role
        ? t('kindUserRole', { role: session.role })
        : t('kindUser');

  const themeItem = (value: ThemePref, label: string, icon: typeof Sun) => ({
    label: (
      <span className="shell__menu-theme">
        {t('theme')} · {label}
        {pref === value && <Check size={15} strokeWidth={2.4} aria-label="(current)" />}
      </span>
    ),
    textValue: `${t('theme')} ${label}`,
    icon,
    onSelect: () => setPref(value),
  });
  const settingsItems = [
    ...secondary.flatMap((g, gi) => [
      ...(gi > 0 ? (['separator'] as const) : []),
      ...g.items.map((i) => ({ label: tn(i.key), icon: i.icon, onSelect: () => navigate(i.to) })),
    ]),
    ...(secondary.length ? (['separator'] as const) : []),
    themeItem('light', t('themeLight'), Sun),
    themeItem('dark', t('themeDark'), Moon),
    themeItem('system', t('themeSystem'), SunMoon),
  ];

  return (
    <div className="shell">
      <header className="shell__top">
        <div className="shell__bar">
          <Link to="/" className="shell__brand" aria-label="SFTPGo">
            <Logo size={30} />
          </Link>
          <nav className="shell__nav" aria-label={t('mainNav')}>
            {primary.map(({ item, label }) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => (isActive ? 'shell__link is-active' : 'shell__link')}>
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="shell__tools">
            <button type="button" className="shell__search" onClick={() => setPaletteOpen(true)} aria-label={t('openPalette')}>
              <Search size={17} aria-hidden="true" />
              <span className="shell__search-text">{t('searchShort')}</span>
              <Kbd>⌘K</Kbd>
            </button>
            <Menu trigger={<IconButton icon={Settings} label={tn('settingsMenu')} variant="ghost" />} items={settingsItems} minWidth={220} />
            <Menu
              trigger={
                <button type="button" className="shell__user" aria-label={session.username}>
                  <span className="shell__avatar" aria-hidden="true">
                    {session.username.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="shell__user-text">
                    <span className="shell__user-name">{session.username}</span>
                    <span className="shell__user-kind">{identity}</span>
                  </span>
                </button>
              }
              items={[
                { label: t('account'), icon: UserIcon, onSelect: () => navigate(accountPath) },
                'separator',
                { label: t('logout'), icon: LogOut, danger: true, onSelect: () => void logout().then(() => navigate('/login')) },
              ]}
            />
          </div>
        </div>
      </header>
      <main className="shell__content" id="main">
        {crumbs.length > 1 && crumbs.some((c) => c.to) && (
          <nav className="shell__crumbs" aria-label={t('breadcrumb')}>
            {crumbs.slice(0, -1).map((c, i) => (
              <span key={i} className="shell__crumb">
                {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
                <span aria-hidden="true">/</span>
              </span>
            ))}
            <span className="shell__crumb" aria-current="page">
              {crumbs[crumbs.length - 1].label}
            </span>
          </nav>
        )}
        <Outlet />
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} placeholder={t('searchPlaceholder')} />
      {expired && <ReauthModal t={t} />}
    </div>
  );
}

function ReauthModal({ t }: { t: ReturnType<typeof useT<keyof typeof dict.fr>> }) {
  const { expired, login, clearExpired, logout } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!expired) return null;

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(expired.kind, expired.username, password, otp || undefined);
    } catch {
      setError(t('badCredentials'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => {}}
      title={t('expiredTitle')}
      description={t('expiredText', { user: expired.username })}
      size="sm"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              clearExpired();
              void logout().then(() => navigate('/login'));
            }}
          >
            {t('switchAccount')}
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            {t('reconnect')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="shell__reauth">
        <PasswordInput label={t('password')} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" />
        <Input label={t('otp')} value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" mono />
        {error && <p className="shell__error" role="alert">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
