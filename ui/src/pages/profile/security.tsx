import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, KeyRound, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react';
import { Badge, Button, Card, Checkbox, Input, Modal, PasswordInput, Select, Spinner, useConfirm, useToast } from '@/components/ui';
import { api, ApiError } from '@/api/client';
import type { RecoveryCode, TOTPConfig } from '@/api/types';
import { useCommon, useT, type Dict } from '@/lib/i18n';
import './security.css';

/**
 * Password + two-factor cards shared by the admin profile (/admin/…) and the
 * end-user account page (/user/…). `base` selects the API prefix.
 */

const dict = {
  fr: {
    password: 'Mot de passe',
    current: 'Mot de passe actuel',
    next: 'Nouveau mot de passe',
    confirm: 'Confirmer le nouveau mot de passe',
    mismatch: 'Les deux mots de passe ne correspondent pas.',
    change: 'Changer le mot de passe',
    changed: 'Mot de passe changé',
    twofa: 'Double authentification',
    on: 'Activée',
    off: 'Désactivée',
    onText: 'Un code de votre application d’authentification est demandé à chaque connexion.',
    offText: 'Protégez ce compte avec un code à usage unique (Google Authenticator, 1Password, Bitwarden…).',
    enable: 'Activer',
    disable: 'Désactiver',
    disableTitle: 'Désactiver la double authentification ?',
    disableMsg: 'Votre compte ne sera plus protégé que par son mot de passe.',
    disabled: 'Double authentification désactivée',
    setupTitle: 'Activer la double authentification',
    step1: '1. Scannez ce QR code avec votre application, ou saisissez la clé manuellement.',
    step2: '2. Saisissez le code à 6 chiffres affiché par l’application.',
    config: 'Configuration',
    secret: 'Clé',
    code: 'Code',
    protocols: 'Protocoles protégés',
    verify: 'Vérifier et activer',
    badCode: 'Code incorrect. Vérifiez l’heure de votre téléphone et réessayez.',
    enabled: 'Double authentification activée',
    recovery: 'Codes de secours',
    recoveryText: 'Utilisables une seule fois si vous perdez l’accès à votre application. Conservez-les en lieu sûr.',
    recoveryLeft: '{n} codes restants sur {total}',
    regenerate: 'Générer de nouveaux codes',
    regenerateTitle: 'Générer de nouveaux codes de secours ?',
    regenerateMsg: 'Les anciens codes ne fonctionneront plus.',
    newCodes: 'Vos nouveaux codes de secours',
    newCodesText: 'Ils ne seront plus affichés. Copiez-les ou téléchargez-les maintenant.',
    copyAll: 'Tout copier',
    downloadTxt: 'Télécharger',
    done: 'C’est noté',
  },
  en: {
    password: 'Password',
    current: 'Current password',
    next: 'New password',
    confirm: 'Confirm new password',
    mismatch: 'The two passwords do not match.',
    change: 'Change password',
    changed: 'Password changed',
    twofa: 'Two-factor authentication',
    on: 'Enabled',
    off: 'Disabled',
    onText: 'A code from your authenticator app is required at each sign-in.',
    offText: 'Protect this account with a one-time code (Google Authenticator, 1Password, Bitwarden…).',
    enable: 'Enable',
    disable: 'Disable',
    disableTitle: 'Disable two-factor authentication?',
    disableMsg: 'Your account will only be protected by its password.',
    disabled: 'Two-factor authentication disabled',
    setupTitle: 'Enable two-factor authentication',
    step1: '1. Scan this QR code with your app, or type the key manually.',
    step2: '2. Enter the 6-digit code shown by the app.',
    config: 'Configuration',
    secret: 'Key',
    code: 'Code',
    protocols: 'Protected protocols',
    verify: 'Verify and enable',
    badCode: 'Wrong code. Check your phone clock and try again.',
    enabled: 'Two-factor authentication enabled',
    recovery: 'Recovery codes',
    recoveryText: 'Single-use codes for when you lose access to your app. Keep them somewhere safe.',
    recoveryLeft: '{n} of {total} codes left',
    regenerate: 'Generate new codes',
    regenerateTitle: 'Generate new recovery codes?',
    regenerateMsg: 'The old codes will stop working.',
    newCodes: 'Your new recovery codes',
    newCodesText: 'They will not be shown again. Copy or download them now.',
    copyAll: 'Copy all',
    downloadTxt: 'Download',
    done: 'Done',
  },
} satisfies Dict;

type Base = '/admin' | '/user';

function errMsg(e: unknown) {
  return e instanceof ApiError ? e.message : String(e);
}

export function PasswordCard({ base }: { base: Base }) {
  const t = useT(dict);
  const c = useCommon();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);
  const mismatch = !!again && next !== again;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !next || mismatch) return;
    setBusy(true);
    try {
      await api.put(`${base}/changepwd`, { current_password: current, new_password: next });
      toast({ title: t('changed'), tone: 'ok' });
      setCurrent('');
      setNext('');
      setAgain('');
    } catch (err) {
      toast({ title: c('error'), description: errMsg(err), tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title={t('password')}>
      <form className="sec-form" onSubmit={submit}>
        <PasswordInput label={t('current')} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        <PasswordInput label={t('next')} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
        <PasswordInput
          label={t('confirm')}
          value={again}
          onChange={(e) => setAgain(e.target.value)}
          error={mismatch ? t('mismatch') : undefined}
          autoComplete="new-password"
        />
        <div>
          <Button type="submit" variant="primary" icon={KeyRound} loading={busy} disabled={!current || !next || !again || mismatch}>
            {t('change')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function TwoFactorCard({ base }: { base: Base }) {
  const t = useT(dict);
  const c = useCommon();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [setup, setSetup] = useState(false);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  // Recovery codes are only readable when 2FA is on: their availability tells us the status.
  const codes = useQuery({
    queryKey: ['2fa', base],
    queryFn: async () => {
      try {
        return { enabled: true, codes: await api.get<RecoveryCode[]>(`${base}/2fa/recoverycodes`) };
      } catch (e) {
        // 400 for admins, 403 for users when 2FA is off.
        if (e instanceof ApiError && (e.status === 400 || e.status === 403)) return { enabled: false, codes: [] as RecoveryCode[] };
        throw e;
      }
    },
  });
  const enabled = !!codes.data?.enabled;
  const left = (codes.data?.codes ?? []).filter((x) => !x.used).length;

  const disable = async () => {
    if (!(await confirm({ title: t('disableTitle'), message: t('disableMsg'), confirmLabel: t('disable'), danger: true }))) return;
    try {
      await api.post(`${base}/totp/save`, { enabled: false });
      toast({ title: t('disabled'), tone: 'ok' });
      await qc.invalidateQueries({ queryKey: ['2fa', base] });
    } catch (err) {
      toast({ title: c('error'), description: errMsg(err), tone: 'bad' });
    }
  };

  const regenerate = async () => {
    if (!(await confirm({ title: t('regenerateTitle'), message: t('regenerateMsg'), confirmLabel: t('regenerate') }))) return;
    try {
      const res = await api.post<string[]>(`${base}/2fa/recoverycodes`);
      setNewCodes(res);
      await qc.invalidateQueries({ queryKey: ['2fa', base] });
    } catch (err) {
      toast({ title: c('error'), description: errMsg(err), tone: 'bad' });
    }
  };

  return (
    <Card
      title={t('twofa')}
      actions={codes.isLoading ? <Spinner /> : <Badge tone={enabled ? 'ok' : 'neutral'}>{enabled ? t('on') : t('off')}</Badge>}
    >
      <div className="sec-form">
        <div className="sec-status">
          {enabled ? <ShieldCheck size={20} aria-hidden="true" /> : <ShieldOff size={20} aria-hidden="true" />}
          <p className="muted">{enabled ? t('onText') : t('offText')}</p>
        </div>
        <div className="sec-actions">
          {enabled ? (
            <Button variant="danger" onClick={() => void disable()}>
              {t('disable')}
            </Button>
          ) : (
            <Button variant="primary" icon={ShieldCheck} onClick={() => setSetup(true)} disabled={codes.isLoading}>
              {t('enable')}
            </Button>
          )}
        </div>
        {enabled && (
          <div className="sec-recovery">
            <div>
              <strong>{t('recovery')}</strong>
              <p className="muted">{t('recoveryText')}</p>
              <p className="mono sec-left">{t('recoveryLeft', { n: left, total: codes.data?.codes.length ?? 0 })}</p>
            </div>
            <Button icon={RefreshCw} onClick={() => void regenerate()}>
              {t('regenerate')}
            </Button>
          </div>
        )}
      </div>
      {setup && (
        <SetupModal
          base={base}
          onClose={() => setSetup(false)}
          onDone={(recovery) => {
            setSetup(false);
            toast({ title: t('enabled'), tone: 'ok' });
            void qc.invalidateQueries({ queryKey: ['2fa', base] });
            if (recovery?.length) setNewCodes(recovery);
          }}
        />
      )}
      {newCodes && <CodesModal codes={newCodes} onClose={() => setNewCodes(null)} />}
    </Card>
  );
}

function SetupModal({ base, onClose, onDone }: { base: Base; onClose: () => void; onDone: (codes?: string[]) => void }) {
  const t = useT(dict);
  const c = useCommon();
  const toast = useToast();
  const configs = useQuery({ queryKey: ['totp-configs', base], queryFn: () => api.get<TOTPConfig[]>(`${base}/totp/configs`) });
  const [configName, setConfigName] = useState('');
  const name = configName || configs.data?.[0]?.name || '';
  const gen = useQuery({
    queryKey: ['totp-generate', base, name],
    queryFn: () => api.post<{ config_name: string; issuer: string; secret: string; qr_code: string }>(`${base}/totp/generate`, { config_name: name }),
    enabled: !!name,
    staleTime: Infinity,
    gcTime: 0,
  });
  const [code, setCode] = useState('');
  const [protocols, setProtocols] = useState<string[]>(['SSH', 'FTP', 'HTTP']);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const verify = async () => {
    if (!gen.data) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(`${base}/totp/validate`, { config_name: name, passcode: code.trim(), secret: gen.data.secret });
    } catch {
      setError(t('badCode'));
      setBusy(false);
      return;
    }
    try {
      await api.post(`${base}/totp/save`, {
        enabled: true,
        config_name: name,
        secret: { status: 'Plain', payload: gen.data.secret },
        ...(base === '/user' ? { protocols } : {}),
      });
      let recovery: string[] | undefined;
      try {
        recovery = await api.post<string[]>(`${base}/2fa/recoverycodes`);
      } catch {
        /* codes can be generated later */
      }
      onDone(recovery);
    } catch (err) {
      toast({ title: c('error'), description: errMsg(err), tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('setupTitle')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {c('cancel')}
          </Button>
          <Button variant="primary" loading={busy} disabled={code.trim().length < 6 || !gen.data} onClick={() => void verify()}>
            {t('verify')}
          </Button>
        </>
      }
    >
      <div className="sec-form">
        {(configs.data?.length ?? 0) > 1 && (
          <Select
            label={t('config')}
            value={name}
            onChange={setConfigName}
            options={(configs.data ?? []).map((x) => ({ value: x.name ?? '', label: x.name ?? '', description: `${x.issuer} · ${x.algo}` }))}
          />
        )}
        <p className="muted">{t('step1')}</p>
        <div className="sec-qr">
          {gen.data ? <img src={`data:image/png;base64,${gen.data.qr_code}`} alt="QR code" width={180} height={180} /> : <Spinner />}
        </div>
        {gen.data && (
          <div className="sec-secret">
            <span className="muted">{t('secret')}</span>
            <code className="mono">{gen.data.secret}</code>
          </div>
        )}
        <p className="muted">{t('step2')}</p>
        <Input
          label={t('code')}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
          inputMode="numeric"
          autoComplete="one-time-code"
          mono
          error={error ?? undefined}
          onKeyDown={(e) => e.key === 'Enter' && void verify()}
        />
        {base === '/user' && (
          <div className="sec-protocols">
            <span className="muted">{t('protocols')}</span>
            {['SSH', 'FTP', 'HTTP'].map((p) => (
              <Checkbox
                key={p}
                checked={protocols.includes(p)}
                onChange={(v) => setProtocols((cur) => (v ? [...cur, p] : cur.filter((x) => x !== p)))}
                label={p}
              />
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}

function CodesModal({ codes, onClose }: { codes: string[]; onClose: () => void }) {
  const t = useT(dict);
  const c = useCommon();
  const toast = useToast();
  const text = codes.join('\n');
  return (
    <Modal
      open
      onClose={onClose}
      title={t('newCodes')}
      description={t('newCodesText')}
      footer={
        <>
          <Button
            icon={Copy}
            onClick={() => {
              void navigator.clipboard?.writeText(text);
              toast({ title: c('copied'), tone: 'ok' });
            }}
          >
            {t('copyAll')}
          </Button>
          <Button
            icon={Download}
            onClick={() => {
              const url = URL.createObjectURL(new Blob([text + '\n'], { type: 'text/plain' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = 'sftpgo-recovery-codes.txt';
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            {t('downloadTxt')}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t('done')}
          </Button>
        </>
      }
    >
      <ul className="sec-codes mono">
        {codes.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </Modal>
  );
}
