import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ellipsis, FolderOpen, Link2, Lock, Pencil, Share2, Trash2 } from 'lucide-react';
import { Button, cx, EmptyState, IconButton, Menu, Skeleton, Tooltip, useConfirm, useToast } from '@/components/ui';
import { Page } from '@/app/PageHeader';
import { useBreadcrumbs, useCommands } from '@/app/layout-context';
import { api } from '@/api/client';
import { useCommon, useT } from '@/lib/i18n';
import { baseName, copyText, errMsg, shareExhausted, shareExpired, sharesKey, shareUrl, useClientPerms, type UserShare } from './api';
import { sharesDict } from './i18n';
import { ShareDialog } from './ShareDialog';
import './client.css';

export { sharesKey };

const DAY = 86_400_000;

type Dialog = { mode: 'edit'; id: string } | { mode: 'create'; paths: string[] } | null;

/** "?paths=/a&paths=/b" (also accepts "?paths=/a,/b"). */
export function pathsFromQuery(sp: URLSearchParams) {
  const all = sp.getAll('paths');
  if (all.length === 1 && all[0].includes(',') && all[0].split(',').every((p) => p.trim().startsWith('/'))) {
    return all[0].split(',').map((p) => p.trim());
  }
  return all.filter((p) => p.startsWith('/'));
}

const CREATED_KEY = 'sftpgo-console-share-new:';

function readCreated(search: string) {
  try {
    return sessionStorage.getItem(CREATED_KEY + search);
  } catch {
    return null;
  }
}

function writeCreated(search: string, id: string) {
  try {
    sessionStorage.setItem(CREATED_KEY + search, id);
  } catch {
    /* ignore */
  }
}

export function SharesDisabled() {
  const t = useT(sharesDict);
  return (
    <Page>
      <div className="shares-page">
        <h1 className="files-title">{t('title')}</h1>
        <EmptyState icon={Share2} title={t('disabledTitle')} description={t('disabledText')} />
      </div>
    </Page>
  );
}

export default function SharesPage() {
  const perms = useClientPerms();
  if (!perms.shares) return <SharesDisabled />;
  return <SharesList />;
}

/** `/shares`, `/shares/:id` (dialog open on that share) and `/shares/new?paths=…` (create dialog). */
export function SharesList() {
  const t = useT(sharesDict);
  const c = useCommon();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { id: routeId } = useParams();
  const [sp] = useSearchParams();

  const q = useQuery({ queryKey: sharesKey, queryFn: () => api.get<UserShare[] | null>('/user/shares', { limit: 500 }).then((r) => r ?? []) });

  const search = sp.toString();
  const fromRoute = (): Dialog => {
    if (!routeId) return null;
    if (routeId === 'new') {
      // A reload of /shares/new?paths=… reopens the share it already created.
      const made = readCreated(search);
      if (made) return { mode: 'edit', id: made };
      const paths = pathsFromQuery(sp);
      return paths.length ? { mode: 'create', paths } : null;
    }
    return { mode: 'edit', id: routeId };
  };
  const [dialog, setDialog] = useState<Dialog>(fromRoute);

  // Follow route changes (/shares/:id opened from elsewhere while mounted).
  useEffect(() => {
    if (routeId) setDialog(fromRoute());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeId, search]);

  useBreadcrumbs([{ label: t('title') }]);
  useEffect(() => {
    document.title = `${t('title')} · SFTPGo`;
  }, [t]);
  useCommands([{ id: 'shares:files', label: t('goFiles'), group: t('title'), icon: FolderOpen, run: () => navigate('/files') }]);

  const rows = useMemo(() => {
    const list = (q.data ?? []).slice();
    // Active links first, then most recent.
    const off = (s: UserShare) => Number(shareExpired(s) || shareExhausted(s));
    list.sort((a, b) => off(a) - off(b) || (b.created_at ?? 0) - (a.created_at ?? 0));
    return list;
  }, [q.data]);

  const closeDialog = () => {
    setDialog(null);
    if (routeId) navigate('/shares', { replace: true });
  };

  const openEdit = (s: UserShare) => setDialog({ mode: 'edit', id: s.id ?? '' });

  const copyLink = async (s: UserShare) => {
    if (await copyText(shareUrl(s.id ?? ''))) toast({ title: t('linkCopied'), description: s.name, tone: 'ok' });
    else toast({ title: c('error'), tone: 'bad' });
  };

  const remove = async (s: UserShare) => {
    if (!(await confirm({ title: c('confirmDelete', { name: s.name || s.id || '' }), message: t('deleteMsg'), confirmLabel: c('delete'), danger: true }))) return;
    try {
      await api.del(`/user/shares/${encodeURIComponent(s.id ?? '')}`);
      toast({ title: t('linkDeleted'), description: s.name, tone: 'ok' });
      await qc.invalidateQueries({ queryKey: sharesKey });
    } catch (e) {
      toast({ title: c('error'), description: errMsg(e), tone: 'bad' });
    }
  };

  const rights = (s: UserShare) => (s.scope === 2 ? t('rightsWrite') : s.scope === 3 ? t('rightsReadWrite') : t('rightsRead'));

  const expiry = (s: UserShare) => {
    if (!s.expires_at) return t('neverExpires');
    const diff = s.expires_at - Date.now();
    if (diff <= 0) return t('expired');
    if (diff < DAY) return t('expiresToday', { n: Math.max(1, Math.ceil(diff / 3_600_000)) });
    const days = Math.round(diff / DAY);
    return days <= 1 ? t('expiresTomorrow') : t('expiresIn', { n: days });
  };

  const uses = (s: UserShare) => {
    const n = s.used_tokens ?? 0;
    if (s.max_tokens) return shareExhausted(s) ? t('exhausted') : t('usesMax', { n, max: s.max_tokens });
    return n === 0 ? t('uses0') : n === 1 ? t('uses1') : t('usesN', { n });
  };

  const onRowKey = (e: KeyboardEvent<HTMLLIElement>, s: UserShare) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      openEdit(s);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const sib = e.key === 'ArrowDown' ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling;
      (sib as HTMLElement | null)?.focus();
    }
  };

  const total = q.data?.length ?? 0;

  let content;
  if (q.isLoading) {
    content = (
      <div className="files-card files-skeleton" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={18} width={`${70 - i * 12}%`} />
        ))}
      </div>
    );
  } else if (q.isError) {
    content = (
      <div className="files-card">
        <EmptyState icon={Share2} title={c('error')} description={errMsg(q.error)} action={<Button onClick={() => void q.refetch()}>{c('retry')}</Button>} />
      </div>
    );
  } else if (!total) {
    content = (
      <div className="files-card">
        <EmptyState
          icon={Share2}
          title={t('emptyTitle')}
          description={t('emptyText')}
          action={
            <Button variant="primary" icon={FolderOpen} onClick={() => navigate('/files')}>
              {t('goFiles')}
            </Button>
          }
        />
      </div>
    );
  } else {
    content = (
      <ul className="files-card shares-list" aria-label={t('title')}>
        {rows.map((s) => {
          const off = shareExpired(s) || shareExhausted(s);
          const paths = s.paths ?? [];
          return (
            <li
              key={s.id}
              className={cx('shares-row', off && 'is-off')}
              tabIndex={0}
              onClick={(e) => !(e.target as HTMLElement).closest('button, a, [role="menu"]') && openEdit(s)}
              onKeyDown={(e) => onRowKey(e, s)}
            >
              <div className="shares-row__main">
                <span className="shares-row__name">
                  {s.name || s.id}
                  {s.password && (
                    <Tooltip content={t('protected')}>
                      <span className="shares-row__lock" tabIndex={-1} aria-label={t('protected')} role="img">
                        <Lock size={13} aria-hidden="true" />
                      </span>
                    </Tooltip>
                  )}
                </span>
                <span className="shares-row__what">{paths.join(', ')}</span>
              </div>
              <div className="shares-row__meta">
                <span>{rights(s)}</span>
                <span className="shares-row__dot" aria-hidden="true">·</span>
                <span className={shareExpired(s) ? 'shares-row__bad' : undefined}>{expiry(s)}</span>
                <span className="shares-row__dot" aria-hidden="true">·</span>
                <span>{uses(s)}</span>
              </div>
              <div className="shares-row__actions">
                <Button size="sm" icon={Link2} onClick={() => void copyLink(s)}>
                  {t('copyLink')}
                </Button>
                <Menu
                  placement="bottom-end"
                  trigger={<IconButton icon={Ellipsis} size="sm" label={t('more', { name: s.name || s.id || '' })} />}
                  items={[
                    { label: t('edit'), icon: Pencil, onSelect: () => openEdit(s) },
                    'separator',
                    { label: c('delete'), icon: Trash2, danger: true, onSelect: () => void remove(s) },
                  ]}
                />
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Page>
      <div className="shares-page">
        <header className="files-head">
          <div className="files-head__row">
            <div className="files-head__titles">
              <h1 className="files-title">{t('title')}</h1>
              <p className="files-subtitle">{t('subtitle')}</p>
            </div>
          </div>
        </header>
        {content}
      </div>
      {dialog?.mode === 'edit' && <ShareDialog key={dialog.id} mode="edit" id={dialog.id} onClose={closeDialog} />}
      {dialog?.mode === 'create' && (
        <ShareDialog
          key={dialog.paths.join('\n')}
          mode="create"
          paths={dialog.paths}
          label={dialog.paths.length === 1 ? baseName(dialog.paths[0]) : String(dialog.paths.length)}
          onCreated={(newId) => routeId === 'new' && writeCreated(search, newId)}
          onClose={closeDialog}
        />
      )}
    </Page>
  );
}
