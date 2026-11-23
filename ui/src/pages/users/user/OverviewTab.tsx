import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Unplug, UsersRound } from 'lucide-react';
import { api } from '@/api/client';
import type { ConnectionStatus, FsEvent, Group, Permission, User } from '@/api/types';
import { Columns } from '@/app/PageHeader';
import { Badge, Button, Card, KeyValue, ProgressBar, StatusDot, useConfirm, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatBytes, formatDate, formatNumber, formatRelative } from '@/lib/format';
import { useCommon, useLang, useT } from '@/lib/i18n';
import { useCloseConnection } from '../api';
import { dict } from '../i18n';
import { inheritedPermissions, PROTOCOL_LABEL, PROTOCOLS, sortPaths, storageLocation } from '../model';
import { ProtocolPills, protoLabel, StorageCell, UserStatus } from '../parts';

interface Props {
  user: User;
  isNew: boolean;
  conns: ConnectionStatus[] | undefined;
  groups: Group[] | undefined;
}

function joinWords(words: ReactNode[], and: string): ReactNode {
  return words.map((w, i) => (
    <Fragment key={i}>
      {i > 0 && (i === words.length - 1 ? ` ${and} ` : ', ')}
      {w}
    </Fragment>
  ));
}

/** "partenaire-acme peut lire dans s3://acme-exchange/in, tout faire dans /in, via SFTP et WebDAV, …" */
function PlainSummary({ user, groups }: { user: User; groups: Group[] | undefined }) {
  const t = useT(dict);
  const { lang } = useLang();
  const mappings = (user.groups ?? []).filter((m) => m.type === 1 || m.type === 2);

  // effective permissions: the user's own, completed (or "/" replaced) by groups
  const eff: Record<string, Permission[]> = { ...(user.permissions ?? {}) };
  for (const i of inheritedPermissions(user.permissions ?? {}, user.groups ?? [], groups ?? [])) eff[i.path] = i.perms;
  // effective protocols: denials are additive across groups
  const denied = new Set(user.filters?.denied_protocols ?? []);
  for (const m of mappings) groups?.find((g) => g.name === m.name)?.user_settings?.filters?.denied_protocols?.forEach((p) => denied.add(p));

  const verbsOf = (list: Permission[] | undefined) => {
    const perms = new Set(list ?? []);
    if (perms.has('*')) return [t('verbAll')];
    const v: string[] = [];
    if (perms.has('list') || perms.has('download')) v.push(t('verbRead'));
    if (perms.has('upload')) v.push(t('verbUpload'));
    if ((['overwrite', 'rename', 'rename_files', 'rename_dirs'] as Permission[]).some((p) => perms.has(p))) v.push(t('verbModify'));
    if ((['delete', 'delete_files', 'delete_dirs'] as Permission[]).some((p) => perms.has(p))) v.push(t('verbDelete'));
    if (perms.has('create_dirs')) v.push(t('verbMkdir'));
    return v;
  };

  const loc = storageLocation(user.filesystem, user.home_dir, true);
  const clauses = sortPaths(Object.keys(eff))
    .map((path) => ({ path, verbs: verbsOf(eff[path]) }))
    .filter((c) => c.verbs.length);
  const rootVerbs = verbsOf(eff['/']).join('|');
  const [main, ...rest] = clauses;
  const extras = rest.filter((c) => c.verbs.join('|') !== rootVerbs);
  const name = <strong className="mono">{user.username || '…'}</strong>;
  const protos = PROTOCOLS.filter((p) => !denied.has(p)).map((p) => <strong key={p}>{PROTOCOL_LABEL[p]}</strong>);
  const where = (path: string) => (path === '/' ? loc || '/' : loc ? `${loc.replace(/\/$/, '')}${path}` : path);

  const tail: ReactNode[] = extras.map((c) => (
    <>
      <strong>{joinWords(c.verbs, t('and'))}</strong> {t('inWord')} <code>{c.path}</code>
    </>
  ));
  const ips = user.filters?.allowed_ip?.length ?? 0;
  if (ips) tail.push(t('plainFromIps', { n: ips }));
  tail.push(user.quota_size ? t('plainQuota', { q: formatBytes(user.quota_size, lang) }) : t('plainNoQuota'));
  if (user.expiration_date) tail.push(t('plainExpires', { date: formatDate(user.expiration_date, lang, false) }));

  const parts = t('plainCan', { user: '\u0001', verbs: '\u0002', where: '\u0003', protocols: '\u0004' }).split(/([\u0001-\u0004])/);
  const slot: Record<string, ReactNode> = main
    ? {
        '\u0001': name,
        '\u0002': <strong>{joinWords(main.verbs, t('and'))}</strong>,
        '\u0003': <code>{where(main.path)}</code>,
        '\u0004': protos.length ? joinWords(protos, t('and')) : t('plainNoProto'),
      }
    : {};

  return (
    <div className="users-stack">
      <p className="users-plain">
        {!main ? (
          t('plainNothing', { user: user.username || '…' })
        ) : (
          <>
            {parts.map((p, i) => (
              <Fragment key={i}>{slot[p] ?? p}</Fragment>
            ))}
            {tail.map((x, i) => (
              <Fragment key={i}>, {x}</Fragment>
            ))}
            .
          </>
        )}
      </p>
      {user.status === 0 && <Badge tone="warn">{t('plainDisabled')}</Badge>}
    </div>
  );
}

function Sessions({ conns }: { conns: ConnectionStatus[] }) {
  const t = useT(dict);
  const { lang } = useLang();
  const { can } = useAuth();
  const confirm = useConfirm();
  const toast = useToast();
  const close = useCloseConnection();
  if (!conns.length) return <p className="muted users-small">{t('noSession')}</p>;
  return (
    <div>
      {conns.map((c) => (
        <div key={c.connection_id} className="users-session">
          <div className="users-session__head">
            <StatusDot tone="ok" pulse label={protoLabel(c.protocol)} />
            <span className="users-session__meta">{c.remote_address}</span>
            <span className="users-grow" />
            {can('close_conns') && (
              <Button
                size="sm"
                variant="danger"
                icon={Unplug}
                loading={close.isPending && close.variables === c.connection_id}
                onClick={async () => {
                  const ok = await confirm({
                    title: t('cutConfirm', { proto: protoLabel(c.protocol), ip: c.remote_address ?? '' }),
                    confirmLabel: t('cut'),
                    danger: true,
                  });
                  if (!ok) return;
                  close.mutate(c.connection_id!, {
                    onSuccess: () => toast({ title: t('cutDone'), tone: 'ok' }),
                    onError: (e) => toast({ title: e.message, tone: 'bad' }),
                  });
                }}
              >
                {t('cut')}
              </Button>
            )}
          </div>
          <span className="users-session__meta">
            {t('since', { t: formatRelative(c.connection_time, lang) })}
            {c.client_version ? ` · ${c.client_version}` : ''}
            {c.command ? ` · ${c.command}` : ''}
          </span>
          {(c.active_transfers ?? []).map((tr, i) => (
            <div key={i} className="users-session__transfer">
              <span className="users-session__path">
                {tr.operation_type === 'upload' ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />}{' '}
                {tr.path}
              </span>
              <ProgressBar value={1} max={1} size="sm" tone="accent" valueText={formatBytes(tr.size ?? 0, lang)} showValue />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function RecentActivity({ username }: { username: string }) {
  const t = useT(dict);
  const { lang } = useLang();
  const { can } = useAuth();
  const q = useQuery({
    queryKey: ['events', 'fs', username],
    queryFn: () => api.get<FsEvent[]>('/events/fs', { username, limit: 8, order: 'DESC' }),
    enabled: can('view_events') && !!username,
    retry: false,
  });
  // no events searcher plugin (501) or no permission: hide the card
  if (!q.data?.length) return null;
  return (
    <Card title={t('recentActivity')}>
      <ul className="users-grouplist">
        {q.data.map((e) => (
          <li key={e.id}>
            <Badge tone={e.status === 1 ? 'ok' : 'bad'} mono>
              {e.action}
            </Badge>
            <span className="users-session__path users-grow">{e.virtual_path}</span>
            <span className="muted users-small">{formatRelative(Math.round((e.timestamp ?? 0) / 1e6), lang)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function OverviewTab({ user, isNew, conns, groups }: Props) {
  const t = useT(dict);
  const c = useCommon();
  const { lang } = useLang();
  const used = user.used_quota_size ?? 0;
  const tfa = !!(user.filters?.totp_config as { enabled?: boolean } | undefined)?.enabled;

  const usage = (
    <Card title={t('usage')}>
      <div className="users-metrics">
        <div className="users-metric">
          <span className="users-metric__label">{t('storage')}</span>
          <span className="users-metric__value">{formatBytes(used, lang)}</span>
          {user.quota_size ? (
            <>
              <ProgressBar value={used} max={user.quota_size} size="sm" label={t('storage')} />
              <span className="users-metric__sub">/ {formatBytes(user.quota_size, lang)}</span>
            </>
          ) : (
            <span className="users-metric__sub">{c('unlimited')}</span>
          )}
        </div>
        <div className="users-metric">
          <span className="users-metric__label">{t('files')}</span>
          <span className="users-metric__value">{formatNumber(user.used_quota_files ?? 0, lang)}</span>
          {user.quota_files ? (
            <>
              <ProgressBar value={user.used_quota_files ?? 0} max={user.quota_files} size="sm" label={t('files')} />
              <span className="users-metric__sub">/ {formatNumber(user.quota_files, lang)}</span>
            </>
          ) : (
            <span className="users-metric__sub">{c('unlimited')}</span>
          )}
        </div>
        <div className="users-metric">
          <span className="users-metric__label">{t('uploaded')}</span>
          <span className="users-metric__value">{formatBytes(user.used_upload_data_transfer ?? 0, lang)}</span>
          <span className="users-metric__sub">
            {user.total_data_transfer
              ? `/ ${formatBytes(user.total_data_transfer * 1024 * 1024, lang)}`
              : user.upload_data_transfer
                ? `/ ${formatBytes(user.upload_data_transfer * 1024 * 1024, lang)}`
                : c('unlimited')}
          </span>
        </div>
        <div className="users-metric">
          <span className="users-metric__label">{t('downloaded')}</span>
          <span className="users-metric__value">{formatBytes(user.used_download_data_transfer ?? 0, lang)}</span>
          <span className="users-metric__sub">
            {user.download_data_transfer && !user.total_data_transfer
              ? `/ ${formatBytes(user.download_data_transfer * 1024 * 1024, lang)}`
              : user.total_data_transfer
                ? t('totalTransfer')
                : c('unlimited')}
          </span>
        </div>
      </div>
    </Card>
  );

  const groupTypeLabel = (type?: number) => (type === 1 ? t('gtPrimary') : type === 3 ? t('gtMembership') : t('gtSecondary'));

  return (
    <Columns
      main={
        <>
          <Card title={t('plainTitle')}>
            <PlainSummary user={user} groups={groups} />
          </Card>
          {!isNew && usage}
          <Card title={t('groups')}>
            {(user.groups ?? []).length === 0 ? (
              <p className="muted users-small">{t('noGroup')}</p>
            ) : (
              <ul className="users-grouplist">
                {(user.groups ?? []).map((g) => (
                  <li key={g.name}>
                    <UsersRound size={14} aria-hidden="true" className="muted" />
                    <Link className="mono" to={`/groups/${encodeURIComponent(g.name ?? '')}`}>
                      {g.name}
                    </Link>
                    <Badge tone={g.type === 1 ? 'accent' : 'neutral'}>{groupTypeLabel(g.type)}</Badge>
                    <span className="muted users-small">{groups?.find((x) => x.name === g.name)?.description}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {!isNew && <RecentActivity username={user.username ?? ''} />}
        </>
      }
      side={
        <>
          <Card title={t('summary')}>
            <KeyValue
              labelWidth={130}
              items={[
                ...(!isNew ? [{ label: c('status'), value: <UserStatus user={user} conns={conns} /> }] : []),
                { label: t('storage'), value: <StorageCell user={user} /> },
                { label: t('protocolsTitle'), value: <ProtocolPills user={user} showDenied /> },
                ...(!isNew
                  ? [
                      { label: t('lastLogin'), value: user.last_login ? formatRelative(user.last_login, lang) : c('never') },
                      { label: t('created_at'), value: formatDate(user.created_at, lang) },
                      { label: t('updated_at'), value: formatDate(user.updated_at, lang) },
                    ]
                  : []),
                { label: t('expiration'), value: user.expiration_date ? formatDate(user.expiration_date, lang, false) : c('never') },
              ]}
            />
          </Card>
          <Card title={t('security')}>
            <KeyValue
              labelWidth={130}
              items={[
                { label: t('password'), value: user.has_password || user.password ? t('pwdSet') : t('pwdNone') },
                { label: t('publicKeys'), value: formatNumber((user.public_keys ?? []).filter(Boolean).length, lang) },
                { label: t('twoFactor'), value: <StatusDot tone={tfa ? 'ok' : 'neutral'} label={tfa ? t('tfaOn') : t('tfaOff')} /> },
                { label: t('role'), value: user.role || t('noRole') },
                ...(!isNew && user.last_password_change
                  ? [{ label: t('lastPwdChange'), value: formatRelative(user.last_password_change, lang) }]
                  : []),
              ]}
            />
          </Card>
          {!isNew && (
            <Card title={t('sessions')}>
              <Sessions conns={conns ?? []} />
            </Card>
          )}
        </>
      }
    />
  );
}
