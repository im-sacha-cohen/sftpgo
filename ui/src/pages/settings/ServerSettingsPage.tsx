import { useQuery } from '@tanstack/react-query';
import { Copy, ExternalLink, Settings2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, IconButton, KeyValue, Skeleton, StatusDot, Tabs, useToast } from '@/components/ui';
import { Columns, Page, PageHeader } from '@/app/PageHeader';
import { api } from '@/api/client';
import type { ServicesStatus, VersionInfo } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { config } from '@/lib/config';
import { formatDate } from '@/lib/format';
import { useCommon, useLang, useT, type Dict } from '@/lib/i18n';
import { useState } from 'react';
import './settings.css';

const dict = {
  fr: {
    title: 'Réglages serveur',
    crumb: 'Système',
    subtitle: 'Configuration effective des services, telle que chargée par SFTPGo.',
    version: 'Version',
    build: 'Compilé le',
    commit: 'Commit',
    features: 'Fonctionnalités',
    ssh: 'SFTP / SSH',
    ftp: 'FTP',
    webdav: 'WebDAV',
    security: 'Sécurité',
    listening: 'Écoute',
    hostKeys: 'Clés d’hôte',
    commands: 'Commandes SSH',
    auth: 'Authentifications',
    kex: 'Échanges de clés',
    ciphers: 'Chiffrements',
    macs: 'MAC',
    pubkeyAlgos: 'Algorithmes de clé publique',
    passive: 'Ports passifs',
    tls: 'TLS',
    tlsMode0: 'Non (ou explicite optionnel)',
    tlsMode1: 'Explicite obligatoire',
    tlsMode2: 'Implicite',
    https: 'HTTPS',
    prefix: 'Préfixe',
    inactive: 'Service désactivé',
    defender: 'Defender',
    allowList: 'Liste d’autorisation',
    rate: 'Limiteurs de débit',
    mfa: 'Double authentification',
    totpConfigs: 'Configurations TOTP',
    active: 'Actif',
    off: 'Inactif',
    editTitle: 'Modifier ces réglages',
    editText:
      'Les services se configurent dans sftpgo.json ou par variables d’environnement. Les réglages modifiables à chaud (SMTP, ACME, algorithmes SFTP, image de marque) restent dans l’interface classique pour l’instant.',
    openClassic: 'Ouvrir dans l’interface classique',
    fingerprintCopied: 'Empreinte copiée',
    forbidden: 'Seuls les super-administrateurs voient les réglages serveur.',
  },
  en: {
    title: 'Server settings',
    crumb: 'System',
    subtitle: 'Effective service configuration, as loaded by SFTPGo.',
    version: 'Version',
    build: 'Built on',
    commit: 'Commit',
    features: 'Features',
    ssh: 'SFTP / SSH',
    ftp: 'FTP',
    webdav: 'WebDAV',
    security: 'Security',
    listening: 'Listening',
    hostKeys: 'Host keys',
    commands: 'SSH commands',
    auth: 'Authentications',
    kex: 'Key exchanges',
    ciphers: 'Ciphers',
    macs: 'MACs',
    pubkeyAlgos: 'Public key algorithms',
    passive: 'Passive ports',
    tls: 'TLS',
    tlsMode0: 'No (or optional explicit)',
    tlsMode1: 'Required explicit',
    tlsMode2: 'Implicit',
    https: 'HTTPS',
    prefix: 'Prefix',
    inactive: 'Service disabled',
    defender: 'Defender',
    allowList: 'Allow list',
    rate: 'Rate limiters',
    mfa: 'Two-factor authentication',
    totpConfigs: 'TOTP configurations',
    active: 'Active',
    off: 'Inactive',
    editTitle: 'Change these settings',
    editText:
      'Services are configured in sftpgo.json or with environment variables. Settings editable at runtime (SMTP, ACME, SFTP algorithms, branding) stay in the classic interface for now.',
    openClassic: 'Open in the classic interface',
    fingerprintCopied: 'Fingerprint copied',
    forbidden: 'Only super administrators can see server settings.',
  },
} satisfies Dict;

function List({ items }: { items?: (string | number)[] | null }) {
  if (!items?.length) return <span className="muted">—</span>;
  return (
    <span className="set-list">
      {items.map((x) => (
        <Badge key={String(x)} mono>
          {x}
        </Badge>
      ))}
    </span>
  );
}

export default function ServerSettingsPage() {
  const t = useT(dict);
  useCommon();
  const { lang } = useLang();
  const { can } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('ssh');
  const allowed = can('*');
  const status = useQuery({ queryKey: ['status'], queryFn: () => api.get<ServicesStatus>('/status'), enabled: allowed });
  const version = useQuery({ queryKey: ['version'], queryFn: () => api.get<VersionInfo>('/version'), staleTime: Infinity });

  if (!allowed) {
    return (
      <Page>
        <PageHeader title={t('title')} crumbs={[{ label: t('crumb') }]} />
        <EmptyState icon={Settings2} title={t('title')} description={t('forbidden')} />
      </Page>
    );
  }

  const s = status.data;
  const webBase = config.consoleBase === '/' ? '/web' : config.consoleBase.replace(/\/console$/, '');
  const bind = (b: { address?: string; port?: number }) => `${b.address || '*'}:${b.port}`;

  const panel = () => {
    if (!s) return <Skeleton height={240} />;
    if (tab === 'ssh') {
      const ssh = s.ssh;
      if (!ssh?.is_active) return <EmptyState icon={Settings2} title={t('inactive')} />;
      return (
        <div className="set-stack">
          <KeyValue
            items={[
              { label: t('listening'), value: <List items={(ssh.bindings ?? []).map(bind)} /> },
              { label: t('auth'), value: <List items={ssh.authentications} /> },
              { label: t('commands'), value: <List items={ssh.ssh_commands} /> },
              { label: t('kex'), value: <List items={ssh.kex_algorithms} /> },
              { label: t('ciphers'), value: <List items={ssh.ciphers} /> },
              { label: t('macs'), value: <List items={ssh.macs} /> },
              { label: t('pubkeyAlgos'), value: <List items={ssh.public_key_algorithms} /> },
            ]}
          />
          <div className="set-keys">
            <span className="set-label">{t('hostKeys')}</span>
            {(ssh.host_keys ?? []).map((k) => (
              <div key={k.path} className="set-key">
                <div className="set-key__info">
                  <span className="mono">{k.fingerprint}</span>
                  <span className="mono muted">
                    {k.path} · {(k.algorithms ?? []).join(', ')}
                  </span>
                </div>
                <IconButton
                  icon={Copy}
                  label={t('fingerprintCopied')}
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard?.writeText(k.fingerprint ?? '');
                    toast({ title: t('fingerprintCopied'), tone: 'ok' });
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      );
    }
    if (tab === 'ftp') {
      const ftp = s.ftp;
      if (!ftp?.is_active) return <EmptyState icon={Settings2} title={t('inactive')} />;
      return (
        <div className="set-stack">
          {(ftp.bindings ?? []).map((b) => (
            <KeyValue
              key={bind(b)}
              items={[
                { label: t('listening'), value: <span className="mono">{bind(b)}</span> },
                { label: t('tls'), value: b.tls_mode === 1 ? t('tlsMode1') : b.tls_mode === 2 ? t('tlsMode2') : t('tlsMode0') },
              ]}
            />
          ))}
          <KeyValue
            items={[
              {
                label: t('passive'),
                value: <span className="mono">{ftp.passive_port_range ? `${ftp.passive_port_range.start}–${ftp.passive_port_range.end}` : '—'}</span>,
              },
            ]}
          />
        </div>
      );
    }
    if (tab === 'webdav') {
      const dav = s.webdav;
      if (!dav?.is_active) return <EmptyState icon={Settings2} title={t('inactive')} />;
      return (
        <div className="set-stack">
          {(dav.bindings ?? []).map((b) => (
            <KeyValue
              key={bind(b)}
              items={[
                { label: t('listening'), value: <span className="mono">{bind(b)}</span> },
                { label: t('https'), value: b.enable_https ? t('active') : t('off') },
                { label: t('prefix'), value: <span className="mono">{b.prefix || '/'}</span> },
              ]}
            />
          ))}
        </div>
      );
    }
    return (
      <KeyValue
        items={[
          { label: t('defender'), value: <StatusDot tone={s.defender?.is_active ? 'ok' : 'neutral'} label={s.defender?.is_active ? t('active') : t('off')} /> },
          { label: t('allowList'), value: <StatusDot tone={s.allow_list?.is_active ? 'ok' : 'neutral'} label={s.allow_list?.is_active ? t('active') : t('off')} /> },
          {
            label: t('rate'),
            value: (
              <span className="set-list">
                <StatusDot tone={s.rate_limiters?.is_active ? 'ok' : 'neutral'} label={s.rate_limiters?.is_active ? t('active') : t('off')} />
                <List items={s.rate_limiters?.protocols} />
              </span>
            ),
          },
          { label: t('mfa'), value: <StatusDot tone={s.mfa?.is_active ? 'ok' : 'neutral'} label={s.mfa?.is_active ? t('active') : t('off')} /> },
          { label: t('totpConfigs'), value: <List items={(s.mfa?.totp_configs ?? []).map((c) => `${c.name} (${c.issuer}, ${c.algo})`)} /> },
        ]}
      />
    );
  };

  return (
    <Page>
      <PageHeader title={t('title')} crumbs={[{ label: t('crumb') }]} subtitle={t('subtitle')} />
      <Columns
        main={
          <Card padded>
            <Tabs
              tabs={[
                { id: 'ssh', label: t('ssh') },
                { id: 'ftp', label: t('ftp') },
                { id: 'webdav', label: t('webdav') },
                { id: 'security', label: t('security') },
              ]}
              value={tab}
              onChange={setTab}
            />
            <div className="set-panel">{panel()}</div>
          </Card>
        }
        side={
          <>
            <Card title={t('version')}>
              {version.data ? (
                <KeyValue
                  items={[
                    { label: t('version'), value: <span className="mono">{version.data.version}</span> },
                    { label: t('build'), value: formatDate(version.data.build_date, lang) },
                    { label: t('commit'), value: <span className="mono">{version.data.commit_hash?.slice(0, 12) || '—'}</span> },
                    { label: t('features'), value: <List items={version.data.features} /> },
                  ]}
                />
              ) : (
                <Skeleton height={120} />
              )}
            </Card>
            <Card title={t('editTitle')}>
              <div className="set-stack">
                <p className="muted set-text">{t('editText')}</p>
                <div>
                  <Button icon={ExternalLink} onClick={() => window.open(`${webBase}/admin/configs`, '_blank', 'noopener')}>
                    {t('openClassic')}
                  </Button>
                </div>
              </div>
            </Card>
          </>
        }
      />
    </Page>
  );
}
