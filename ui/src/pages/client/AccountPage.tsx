import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Lock, Plus, Trash2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, IconButton, Input, SaveBar, Skeleton, Switch, TagInput, Textarea, useToast } from '@/components/ui';
import { Columns, Page, PageHeader } from '@/app/PageHeader';
import { api } from '@/api/client';
import type { UserProfile } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { useCommon, useT } from '@/lib/i18n';
import { PreferencesCard } from '@/pages/profile/ProfilePage';
import { PasswordCard, TwoFactorCard } from '@/pages/profile/security';
import { errMsg, useClientPerms } from './api';
import { accountDict } from './i18n';
import './client.css';

/** The API also returns these fields, missing from the OpenAPI schema. */
type Profile = UserProfile & { additional_emails?: string[]; tls_certs?: string[] };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KEY_RE = /^(ssh-(ed25519|rsa|dss)|ecdsa-sha2-nistp(256|384|521)|sk-(ssh-ed25519|ecdsa-sha2-nistp256)@openssh\.com)(-cert-v01@openssh\.com)?\s+[A-Za-z0-9+/]+={0,3}(\s+.*)?$/;

const normalize = (p: Profile): Profile => ({
  email: p.email ?? '',
  description: p.description ?? '',
  allow_api_key_auth: !!p.allow_api_key_auth,
  additional_emails: p.additional_emails ?? [],
  public_keys: p.public_keys ?? [],
  tls_certs: p.tls_certs ?? [],
});

function keyParts(k: string) {
  const [type = '', body = '', ...rest] = k.trim().split(/\s+/);
  return { type, body, comment: rest.join(' ') };
}

export default function AccountPage() {
  const t = useT(accountDict);
  const c = useCommon();
  const toast = useToast();
  const qc = useQueryClient();
  const { session } = useAuth();
  const perms = useClientPerms();
  const profile = useQuery({ queryKey: ['user-profile'], queryFn: () => api.get<Profile>('/user/profile').then(normalize) });
  const [draft, setDraft] = useState<Profile | null>(null);
  const [newKey, setNewKey] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile.data) setDraft(profile.data);
  }, [profile.data]);

  const canEdit = perms.info || perms.publicKeys || perms.apiKeyAuth;

  const dirtyCount = useMemo(() => {
    if (!draft || !profile.data) return 0;
    const keys: (keyof Profile)[] = ['email', 'description', 'allow_api_key_auth', 'additional_emails', 'public_keys'];
    return keys.filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(profile.data[k])).length;
  }, [draft, profile.data]);

  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));

  const emailError = draft?.email && !EMAIL_RE.test(draft.email) ? t('emailInvalid') : undefined;

  const save = async () => {
    if (!draft || emailError) return;
    setSaving(true);
    try {
      // Send everything back: the server only applies what this account may change,
      // and fields omitted here (e.g. TLS certificates) would otherwise be cleared.
      await api.put('/user/profile', { ...profile.data, ...draft, tls_certs: profile.data?.tls_certs ?? [] });
      toast({ title: c('saved'), tone: 'ok' });
      await qc.invalidateQueries({ queryKey: ['user-profile'] });
    } catch (e) {
      toast({ title: c('error'), description: errMsg(e), tone: 'bad' });
    } finally {
      setSaving(false);
    }
  };

  const addKey = () => {
    const k = newKey.trim().replace(/\s+/g, ' ');
    if (!k || !draft) return;
    if (!KEY_RE.test(k)) {
      setKeyError(t('keyInvalid'));
      return;
    }
    const body = keyParts(k).body;
    if ((draft.public_keys ?? []).some((x) => keyParts(x).body === body)) {
      setKeyError(t('keyDuplicate'));
      return;
    }
    set('public_keys', [...(draft.public_keys ?? []), k]);
    setNewKey('');
    setKeyError(null);
  };

  const header = <PageHeader title={t('title')} subtitle={<span className="mono">{session?.username}</span>} />;

  if (profile.isLoading || (!draft && !profile.isError)) {
    return (
      <Page>
        {header}
        <Skeleton height={280} />
      </Page>
    );
  }

  const keys = draft?.public_keys ?? [];

  return (
    <Page>
      {header}
      <Columns
        main={
          <>
            {profile.isError || !draft ? (
              <Card title={t('profile')}>
                <EmptyState compact title={c('error')} description={errMsg(profile.error)} action={<Button onClick={() => void profile.refetch()}>{c('retry')}</Button>} />
              </Card>
            ) : (
              <>
                <Card title={t('profile')} actions={!perms.info ? <Badge icon={Lock}>{t('locked')}</Badge> : undefined}>
                  <div className="account-form">
                    {!canEdit && <p className="muted">{t('noChange')}</p>}
                    <Input
                      label={t('email')}
                      type="email"
                      value={draft.email ?? ''}
                      onChange={(e) => set('email', e.target.value)}
                      disabled={!perms.info}
                      error={emailError}
                      autoComplete="email"
                    />
                    <TagInput
                      label={t('additionalEmails')}
                      hint={t('additionalEmailsHint')}
                      values={draft.additional_emails ?? []}
                      onChange={(v) => set('additional_emails', v)}
                      validate={(v) => (EMAIL_RE.test(v) ? null : t('emailInvalid'))}
                      transform={(v) => v.trim().toLowerCase()}
                      disabled={!perms.info}
                      placeholder="name@example.com"
                      removeLabel={(v) => `${c('remove')} ${v}`}
                    />
                    <Textarea
                      label={t('description')}
                      rows={2}
                      value={draft.description ?? ''}
                      onChange={(e) => set('description', e.target.value)}
                      disabled={!perms.info}
                    />
                    <Switch
                      checked={!!draft.allow_api_key_auth}
                      onChange={(v) => set('allow_api_key_auth', v)}
                      label={t('apiKeyAuth')}
                      description={perms.apiKeyAuth ? t('apiKeyAuthHint') : t('locked')}
                      disabled={!perms.apiKeyAuth}
                    />
                  </div>
                </Card>

                <Card
                  title={t('keys')}
                  description={t('keysText')}
                  actions={!perms.publicKeys ? <Badge icon={Lock}>{t('locked')}</Badge> : <Badge mono>{keys.length}</Badge>}
                >
                  <div className="account-form">
                    {keys.length === 0 ? (
                      <EmptyState compact icon={KeyRound} title={t('keysEmpty')} />
                    ) : (
                      <ul className="account-keys">
                        {keys.map((k) => {
                          const p = keyParts(k);
                          return (
                            <li key={k} className="account-key">
                              <KeyRound size={15} aria-hidden="true" className="account-key__icon" />
                              <div className="account-key__text">
                                <span className="account-key__type mono">
                                  {p.type}
                                  {p.comment && <span className="muted"> · {p.comment}</span>}
                                </span>
                                <span className="account-key__body mono muted">{p.body.length > 36 ? `${p.body.slice(0, 16)}…${p.body.slice(-16)}` : p.body}</span>
                              </div>
                              {perms.publicKeys && (
                                <IconButton
                                  icon={Trash2}
                                  size="sm"
                                  label={t('removeKey')}
                                  onClick={() => set('public_keys', keys.filter((x) => x !== k))}
                                />
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {perms.publicKeys && (
                      <div className="account-newkey">
                        <Textarea
                          label={t('keyNew')}
                          rows={3}
                          mono
                          value={newKey}
                          placeholder={t('keyPlaceholder')}
                          spellCheck={false}
                          onChange={(e) => {
                            setNewKey(e.target.value);
                            setKeyError(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              addKey();
                            }
                          }}
                          error={keyError ?? undefined}
                        />
                        <div>
                          <Button icon={Plus} disabled={!newKey.trim()} onClick={addKey}>
                            {t('addKey')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </>
            )}
            {perms.password && <PasswordCard base="/user" />}
          </>
        }
        side={
          <>
            {perms.mfa && <TwoFactorCard base="/user" />}
            <PreferencesCard />
          </>
        }
      />
      {canEdit && (
        <SaveBar
          dirtyCount={dirtyCount}
          saving={saving}
          onCancel={() => {
            setDraft(profile.data ?? null);
            setNewKey('');
            setKeyError(null);
          }}
          onSave={() => void save()}
          cancelLabel={c('cancel')}
          saveLabel={c('save')}
        />
      )}
    </Page>
  );
}
