import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Shield, ShieldOff } from 'lucide-react';
import { Badge, Button, Card, DataTable, EmptyState, FilterChips, Input, useConfirm, useToast } from '@/components/ui';
import { Page, PageHeader } from '@/app/PageHeader';
import { api, ApiError } from '@/api/client';
import type { DefenderEntry, ServicesStatus } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { formatDate, formatRelative } from '@/lib/format';
import { useCommon, useLang, useT, type Dict } from '@/lib/i18n';
import './defender.css';

const dict = {
  fr: {
    title: 'Defender',
    crumb: 'Sécurité',
    subtitle: 'Hôtes repérés pour des tentatives suspectes (échecs de connexion, scans…).',
    off: 'Le Defender est désactivé dans la configuration du serveur.',
    offHelp: 'Activez la section « defender » de sftpgo.json pour bloquer automatiquement les adresses malveillantes.',
    all: 'Tous',
    banned: 'Bloqués',
    watched: 'Sous surveillance',
    filter: 'Filtrer par adresse',
    ip: 'Adresse',
    state: 'État',
    score: 'Score',
    until: 'Jusqu’à',
    isBanned: 'Bloqué',
    isWatched: 'Surveillé',
    unban: 'Débloquer',
    unbanTitle: 'Débloquer {ip} ?',
    unbanMsg: 'Son score est remis à zéro et il pourra se reconnecter immédiatement.',
    unbanned: 'Hôte débloqué',
    emptyTitle: 'Aucun hôte suspect',
    emptyText: 'Le Defender n’a repéré aucune adresse pour le moment.',
    rules: 'Règles permanentes',
    rulesText: 'Pour bloquer ou exempter une adresse durablement, ajoutez-la dans la liste « Defender ».',
    rulesLink: 'Ouvrir les listes IP',
    forbidden: 'Vous n’avez pas la permission de voir le Defender.',
  },
  en: {
    title: 'Defender',
    crumb: 'Security',
    subtitle: 'Hosts flagged for suspicious activity (failed logins, scans…).',
    off: 'The Defender is disabled in the server configuration.',
    offHelp: 'Enable the “defender” section of sftpgo.json to automatically block malicious addresses.',
    all: 'All',
    banned: 'Banned',
    watched: 'Watched',
    filter: 'Filter by address',
    ip: 'Address',
    state: 'State',
    score: 'Score',
    until: 'Until',
    isBanned: 'Banned',
    isWatched: 'Watched',
    unban: 'Unban',
    unbanTitle: 'Unban {ip}?',
    unbanMsg: 'Its score is reset and it can reconnect immediately.',
    unbanned: 'Host unbanned',
    emptyTitle: 'No suspicious host',
    emptyText: 'The Defender has not flagged any address yet.',
    rules: 'Permanent rules',
    rulesText: 'To block or exempt an address permanently, add it to the “Defender” list.',
    rulesLink: 'Open IP lists',
    forbidden: 'You do not have permission to view the Defender.',
  },
} satisfies Dict;

function isBanned(e: DefenderEntry) {
  return !!e.ban_time && Date.parse(e.ban_time) > Date.now();
}

export default function DefenderPage() {
  const t = useT(dict);
  const c = useCommon();
  const { lang } = useLang();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [view, setView] = useState('all');
  const [q, setQ] = useState('');
  const allowed = can('view_defender') || can('manage_defender');

  const status = useQuery({ queryKey: ['status'], queryFn: () => api.get<ServicesStatus>('/status'), enabled: can('view_status') });
  const hosts = useQuery({
    queryKey: ['defender', 'hosts'],
    queryFn: () => api.get<DefenderEntry[]>('/defender/hosts'),
    enabled: allowed,
    refetchInterval: 15_000,
  });
  const unban = useMutation({
    mutationFn: (e: DefenderEntry) => api.del(`/defender/hosts/${encodeURIComponent(e.id ?? '')}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['defender'] }),
  });

  const all = useMemo(() => hosts.data ?? [], [hosts.data]);
  const banned = all.filter(isBanned);
  const rows = all
    .filter((e) => (view === 'all' ? true : view === 'banned' ? isBanned(e) : !isBanned(e)))
    .filter((e) => !q || (e.ip ?? '').startsWith(q.trim()))
    .sort((a, b) => Number(isBanned(b)) - Number(isBanned(a)) || (b.score ?? 0) - (a.score ?? 0));

  if (!allowed) {
    return (
      <Page>
        <PageHeader title={t('title')} crumbs={[{ label: t('crumb') }]} />
        <EmptyState icon={Shield} title={t('title')} description={t('forbidden')} />
      </Page>
    );
  }

  const doUnban = async (e: DefenderEntry) => {
    if (!(await confirm({ title: t('unbanTitle', { ip: e.ip ?? '' }), message: t('unbanMsg'), confirmLabel: t('unban') }))) return;
    try {
      await unban.mutateAsync(e);
      toast({ title: t('unbanned'), tone: 'ok' });
    } catch (err) {
      toast({ title: c('error'), description: err instanceof ApiError ? err.message : String(err), tone: 'bad' });
    }
  };

  const defenderOff = status.data && !status.data.defender?.is_active;

  return (
    <Page>
      <PageHeader
        title={t('title')}
        crumbs={[{ label: t('crumb') }]}
        subtitle={t('subtitle')}
        actions={
          <Button icon={RefreshCw} onClick={() => void hosts.refetch()} loading={hosts.isFetching}>
            {c('refresh')}
          </Button>
        }
      />
      {defenderOff ? (
        <EmptyState icon={ShieldOff} title={t('off')} description={t('offHelp')} />
      ) : (
        <>
          <div className="def-toolbar">
            <FilterChips
              chips={[
                { id: 'all', label: t('all'), count: all.length },
                { id: 'banned', label: t('banned'), count: banned.length, tone: 'bad' },
                { id: 'watched', label: t('watched'), count: all.length - banned.length, tone: 'warn' },
              ]}
              value={view}
              onChange={setView}
            />
            <div className="def-search">
              <Input aria-label={t('filter')} placeholder={t('filter')} value={q} onChange={(e) => setQ(e.target.value)} mono />
            </div>
          </div>
          <DataTable<DefenderEntry>
            rows={rows}
            rowKey={(e) => e.id ?? e.ip ?? ''}
            loading={hosts.isLoading}
            empty={<EmptyState icon={Shield} title={t('emptyTitle')} description={t('emptyText')} />}
            columns={[
              { id: 'ip', header: t('ip'), cell: (e) => <span className="mono def-ip">{e.ip}</span> },
              {
                id: 'state',
                header: t('state'),
                cell: (e) => (isBanned(e) ? <Badge tone="bad">{t('isBanned')}</Badge> : <Badge tone="warn">{t('isWatched')}</Badge>),
              },
              { id: 'score', header: t('score'), align: 'right', cell: (e) => <span className="mono">{e.score ?? 0}</span> },
              {
                id: 'until',
                header: t('until'),
                cell: (e) =>
                  isBanned(e) ? (
                    <span className="muted">
                      {formatDate(Date.parse(e.ban_time!), lang)} · {formatRelative(Date.parse(e.ban_time!), lang)}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  ),
              },
              {
                id: 'actions',
                header: '',
                align: 'right',
                cell: (e) =>
                  can('manage_defender') ? (
                    <Button size="sm" variant="ghost" onClick={() => void doUnban(e)}>
                      {t('unban')}
                    </Button>
                  ) : null,
              },
            ]}
          />
          <Card title={t('rules')}>
            <p className="muted def-rules">
              {t('rulesText')} <Link to="/iplists?list=2">{t('rulesLink')}</Link>
            </p>
          </Card>
        </>
      )}
    </Page>
  );
}
