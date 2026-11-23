import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  Check,
  CornerLeftUp,
  Download,
  Ellipsis,
  File as FileIcon,
  FileSymlink,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Share2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  Button,
  cx,
  EmptyState,
  FileDrop,
  IconButton,
  Menu,
  Skeleton,
  useConfirm,
  useToast,
  type MenuItem,
} from '@/components/ui';
import { Page } from '@/app/PageHeader';
import { useBreadcrumbs, useCommands } from '@/app/layout-context';
import { request } from '@/api/client';
import type { DirEntry } from '@/api/types';
import { useCommon, useLang, useT } from '@/lib/i18n';
import { formatBytes } from '@/lib/format';
import {
  baseName,
  dirFromPathname,
  dirKey,
  downloadFile,
  downloadZip,
  entryTime,
  errMsg,
  filesRoute,
  isDir,
  isSymlink,
  joinPath,
  listDir,
  parentPath,
  splitPath,
  useClientPerms,
} from './api';
import { filesDict } from './i18n';
import { MoveCopyDrawer, NameModal } from './FileDialogs';
import { PreviewModal, previewKind, type PreviewKind } from './Preview';
import { ShareDialog } from './ShareDialog';
import { filesFromDrop, uploads, UploadsPanel, type QueuedFile } from './uploads';
import { friendlyDate } from './when';
import './client.css';

type Preview = { path: string; size: number; kind: PreviewKind };
type SortId = 'name' | 'modified' | 'size';
type Sort = { id: SortId; dir: 'asc' | 'desc' };
type ShareTarget = { paths: string[]; label: string; isDir: boolean };

const INTERACTIVE = 'button, a, input, textarea, [role="menu"], [role="menuitem"]';

export default function FilesPage() {
  const t = useT(filesDict);
  const c = useCommon();
  const { lang } = useLang();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const perms = useClientPerms();
  const dir = dirFromPathname(location.pathname);

  const q = useQuery({ queryKey: dirKey(dir), queryFn: ({ signal }) => listDir(dir, signal) });
  const entries = useMemo(() => q.data ?? [], [q.data]);

  const [sort, setSort] = useState<Sort>({ id: 'name', dir: 'asc' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(0);
  const [newFolder, setNewFolder] = useState(false);
  const [renaming, setRenaming] = useState<DirEntry | null>(null);
  const [moveCopy, setMoveCopy] = useState<{ mode: 'move' | 'copy'; names: string[] } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Row to focus once the listing renders (after keyboard navigation). */
  const pendingFocus = useRef<string | true | null>(null);
  const anchor = useRef<number | null>(null);

  // Reset per-folder state when the folder changes.
  useEffect(() => {
    setSelected(new Set());
    setActive(0);
    anchor.current = null;
  }, [dir]);

  const rows = useMemo(() => {
    const list = entries.slice();
    const mul = sort.dir === 'desc' ? -1 : 1;
    const byName = (a: DirEntry, b: DirEntry) => (a.name ?? '').localeCompare(b.name ?? '', lang, { numeric: true, sensitivity: 'base' });
    list.sort((a, b) => {
      const d = Number(isDir(b)) - Number(isDir(a));
      if (d) return d;
      if (sort.id === 'size') return mul * ((a.size ?? 0) - (b.size ?? 0)) || byName(a, b);
      if (sort.id === 'modified') return mul * (entryTime(a) - entryTime(b)) || byName(a, b);
      return mul * byName(a, b);
    });
    return list;
  }, [entries, sort, lang]);

  const byName = useMemo(() => new Map(entries.map((e) => [e.name ?? '', e])), [entries]);
  const selection = useMemo(() => rows.filter((r) => selected.has(r.name ?? '')), [rows, selected]);
  const selNames = selection.map((r) => r.name ?? '');

  // Drop selected names that disappeared (deleted elsewhere, renamed…).
  useEffect(() => {
    setSelected((s) => {
      if (!s.size) return s;
      const next = new Set([...s].filter((n) => byName.has(n)));
      return next.size === s.size ? s : next;
    });
  }, [byName]);

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['user-dirs'] }), [qc]);

  // Refresh listings as uploads complete (debounced).
  useEffect(() => {
    let timer = 0;
    const off = uploads.onUploaded(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void qc.invalidateQueries({ queryKey: ['user-dirs'] }), 300);
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, [qc]);

  const rowEls = () => Array.from(listRef.current?.querySelectorAll<HTMLTableRowElement>('tbody tr[data-row]') ?? []);

  // Focus a row after keyboard navigation once the listing is there.
  useEffect(() => {
    if (q.isLoading || pendingFocus.current === null) return;
    const target = pendingFocus.current;
    pendingFocus.current = null;
    const trs = rowEls();
    if (!trs.length) {
      listRef.current?.focus();
      return;
    }
    const idx = typeof target === 'string' ? Math.max(0, rows.findIndex((r) => r.name === target)) : 0;
    setActive(idx);
    trs[idx]?.focus();
  }, [q.isLoading, rows]);

  /* ---------- Page meta ---------- */

  const segs = splitPath(dir);
  const title = dir === '/' ? t('title') : baseName(dir);
  useBreadcrumbs(
    dir === '/'
      ? [{ label: t('title') }]
      : [{ label: t('title'), to: '/files' }, ...segs.map((s, i) => ({ label: s, to: i < segs.length - 1 ? filesRoute('/' + segs.slice(0, i + 1).join('/')) : undefined }))],
  );
  useEffect(() => {
    document.title = `${title} · SFTPGo`;
  }, [title]);

  /* ---------- Actions ---------- */

  const goTo = (path: string, focus?: string | true) => {
    if (focus !== undefined) pendingFocus.current = focus;
    navigate(filesRoute(path));
  };

  const download = async (names: string[]) => {
    if (!names.length) return;
    setDownloading(true);
    try {
      const single = names.length === 1 ? byName.get(names[0]) : undefined;
      if (single && !isDir(single)) await downloadFile(joinPath(dir, names[0]));
      else await downloadZip(names.map((n) => joinPath(dir, n)));
    } catch (e) {
      toast({ title: c('error'), description: errMsg(e), tone: 'bad' });
    } finally {
      setDownloading(false);
    }
  };

  const open = (e: DirEntry, viaKeyboard = false) => {
    const name = e.name ?? '';
    if (isDir(e)) {
      goTo(joinPath(dir, name), viaKeyboard ? true : undefined);
      return;
    }
    const kind = previewKind(name, e.size ?? 0);
    if (kind) setPreview({ path: joinPath(dir, name), size: e.size ?? 0, kind });
    else void download([name]);
  };

  const startUpload = async (files: QueuedFile[]) => {
    if (!perms.write || !files.length) return;
    const conflicts = files.filter((f) => !(f.relPath ?? f.file.name).includes('/') && byName.has(f.file.name) && !isDir(byName.get(f.file.name)!));
    let list = files;
    if (conflicts.length) {
      const names = conflicts.slice(0, 5).map((f) => f.file.name).join(', ') + (conflicts.length > 5 ? '…' : '');
      const ok = await confirm({
        title: t('overwriteTitle', { n: conflicts.length }),
        message: t('overwriteMsg', { names }),
        confirmLabel: t('overwrite'),
        danger: true,
      });
      if (!ok) list = files.filter((f) => !conflicts.includes(f));
    }
    if (list.length) uploads.enqueue(dir, list);
  };
  const startUploadRef = useRef(startUpload);
  startUploadRef.current = startUpload;

  // Drag and drop anywhere on the page.
  useEffect(() => {
    if (!perms.write) return;
    let depth = 0;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragging(true);
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const drop = (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      // Already handled by an inner drop zone (FileDrop).
      if (!hasFiles(e) || e.defaultPrevented || !e.dataTransfer) return;
      e.preventDefault();
      void filesFromDrop(e.dataTransfer).then((files) => startUploadRef.current(files));
    };
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', over);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', over);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
    };
  }, [perms.write]);

  const remove = async (names: string[]) => {
    if (!perms.write || !names.length) return;
    const ok = await confirm({
      title: names.length === 1 ? t('deleteOne', { name: names[0] }) : t('deleteTitle', { n: names.length }),
      message: t('deleteMsg'),
      confirmLabel: c('delete'),
      danger: true,
    });
    if (!ok) return;
    const errors: string[] = [];
    for (const n of names) {
      const e = byName.get(n);
      try {
        await request(e && isDir(e) ? '/user/dirs' : '/user/files', { method: 'DELETE', query: { path: joinPath(dir, n) } });
      } catch (err) {
        errors.push(`${n}: ${errMsg(err)}`);
      }
    }
    setSelected(new Set());
    await refresh();
    const okCount = names.length - errors.length;
    if (okCount) toast({ title: t('deleted', { n: okCount }), tone: 'ok' });
    if (errors.length) toast({ title: t('partial', { n: errors.length }), description: errors.join('\n'), tone: 'bad', duration: 0 });
    listRef.current?.focus();
  };

  const share = (names: string[]) => {
    if (!perms.shares || !names.length) return;
    const first = byName.get(names[0]);
    setShareTarget({
      paths: names.map((n) => joinPath(dir, n)),
      label: names.length === 1 ? names[0] : String(names.length),
      isDir: names.length === 1 && !!first && isDir(first),
    });
  };

  const createFolder = async (name: string) => {
    await request('/user/dirs', { method: 'POST', query: { path: joinPath(dir, name) } });
    toast({ title: t('created'), description: name, tone: 'ok' });
    setNewFolder(false);
    pendingFocus.current = name;
    await refresh();
  };

  const rename = async (from: DirEntry, to: string) => {
    await request('/user/file-actions/move', { method: 'POST', query: { path: joinPath(dir, from.name ?? ''), target: joinPath(dir, to) } });
    toast({ title: t('renamed'), description: `${from.name} → ${to}`, tone: 'ok' });
    setRenaming(null);
    setSelected((s) => (s.has(from.name ?? '') ? new Set([...s].filter((n) => n !== from.name).concat(to)) : s));
    pendingFocus.current = to;
    await refresh();
  };

  const moveOrCopy = async (mode: 'move' | 'copy', names: string[], dest: string) => {
    const errors: string[] = [];
    for (const n of names) {
      try {
        await request(`/user/file-actions/${mode}`, { method: 'POST', query: { path: joinPath(dir, n), target: joinPath(dest, n) } });
      } catch (err) {
        errors.push(`${n}: ${errMsg(err)}`);
      }
    }
    await refresh();
    const okCount = names.length - errors.length;
    if (okCount) {
      toast({
        title: t(mode === 'move' ? 'moved' : 'copied', { n: okCount }),
        tone: 'ok',
        action: { label: t('open'), onClick: () => goTo(dest) },
      });
    }
    if (errors.length) toast({ title: t('partial', { n: errors.length }), description: errors.join('\n'), tone: 'bad', duration: 0 });
    if (mode === 'move') setSelected(new Set());
    setMoveCopy(null);
  };

  /* ---------- Selection ---------- */

  const toggle = (idx: number) => {
    const name = rows[idx]?.name ?? '';
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });
    anchor.current = idx;
  };

  const selectRange = (idx: number) => {
    const from = anchor.current ?? idx;
    const [a, b] = [Math.min(from, idx), Math.max(from, idx)];
    setSelected((s) => new Set([...s, ...rows.slice(a, b + 1).map((r) => r.name ?? '')]));
  };

  const onRowClick = (e: MouseEvent<HTMLTableRowElement>, row: DirEntry, idx: number) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    setActive(idx);
    if (e.shiftKey) {
      selectRange(idx);
      return;
    }
    if (e.metaKey || e.ctrlKey) {
      toggle(idx);
      return;
    }
    open(row, e.detail === 0);
  };

  /* ---------- Keyboard ---------- */

  const focusedIndex = () => {
    const tr = (document.activeElement as HTMLElement | null)?.closest('tr[data-row]');
    return tr ? rowEls().indexOf(tr as HTMLTableRowElement) : -1;
  };

  const focusRow = (i: number) => {
    setActive(i);
    rowEls()[i]?.focus();
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, [role="menu"], [role="dialog"]')) return;
    const onRow = target.tagName === 'TR';
    const mod = e.metaKey || e.ctrlKey;
    const els = rowEls();
    const i = focusedIndex();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!els.length) return;
      e.preventDefault();
      const next = i < 0 ? 0 : Math.min(els.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)));
      focusRow(next);
      if (e.shiftKey) {
        if (anchor.current === null) anchor.current = Math.max(0, i);
        selectRange(next);
      }
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      if (!els.length) return;
      e.preventDefault();
      focusRow(e.key === 'Home' ? 0 : els.length - 1);
      return;
    }
    if (e.key === 'Enter' && onRow && i >= 0) {
      e.preventDefault();
      open(rows[i], true);
      return;
    }
    if (e.key === ' ' && onRow && i >= 0) {
      e.preventDefault();
      toggle(i);
      return;
    }
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      setSelected(new Set(rows.map((r) => r.name ?? '')));
      return;
    }
    if (e.key === 'Escape' && selected.size) {
      e.preventDefault();
      setSelected(new Set());
      return;
    }
    if ((e.key === 'Delete' || (mod && e.key === 'Backspace')) && perms.write) {
      const names = selNames.length ? selNames : i >= 0 ? [rows[i]?.name ?? ''] : [];
      if (names.length) {
        e.preventDefault();
        void remove(names);
      }
      return;
    }
    if (e.key === 'Backspace' && !mod && dir !== '/') {
      e.preventDefault();
      goTo(parentPath(dir), baseName(dir));
      return;
    }
    if (e.key === 'F2' && i >= 0 && perms.write) {
      e.preventDefault();
      setRenaming(rows[i]);
    }
  };

  /* ---------- Commands ---------- */

  useCommands([
    ...(perms.write
      ? [
          { id: 'files:upload', label: t('uploadFiles'), group: t('title'), icon: Upload, keywords: ['upload', 'déposer', 'envoyer'], run: () => fileInput.current?.click() },
          { id: 'files:mkdir', label: t('newFolder'), group: t('title'), icon: FolderPlus, keywords: ['mkdir', 'dossier', 'folder'], run: () => setNewFolder(true) },
        ]
      : []),
    ...(perms.shares && selNames.length
      ? [{ id: 'files:share', label: t('shareSelection'), group: t('title'), icon: Share2, keywords: ['share', 'partage', 'lien'], run: () => share(selNames) }]
      : []),
    ...(dir !== '/' ? [{ id: 'files:up', label: t('parent'), group: t('title'), icon: CornerLeftUp, run: () => goTo(parentPath(dir)) }] : []),
  ]);

  /* ---------- Rendering ---------- */

  const rowMenu = (e: DirEntry): MenuItem[] => {
    const name = e.name ?? '';
    const items: MenuItem[] = [{ label: t('download'), icon: Download, onSelect: () => void download([name]) }];
    if (perms.write) {
      items.push(
        { label: t('rename'), icon: Pencil, kbd: 'F2', onSelect: () => setRenaming(e) },
        { label: t('moveCopy'), icon: ArrowRightLeft, onSelect: () => setMoveCopy({ mode: 'move', names: [name] }) },
        'separator',
        { label: c('delete'), icon: Trash2, danger: true, onSelect: () => void remove([name]) },
      );
    }
    return items;
  };

  const sortHeader = (id: SortId, label: string, className?: string) => {
    const on = sort.id === id;
    const Arrow = sort.dir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th scope="col" className={className} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
        <button
          type="button"
          className={cx('files-sort', on && 'is-on')}
          onClick={() => setSort(on ? { id, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { id, dir: id === 'name' ? 'asc' : 'desc' })}
        >
          {label}
          {on && <Arrow size={12} aria-hidden="true" />}
        </button>
      </th>
    );
  };

  const dateWords = { today: (time: string) => t('today', { time }), yesterday: (time: string) => t('yesterday', { time }) };
  const nSel = selection.length;

  const head =
    nSel > 0 ? (
      <tr className="files-selrow">
        <th colSpan={4} scope="colgroup">
          <div className="files-selbar" role="toolbar" aria-label={t(nSel > 1 ? 'selectedMany' : 'selected', { n: nSel })}>
            <span className="files-selbar__count">{t(nSel > 1 ? 'selectedMany' : 'selected', { n: nSel })}</span>
            <span className="files-selbar__dot" aria-hidden="true">·</span>
            <button type="button" className="files-selbar__btn" disabled={downloading} onClick={() => void download(selNames)}>
              {t('download')}
            </button>
            {perms.shares && (
              <>
                <span className="files-selbar__dot" aria-hidden="true">·</span>
                <button type="button" className="files-selbar__btn" onClick={() => share(selNames)}>
                  {t('share')}
                </button>
              </>
            )}
            {perms.write && (
              <>
                <span className="files-selbar__dot" aria-hidden="true">·</span>
                <button type="button" className="files-selbar__btn" onClick={() => setMoveCopy({ mode: 'move', names: selNames })}>
                  {t('move')}
                </button>
                <span className="files-selbar__dot" aria-hidden="true">·</span>
                <button type="button" className="files-selbar__btn files-selbar__btn--bad" onClick={() => void remove(selNames)}>
                  {c('delete')}
                </button>
              </>
            )}
            <IconButton icon={X} size="sm" label={t('clearSel')} className="files-selbar__clear" onClick={() => setSelected(new Set())} />
          </div>
        </th>
      </tr>
    ) : (
      <tr>
        {sortHeader('name', t('colName'), 'files-c-name')}
        {sortHeader('modified', t('colModified'), 'files-c-mod')}
        {sortHeader('size', t('colSize'), 'files-c-size')}
        <th scope="col" className="files-c-act">
          <span className="sr-only">{c('actions')}</span>
        </th>
      </tr>
    );

  let content;
  if (q.isLoading) {
    content = (
      <div className="files-skeleton" aria-busy="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height={18} width={`${70 - i * 9}%`} />
        ))}
      </div>
    );
  } else if (!rows.length) {
    content = perms.write ? (
      <div className="files-empty">
        <EmptyState compact icon={FolderOpen} title={t('emptyTitle')} description={t('emptyText')} />
        <FileDrop multiple label={t('dropHere')} hint={t('dropHint', { dir: title })} onFiles={(files) => void startUpload(files.map((file) => ({ file })))} />
      </div>
    ) : (
      <div className="files-empty">
        <EmptyState compact icon={FolderOpen} title={t('emptyRO')} />
      </div>
    );
  } else {
    content = (
      <table className="files-table" aria-label={title}>
        <thead>{head}</thead>
        <tbody>
          {rows.map((e, idx) => {
            const name = e.name ?? '';
            const folder = isDir(e);
            const isSel = selected.has(name);
            const Icon = folder ? Folder : isSymlink(e) ? FileSymlink : FileIcon;
            const tab = idx === Math.min(active, rows.length - 1) ? 0 : -1;
            const date = friendlyDate(e.last_modified ?? null, lang, dateWords);
            const size = folder ? '' : formatBytes(e.size ?? 0, lang);
            return (
              <tr
                key={name}
                data-row=""
                tabIndex={tab}
                className={cx('files-row', folder && 'files-row--dir', isSel && 'is-selected')}
                onClick={(ev) => onRowClick(ev, e, idx)}
                onMouseDown={(ev) => ev.shiftKey && ev.preventDefault()}
                onFocus={() => setActive(idx)}
              >
                <td className="files-c-name">
                  <div className="files-name">
                    <button
                      type="button"
                      className={cx('files-pick', folder ? 'files-pick--dir' : 'files-pick--file')}
                      aria-pressed={isSel}
                      aria-label={t(isSel ? 'unselectRow' : 'selectRow', { name })}
                      tabIndex={-1}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setActive(idx);
                        if (ev.shiftKey) selectRange(idx);
                        else toggle(idx);
                      }}
                    >
                      <Icon size={18} className="files-pick__icon" aria-hidden="true" />
                      <Check size={14} strokeWidth={3} className="files-pick__check" aria-hidden="true" />
                    </button>
                    <span className="files-name__text">{name}</span>
                    <span className="files-name__meta" aria-hidden="true">
                      {size ? `${date} · ${size}` : date}
                    </span>
                  </div>
                </td>
                <td className="files-c-mod">
                  {e.last_modified ? <time dateTime={new Date(e.last_modified).toISOString()}>{date}</time> : date}
                </td>
                <td className="files-c-size">{size || <span aria-hidden="true">—</span>}</td>
                <td className="files-c-act">
                  <div className="files-act">
                    {perms.shares && (
                      <Button size="sm" className="files-act__share" tabIndex={tab} onClick={() => share([name])}>
                        {t('share')}
                      </Button>
                    )}
                    <Menu
                      placement="bottom-end"
                      trigger={<IconButton icon={Ellipsis} size="sm" label={t('more', { name })} tabIndex={tab} />}
                      items={rowMenu(e)}
                    />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <Page>
      <div className="files-page">
        <header className="files-head">
          {dir !== '/' && (
            <nav className="files-trail" aria-label={t('path')}>
              <ol>
                <li>
                  <Link to="/files">{t('root')}</Link>
                </li>
                {segs.map((s, i) => {
                  const p = '/' + segs.slice(0, i + 1).join('/');
                  const last = i === segs.length - 1;
                  return (
                    <li key={p}>
                      <span className="files-trail__sep" aria-hidden="true">
                        /
                      </span>
                      {last ? <span aria-current="page">{s}</span> : <Link to={filesRoute(p)}>{s}</Link>}
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}
          <div className="files-head__row">
            <h1 className="files-title">{title}</h1>
            {perms.write && (
              <div className="files-head__actions">
                <Button icon={FolderPlus} onClick={() => setNewFolder(true)}>
                  {t('newFolder')}
                </Button>
                <Button variant="primary" icon={Upload} onClick={() => fileInput.current?.click()}>
                  {t('uploadFiles')}
                </Button>
              </div>
            )}
          </div>
        </header>

        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          tabIndex={-1}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            void startUpload(files.map((file) => ({ file })));
          }}
        />

        {q.isError ? (
          <div className="files-card">
            <EmptyState
              icon={FolderOpen}
              title={t('loadError')}
              description={errMsg(q.error)}
              action={
                <div className="files-error-actions">
                  <Button onClick={() => void q.refetch()}>{c('retry')}</Button>
                  {dir !== '/' && <Button onClick={() => goTo('/')}>{t('backRoot')}</Button>}
                </div>
              }
            />
          </div>
        ) : (
          <div ref={listRef} className="files-card" tabIndex={-1} onKeyDown={onListKeyDown}>
            {content}
          </div>
        )}
      </div>

      {dragging && perms.write && (
        <div className="files-dropzone" aria-hidden="true">
          <div className="files-dropzone__box">
            <Upload size={28} />
            <span>{t('dropOverlay', { dir: title })}</span>
          </div>
        </div>
      )}

      <UploadsPanel />

      {newFolder && (
        <NameModal
          title={t('newFolder')}
          label={t('folderName')}
          initial=""
          confirmLabel={c('create')}
          existing={byName}
          onClose={() => setNewFolder(false)}
          onSubmit={createFolder}
        />
      )}
      {renaming && (
        <NameModal
          title={`${t('rename')} · ${renaming.name}`}
          label={t('newName')}
          initial={renaming.name ?? ''}
          selectBase={!isDir(renaming)}
          confirmLabel={t('rename')}
          existing={byName}
          onClose={() => setRenaming(null)}
          onSubmit={(name) => rename(renaming, name)}
        />
      )}
      {moveCopy && (
        <MoveCopyDrawer
          dir={dir}
          names={moveCopy.names}
          initialMode={moveCopy.mode}
          onClose={() => setMoveCopy(null)}
          onSubmit={(mode, dest) => moveOrCopy(mode, moveCopy.names, dest)}
        />
      )}
      {preview && (
        <PreviewModal
          path={preview.path}
          size={preview.size}
          kind={preview.kind}
          onClose={() => setPreview(null)}
          onDownload={() => void download([baseName(preview.path)])}
        />
      )}
      {shareTarget && (
        <ShareDialog mode="create" paths={shareTarget.paths} label={shareTarget.label} isDir={shareTarget.isDir} onClose={() => setShareTarget(null)} />
      )}
    </Page>
  );
}
