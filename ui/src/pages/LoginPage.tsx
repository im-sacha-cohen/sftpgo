import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, KeyRound, LogIn, Mail, Monitor, Moon, Sun } from 'lucide-react';
import { Button, Input, PasswordInput, SegmentedControl } from '@/components/ui';
import { ApiError, publicPost, type SessionKind } from '@/api/client';
import { useAuth } from '@/lib/auth';
import { config } from '@/lib/config';
import { Logo } from '@/app/Logo';
import { useTheme, type ThemePref } from '@/lib/theme';
import './login.css';

/** username → kind that last signed in on this browser, tried first next time. */
const KINDS_KEY = 'sftpgo-console-login-kinds';
const OTP_KEY = 'sftpgo-console-otp-users';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

function enabledKinds(): SessionKind[] {
  const kinds: SessionKind[] = [];
  if (config.webAdmin) kinds.push('admin');
  if (config.webClient) kinds.push('user');
  return kinds;
}

/**
 * Order in which the token endpoints are tried. The kind that worked last time
 * for this username goes first, so a known account costs a single request.
 * Otherwise administrators are tried first: a failed admin attempt only feeds
 * the defender, while a failed user attempt also fires "login failed" events.
 */
function loginOrder(username: string): SessionKind[] {
  const enabled = enabledKinds();
  const known = readJson<Record<string, SessionKind>>(KINDS_KEY, {})[username];
  if (known && enabled.includes(known)) return [known, ...enabled.filter((k) => k !== known)];
  return enabled;
}

const resetBase = (kind: SessionKind, username: string) =>
  `${kind === 'admin' ? '/admins' : '/users'}/${encodeURIComponent(username)}`;

const NO_SMTP = 'Password reset by email is not set up on this server. Ask an administrator to reset your password.';

type Mode = 'login' | 'forgot' | 'reset';

export default function LoginPage() {
  const { pref, setPref } = useTheme();
  const { session, loginAny } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtp, setShowOtp] = useState(false);
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = `${mode === 'login' ? 'Sign in' : 'Reset password'} · SFTPGo`;
  }, [mode]);

  useEffect(() => {
    if (readJson<string[]>(OTP_KEY, []).includes(username.trim())) setShowOtp(true);
  }, [username]);

  if (session) return <Navigate to={params.get('next') || '/'} replace />;

  const go = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
  };

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = username.trim();
    if (!name || !password) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const s = await loginAny(loginOrder(name), name, password, otp.trim() || undefined);
      writeJson(KINDS_KEY, { ...readJson<Record<string, SessionKind>>(KINDS_KEY, {}), [name]: s.kind });
      if (otp) writeJson(OTP_KEY, [...new Set([...readJson<string[]>(OTP_KEY, []), name])]);
      navigate(params.get('next') || '/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) setError('Sign-in refused for this account or from your address. Try again later or contact an administrator.');
        else if (!showOtp) {
          setError('Wrong username or password. If two-factor authentication is enabled on this account, also enter your code.');
          setShowOtp(true);
        } else setError('Wrong username, password or code.');
      } else setError('The server is not responding.');
    } finally {
      setBusy(false);
    }
  };

  // Ask every enabled account kind for a code: the server silently ignores
  // unknown names, so this reveals nothing and nobody has to say what they are.
  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = username.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    const results = await Promise.allSettled(enabledKinds().map((k) => publicPost(`${resetBase(k, name)}/forgot-password`)));
    setBusy(false);
    if (results.some((r) => r.status === 'fulfilled')) {
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
      setMode('reset');
      setNotice('If an account with this name has an email address, a reset code has been sent to it.');
      return;
    }
    const reasons = results.map((r) => (r as PromiseRejectedResult).reason);
    if (reasons.some((r) => r instanceof ApiError && /smtp/i.test(r.message))) setError(NO_SMTP);
    else if (reasons.some((r) => r instanceof ApiError)) setError((reasons.find((r) => r instanceof ApiError) as ApiError).message);
    else setError('The server is not responding.');
  };

  const submitReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = username.trim();
    if (!code.trim() || !newPassword) return;
    if (newPassword !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    let last: unknown = null;
    // The code belongs to either a user or an admin: try each until one accepts it.
    for (const kind of loginOrder(name)) {
      try {
        await publicPost(`${resetBase(kind, name)}/reset-password`, { code: code.trim(), password: newPassword });
        writeJson(KINDS_KEY, { ...readJson<Record<string, SessionKind>>(KINDS_KEY, {}), [name]: kind });
        setPassword('');
        setMode('login');
        setNotice('Your password has been changed. You can sign in now.');
        setBusy(false);
        return;
      } catch (err) {
        last = err;
      }
    }
    setBusy(false);
    setError(last instanceof ApiError ? last.message : 'The server is not responding.');
  };

  const themeOptions: { value: ThemePref; label: React.ReactNode; icon: typeof Sun }[] = [
    { value: 'light', icon: Sun, label: <span className="sr-only">Light</span> },
    { value: 'dark', icon: Moon, label: <span className="sr-only">Dark</span> },
    { value: 'system', icon: Monitor, label: <span className="sr-only">System</span> },
  ];

  const messages = (
    <>
      {notice && (
        <p className="login__notice" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="login__error" role="alert">
          {error}
        </p>
      )}
    </>
  );

  return (
    <div className="login">
      <header className="login__top">
        <div className="login__brand">
          <Logo size={30} />
        </div>
        <SegmentedControl size="sm" aria-label="Theme" options={themeOptions} value={pref} onChange={setPref} className="login__theme" />
      </header>

      <main className="login__main">
        <section className="login__hero" aria-hidden="true">
          <h2>Your files, your access, one place.</h2>
          <p>Run the server, manage accounts or get to your files and shares: the console shows what your account allows.</p>
          <ul className="login__protocols mono">
            <li>SFTP</li>
            <li>FTP/S</li>
            <li>WebDAV</li>
            <li>HTTP/S</li>
          </ul>
          <ul className="login__points">
            {config.webAdmin && <li>Administrators: server, accounts, automation and security, as your permissions allow.</li>}
            {config.webClient && <li>Users: files, shares and your account settings.</li>}
          </ul>
        </section>

        <section className="login__card" aria-labelledby="login-title">
          {mode === 'login' && (
            <>
              <div className="login__head">
                <h1 id="login-title">Welcome back</h1>
                <p className="muted">Sign in with your SFTPGo account. The console adapts to your profile.</p>
              </div>
              <form className="login__form" onSubmit={submitLogin}>
                <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus mono spellCheck={false} />
                <PasswordInput label="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                {showOtp && (
                  <Input
                    label="Two-factor code"
                    hint="The 6-digit code from your authenticator app."
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\s/g, ''))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    mono
                  />
                )}
                {messages}
                <Button type="submit" variant="primary" icon={LogIn} loading={busy} disabled={!username.trim() || !password}>
                  Sign in
                </Button>
              </form>
              <div className="login__links">
                <Button variant="ghost" size="sm" icon={KeyRound} onClick={() => go('forgot')}>
                  Forgot password
                </Button>
              </div>
            </>
          )}

          {mode === 'forgot' && (
            <>
              <div className="login__head">
                <h1 id="login-title">Reset your password</h1>
                <p className="muted">Enter your username. We’ll email a reset code to the address on your account.</p>
              </div>
              <form className="login__form" onSubmit={submitForgot}>
                <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus mono spellCheck={false} />
                {messages}
                <Button type="submit" variant="primary" icon={Mail} loading={busy} disabled={!username.trim()}>
                  Send reset code
                </Button>
              </form>
              <div className="login__links">
                <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => go('login')}>
                  Back to sign in
                </Button>
              </div>
            </>
          )}

          {mode === 'reset' && (
            <>
              <div className="login__head">
                <h1 id="login-title">Choose a new password</h1>
                <p className="muted">
                  Enter the code from the email sent for <span className="mono">{username.trim()}</span>.
                </p>
              </div>
              <form className="login__form" onSubmit={submitReset}>
                <Input label="Reset code" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" autoFocus mono spellCheck={false} />
                <PasswordInput label="New password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
                <PasswordInput label="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
                {messages}
                <Button type="submit" variant="primary" icon={KeyRound} loading={busy} disabled={!code.trim() || !newPassword || !confirmPassword}>
                  Change password
                </Button>
              </form>
              <div className="login__links">
                <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={() => go('forgot')}>
                  Send a new code
                </Button>
                <Button variant="ghost" size="sm" onClick={() => go('login')}>
                  Back to sign in
                </Button>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
