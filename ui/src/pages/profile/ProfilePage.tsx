import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Input, Switch, useToast } from '@/components/ui';
import { Columns, Page, PageHeader } from '@/app/PageHeader';
import { api, ApiError } from '@/api/client';
import type { AdminProfile } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { useCommon, useT, type Dict } from '@/lib/i18n';
import { useTheme } from '@/lib/theme';
import { SegmentedControl } from '@/components/ui';
import { PasswordCard, TwoFactorCard } from './security';
import './security.css';

const dict = {
  fr: {
    title: 'Mon compte',
    profile: 'Profil',
    email: 'E-mail',
    description: 'Description',
    apiKeyAuth: 'Autoriser l’authentification par clé d’API',
    apiKeyAuthHint: 'Les clés d’API associées à votre compte pourront agir en votre nom.',
    prefs: 'Préférences',
    theme: 'Thème',
    dark: 'Sombre',
    light: 'Clair',
    system: 'Système',
  },
  en: {
    title: 'My account',
    profile: 'Profile',
    email: 'Email',
    description: 'Description',
    apiKeyAuth: 'Allow API key authentication',
    apiKeyAuthHint: 'API keys bound to your account will be able to act on your behalf.',
    prefs: 'Preferences',
    theme: 'Theme',
    dark: 'Dark',
    light: 'Light',
    system: 'System',
  },
} satisfies Dict;

export function PreferencesCard() {
  const t = useT(dict);
  const { pref, setPref } = useTheme();
  return (
    <Card title={t('prefs')}>
      <div className="sec-form">
        <div className="sec-form" style={{ gap: 8 }}>
          <span className="muted">{t('theme')}</span>
          <SegmentedControl
            options={[
              { value: 'dark', label: t('dark') },
              { value: 'light', label: t('light') },
              { value: 'system', label: t('system') },
            ]}
            value={pref}
            onChange={(v) => setPref(v as 'dark' | 'light' | 'system')}
          />
        </div>
      </div>
    </Card>
  );
}

export default function ProfilePage() {
  const t = useT(dict);
  const c = useCommon();
  const toast = useToast();
  const qc = useQueryClient();
  const { session } = useAuth();
  const profile = useQuery({ queryKey: ['admin-profile'], queryFn: () => api.get<AdminProfile>('/admin/profile') });
  const [draft, setDraft] = useState<AdminProfile>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (profile.data) setDraft(profile.data);
  }, [profile.data]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(profile.data ?? {});

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/admin/profile', draft);
      toast({ title: c('saved'), tone: 'ok' });
      await qc.invalidateQueries({ queryKey: ['admin-profile'] });
    } catch (err) {
      toast({ title: c('error'), description: err instanceof ApiError ? err.message : String(err), tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page>
      <PageHeader title={t('title')} subtitle={<span className="mono">{session?.username}</span>} />
      <Columns
        main={
          <>
            <Card title={t('profile')}>
              <div className="sec-form">
                <Input label={t('email')} type="email" value={draft.email ?? ''} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                <Input label={t('description')} value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                <Switch
                  checked={!!draft.allow_api_key_auth}
                  onChange={(v) => setDraft({ ...draft, allow_api_key_auth: v })}
                  label={t('apiKeyAuth')}
                  description={t('apiKeyAuthHint')}
                />
                <div>
                  <Button variant="primary" loading={busy} disabled={!dirty} onClick={() => void save()}>
                    {c('save')}
                  </Button>
                </div>
              </div>
            </Card>
            <PasswordCard base="/admin" />
          </>
        }
        side={
          <>
            <TwoFactorCard base="/admin" />
            <PreferencesCard />
          </>
        }
      />
    </Page>
  );
}
