import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, Trash2, UserCog, Wand2, X } from 'lucide-react';
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  IconButton,
  Input,
  Menu,
  NumberInput,
  PasswordInput,
  SaveBar,
  Select,
  Skeleton,
  Switch,
  TagInput,
  Textarea,
  useConfirm,
  useToast,
} from '@/components/ui';
import { Columns, Page, PageHeader } from '@/app/PageHeader';
import { api, ApiError } from '@/api/client';
import type { Admin, Group, Role } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { useCommon, useT } from '@/lib/i18n';
import { isIpOrCidr } from '../iplists/IpListsPage';
import { dict, PERMISSIONS, type AdminKey } from './shared';
import './admins.css';

const empty: Admin = {
  username: '',
  status: 1,
  email: '',
  description: '',
  permissions: ['view_users', 'view_conns', 'view_status'],
  filters: { allow_list: [], allow_api_key_auth: false, require_two_factor: false, require_password_change: false, preferences: {} },
  groups: [],
  additional_info: '',
  role: '',
};

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_.';
  const a = new Uint32Array(20);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => chars[n % chars.length]).join('');
}

/** Fields compared to detect unsaved changes (secrets and server-managed fields excluded). */
function comparable(a: Admin, password: string) {
  return JSON.stringify({
    s: a.status,
    e: a.email,
    d: a.description,
    p: [...(a.permissions ?? [])].sort(),
    f: { ...a.filters, totp_config: undefined, recovery_codes: undefined },
    g: a.groups,
    i: a.additional_info,
    r: a.role,
    password,
  });
}

export default function AdminPage() {
  const { username = '' } = useParams();
  const isNew = username === 'new';
  const t = useT(dict);
  const c = useCommon();
  const { can, session } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const allowed = can('*');

  const admin = useQuery({
    queryKey: ['admins', username],
    queryFn: () => api.get<Admin>(`/admins/${encodeURIComponent(username)}`),
    enabled: allowed && !isNew,
  });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<Role[]>('/roles', { limit: 500 }), enabled: allowed });
  const groups = useQuery({ queryKey: ['groups', 'all'], queryFn: () => api.get<Group[]>('/groups', { limit: 500 }), enabled: allowed });

  const base = isNew ? empty : admin.data;
  const [draft, setDraft] = useState<Admin>(empty);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  // The base the draft was last reset from: avoids a one-render "dirty" flash when data arrives.
  const [draftOf, setDraftOf] = useState<Admin | undefined>();
  useEffect(() => {
    if (base) {
      setDraft(structuredClone(base));
      setPassword('');
      setDraftOf(base);
    }
  }, [base]);

  const dirtyCount = useMemo(() => {
    if (!base || draftOf !== base) return 0;
    if (comparable(base, '') === comparable(draft, password)) return 0;
    const keys: (keyof Admin)[] = ['status', 'email', 'description', 'permissions', 'filters', 'groups', 'additional_info', 'role'];
    return keys.filter((k) => JSON.stringify(base[k]) !== JSON.stringify(draft[k])).length + (password ? 1 : 0) || 1;
  }, [base, draftOf, draft, password]);

  const disable2fa = useMutation({
    mutationFn: () => api.put(`/admins/${encodeURIComponent(username)}/2fa/disable`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admins'] }),
  });

  if (!allowed) {
    return (
      <Page>
        <PageHeader title={t('title')} crumbs={[{ label: t('crumb') }]} />
        <EmptyState icon={UserCog} title={t('title')} description={t('forbidden')} />
      </Page>
    );
  }

  const set = <K extends keyof Admin>(k: K, v: Admin[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setFilter = <K extends keyof NonNullable<Admin['filters']>>(k: K, v: NonNullable<Admin['filters']>[K]) =>
    setDraft((d) => ({ ...d, filters: { ...d.filters, [k]: v } }));
  const perms = draft.permissions ?? [];
  const isSuper = perms.includes('*');
  const togglePerm = (p: string, on: boolean) =>
    set('permissions', (on ? [...perms.filter((x) => x !== p), p] : perms.filter((x) => x !== p)) as Admin['permissions']);

  const save = async () => {
    setSaving(true);
    try {
      const body: Admin = { ...draft, filters: { ...draft.filters, totp_config: undefined, recovery_codes: undefined } };
      if (password) body.password = password;
      else delete body.password;
      if (isNew) {
        if (!draft.username?.trim()) throw new ApiError(400, `${t('username')} ?`);
        await api.post('/admins', { ...body, username: draft.username.trim() });
        toast({ title: t('created'), tone: 'ok' });
        await qc.invalidateQueries({ queryKey: ['admins'] });
        navigate(`/admins/${encodeURIComponent(draft.username.trim())}`, { replace: true });
      } else {
        await api.put(`/admins/${encodeURIComponent(username)}`, body);
        toast({ title: c('saved'), tone: 'ok' });
        await qc.invalidateQueries({ queryKey: ['admins'] });
        setPassword('');
      }
    } catch (err) {
      toast({ title: c('error'), description: err instanceof ApiError ? err.message : String(err), tone: 'bad' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!(await confirm({ title: c('confirmDelete', { name: username }), message: t('deleteMsg'), confirmLabel: c('delete'), danger: true }))) return;
    try {
      await api.del(`/admins/${encodeURIComponent(username)}`);
      await qc.invalidateQueries({ queryKey: ['admins'] });
      toast({ title: c('deleted'), tone: 'ok' });
      navigate('/admins');
    } catch (err) {
      toast({ title: c('error'), description: err instanceof ApiError ? err.message : String(err), tone: 'bad' });
    }
  };

  const doDisable2fa = async () => {
    if (!(await confirm({ title: t('disable2faTitle', { name: username }), message: t('disable2faMsg'), confirmLabel: t('disable2fa'), danger: true })))
      return;
    try {
      await disable2fa.mutateAsync();
      toast({ title: t('disabled2fa'), tone: 'ok' });
    } catch (err) {
      toast({ title: c('error'), description: err instanceof ApiError ? err.message : String(err), tone: 'bad' });
    }
  };

  if (!isNew && admin.isLoading) {
    return (
      <Page>
        <PageHeader title={username} crumbs={[{ label: t('crumb') }, { label: t('title'), to: '/admins' }]} />
        <Skeleton height={320} />
      </Page>
    );
  }
  if (!isNew && admin.isError) {
    return (
      <Page>
        <PageHeader title={username} crumbs={[{ label: t('crumb') }, { label: t('title'), to: '/admins' }]} />
        <EmptyState icon={UserCog} title={c('notFound')} description={(admin.error as Error)?.message} />
      </Page>
    );
  }

  const totp = base?.filters?.totp_config;
  const groupOptions = (groups.data ?? []).map((g) => ({ value: g.name ?? '', label: g.name ?? '', description: g.description }));
  const mappings = draft.groups ?? [];

  return (
    <Page>
      <PageHeader
        title={isNew ? t('newTitle') : <span className="mono">{username}</span>}
        docTitle={isNew ? t('newTitle') : username}
        crumbs={[{ label: t('crumb') }, { label: t('title'), to: '/admins' }]}
        subtitle={!isNew ? [draft.email, draft.role ? `${t('role')} ${draft.role}` : null].filter(Boolean).join(' · ') || undefined : undefined}
        actions={
          !isNew && username !== session?.username ? (
            <Menu trigger={<Button>{c('more')}</Button>} items={[{ label: c('delete'), icon: Trash2, danger: true, onSelect: () => void remove() }]} />
          ) : undefined
        }
      />
      <Columns
        main={
          <>
            <Card title={t('identity')}>
              <div className="admins-form">
                <div className="admins-grid">
                  <Input
                    label={t('username')}
                    value={draft.username ?? ''}
                    onChange={(e) => set('username', e.target.value)}
                    disabled={!isNew}
                    mono
                    autoFocus={isNew}
                    autoComplete="off"
                  />
                  <Input label={t('email')} type="email" value={draft.email ?? ''} onChange={(e) => set('email', e.target.value)} />
                </div>
                <Input label={t('description')} value={draft.description ?? ''} onChange={(e) => set('description', e.target.value)} />
                <PasswordInput
                  label={t('password')}
                  hint={isNew ? undefined : t('passwordNew')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  action={
                    <Button icon={Wand2} onClick={() => setPassword(generatePassword())}>
                      {t('generate')}
                    </Button>
                  }
                />
                <Switch checked={draft.status === 1} onChange={(v) => set('status', v ? 1 : 0)} label={t('accountActive')} />
              </div>
            </Card>

            <Card title={t('permissions')}>
              <div className="admins-form">
                <Switch
                  checked={isSuper}
                  onChange={(v) => set('permissions', (v ? ['*'] : ['view_users']) as Admin['permissions'])}
                  label={t('superAdmin')}
                  description={t('superAdminHelp')}
                />
                {!isSuper && (
                  <div className="admins-perms">
                    {PERMISSIONS.map((p) => (
                      <Checkbox key={p} checked={perms.includes(p)} onChange={(v) => togglePerm(p, v)} label={t(`perm_${p}` as AdminKey)} />
                    ))}
                  </div>
                )}
                <Select
                  label={t('role')}
                  value={draft.role ?? ''}
                  onChange={(v) => set('role', v)}
                  options={[{ value: '', label: t('noRole') }, ...(roles.data ?? []).map((r) => ({ value: r.name ?? '', label: r.name ?? '', description: r.description }))]}
                />
              </div>
            </Card>

            <Card title={t('groupsMapping')}>
              <div className="admins-form">
                <p className="muted">{t('groupsMappingHint')}</p>
                {mappings.map((m, i) => (
                  <div key={i} className="admins-group-row">
                    <Select
                      aria-label={t('groupsMapping')}
                      value={m.name ?? ''}
                      searchable
                      onChange={(v) => set('groups', mappings.map((x, j) => (j === i ? { ...x, name: v } : x)))}
                      options={groupOptions}
                    />
                    <Select
                      aria-label={t('groupsMapping')}
                      value={String(m.options?.add_to_users_as ?? 0)}
                      onChange={(v) =>
                        set(
                          'groups',
                          mappings.map((x, j) => (j === i ? { ...x, options: { add_to_users_as: Number(v) as 0 | 1 | 2 } } : x)),
                        )
                      }
                      options={[
                        { value: '1', label: t('asPrimary') },
                        { value: '2', label: t('asSecondary') },
                        { value: '0', label: t('asMembership') },
                      ]}
                    />
                    <IconButton icon={X} label={c('remove')} variant="ghost" onClick={() => set('groups', mappings.filter((_, j) => j !== i))} />
                  </div>
                ))}
                <div>
                  <Button size="sm" icon={Plus} onClick={() => set('groups', [...mappings, { name: groupOptions[0]?.value ?? '', options: { add_to_users_as: 0 } }])} disabled={!groupOptions.length}>
                    {t('addGroup')}
                  </Button>
                </div>
              </div>
            </Card>
          </>
        }
        side={
          <>
            <Card title={t('access')}>
              <div className="admins-form">
                <TagInput
                  label={t('allowList')}
                  hint={t('allowListHint')}
                  values={draft.filters?.allow_list ?? []}
                  onChange={(v) => setFilter('allow_list', v)}
                  validate={(v) => (isIpOrCidr(v) ? null : 'CIDR ?')}
                  mono
                />
                <Switch checked={!!draft.filters?.allow_api_key_auth} onChange={(v) => setFilter('allow_api_key_auth', v)} label={t('apiKeyAuth')} />
                <Switch checked={!!draft.filters?.require_two_factor} onChange={(v) => setFilter('require_two_factor', v)} label={t('require2fa')} />
                <Switch
                  checked={!!draft.filters?.require_password_change}
                  onChange={(v) => setFilter('require_password_change', v)}
                  label={t('requirePwdChange')}
                />
              </div>
            </Card>
            {!isNew && (
              <Card title={t('security')}>
                <div className="admins-2fa">
                  <KeyRound size={16} aria-hidden="true" />
                  <span>{totp?.enabled ? t('twofaEnabled', { proto: totp.config_name ?? 'TOTP' }) : t('twofaDisabled')}</span>
                  {totp?.enabled && (
                    <Button size="sm" variant="danger" onClick={() => void doDisable2fa()}>
                      {t('disable2fa')}
                    </Button>
                  )}
                </div>
              </Card>
            )}
            <Card title={t('defaults')}>
              <div className="admins-form">
                <NumberInput
                  label={t('defaultExpiration')}
                  unit={t('days')}
                  min={0}
                  value={draft.filters?.preferences?.default_users_expiration ?? 0}
                  onChange={(v) => setFilter('preferences', { ...draft.filters?.preferences, default_users_expiration: v ?? 0 })}
                />
                <Textarea label={t('additionalInfo')} value={draft.additional_info ?? ''} onChange={(e) => set('additional_info', e.target.value)} rows={3} />
              </div>
            </Card>
          </>
        }
      />
      {(isNew || dirtyCount > 0) && (
        <SaveBar
          dirtyCount={Math.max(dirtyCount, isNew ? 1 : 0)}
          onCancel={() => (isNew ? navigate('/admins') : base && (setDraft(structuredClone(base)), setPassword('')))}
          onSave={() => void save()}
          saving={saving}
        />
      )}
    </Page>
  );
}
