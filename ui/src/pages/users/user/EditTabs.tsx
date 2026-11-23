import { Plus, ShieldOff, Trash2, Wand2 } from 'lucide-react';
import type { BaseVirtualFolder, Group, Role, SupportedProtocols, User, UserFilters, WebClientOptions } from '@/api/types';
import { Columns } from '@/app/PageHeader';
import {
  Button,
  Card,
  DatePicker,
  IconButton,
  Input,
  PasswordInput,
  Select,
  StatusDot,
  Switch,
  TagInput,
  Textarea,
  useToast,
} from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useLang, useT } from '@/lib/i18n';
import { dict, type UsersKey } from '../i18n';
import { NetworkCard, PatternsCard, ProtocolsCard } from '../editors/FiltersSection';
import { GroupsEditor } from '../editors/GroupsEditor';
import { LimitsEditor } from '../editors/LimitsEditor';
import { PermissionMatrix } from '../editors/PermissionMatrix';
import { StorageEditor } from '../editors/StorageEditor';
import { VirtualFoldersEditor } from '../editors/VirtualFoldersEditor';
import { generatePassword, inheritedPermissions, PROTOCOL_LABEL } from '../model';

export interface TabProps {
  draft: User;
  base: User;
  isNew: boolean;
  set: (patch: Partial<User>) => void;
  readOnly: boolean;
  groups: Group[] | undefined;
  errors: Partial<Record<string, string>>;
}

/* ------------------------------------------------------------------ */

export function AccessTab({ draft, base, isNew, set, readOnly, groups }: TabProps) {
  const t = useT(dict);
  const mappings = draft.groups ?? [];
  const inherited = inheritedPermissions(draft.permissions ?? {}, mappings, groups ?? []);
  const deniedByGroup = new Map<SupportedProtocols, string>();
  for (const m of mappings) {
    if (m.type === 3) continue;
    const g = groups?.find((x) => x.name === m.name);
    for (const p of g?.user_settings?.filters?.denied_protocols ?? []) if (!deniedByGroup.has(p)) deniedByGroup.set(p, m.name ?? '');
  }

  return (
    <Columns
      main={
        <>
          <Card title={t('permTitle')}>
            <PermissionMatrix
              value={draft.permissions ?? {}}
              initial={isNew ? undefined : base.permissions ?? {}}
              inherited={inherited}
              readOnly={readOnly}
              onChange={(permissions) => set({ permissions })}
            />
          </Card>
          <PatternsCard value={draft.filters ?? {}} disabled={readOnly} onChange={(filters) => set({ filters })} />
        </>
      }
      side={
        <>
          <ProtocolsCard
            value={draft.filters ?? {}}
            disabled={readOnly}
            deniedByGroup={deniedByGroup}
            onChange={(filters) => set({ filters })}
          />
          <NetworkCard value={draft.filters ?? {}} disabled={readOnly} onChange={(filters) => set({ filters })} />
        </>
      }
    />
  );
}

/* ------------------------------------------------------------------ */

export function StorageTab({
  draft,
  set,
  readOnly,
  groups,
  folders,
  canListFolders,
  canListGroups,
  errors,
}: TabProps & { folders: BaseVirtualFolder[] | undefined; canListFolders: boolean; canListGroups: boolean }) {
  const t = useT(dict);
  return (
    <Columns
      main={
        <>
          <Card title={t('backendTitle')}>
            <StorageEditor
              fs={draft.filesystem ?? { provider: 0 }}
              homeDir={draft.home_dir}
              homeDirError={errors.home_dir}
              disabled={readOnly}
              onChange={(filesystem) => set({ filesystem })}
              onHomeDirChange={(home_dir) => set({ home_dir })}
            />
          </Card>
          <Card title={t('vfTitle')}>
            <VirtualFoldersEditor
              value={draft.virtual_folders ?? []}
              folders={folders}
              canList={canListFolders}
              disabled={readOnly}
              onChange={(virtual_folders) => set({ virtual_folders })}
            />
          </Card>
        </>
      }
      side={
        <Card title={t('groupsTitle')}>
          <GroupsEditor
            value={draft.groups ?? []}
            groups={groups}
            canList={canListGroups}
            disabled={readOnly}
            onChange={(g) => set({ groups: g })}
          />
        </Card>
      }
    />
  );
}

/* ------------------------------------------------------------------ */

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 0);
  return x.getTime();
}

export function LimitsTab({ draft, set, readOnly }: TabProps) {
  const t = useT(dict);
  const { lang } = useLang();
  return (
    <div className="users-stack">
      <LimitsEditor
        value={draft}
        disabled={readOnly}
        onChange={(p) => set(p as Partial<User>)}
        validity={
          <DatePicker
            label={t('expiration')}
            hint={t('expirationHint')}
            clearable
            locale={lang === 'fr' ? 'fr-FR' : 'en-GB'}
            disabled={readOnly}
            value={draft.expiration_date ? new Date(draft.expiration_date) : null}
            onChange={(d) => set({ expiration_date: d ? endOfDay(d) : 0 })}
          />
        }
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

const WEB_CLIENT: [UsersKey, WebClientOptions][] = [
  ['wc_write', 'write-disabled'],
  ['wc_shares', 'shares-disabled'],
  ['wc_password', 'password-change-disabled'],
  ['wc_reset', 'password-reset-disabled'],
  ['wc_publickey', 'publickey-change-disabled'],
  ['wc_mfa', 'mfa-disabled'],
  ['wc_info', 'info-change-disabled'],
];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SecurityTab({
  draft,
  isNew,
  set,
  readOnly,
  errors,
  roles,
  onReset2fa,
}: TabProps & { roles: Role[] | undefined; onReset2fa: () => void }) {
  const t = useT(dict);
  const toast = useToast();
  const { can } = useAuth();
  const filters = (draft.filters ?? {}) as UserFilters;
  const setFilters = (p: Partial<UserFilters>) => set({ filters: { ...filters, ...p } });
  const keys = draft.public_keys ?? [];
  const totp = filters.totp_config as { enabled?: boolean; protocols?: string[] } | undefined;
  const wc = new Set(filters.web_client ?? []);

  const generate = async () => {
    const pwd = generatePassword();
    set({ password: pwd });
    try {
      await navigator.clipboard.writeText(pwd);
    } catch {
      /* clipboard unavailable: the value stays visible in the field */
    }
    toast({ title: t('passwordGenerated'), tone: 'ok' });
  };

  return (
    <Columns
      main={
        <>
          <Card title={t('credentialsTitle')}>
            <div className="users-stack">
              <div className="users-pwd">
                <PasswordInput
                  label={isNew ? t('password') : t('passwordNew')}
                  hint={isNew ? t('passwordCreateHint') : draft.has_password ? t('passwordKeep') : undefined}
                  mono
                  autoComplete="new-password"
                  value={draft.password ?? ''}
                  disabled={readOnly}
                  error={errors.password}
                  onChange={(e) => set({ password: e.target.value })}
                />
                {!readOnly && (
                  <Button icon={Wand2} onClick={() => void generate()}>
                    {t('generate')}
                  </Button>
                )}
              </div>
              <Switch
                checked={!!filters.require_password_change}
                disabled={readOnly}
                label={t('requirePwdChange')}
                onChange={(v) => setFilters({ require_password_change: v })}
              />
            </div>
          </Card>

          <Card
            title={t('keysTitle')}
            description={t('keysHint')}
            actions={
              !readOnly && (
                <Button size="sm" icon={Plus} onClick={() => set({ public_keys: [...keys, ''] })}>
                  {t('keyAdd')}
                </Button>
              )
            }
          >
            {keys.length === 0 ? (
              <p className="muted users-small">{t('keysEmpty')}</p>
            ) : (
              <div className="users-keys">
                {keys.map((k, i) => (
                  <div key={i} className="users-key">
                    <Textarea
                      mono
                      rows={2}
                      aria-label={`${t('publicKeys')} ${i + 1}`}
                      placeholder={t('keyPlaceholder')}
                      value={k}
                      disabled={readOnly}
                      onChange={(e) => set({ public_keys: keys.map((x, idx) => (idx === i ? e.target.value : x)) })}
                    />
                    {!readOnly && (
                      <IconButton
                        icon={Trash2}
                        label={t('keyRemove')}
                        onClick={() => set({ public_keys: keys.filter((_, idx) => idx !== i) })}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title={t('identityTitle')}>
            <div className="users-grid">
              <Input
                label={t('email')}
                type="email"
                value={draft.email ?? ''}
                disabled={readOnly}
                error={errors.email}
                onChange={(e) => set({ email: e.target.value })}
              />
              <TagInput
                label={t('additionalEmails')}
                values={filters.additional_emails ?? []}
                disabled={readOnly}
                validate={(v) => (EMAIL.test(v) ? null : t('emailInvalid'))}
                onChange={(v) => setFilters({ additional_emails: v })}
              />
              <div className="users-grid__full">
                <Input
                  label={t('description')}
                  value={draft.description ?? ''}
                  disabled={readOnly}
                  onChange={(e) => set({ description: e.target.value })}
                />
              </div>
              <div className="users-grid__full">
                <Textarea
                  label={t('additionalInfo')}
                  hint={t('additionalInfoHint')}
                  rows={3}
                  value={draft.additional_info ?? ''}
                  disabled={readOnly}
                  onChange={(e) => set({ additional_info: e.target.value })}
                />
              </div>
            </div>
          </Card>
        </>
      }
      side={
        <>
          <Card title={t('statusLabel')}>
            <Switch
              checked={draft.status !== 0}
              disabled={readOnly}
              label={t('statusLabel')}
              description={t('statusDesc')}
              onChange={(v) => set({ status: v ? 1 : 0 })}
            />
          </Card>
          <Card title={t('tfaTitle')}>
            <div className="users-stack">
              {totp?.enabled ? (
                <>
                  <StatusDot
                    tone="ok"
                    label={t('tfaEnabledFor', {
                      protocols: (totp.protocols ?? []).map((p) => PROTOCOL_LABEL[p as SupportedProtocols] ?? p).join(', ') || '—',
                    })}
                  />
                  {!isNew && can('disable_mfa') && (
                    <div>
                      <Button size="sm" variant="danger" icon={ShieldOff} onClick={onReset2fa}>
                        {t('reset2fa')}
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <StatusDot tone="neutral" label={t('tfaOff')} />
                  <p className="muted users-small">{t('tfaNotEnabled')}</p>
                </>
              )}
            </div>
          </Card>
          <Card title={t('role')}>
            {roles ? (
              <Select
                aria-label={t('role')}
                hint={t('roleHint')}
                value={draft.role ?? ''}
                disabled={readOnly}
                options={[{ value: '', label: t('noRole') }, ...roles.map((r) => ({ value: r.name ?? '', label: r.name ?? '', description: r.description }))]}
                onChange={(role) => set({ role })}
              />
            ) : (
              <Input
                aria-label={t('role')}
                hint={t('roleHint')}
                mono
                value={draft.role ?? ''}
                disabled={readOnly || !can('*')}
                placeholder={t('noRole')}
                onChange={(e) => set({ role: e.target.value })}
              />
            )}
          </Card>
          <Card title={t('webClientTitle')}>
            <div className="users-stack">
              {WEB_CLIENT.map(([key, opt]) => (
                <Switch
                  key={opt}
                  size="sm"
                  checked={wc.has(opt)}
                  disabled={readOnly}
                  label={t(key)}
                  onChange={(on) => {
                    const next = new Set(wc);
                    if (on) next.add(opt);
                    else next.delete(opt);
                    setFilters({ web_client: Array.from(next) });
                  }}
                />
              ))}
              <Switch
                size="sm"
                checked={!!filters.allow_api_key_auth}
                disabled={readOnly}
                label={t('allowApiKey')}
                description={t('allowApiKeyDesc')}
                onChange={(v) => setFilters({ allow_api_key_auth: v })}
              />
            </div>
          </Card>
        </>
      }
    />
  );
}
