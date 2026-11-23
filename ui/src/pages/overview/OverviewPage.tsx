import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, Upload } from 'lucide-react';
import { Button, Card, EmptyState, Skeleton } from '@/components/ui';
import { Page, PageHeader } from '@/app/PageHeader';
import { api } from '@/api/client';
import type { ConnectionStatus, DefenderEntry, ServicesStatus, VersionInfo } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { formatBytes, formatRelative } from '@/lib/format';
import { useLang, useT, type Dict } from '@/lib/i18n';
import { protocolLabel, transferSpeed, useCloseConnection, useConnections } from '../connections/useConnections';
import './overview.css';

/** Design v2 "Activité": who is connected, what is moving, is the server OK — in sentences. */
const dict = {
  fr: {
    title: 'Activité',
    nobody: 'Personne n’est connecté en ce moment.',
    people: '{n} personne connectée',
    peoplePlural: '{n} personnes connectées',
    transfers: ', {n} transfert en cours',
    transfersPlural: ', {n} transferts en cours',
    now: 'En ce moment',
    seeAll: 'Voir le détail des connexions',
    since: 'connecté {when}',
    idle: 'inactif',
    sending: 'envoie',
    receiving: 'télécharge',
    disconnect: 'Couper',
    server: 'Serveur',
    sshOn: 'SFTP répond sur le port {ports}.',
    sshOff: 'SFTP est désactivé.',
    ftpOn: 'FTP répond sur le port {ports}.',
    davOn: 'WebDAV répond sur le port {ports}.',
    otherOff: '{list} {verb} désactivé{s}.',
    is: 'est',
    are: 'sont',
    providerOk: 'La base de données fonctionne.',
    providerKo: 'La base de données a un problème : {err}',
    security: 'Sécurité',
    defenderOn: 'Le Defender bloque automatiquement les adresses suspectes.',
    defenderBanned: ' {n} adresse est bloquée en ce moment.',
    defenderBannedPlural: ' {n} adresses sont bloquées en ce moment.',
    defenderOff: 'Le Defender est désactivé : les tentatives répétées ne sont pas bloquées.',
    mfaOn: 'La double authentification est disponible pour les comptes.',
    version: 'Version {v}',
  },
  en: {
    title: 'Activity',
    nobody: 'Nobody is connected right now.',
    people: '{n} person connected',
    peoplePlural: '{n} people connected',
    transfers: ', {n} transfer in progress',
    transfersPlural: ', {n} transfers in progress',
    now: 'Right now',
    seeAll: 'See connection details',
    since: 'connected {when}',
    idle: 'idle',
    sending: 'uploading',
    receiving: 'downloading',
    disconnect: 'Disconnect',
    server: 'Server',
    sshOn: 'SFTP answers on port {ports}.',
    sshOff: 'SFTP is disabled.',
    ftpOn: 'FTP answers on port {ports}.',
    davOn: 'WebDAV answers on port {ports}.',
    otherOff: '{list} {verb} disabled.',
    is: 'is',
    are: 'are',
    providerOk: 'The database is working.',
    providerKo: 'The database has a problem: {err}',
    security: 'Security',
    defenderOn: 'The Defender automatically blocks suspicious addresses.',
    defenderBanned: ' {n} address is blocked right now.',
    defenderBannedPlural: ' {n} addresses are blocked right now.',
    defenderOff: 'The Defender is disabled: repeated attempts are not blocked.',
    mfaOn: 'Two-factor authentication is available for accounts.',
    version: 'Version {v}',
  },
} satisfies Dict;

function ports(bindings?: { port?: number }[] | null) {
  return (bindings ?? [])
    .map((b) => b.port)
    .filter(Boolean)
    .join(', ');
}

export default function OverviewPage() {
  const t = useT(dict);
  const { lang } = useLang();
  const { can } = useAuth();
  const status = useQuery({ queryKey: ['status'], queryFn: () => api.get<ServicesStatus>('/status'), enabled: can('view_status'), refetchInterval: 30_000 });
  const version = useQuery({ queryKey: ['version'], queryFn: () => api.get<VersionInfo>('/version'), staleTime: Infinity });
  const conns = useConnections({ enabled: can('view_conns'), refetchInterval: 4000 });
  const defender = useQuery({
    queryKey: ['defender', 'hosts'],
    queryFn: () => api.get<DefenderEntry[]>('/defender/hosts'),
    enabled: can('view_defender') && !!status.data?.defender?.is_active,
  });
  const close = useCloseConnection();

  const list = useMemo(() => conns.data ?? [], [conns.data]);
  const people = new Set(list.map((c) => c.username)).size;
  const transferCount = list.reduce((n, c) => n + (c.active_transfers?.length ?? 0), 0);
  const banned = (defender.data ?? []).filter((d) => d.ban_time && Date.parse(d.ban_time) > Date.now()).length;

  const subtitle =
    list.length === 0
      ? t('nobody')
      : (people > 1 ? t('peoplePlural', { n: people }) : t('people', { n: people })) +
        (transferCount ? (transferCount > 1 ? t('transfersPlural', { n: transferCount }) : t('transfers', { n: transferCount })) : '') +
        '.';

  const s = status.data;
  const serverLines: string[] = [];
  if (s) {
    serverLines.push(s.ssh?.is_active ? t('sshOn', { ports: ports(s.ssh.bindings) }) : t('sshOff'));
    if (s.ftp?.is_active) serverLines.push(t('ftpOn', { ports: ports(s.ftp.bindings) }));
    if (s.webdav?.is_active) serverLines.push(t('davOn', { ports: ports(s.webdav.bindings) }));
    const off = [!s.ftp?.is_active && 'FTP', !s.webdav?.is_active && 'WebDAV'].filter(Boolean) as string[];
    if (off.length)
      serverLines.push(
        t('otherOff', { list: off.join(lang === 'fr' ? ' et ' : ' and '), verb: off.length > 1 ? t('are') : t('is'), s: off.length > 1 && lang === 'fr' ? 's' : '' }),
      );
    serverLines.push(s.data_provider?.is_active ? t('providerOk') : t('providerKo', { err: s.data_provider?.error ?? '?' }));
  }

  return (
    <Page>
      <PageHeader title={t('title')} subtitle={subtitle} />
      <div className="ov-layout">
        <Card title={t('now')} actions={list.length ? <Link to="/connections">{t('seeAll')}</Link> : undefined}>
          {conns.isLoading ? (
            <Skeleton height={120} />
          ) : list.length === 0 ? (
            <EmptyState title={t('nobody')} />
          ) : (
            <ul className="ov-people">
              {list.map((c) => (
                <Row key={c.connection_id} c={c} t={t} lang={lang} canClose={can('close_conns')} onClose={(id) => close.mutate(id)} />
              ))}
            </ul>
          )}
        </Card>
        <div className="ov-side">
          <Card title={t('server')}>
            {s ? (
              <div className="ov-text">
                {serverLines.map((l) => (
                  <p key={l}>{l}</p>
                ))}
                {version.data?.version && <p className="muted">{t('version', { v: version.data.version })}</p>}
              </div>
            ) : (
              <Skeleton height={90} />
            )}
          </Card>
          {s && (
            <Card title={t('security')}>
              <div className="ov-text">
                <p>
                  {s.defender?.is_active ? t('defenderOn') : t('defenderOff')}
                  {s.defender?.is_active && banned > 0 && (banned > 1 ? t('defenderBannedPlural', { n: banned }) : t('defenderBanned', { n: banned }))}
                  {s.defender?.is_active && can('view_defender') && (
                    <>
                      {' '}
                      <Link to="/defender">Defender</Link>
                    </>
                  )}
                </p>
                {s.mfa?.is_active && <p>{t('mfaOn')}</p>}
              </div>
            </Card>
          )}
        </div>
      </div>
    </Page>
  );
}

function Row({
  c,
  t,
  lang,
  canClose,
  onClose,
}: {
  c: ConnectionStatus;
  t: ReturnType<typeof useT<keyof typeof dict.fr>>;
  lang: 'fr' | 'en';
  canClose: boolean;
  onClose: (id: string) => void;
}) {
  const tr = c.active_transfers?.[0];
  return (
    <li className="ov-person">
      <span className="ov-avatar" aria-hidden="true">
        {(c.username ?? '?').slice(0, 2).toUpperCase()}
      </span>
      <span className="ov-person__main">
        <Link to={`/users/${encodeURIComponent(c.username ?? '')}`} className="ov-person__name">
          {c.username}
        </Link>
        <span className="muted">
          {protocolLabel(c.protocol)} · {t('since', { when: formatRelative(c.connection_time, lang) })}
        </span>
      </span>
      <span className="ov-person__what">
        {tr ? (
          <>
            {tr.operation_type === 'upload' ? <Upload size={15} aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
            <span>
              {tr.operation_type === 'upload' ? t('sending') : t('receiving')} <strong>{(tr.path ?? '').split('/').pop()}</strong>
              <span className="muted">
                {' '}
                · {formatBytes(tr.size, lang)} · {formatBytes(transferSpeed(tr), lang)}/s
              </span>
            </span>
          </>
        ) : (
          <span className="muted">{t('idle')}</span>
        )}
      </span>
      {canClose && c.connection_id && (
        <Button size="sm" variant="ghost" onClick={() => onClose(c.connection_id!)}>
          {t('disconnect')}
        </Button>
      )}
    </li>
  );
}
