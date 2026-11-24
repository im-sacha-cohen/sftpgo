// "Partager" dialog: creates the share as soon as it opens, shows the link
// right away, and saves every change (PUT with the full object).
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownUp, Check, Download, Link2, Upload, Wand2 } from 'lucide-react';
import {
  Button,
  Modal,
  PasswordInput,
  RadioCards,
  Skeleton,
  Switch,
  useConfirm,
  useStableId,
  useToast,
  type RadioCardOption,
} from '@/components/ui';
import { useCommon, useLang, useT } from '@/lib/i18n';
import {
  copyText,
  errMsg,
  generatePassword,
  listDir,
  REDACTED,
  shareNameFrom,
  sharesKey,
  shareUrl,
  useClientPerms,
  type Scope,
  type UserShare,
} from './api';
import { sharesDict } from './i18n';
import { useFilesClient } from './fsclient';
import { longDate } from './when';

const DAY = 86_400_000;

type Preset = 'd1' | 'd7' | 'd30' | 'never';
const PRESET_DAYS: Record<Exclude<Preset, 'never'>, number> = { d1: 1, d7: 7, d30: 30 };

function presetExpiry(p: Preset) {
  return p === 'never' ? 0 : Date.now() + PRESET_DAYS[p] * DAY;
}

interface Draft {
  scope: Scope;
  /** Unix ms, 0 = never. */
  expiresAt: number;
  /** Selected expiry chip (null = a custom date set elsewhere). */
  preset: Preset | null;
  pwdOn: boolean;
  /** Typed/generated password; '' keeps the one already stored (if any). */
  pwd: string;
}

/** Fields the dialog does not edit, sent back untouched on every PUT. */
interface Base {
  name: string;
  description: string;
  paths: string[];
  max_tokens: number;
  allow_from: string[];
}

export type ShareDialogProps =
  | {
      mode: 'create';
      paths: string[];
      /** Item name, used for the title and as the share name ("a +2" for several items). */
      label: string;
      /** Single folder? Unknown = checked with the API. */
      isDir?: boolean;
      onCreated?: (id: string) => void;
      onClose: () => void;
    }
  | { mode: 'edit'; id: string; onClose: () => void };

type Phase = 'loading' | 'creating' | 'ready' | 'failed';

export function ShareDialog(props: ShareDialogProps) {
  const t = useT(sharesDict);
  const c = useCommon();
  const { lang } = useLang();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const fc = useFilesClient();
  const perms = useClientPerms();
  const pwdRequired = !perms.sharesNoPassword;
  const isCreate = props.mode === 'create';

  const [phase, setPhase] = useState<Phase>(isCreate ? 'creating' : 'loading');
  const [id, setId] = useState(props.mode === 'edit' ? props.id : '');
  const [base, setBase] = useState<Base | null>(null);
  const [draft, setDraftState] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [savedOnce, setSavedOnce] = useState(false);
  const [pwdKey, setPwdKey] = useState(0);
  const [deleting, setDeleting] = useState(false);

  const idRef = useRef(id);
  const baseRef = useRef<Base | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const savedRef = useRef<Draft | null>(null);
  const hadPwdRef = useRef(false);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const pwdTimer = useRef(0);
  const started = useRef(false);
  const copyRef = useRef<HTMLButtonElement>(null);
  const canLabelId = useStableId('share-can');
  const expLabelId = useStableId('share-exp');

  const setDraft = (d: Draft) => {
    draftRef.current = d;
    setDraftState(d);
  };

  const paths = props.mode === 'create' ? props.paths : (base?.paths ?? []);
  const single = paths.length === 1 ? paths[0] : null;
  const knownDir = props.mode === 'create' ? props.isDir : undefined;
  // Upload scopes need exactly one folder: check it when the caller does not know.
  const dirQ = useQuery({
    queryKey: ['user-dirs', fc.id, single ?? '', 'is-dir'],
    queryFn: ({ signal }) => listDir(fc, single ?? '/', signal).then(() => true),
    enabled: !!single && knownDir === undefined,
    retry: false,
    staleTime: 60_000,
  });
  const dirPending = !!single && knownDir === undefined && dirQ.isPending;
  const canWrite = !!single && (knownDir ?? (dirQ.data === true || (dirPending && (draft?.scope ?? 1) >= 2)));

  /* ---------- Load (edit) ---------- */

  const editQ = useQuery({
    queryKey: [...sharesKey, fc.id, props.mode === 'edit' ? props.id : ''],
    queryFn: () => fc.request<UserShare>(`/user/shares/${encodeURIComponent(props.mode === 'edit' ? props.id : '')}`),
    enabled: props.mode === 'edit',
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (props.mode !== 'edit' || !editQ.data || started.current) return;
    started.current = true;
    const s = editQ.data;
    const b: Base = {
      name: s.name || s.id || '',
      description: s.description ?? '',
      paths: s.paths ?? [],
      max_tokens: s.max_tokens ?? 0,
      allow_from: s.allow_from ?? [],
    };
    const hadPwd = !!s.password;
    const exp = s.expires_at ?? 0;
    const d: Draft = { scope: (s.scope ?? 1) as Scope, expiresAt: exp, preset: exp ? null : 'never', pwdOn: hadPwd, pwd: '' };
    hadPwdRef.current = hadPwd;
    baseRef.current = b;
    savedRef.current = d;
    setBase(b);
    setDraft(d);
    setPhase('ready');
  }, [props.mode, editQ.data]);

  /* ---------- Create (on open) ---------- */

  const create = useCallback(async () => {
    if (props.mode !== 'create') return;
    setPhase('creating');
    setError(null);
    const b: Base = { name: shareNameFrom(props.label), description: '', paths: props.paths, max_tokens: 0, allow_from: [] };
    const pwd = pwdRequired ? generatePassword() : '';
    const attempt = async (preset: Preset) => {
      const expiresAt = presetExpiry(preset);
      const res = await fc.request<Response>('/user/shares', {
        method: 'POST',
        body: { ...b, scope: 1, expires_at: expiresAt, password: pwd },
        raw: true,
      });
      return { newId: res.headers.get('X-Object-ID') ?? '', expiresAt, preset };
    };
    try {
      let r;
      try {
        r = await attempt('d7');
      } catch (e) {
        // The account caps the expiration below 7 days: fall back to the shortest choice.
        if (!/expire before/i.test(errMsg(e))) throw e;
        r = await attempt('d1');
      }
      if (!r.newId) throw new Error('missing share id');
      const d: Draft = { scope: 1, expiresAt: r.expiresAt, preset: r.preset, pwdOn: !!pwd, pwd };
      idRef.current = r.newId;
      hadPwdRef.current = !!pwd;
      baseRef.current = b;
      savedRef.current = d;
      setId(r.newId);
      setBase(b);
      setDraft(d);
      setPhase('ready');
      props.onCreated?.(r.newId);
      void qc.invalidateQueries({ queryKey: sharesKey });
      window.setTimeout(() => copyRef.current?.focus(), 0);
    } catch (e) {
      setError(errMsg(e));
      setPhase('failed');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isCreate || started.current) return;
    started.current = true; // StrictMode re-runs effects: never create twice.
    void create();
  }, [isCreate, create]);

  /* ---------- Save every change ---------- */

  const save = (next: Draft, kind: 'scope' | 'expiry' | 'pwd') => {
    chain.current = chain.current.then(async () => {
      const b = baseRef.current;
      const shareId = idRef.current;
      if (!b || !shareId) return;
      const password = next.pwdOn ? next.pwd || (hadPwdRef.current ? REDACTED : '') : '';
      setPending((n) => n + 1);
      try {
        await fc.request(`/user/shares/${encodeURIComponent(shareId)}`, { method: 'PUT', body: {
          ...b,
          id: shareId,
          scope: next.scope,
          expires_at: next.expiresAt,
          password,
        } });
        hadPwdRef.current = !!password;
        savedRef.current = next;
        setSavedOnce(true);
        if (kind === 'pwd') setPwdError(null);
        void qc.invalidateQueries({ queryKey: sharesKey });
      } catch (e) {
        const m = errMsg(e);
        if (kind === 'pwd') {
          setPwdError(m);
        } else {
          setError(m);
          // Put the choice back to what the server has.
          const prev = savedRef.current;
          const cur = draftRef.current;
          if (prev && cur) setDraft({ ...cur, scope: prev.scope, expiresAt: prev.expiresAt, preset: prev.preset });
        }
      } finally {
        setPending((n) => n - 1);
      }
    });
    return chain.current;
  };

  const change = (patch: Partial<Draft>, kind: 'scope' | 'expiry' | 'pwd') => {
    const cur = draftRef.current;
    if (!cur) return;
    const next = { ...cur, ...patch };
    setDraft(next);
    setError(null);
    void save(next, kind);
  };

  const flushPwd = () => {
    if (!pwdTimer.current) return;
    window.clearTimeout(pwdTimer.current);
    pwdTimer.current = 0;
    const cur = draftRef.current;
    if (cur?.pwdOn && cur.pwd) void save(cur, 'pwd');
  };

  useEffect(() => () => window.clearTimeout(pwdTimer.current), []);

  const onPwdInput = (value: string) => {
    const cur = draftRef.current;
    if (!cur) return;
    setDraft({ ...cur, pwd: value });
    setPwdError(null);
    window.clearTimeout(pwdTimer.current);
    pwdTimer.current = 0;
    // Empty = keep the stored password: nothing to save.
    if (!value) return;
    pwdTimer.current = window.setTimeout(() => {
      pwdTimer.current = 0;
      const d = draftRef.current;
      if (d?.pwdOn && d.pwd) void save(d, 'pwd');
    }, 700);
  };

  const togglePwd = (on: boolean) => {
    if (pwdRequired && !on) return;
    window.clearTimeout(pwdTimer.current);
    pwdTimer.current = 0;
    setPwdError(null);
    if (on) {
      setPwdKey((k) => k + 1);
      change({ pwdOn: true, pwd: generatePassword() }, 'pwd');
    } else {
      change({ pwdOn: false, pwd: '' }, 'pwd');
    }
  };

  const regenerate = () => {
    window.clearTimeout(pwdTimer.current);
    pwdTimer.current = 0;
    setPwdKey((k) => k + 1);
    change({ pwdOn: true, pwd: generatePassword() }, 'pwd');
  };

  /* ---------- Actions ---------- */

  const close = () => {
    flushPwd();
    props.onClose();
  };

  const copyLink = async () => {
    if (!id) return;
    if (await copyText(shareUrl(id))) toast({ title: t('linkCopied'), tone: 'ok' });
    else toast({ title: c('error'), tone: 'bad' });
  };

  const remove = async () => {
    if (!id) return;
    if (!isCreate) {
      const ok = await confirm({
        title: c('confirmDelete', { name: base?.name || id }),
        message: t('deleteMsg'),
        confirmLabel: c('delete'),
        danger: true,
      });
      if (!ok) return;
    }
    window.clearTimeout(pwdTimer.current);
    pwdTimer.current = 0;
    setDeleting(true);
    try {
      await chain.current;
      await fc.request(`/user/shares/${encodeURIComponent(id)}`, { method: 'DELETE' });
      toast({ title: t('linkDeleted'), tone: 'ok' });
      await qc.invalidateQueries({ queryKey: sharesKey });
      props.onClose();
    } catch (e) {
      setError(errMsg(e));
      setDeleting(false);
    }
  };

  /* ---------- Rendering ---------- */

  const n = paths.length;
  const label = props.mode === 'create' ? props.label : base?.name || props.id;
  const title = n > 1 ? t('dlgTitleMany', { n }) : t('dlgTitle', { name: label });

  const scopeOptions: RadioCardOption<'1' | '2' | '3'>[] = [
    { value: '1', label: t('canRead'), description: t('canReadSub'), icon: Download },
    { value: '2', label: t('canWrite'), description: t('canWriteSub'), icon: Upload, disabled: !canWrite },
    { value: '3', label: t('canBoth'), description: t('canBothSub'), icon: ArrowDownUp, disabled: !canWrite },
  ];
  const presets: { value: Preset; label: string }[] = [
    { value: 'd1', label: t('expTomorrow') },
    { value: 'd7', label: t('exp7') },
    { value: 'd30', label: t('exp30') },
    { value: 'never', label: t('expNever') },
  ];

  const ready = phase === 'ready' && !!draft;
  const busy = !ready || deleting;
  const expired = !!draft && draft.preset === null && draft.expiresAt > 0 && draft.expiresAt < Date.now();
  const url = id ? shareUrl(id) : '';
  const status = phase === 'creating' ? t('creating') : pending > 0 ? t('saving') : savedOnce ? t('saved') : '';

  const footer = (
    <div className="share-dlg__foot">
      <p className="share-dlg__note">
        {isCreate && fc.actingAs ? (
          t('footerActingAs', { name: fc.actingAs })
        ) : isCreate ? (
          <>
            {t('footer')}{' '}
            <Link to="/shares" className="share-dlg__mylink" onClick={close}>
              {t('mySharesLink')}
            </Link>
          </>
        ) : (
          t('footerEdit')
        )}
      </p>
      <Button variant="ghost" size="sm" onClick={() => void remove()} disabled={!id || busy} loading={deleting}>
        {t('deleteLink')}
      </Button>
    </div>
  );

  let body;
  if (props.mode === 'edit' && (editQ.isError || (editQ.isSuccess && !editQ.data))) {
    body = <p className="share-dlg__error" role="alert">{editQ.error ? `${t('notFound')} ${errMsg(editQ.error)}` : t('notFound')}</p>;
  } else if (phase === 'failed') {
    body = (
      <div className="share-dlg__failed" role="alert">
        <p className="share-dlg__error">
          <strong>{t('createFailed')}</strong>
          <br />
          {error}
        </p>
        <Button onClick={() => void create()}>{c('retry')}</Button>
      </div>
    );
  } else if (!draft) {
    body = (
      <div className="share-dlg__body" aria-busy="true">
        <Skeleton height={86} />
        <Skeleton height={44} />
        <Skeleton height={56} />
        <p className="share-dlg__status muted" role="status">
          {phase === 'creating' ? t('creating') : c('loading')}
        </p>
      </div>
    );
  } else {
    body = (
      <div className="share-dlg__body">
        <section className="share-dlg__section">
          <h3 id={canLabelId} className="share-dlg__label">
            {t('canLabel')}
          </h3>
          <RadioCards<'1' | '2' | '3'>
            aria-label={t('canLabel')}
            className="share-dlg__scope"
            value={String(draft.scope) as '1' | '2' | '3'}
            onChange={(v) => change({ scope: Number(v) as Scope }, 'scope')}
            options={scopeOptions}
            disabled={busy}
          />
          {!canWrite && !dirPending && <p className="share-dlg__hint">{t('writeOnlyDir')}</p>}
        </section>

        <section className="share-dlg__section">
          <h3 id={expLabelId} className="share-dlg__label">
            {t('expiresLabel')}
          </h3>
          <Chips
            labelledBy={expLabelId}
            value={draft.preset}
            options={presets}
            disabled={busy}
            onChange={(p) => change({ preset: p, expiresAt: presetExpiry(p) }, 'expiry')}
          />
          {draft.preset === null && draft.expiresAt > 0 && (
            <p className={expired ? 'share-dlg__hint share-dlg__hint--warn' : 'share-dlg__hint'}>
              {expired ? t('expiredOn', { date: longDate(draft.expiresAt, lang) }) : t('expCustom', { date: longDate(draft.expiresAt, lang) })}
            </p>
          )}
        </section>

        <section className="share-dlg__section share-dlg__section--pwd">
          <Switch
            checked={draft.pwdOn || pwdRequired}
            onChange={togglePwd}
            disabled={pwdRequired || busy}
            label={t('askPassword')}
            description={pwdRequired ? t('askPasswordLocked') : undefined}
            labelPosition="end"
          />
          {(draft.pwdOn || pwdRequired) && (
            <div className="share-dlg__pwd">
              <PasswordInput
                key={pwdKey}
                label={t('password')}
                value={draft.pwd}
                onChange={(e) => onPwdInput(e.target.value)}
                onBlur={flushPwd}
                autoComplete="new-password"
                mono
                defaultVisible={!!draft.pwd}
                showLabel={t('showPassword')}
                hideLabel={t('hidePassword')}
                hint={!draft.pwd && hadPwdRef.current ? t('passwordKeep') : t('passwordHint')}
                error={pwdError ?? undefined}
                wrapperClassName="share-dlg__pwd-field"
              />
              <Button icon={Wand2} onClick={regenerate} disabled={busy} className="share-dlg__gen">
                {t('generate')}
              </Button>
            </div>
          )}
        </section>

        <section className="share-dlg__section share-dlg__section--link">
          <div className="share-dlg__linkhead">
            <h3 className="share-dlg__label">{t('linkLabel')}</h3>
            <span className="share-dlg__status" role="status" aria-live="polite">
              {status === t('saved') && <Check size={13} aria-hidden="true" />}
              {status}
            </span>
          </div>
          <div className="share-dlg__linkrow">
            <input
              className="share-dlg__url mono"
              readOnly
              value={url}
              aria-label={t('linkLabel')}
              onFocus={(e) => e.currentTarget.select()}
              onClick={(e) => e.currentTarget.select()}
            />
            <Button ref={copyRef} variant="primary" icon={Link2} onClick={() => void copyLink()} disabled={!id}>
              {t('copyLink')}
            </Button>
          </div>
          {error && (
            <p className="share-dlg__error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
    );
  }

  return (
    <Modal open onClose={close} title={title} description={t('dlgSubtitle')} size="md" footer={footer} closeLabel={c('close')} className="share-dlg">
      {body}
    </Modal>
  );
}

/* ---------- Chips: single choice, the active one inverted ---------- */

function Chips<T extends string>({
  value,
  options,
  onChange,
  labelledBy,
  disabled,
}: {
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  labelledBy: string;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = options.findIndex((o) => o.value === value);
  const tabStop = selected >= 0 ? selected : 0;
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = refs.current.findIndex((el) => el === document.activeElement);
    const from = cur >= 0 ? cur : tabStop;
    let next = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (from + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (from - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    if (next < 0) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(options[next].value);
  };
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="share-chips" onKeyDown={onKeyDown}>
      {options.map((o, i) => (
        <button
          key={o.value}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={i === tabStop ? 0 : -1}
          disabled={disabled}
          className="share-chip"
          onClick={() => o.value !== value && onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
