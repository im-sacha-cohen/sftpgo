import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Download, Pause, Play, Plug, Upload } from 'lucide-react';
import { Badge, Button, DataTable, EmptyState, FilterChips, Input, useConfirm, useToast } from '@/components/ui';
import { Page, PageHeader } from '@/app/PageHeader';
import { ApiError } from '@/api/client';
import type { ConnectionStatus } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { formatBytes, formatDuration, formatRelative } from '@/lib/format';
import { useCommon, useLang, useT, type Dict } from '@/lib/i18n';
import { protocolLabel, transferSpeed, useCloseConnection, useConnections } from './useConnections';
import './connections.css';

export const dict = {
  fr: {
    title: 'Connexions',
    crumb: 'Serveur',
    subtitle: '{n} connexions · {t} transferts en cours',
    live: 'En direct',
    paused: 'En pause',
    pause: 'Mettre en pause',
    resume: 'Reprendre',
    filter: 'Filtrer par compte ou adresse IP',
    user: 'Compte',
    protocol: 'Protocole',
    address: 'Adresse',
    since: 'Connecté',
    activity: 'Activité',
    transfers: 'Transferts',
    idle: 'Inactif',
    close: 'Couper',
    closeTitle: 'Couper la connexion de {user} ?',
    closeMsg: 'Les transferts en cours seront interrompus.',
    closed: 'Connexion coupée',
    emptyTitle: 'Aucune connexion',
    emptyText: 'Personne n’est connecté pour le moment.',
    noMatch: 'Aucune connexion ne correspond au filtre.',
    forbidden: 'Vous n’avez pas la permission de voir les connexions.',
  },
  en: {
    title: 'Connections',
    crumb: 'Server',
    subtitle: '{n} connections · {t} active transfers',
    live: 'Live',
    paused: 'Paused',
    pause: 'Pause',
    resume: 'Resume',
    filter: 'Filter by account or IP address',
    user: 'Account',
    protocol: 'Protocol',
    address: 'Address',
    since: 'Connected',
    activity: 'Activity',
    transfers: 'Transfers',
    idle: 'Idle',
    close: 'Disconnect',
    closeTitle: 'Disconnect {user}?',
    closeMsg: 'Transfers in progress will be interrupted.',
    closed: 'Connection closed',
    emptyTitle: 'No connections',
    emptyText: 'Nobody is connected right now.',
    noMatch: 'No connection matches the filter.',
    forbidden: 'You do not have permission to view connections.',
  },
} satisfies Dict;

export default function ConnectionsPage() {
  const t = useT(dict);
  const c = useCommon();
  const { lang } = useLang();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [paused, setPaused] = useState(false);
  const [proto, setProto] = useState('all');
  const [q, setQ] = useState('');
  const allowed = can('view_conns');
  const query = useConnections({ enabled: allowed, refetchInterval: paused ? false : 3000 });
  const closeConn = useCloseConnection();
  const conns = useMemo(() => query.data ?? [], [query.data]);

  const protocols = useMemo(() => {
    const m = new Map<string, number>();
    conns.forEach((x) => m.set(protocolLabel(x.protocol), (m.get(protocolLabel(x.protocol)) ?? 0) + 1));
    return m;
  }, [conns]);

  const rows = conns.filter(
    (x) =>
      (proto === 'all' || protocolLabel(x.protocol) === proto) &&
      (!q || `${x.username} ${x.remote_address}`.toLowerCase().includes(q.toLowerCase())),
  );
  const transferCount = conns.reduce((n, x) => n + (x.active_transfers?.length ?? 0), 0);

  if (!allowed) {
    return (
      <Page>
        <PageHeader title={t('title')} crumbs={[{ label: t('crumb') }]} />
        <EmptyState icon={Plug} title={t('title')} description={t('forbidden')} />
      </Page>
    );
  }

  const doClose = async (x: ConnectionStatus) => {
    if (!x.connection_id) return;
    const ok = await confirm({ title: t('closeTitle', { user: x.username ?? '' }), message: t('closeMsg'), confirmLabel: t('close'), danger: true });
    if (!ok) return;
    try {
      await closeConn.mutateAsync(x.connection_id);
      toast({ title: t('closed'), tone: 'ok' });
    } catch (e) {
      toast({ title: c('error'), description: e instanceof ApiError ? e.message : String(e), tone: 'bad' });
    }
  };

  return (
    <Page>
      <PageHeader
        title={t('title')}
        crumbs={[{ label: t('crumb') }]}
        subtitle={t('subtitle', { n: conns.length, t: transferCount })}
        actions={
          <Button icon={paused ? Play : Pause} onClick={() => setPaused((p) => !p)}>
            {paused ? t('resume') : t('pause')}
          </Button>
        }
      />
      <div className="conns-toolbar">
        <span className={paused ? 'conns-live is-paused' : 'conns-live'}>
          <span aria-hidden="true" />
          {paused ? t('paused') : t('live')}
        </span>
        <FilterChips
          chips={[
            { id: 'all', label: c('all'), count: conns.length },
            ...[...protocols.entries()].map(([p, n]) => ({ id: p, label: p, count: n })),
          ]}
          value={proto}
          onChange={setProto}
        />
        <div className="conns-search">
          <Input aria-label={t('filter')} placeholder={t('filter')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <DataTable<ConnectionStatus>
        rows={rows}
        rowKey={(x) => x.connection_id ?? `${x.username}-${x.connection_time}`}
        loading={query.isLoading}
        empty={
          conns.length === 0 ? (
            <EmptyState icon={Activity} title={t('emptyTitle')} description={t('emptyText')} />
          ) : (
            <EmptyState icon={Activity} title={t('noMatch')} />
          )
        }
        columns={[
          {
            id: 'user',
            header: t('user'),
            cell: (x) => (
              <Link to={`/users/${encodeURIComponent(x.username ?? '')}`} className="mono conns-user">
                {x.username}
              </Link>
            ),
          },
          { id: 'proto', header: t('protocol'), cell: (x) => <Badge mono>{protocolLabel(x.protocol)}</Badge> },
          {
            id: 'addr',
            header: t('address'),
            cell: (x) => (
              <span className="mono muted">
                {x.remote_address}
                {x.client_version ? <span className="conns-client"> · {x.client_version}</span> : null}
              </span>
            ),
          },
          { id: 'since', header: t('since'), cell: (x) => <span className="muted">{formatRelative(x.connection_time, lang)}</span> },
          {
            id: 'transfers',
            header: t('transfers'),
            cell: (x) =>
              x.active_transfers?.length ? (
                <div className="conns-transfers">
                  {x.active_transfers.map((tr, i) => (
                    <span key={i} className="conns-transfer">
                      {tr.operation_type === 'upload' ? <Upload size={13} aria-hidden="true" /> : <Download size={13} aria-hidden="true" />}
                      <span className="mono conns-path">{tr.path}</span>
                      <span className="mono muted">
                        {formatBytes(tr.size, lang)} · {formatBytes(transferSpeed(tr), lang)}/s ·{' '}
                        {formatDuration(((Date.now() - (tr.start_time ?? Date.now())) / 1000) | 0, lang)}
                      </span>
                    </span>
                  ))}
                </div>
              ) : (
                <span className="muted">{x.command ? <span className="mono">{x.command}</span> : t('idle')}</span>
              ),
          },
          { id: 'activity', header: t('activity'), cell: (x) => <span className="muted">{formatRelative(x.last_activity, lang)}</span> },
          {
            id: 'actions',
            header: '',
            align: 'right',
            cell: (x) =>
              can('close_conns') ? (
                <Button size="sm" variant="ghost" onClick={(e) => (e.stopPropagation(), void doClose(x))}>
                  {t('close')}
                </Button>
              ) : null,
          },
        ]}
      />
    </Page>
  );
}
