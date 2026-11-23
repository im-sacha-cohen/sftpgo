import { Cloud, Database, Globe, HardDrive, Lock, Server } from 'lucide-react';
import type { ConnectionStatus, FsProviders, User } from '@/api/types';
import { ProgressBar, StatusDot } from '@/components/ui';
import { formatBytes, formatDate } from '@/lib/format';
import { useLang, useT } from '@/lib/i18n';
import { dict, type UsersKey } from './i18n';
import { allowedProtocols, PROTOCOL_LABEL, PROTOCOLS, PROVIDER_KEY, storageLocation, userState, type UserState } from './model';

export const PROVIDER_ICON = { 0: HardDrive, 1: Cloud, 2: Cloud, 3: Database, 4: Lock, 5: Server, 6: Globe } as const;

export function protoLabel(p?: string) {
  if (p === 'DAV') return 'WebDAV';
  return p ?? '';
}

export function StorageCell({ user }: { user: User }) {
  const t = useT(dict);
  const p = (user.filesystem?.provider ?? 0) as FsProviders;
  const Icon = PROVIDER_ICON[p] ?? HardDrive;
  const loc = storageLocation(user.filesystem, user.home_dir);
  return (
    <div className="users-cell-storage">
      <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
      <div className="users-cell-storage__txt">
        <span className="users-cell-storage__name">{t(`be_${PROVIDER_KEY[p]}` as UsersKey)}</span>
        {loc && <span className="users-cell-storage__loc">{loc}</span>}
      </div>
    </div>
  );
}

export function ProtocolPills({ user, showDenied, nowrap }: { user: User; showDenied?: boolean; nowrap?: boolean }) {
  const allowed = new Set(allowedProtocols(user.filters));
  return (
    <div className={nowrap ? 'users-pills users-pills--nowrap' : 'users-pills'}>
      {PROTOCOLS.filter((p) => showDenied || allowed.has(p)).map((p) => (
        <span key={p} className={allowed.has(p) ? 'users-pill' : 'users-pill users-pill--off'}>
          {PROTOCOL_LABEL[p]}
        </span>
      ))}
    </div>
  );
}

export function QuotaCell({ user }: { user: Pick<User, 'quota_size' | 'used_quota_size'> }) {
  const t = useT(dict);
  const { lang } = useLang();
  const used = user.used_quota_size ?? 0;
  if (!user.quota_size) {
    return <span className="users-quota__txt">{t('quotaUnlimited', { used: formatBytes(used, lang) })}</span>;
  }
  return (
    <div className="users-quota">
      <ProgressBar value={used} max={user.quota_size} size="sm" label={t('colQuota')} />
      <span className="users-quota__txt">
        {t('quotaOf', { used: formatBytes(used, lang), total: formatBytes(user.quota_size, lang) })}
      </span>
    </div>
  );
}

const TONE: Record<UserState, 'ok' | 'warn' | 'bad' | 'neutral' | 'accent'> = {
  connected: 'ok',
  active: 'accent',
  disabled: 'neutral',
  expired: 'bad',
  expiring: 'warn',
  never: 'neutral',
};

export function useStatusLabel() {
  const t = useT(dict);
  const { lang } = useLang();
  return (u: User, conns: ConnectionStatus[] | undefined) => {
    const st = userState(u, !!conns?.length);
    switch (st) {
      case 'connected':
        return conns?.[0]?.protocol ? t('stConnectedVia', { proto: protoLabel(conns[0].protocol) }) : t('stConnected');
      case 'disabled':
        return t('stDisabled');
      case 'expired':
        return t('stExpired');
      case 'expiring':
        return t('stExpiring', { date: formatDate(u.expiration_date, lang, false) });
      case 'never':
        return t('stNever');
      default:
        return t('stActive');
    }
  };
}

export function UserStatus({ user, conns }: { user: User; conns: ConnectionStatus[] | undefined }) {
  const label = useStatusLabel();
  const st = userState(user, !!conns?.length);
  return <StatusDot tone={TONE[st]} label={label(user, conns)} pulse={st === 'connected'} />;
}
