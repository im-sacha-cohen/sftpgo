import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Pencil, Power, PowerOff, Unplug } from 'lucide-react';
import type { ConnectionStatus, Permission, User } from '@/api/types';
import { Button, ProgressBar, useConfirm, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatBytes, formatRelative } from '@/lib/format';
import { useLang, useT, type Lang } from '@/lib/i18n';
import { useCloseConnection, userApi } from './api';
import { dict, type UsersKey } from './i18n';
import { clockTime, joinWords, longDate, providerName, rich, sizePair, StatusLine, UserAvatar, type TFn } from './listParts';
import { allowedProtocols, PROTOCOL_LABEL, PROTOCOLS, sortPaths, userState } from './model';
import { protoLabel } from './parts';

/* ---------- plain-language helpers ---------- */

type Verb = 'list' | 'download' | 'upload' | 'overwrite' | 'rename' | 'delete' | 'create_dirs' | 'copy' | 'symlinks' | 'attrs';

const VERB_OF: Partial<Record<Permission, Verb>> = {
  list: 'list',
  download: 'download',
  upload: 'upload',
  overwrite: 'overwrite',
  rename: 'rename',
  rename_files: 'rename',
  rename_dirs: 'rename',
  delete: 'delete',
  delete_files: 'delete',
  delete_dirs: 'delete',
  create_dirs: 'create_dirs',
  copy: 'copy',
  create_symlinks: 'symlinks',
  chmod: 'attrs',
  chown: 'attrs',
  chtimes: 'attrs',
};
const VERB_ORDER: Verb[] = ['list', 'download', 'upload', 'overwrite', 'rename', 'delete', 'create_dirs', 'copy', 'symlinks', 'attrs'];
const READ_VERBS = new Set<Verb>(['list', 'download']);

/** ["list", "download"] → "voir et télécharger seulement"; ["*"] → "tous les droits". */
export function describePerms(t: TFn, perms: Permission[]): string {
  if (perms.includes('*')) return t('v_all');
  const set = new Set<Verb>();
  perms.forEach((p) => {
    const v = VERB_OF[p];
    if (v) set.add(v);
  });
  const verbs = VERB_ORDER.filter((v) => set.has(v));
  if (!verbs.length) return t('v_none');
  const text = joinWords(
    verbs.map((v) => t(`v_${v}` as UsersKey)),
    t('and'),
  );
  return verbs.every((v) => READ_VERBS.has(v)) ? t('v_only', { verbs: text }) : text;
}

const Code = ({ children }: { children: ReactNode }) => <span className="users-panel__code">{children}</span>;

function trimSlashes(p?: string) {
  return (p ?? '').replace(/^\/+/, '');
}

function whereSentence(t: TFn, u: User): ReactNode {
  const fs = u.filesystem;
  const prov = providerName(t, fs);
  switch (fs?.provider ?? 0) {
    case 1:
    case 2: {
      const c = fs?.provider === 1 ? fs?.s3config : fs?.gcsconfig;
      const prefix = trimSlashes(c?.key_prefix);
      const gcsProv = fs?.provider === 2 ? 'Google Cloud Storage' : prov;
      return rich(t(prefix ? 'wh_bucketPrefix' : 'wh_bucket'), {
        prov: gcsProv,
        bucket: <Code>{c?.bucket || '—'}</Code>,
        prefix: <Code>{prefix}</Code>,
      });
    }
    case 3: {
      const c = fs?.azblobconfig;
      const prefix = trimSlashes(c?.key_prefix);
      return rich(t(prefix ? 'wh_containerPrefix' : 'wh_container'), {
        bucket: <Code>{c?.container || '—'}</Code>,
        prefix: <Code>{prefix}</Code>,
      });
    }
    case 5: {
      const c = fs?.sftpconfig;
      const prefix = c?.prefix && c.prefix !== '/' ? c.prefix : '';
      return rich(t(prefix ? 'wh_sftpPrefix' : 'wh_sftp'), {
        endpoint: <Code>{`${c?.username ? c.username + '@' : ''}${c?.endpoint ?? ''}`}</Code>,
        prefix: <Code>{prefix}</Code>,
      });
    }
    case 6:
      return rich(t('wh_http'), { endpoint: <Code>{fs?.httpconfig?.endpoint ?? '—'}</Code> });
    case 4:
      return u.home_dir ? rich(t('wh_crypt'), { path: <Code>{u.home_dir}</Code> }) : t('wh_localNone');
    default:
      return u.home_dir ? rich(t('wh_local'), { path: <Code>{u.home_dir}</Code> }) : t('wh_localNone');
  }
}

function ipList(t: TFn, ips: string[]): ReactNode {
  const shown = ips.slice(0, 2);
  const parts: ReactNode[] = shown.map((ip) => <Code key={ip}>{ip}</Code>);
  if (ips.length > 2) parts.push(t('cn_moreIps', { n: ips.length - 2 }));
  // join nodes as "a, b et 3 autres"
  const out: ReactNode[] = [];
  parts.forEach((p, i) => {
    if (i > 0) out.push(i === parts.length - 1 ? ` ${t('and')} ` : ', ');
    out.push(p);
  });
  return out;
}

function liveLine(t: TFn, u: User, conns: ConnectionStatus[], lang: Lang): { tone: 'ok' | 'muted' | 'warn' | 'bad'; label: string } {
  const st = userState(u, conns.length > 0);
  if (st === 'connected') {
    const since = Math.min(...conns.map((c) => c.connection_time ?? Date.now()));
    const protos = [...new Set(conns.map((c) => protoLabel(c.protocol)).filter(Boolean))];
    const time = clockTime(since, lang);
    return protos.length
      ? { tone: 'ok', label: t('spOnlineVia', { time, proto: joinWords(protos, t('and')) }) }
      : { tone: 'ok', label: t('spOnlineSince', { time }) };
  }
  if (st === 'disabled') return { tone: 'bad', label: t('spDisabled') };
  if (st === 'expired') return { tone: 'bad', label: t('spExpiredLine') };
  if (!u.last_login) return { tone: 'muted', label: t('spNever') };
  return { tone: st === 'expiring' ? 'warn' : 'muted', label: t('spLastSeen', { when: formatRelative(u.last_login, lang) }) };
}

/* ---------- panel ---------- */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="users-panel__section">
      <h3 className="users-panel__h">{title}</h3>
      {children}
    </section>
  );
}

export function UserSummaryPanel({ user, conns, id }: { user: User; conns: ConnectionStatus[]; id?: string }) {
  const t = useT(dict);
  const { lang } = useLang();
  const { can } = useAuth();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const qc = useQueryClient();
  const closeConn = useCloseConnection();
  const name = user.username ?? '';
  const canEdit = can('edit_users');
  const online = conns.length > 0;

  const status = useMutation({
    mutationFn: (s: 0 | 1) => userApi.setStatus(user, s),
    onSuccess: (_, s) => {
      toast({ title: t(s ? 'spEnabledDone' : 'spDisabledDone'), description: name, tone: 'ok' });
      return qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e) => toast({ title: e instanceof Error ? e.message : String(e), tone: 'bad' }),
  });

  const open = () => navigate(`/users/${encodeURIComponent(name)}`);

  const cut = async () => {
    const ok = await confirm({ title: t('spCutConfirm', { name }), message: t('spCutMsg'), confirmLabel: t('cut'), danger: true });
    if (!ok) return;
    try {
      await Promise.all(conns.filter((c) => c.connection_id).map((c) => closeConn.mutateAsync(c.connection_id!)));
      toast({ title: t('spCutDone'), description: name, tone: 'ok' });
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : String(e), tone: 'bad' });
    }
  };

  const toggleStatus = async () => {
    if (user.status === 0) {
      status.mutate(1);
      return;
    }
    const ok = await confirm({ title: t('disableConfirm', { name }), message: t('disableMsg'), confirmLabel: t('disable'), danger: true });
    if (ok) status.mutate(0);
  };

  const live = liveLine(t, user, conns, lang);

  // access
  const perms = user.permissions ?? {};
  const paths = sortPaths(Object.keys(perms));
  const groups = (user.groups ?? []).filter((g) => g.type === 1 || g.type === 2).map((g) => g.name ?? '');

  // where
  const folders = (user.virtual_folders ?? []).map((f) => f.virtual_path ?? '').filter(Boolean);

  // connection
  const protos = allowedProtocols(user.filters);
  const protoText =
    protos.length === PROTOCOLS.length
      ? t('cn_all')
      : protos.length === 0
        ? t('cn_none')
        : t('cn_some', { list: joinWords(protos.map((p) => PROTOCOL_LABEL[p]), t('and')) });
  const allowedIp = user.filters?.allowed_ip ?? [];
  const deniedIp = user.filters?.denied_ip ?? [];
  const tfa = !!user.filters?.totp_config?.enabled;

  // space
  const used = user.used_quota_size ?? 0;
  const pair = user.quota_size ? sizePair(used, user.quota_size, lang) : null;
  const exp = user.expiration_date;

  const canCut = online && can('close_conns');

  return (
    <article className="users-panel" id={id} aria-label={name}>
      <header className="users-panel__head">
        <UserAvatar name={name} size={52} />
        <div className="users-panel__who">
          <h2 className="users-panel__name">{name}</h2>
          <StatusLine tone={live.tone} label={live.label} pulse={online} />
        </div>
        <div className="users-panel__actions">
          {can('view_user_files') && (
            <Button variant="ghost" icon={FolderOpen} onClick={() => navigate(`/browse/u/${encodeURIComponent(name)}`)}>
              {t('spFiles')}
            </Button>
          )}
          <Button icon={Pencil} onClick={open}>
            {canEdit ? t('spEdit') : t('spView')}
          </Button>
        </div>
      </header>
      {user.description && <p className="users-panel__desc">{user.description}</p>}

      <Section title={t('spAccess')}>
        {paths.length ? (
          <ul className="users-panel__lines">
            {paths.map((p) => (
              <li key={p}>
                <Code>{p}</Code> — {describePerms(t, perms[p] ?? [])}
              </li>
            ))}
          </ul>
        ) : (
          <p className="users-panel__p">{t('spNoAccess')}</p>
        )}
        {groups.length > 0 && <p className="users-panel__p users-panel__p--muted">{t('spAlsoGroups', { groups: groups.join(', ') })}</p>}
      </Section>

      <Section title={t('spWhere')}>
        <p className="users-panel__p">{whereSentence(t, user)}</p>
        {folders.length > 0 && (
          <p className="users-panel__p users-panel__p--muted">
            {rich(t('wh_folders'), {
              paths: ipList(t, folders),
            })}
          </p>
        )}
      </Section>

      <Section title={t('spConnection')}>
        <ul className="users-panel__lines">
          <li>{protoText}</li>
          {allowedIp.length > 0 && <li>{rich(t('cn_ipOnly'), { ips: ipList(t, allowedIp) })}</li>}
          {deniedIp.length > 0 && <li>{rich(t('cn_ipDenied'), { ips: ipList(t, deniedIp) })}</li>}
          {tfa && <li>{t('cn_2fa')}</li>}
        </ul>
      </Section>

      <Section title={t('spSpace')}>
        {pair ? (
          <>
            <p className="users-panel__p">{t('sp_quota', pair)}</p>
            <ProgressBar className="users-panel__bar" value={used} max={user.quota_size!} size="sm" label={t('spSpace')} />
          </>
        ) : (
          <p className="users-panel__p">{t('sp_noQuota', { used: formatBytes(used, lang) })}</p>
        )}
        {!!exp && (
          <p className="users-panel__p">{t(exp < Date.now() ? 'sp_expired' : 'sp_expires', { date: longDate(exp, lang) })}</p>
        )}
      </Section>

      {(canCut || canEdit) && (
        <footer className="users-panel__foot">
          {canCut && (
            <Button variant="ghost" size="sm" icon={Unplug} loading={closeConn.isPending} onClick={() => void cut()}>
              {t('spCut')}
            </Button>
          )}
          {canEdit && (
            <Button
              variant="ghost"
              size="sm"
              className={user.status === 0 ? undefined : 'users-panel__danger'}
              icon={user.status === 0 ? Power : PowerOff}
              loading={status.isPending}
              onClick={() => void toggleStatus()}
            >
              {user.status === 0 ? t('spEnable') : t('spDisable')}
            </Button>
          )}
        </footer>
      )}
    </article>
  );
}
