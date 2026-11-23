import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { KeyRound, Link2, Link2Off, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge, Button, Card, DataTable, EmptyState, FilterChips, KeyValue, Skeleton } from '@/components/ui';
import { Page, PageHeader } from '@/app/PageHeader';
import { api, ApiError } from '@/api/client';
import type { SignedFilesEvent, SignedFilesSite, SignedFilesStatus } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { formatDate, formatDuration, formatNumber, formatRelative } from '@/lib/format';
import { useCommon, useLang, useT, type Dict } from '@/lib/i18n';
import './signedfiles.css';

const dict = {
  fr: {
    title: 'Fichiers signés',
    crumb: 'Sécurité',
    subtitle: 'Dossiers servis en lecture seule derrière une URL signée. Lecture seule : la configuration se fait dans sftpgo.json.',
    forbidden: 'Seuls les super-administrateurs peuvent voir les fichiers signés.',
    off: 'Le serveur de fichiers signés est désactivé.',
    offHelp: 'Renseignez bind_port et au moins un site dans la section « signed_files » de sftpgo.json, puis redémarrez SFTPGo.',
    server: 'Serveur',
    listening: 'Écoute',
    since: 'Démarré',
    unknownHost: 'Domaines inconnus',
    unknownHostHint: '{n} requête(s) pour un domaine sans site',
    sites: 'Sites',
    host: 'Domaine',
    anyHost: 'Tous les autres domaines',
    root: 'Dossier',
    mode: 'Mode',
    enforce: 'Appliqué',
    observe: 'Observation',
    modeOff: 'Sans vérification',
    maxTtl: 'Durée max.',
    keys: 'Clés',
    keyCurrent: 'Clé courante',
    keyRotation: 'Ancienne clé acceptée',
    served: 'Servies',
    refused: 'Refusées',
    wouldRefuse: 'À refuser',
    counters: 'Depuis le démarrage',
    events: 'Derniers refus',
    eventsHint: 'Les 200 derniers, en mémoire : vidés au redémarrage. La signature n’est jamais conservée.',
    all: 'Tous',
    evRefused: 'Refusé',
    evObserve: 'Aurait été refusé',
    evUnknown: 'Domaine inconnu',
    time: 'Heure',
    outcome: 'Résultat',
    path: 'Chemin',
    user: 'Utilisateur (u)',
    reason: 'Motif',
    status: 'Statut',
    from: 'Origine',
    emptyTitle: 'Aucun refus',
    emptyText: 'Aucune requête refusée depuis le démarrage.',
    keysNote: 'Les clés ne sont jamais affichées ni renvoyées par l’API.',
    r_missing_exp: 'exp manquant',
    r_missing_u: 'u manquant',
    r_missing_sig: 'sig manquante',
    r_duplicate_exp: 'exp en double',
    r_duplicate_u: 'u en double',
    r_duplicate_sig: 'sig en double',
    r_malformed_query: 'Paramètres illisibles',
    r_malformed_exp: 'exp mal formé',
    r_malformed_u: 'u mal formé',
    r_malformed_sig: 'sig mal formée',
    r_expired: 'Lien expiré',
    r_exp_too_far: 'Expiration trop lointaine',
    r_bad_path: 'Chemin interdit',
    r_bad_signature: 'Signature invalide',
  },
  en: {
    title: 'Signed files',
    crumb: 'Security',
    subtitle: 'Directories served read-only behind a signed URL. Read-only: configure them in sftpgo.json.',
    forbidden: 'Only super administrators can view signed files.',
    off: 'The signed files server is disabled.',
    offHelp: 'Set bind_port and at least one site in the “signed_files” section of sftpgo.json, then restart SFTPGo.',
    server: 'Server',
    listening: 'Listening',
    since: 'Started',
    unknownHost: 'Unknown hosts',
    unknownHostHint: '{n} request(s) for a host without a site',
    sites: 'Sites',
    host: 'Host',
    anyHost: 'Any other host',
    root: 'Directory',
    mode: 'Mode',
    enforce: 'Enforced',
    observe: 'Observe',
    modeOff: 'No check',
    maxTtl: 'Max TTL',
    keys: 'Keys',
    keyCurrent: 'Current key',
    keyRotation: 'Previous key accepted',
    served: 'Served',
    refused: 'Refused',
    wouldRefuse: 'Would refuse',
    counters: 'Since the start',
    events: 'Recent refusals',
    eventsHint: 'The last 200, kept in memory: cleared on restart. The signature is never kept.',
    all: 'All',
    evRefused: 'Refused',
    evObserve: 'Would be refused',
    evUnknown: 'Unknown host',
    time: 'Time',
    outcome: 'Outcome',
    path: 'Path',
    user: 'User (u)',
    reason: 'Reason',
    status: 'Status',
    from: 'From',
    emptyTitle: 'No refusal',
    emptyText: 'No request was refused since the start.',
    keysNote: 'Keys are never displayed nor returned by the API.',
    r_missing_exp: 'Missing exp',
    r_missing_u: 'Missing u',
    r_missing_sig: 'Missing sig',
    r_duplicate_exp: 'Duplicate exp',
    r_duplicate_u: 'Duplicate u',
    r_duplicate_sig: 'Duplicate sig',
    r_malformed_query: 'Unreadable parameters',
    r_malformed_exp: 'Malformed exp',
    r_malformed_u: 'Malformed u',
    r_malformed_sig: 'Malformed sig',
    r_expired: 'Link expired',
    r_exp_too_far: 'Expiry too far',
    r_bad_path: 'Forbidden path',
    r_bad_signature: 'Invalid signature',
  },
} satisfies Dict;

type Key = keyof typeof dict.fr;

function ModeBadge({ mode, t }: { mode?: string; t: (k: Key) => string }) {
  if (mode === 'enforce') return <Badge tone="ok" dot>{t('enforce')}</Badge>;
  if (mode === 'observe') return <Badge tone="warn" dot>{t('observe')}</Badge>;
  return <Badge tone="bad" dot>{t('modeOff')}</Badge>;
}

function OutcomeBadge({ outcome, t }: { outcome?: string; t: (k: Key) => string }) {
  if (outcome === 'refused') return <Badge tone="bad">{t('evRefused')}</Badge>;
  if (outcome === 'observe-would-refuse') return <Badge tone="warn">{t('evObserve')}</Badge>;
  return <Badge tone="neutral">{t('evUnknown')}</Badge>;
}

export default function SignedFilesPage() {
  const t = useT(dict);
  const c = useCommon();
  const { lang } = useLang();
  const { can } = useAuth();
  const [view, setView] = useState('all');
  const allowed = can('*');

  const status = useQuery({
    queryKey: ['signedfiles', 'status'],
    queryFn: () => api.get<SignedFilesStatus>('/signedfiles/status'),
    enabled: allowed,
    refetchInterval: 15_000,
  });

  if (!allowed) {
    return (
      <Page>
        <PageHeader title={t('title')} crumbs={[{ label: t('crumb') }]} />
        <EmptyState icon={Link2} title={t('title')} description={t('forbidden')} />
      </Page>
    );
  }

  const reason = (code?: string) => {
    const key = `r_${code ?? ''}` as Key;
    return key in dict.fr ? t(key) : (code ?? '');
  };

  const s = status.data;
  const events = s?.recent_events ?? [];
  const count = (o: string) => events.filter((e) => e.outcome === o).length;
  const rows = view === 'all' ? events : events.filter((e) => e.outcome === view);

  const body = () => {
    if (status.error) {
      return (
        <EmptyState
          icon={Link2Off}
          title={c('error')}
          description={status.error instanceof ApiError ? status.error.message : String(status.error)}
        />
      );
    }
    if (!s) return <Skeleton height={240} />;
    if (!s.enabled) return <EmptyState icon={Link2Off} title={t('off')} description={t('offHelp')} />;
    const started = s.started_at ? Date.parse(s.started_at) : undefined;
    return (
      <>
        <Card title={t('server')}>
          <KeyValue
            columns={2}
            labelWidth={140}
            items={[
              { label: t('listening'), value: s.bind_address, mono: true },
              {
                label: t('since'),
                value: started ? `${formatRelative(started, lang)} · ${formatDate(started, lang)}` : '—',
              },
              {
                label: t('unknownHost'),
                value: <span className="mono">{formatNumber(s.unknown_host ?? 0, lang)}</span>,
              },
            ]}
          />
        </Card>

        <Card title={t('sites')} description={t('counters')} padded={false}>
          <DataTable<SignedFilesSite>
            rows={s.sites ?? []}
            rowKey={(x) => x.host || '*'}
            columns={[
              {
                id: 'host',
                header: t('host'),
                cell: (x) => (x.host ? <span className="mono sf-host">{x.host}</span> : <span className="muted">{t('anyHost')}</span>),
              },
              { id: 'mode', header: t('mode'), cell: (x) => <ModeBadge mode={x.mode} t={t} /> },
              {
                id: 'ttl',
                header: t('maxTtl'),
                cell: (x) => <span className="mono">{formatDuration(x.max_ttl ?? 0, lang)}</span>,
              },
              {
                id: 'keys',
                header: t('keys'),
                cell: (x) =>
                  x.mode === 'off' ? (
                    <span className="muted">—</span>
                  ) : x.has_previous_key ? (
                    <Badge tone="warn" icon={KeyRound}>
                      {t('keyRotation')}
                    </Badge>
                  ) : (
                    <Badge tone="neutral" icon={KeyRound}>
                      {t('keyCurrent')}
                    </Badge>
                  ),
              },
              { id: 'served', header: t('served'), align: 'right', cell: (x) => <span className="mono">{formatNumber(x.served ?? 0, lang)}</span> },
              {
                id: 'refused',
                header: t('refused'),
                align: 'right',
                cell: (x) => <span className={`mono${x.refused ? ' sf-bad' : ''}`}>{formatNumber(x.refused ?? 0, lang)}</span>,
              },
              {
                id: 'would',
                header: t('wouldRefuse'),
                align: 'right',
                cell: (x) => <span className={`mono${x.would_refuse ? ' sf-warn' : ''}`}>{formatNumber(x.would_refuse ?? 0, lang)}</span>,
              },
              { id: 'root', header: t('root'), cell: (x) => <span className="mono sf-path">{x.root}</span> },
            ]}
          />
        </Card>

        <div className="sf-events-head">
          <div>
            <h2 className="sf-h2">{t('events')}</h2>
            <p className="muted sf-hint">{t('eventsHint')}</p>
          </div>
          <FilterChips
            aria-label={t('outcome')}
            value={view}
            onChange={setView}
            chips={[
              { id: 'all', label: t('all'), count: events.length },
              { id: 'refused', label: t('evRefused'), count: count('refused'), tone: 'bad' },
              { id: 'observe-would-refuse', label: t('evObserve'), count: count('observe-would-refuse'), tone: 'warn' },
              { id: 'unknown-host', label: t('evUnknown'), count: count('unknown-host') },
            ]}
          />
        </div>
        <DataTable<SignedFilesEvent>
          rows={rows}
          rowKey={(e) => `${e.time}-${e.remote_addr}-${e.path}-${e.reason}`}
          dense
          maxHeight={560}
          empty={<EmptyState icon={ShieldCheck} title={t('emptyTitle')} description={t('emptyText')} compact />}
          columns={[
            {
              id: 'time',
              header: t('time'),
              cell: (e) => {
                const ms = Date.parse(e.time ?? '');
                return (
                  <span className="sf-time">
                    <span>{formatRelative(ms, lang)}</span>
                    <span className="muted mono">{formatDate(ms, lang)}</span>
                  </span>
                );
              },
            },
            { id: 'outcome', header: t('outcome'), cell: (e) => <OutcomeBadge outcome={e.outcome} t={t} /> },
            {
              id: 'reason',
              header: t('reason'),
              cell: (e) =>
                e.reason ? (
                  <span className="sf-reason">
                    <span>{reason(e.reason)}</span>
                    <span className="muted mono">{e.reason}</span>
                  </span>
                ) : (
                  <span className="muted">—</span>
                ),
            },
            {
              id: 'path',
              header: t('path'),
              cell: (e) => (
                <span className="sf-reason">
                  <span className="mono sf-path">{e.path}</span>
                  <span className="muted mono">
                    {e.method} · {e.host}
                  </span>
                </span>
              ),
            },
            { id: 'u', header: t('user'), cell: (e) => (e.u ? <span className="mono">{e.u}</span> : <span className="muted">—</span>) },
            { id: 'status', header: t('status'), align: 'right', cell: (e) => <span className="mono">{e.status}</span> },
            {
              id: 'from',
              header: t('from'),
              cell: (e) => (
                <span className="sf-reason">
                  <span className="mono">{e.forwarded_for || e.remote_addr}</span>
                  {e.forwarded_for ? <span className="muted mono">{e.remote_addr}</span> : null}
                </span>
              ),
            },
          ]}
        />
        <p className="muted sf-hint">{t('keysNote')}</p>
      </>
    );
  };

  return (
    <Page>
      <PageHeader
        title={t('title')}
        crumbs={[{ label: t('crumb') }]}
        subtitle={t('subtitle')}
        actions={
          <Button icon={RefreshCw} onClick={() => void status.refetch()} loading={status.isFetching}>
            {c('refresh')}
          </Button>
        }
      />
      {body()}
    </Page>
  );
}
