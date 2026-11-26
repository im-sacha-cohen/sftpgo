import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronRight,
  Copy,
  CornerLeftUp,
  Download,
  Ellipsis,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileImage,
  FileSymlink,
  FileText,
  FileVideo,
  Folder,
  FolderOpen,
  FolderPlus,
  LayoutGrid,
  ListChecks,
  Link2,
  List,
  Minus,
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
  FilterChips,
  IconButton,
  Menu,
  SegmentedControl,
  Skeleton,
  useConfirm,
  useToast,
  type MenuItem,
} from '@/components/ui';
import { useBreadcrumbs, useCommands } from '@/app/layout-context';
import type { DirEntry } from '@/api/types';
import { useCommon, useLang, useT } from '@/lib/i18n';
import { formatBytes } from '@/lib/format';
import {
  baseName,
  dirKey,
  downloadFile,
  downloadZip,
  entryTime,
  errMsg,
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
import { PreviewLayout } from '@/components/preview/FilePreview';
import { fileKind, type FileKind } from '@/components/preview/kinds';
import { streamingReady, streamUrl } from '@/lib/stream';
import { ShareDialog } from './ShareDialog';
import { filesFromDrop, uploads, UploadsPanel, type QueuedFile } from './uploads';
import { useFilesClient } from './fsclient';
import { useExplorerRequests } from './Drive';
import { friendlyDate } from './when';
import './client.css';

type Preview = { path: string; size: number; kind: PreviewKind; live: boolean };
type SortId = 'name' | 'modified' | 'size' | 'kind';
type View = 'list' | 'grid';
type KindFilter = 'all' | FileKind;

/** Files modified this recently are watched: the listing refreshes to see whether they grow. */
const RECENT_MS = 60_000;
const VIEW_KEY = 'sftpgo-files-view';
const isRecent = (e: DirEntry, now = Date.now()) => !isDir(e) && now - entryTime(e) < RECENT_MS;

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list';
  } catch {
    return 'list';
  }
}
type Sort = { id: SortId; dir: 'asc' | 'desc' };
const SORT_KEY = 'sftpgo-files-sort';
const SORT_IDS: SortId[] = ['name', 'modified', 'size', 'kind'];

/** The sort last chosen, kept for every folder, person and space (like list/grid). */
function readSort(): Sort {
  try {
    const v = JSON.parse(localStorage.getItem(SORT_KEY) ?? 'null') as Partial<Sort> | null;
    if (v && SORT_IDS.includes(v.id as SortId) && (v.dir === 'asc' || v.dir === 'desc')) return { id: v.id as SortId, dir: v.dir };
  } catch {
    /* ignore */
  }
  return { id: 'name', dir: 'asc' };
}
type ShareTarget = { paths: string[]; label: string; isDir: boolean };

const INTERACTIVE = 'button, a, input, textarea, [role="menu"], [role="menuitem"]';

export interface ExplorerProps {
  /** Folder shown ("/" = root of the account). */
  dir: string;
  /** Router path of a folder. */
  route: (dir: string) => string;
  /** Name of the root folder in the path ("My files", "gly-logger"…). */
  rootLabel?: string;
  /** Line above the title (whose files these are, links…). */
  context?: ReactNode;
  /** Called after any change (quota refresh…). */
  onChanged?: () => void;
  /** Upload / New folder live in the sidebar's New menu (hidden from the header on wide screens). */
  actionsInSidebar?: boolean;
}

export function Explorer({ dir, route, rootLabel, context, onChanged, actionsInSidebar }: ExplorerProps) {
  const t = useT(filesDict);
  const c = useCommon();
  const { lang } = useLang();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fc = useFilesClient();
  const perms = useClientPerms();
  const rootName = rootLabel ?? t('root');

  const q = useQuery({
    queryKey: dirKey(fc, dir),
    queryFn: ({ signal }) => listDir(fc, dir, signal),
    // While a file may still be written, refresh to see whether it grows.
    refetchInterval: (query) => ((query.state.data ?? []).some((e) => isRecent(e)) ? 5000 : false),
  });

  // A file is LIVE (being written) when it grew between two listings and was modified recently.
  // A file that was just uploaded is recent too, but it does not grow any more.
  const sizes = useRef(new Map<string, number>());
  const [growing, setGrowing] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!q.data) return;
    const now = Date.now();
    const next = new Set<string>();
    const seen = new Map<string, number>();
    for (const e of q.data) {
      if (isDir(e)) continue;
      const name = e.name ?? '';
      const before = sizes.current.get(name);
      seen.set(name, e.size ?? 0);
      if (isRecent(e, now) && (growing.has(name) || (before !== undefined && (e.size ?? 0) > before))) next.add(name);
    }
    sizes.current = seen;
    setGrowing((g) => (g.size === next.size && [...next].every((n) => g.has(n)) ? g : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);
  useEffect(() => {
    sizes.current = new Map();
    setGrowing(new Set());
  }, [dir, fc.id]);
  const isLive = (e: DirEntry, now = Date.now()) => isRecent(e, now) && growing.has(e.name ?? '');
  const entries = useMemo(() => q.data ?? [], [q.data]);

  const [sort, setSortState] = useState<Sort>(readSort);
  const setSort = (v: Sort) => {
    setSortState(v);
    try {
      localStorage.setItem(SORT_KEY, JSON.stringify(v));
    } catch {
      /* ignore */
    }
  };
  const [view, setViewState] = useState<View>(readView);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const setView = (v: View) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState(0);
  const [newFolder, setNewFolder] = useState(false);
  const [renaming, setRenaming] = useState<DirEntry | null>(null);
  const [moveCopy, setMoveCopy] = useState<{ mode: 'move' | 'copy'; names: string[] } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [streaming, setStreaming] = useState(false);
  useEffect(() => {
    let on = true;
    void streamingReady().then((v) => on && setStreaming(v));
    return () => {
      on = false;
    };
  }, []);

  const fileInput = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** Row to focus once the listing renders (after keyboard navigation). */
  const pendingFocus = useRef<string | true | null>(null);
  const anchor = useRef<number | null>(null);

  // Reset per-folder state when the folder changes.
  useEffect(() => {
    setKindFilter('all');
    setSelected(new Set());
    setActive(0);
    anchor.current = null;
  }, [dir]);

  const kindCounts = useMemo(() => {
    const m = new Map<FileKind, number>();
    for (const e of entries) if (!isDir(e)) m.set(fileKind(e.name ?? ''), (m.get(fileKind(e.name ?? '')) ?? 0) + 1);
    return m;
  }, [entries]);
  // A filter on a type that is no longer in the folder would hide everything.
  const activeKind: KindFilter = kindFilter !== 'all' && !kindCounts.has(kindFilter) ? 'all' : kindFilter;

  const rows = useMemo(() => {
    const list = entries.filter((e) => activeKind === 'all' || (!isDir(e) && fileKind(e.name ?? '') === activeKind));
    const mul = sort.dir === 'desc' ? -1 : 1;
    const byName = (a: DirEntry, b: DirEntry) => (a.name ?? '').localeCompare(b.name ?? '', lang, { numeric: true, sensitivity: 'base' });
    list.sort((a, b) => {
      const d = Number(isDir(b)) - Number(isDir(a));
      if (d) return d;
      if (sort.id === 'size') return mul * ((a.size ?? 0) - (b.size ?? 0)) || byName(a, b);
      if (sort.id === 'kind') return mul * fileKind(a.name ?? '').localeCompare(fileKind(b.name ?? '')) || byName(a, b);
      if (sort.id === 'modified') return mul * (entryTime(a) - entryTime(b)) || byName(a, b);
      return mul * byName(a, b);
    });
    return list;
  }, [entries, sort, lang, activeKind]);

  // Files the viewer can open, in the order shown, for previous/next in the viewer.
  const viewable = useMemo(() => rows.filter((e) => !isDir(e) && previewKind(e.name ?? '')), [rows]);
  const previewIndex = preview ? viewable.findIndex((e) => joinPath(dir, e.name ?? '') === preview.path) : -1;
  const showPreview = (e: DirEntry) => {
    const kind = previewKind(e.name ?? '', e.size ?? 0);
    if (kind) setPreview({ path: joinPath(dir, e.name ?? ''), size: e.size ?? 0, kind, live: isLive(e) });
    return !!kind;
  };

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

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['user-dirs', fc.id] });
    onChanged?.();
  }, [qc, fc.id, onChanged]);

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

  const rowEls = () => Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-row]') ?? []);

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
  const title = dir === '/' ? rootName : baseName(dir);
  // The path is shown in the page itself (design v2): give the shell the title only.
  useBreadcrumbs([{ label: title }]);
  useEffect(() => {
    document.title = `${title} · SFTPGo`;
  }, [title]);

  /* ---------- Actions ---------- */

  const goTo = (path: string, focus?: string | true) => {
    if (focus !== undefined) pendingFocus.current = focus;
    navigate(route(path));
  };

  const download = async (names: string[]) => {
    if (!names.length) return;
    setDownloading(true);
    try {
      const single = names.length === 1 ? byName.get(names[0]) : undefined;
      if (single && !isDir(single)) await downloadFile(fc, joinPath(dir, names[0]));
      else if (perms.zip) await downloadZip(fc, names.map((n) => joinPath(dir, n)));
      else {
        // No zip here (spaces): files one by one, folders can't be downloaded.
        const files = names.filter((n) => {
          const e = byName.get(n);
          return e && !isDir(e);
        });
        for (const n of files) await downloadFile(fc, joinPath(dir, n));
        if (files.length < names.length) toast({ title: t('noFolderDownload'), tone: 'bad' });
      }
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
    if (!showPreview(e)) void download([name]);
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
    if (list.length) uploads.enqueue(fc, dir, list);
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
      message: names.some((n) => {
        const e = byName.get(n);
        return !!e && isDir(e);
      })
        ? t('deleteMsg')
        : t('deleteFileMsg'),
      confirmLabel: c('delete'),
      danger: true,
    });
    if (!ok) return;
    const errors: string[] = [];
    for (const n of names) {
      const e = byName.get(n);
      try {
        await fc.request(e && isDir(e) ? '/user/dirs' : '/user/files', { method: 'DELETE', query: { path: joinPath(dir, n) } });
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
      label: names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`,
      isDir: names.length === 1 && !!first && isDir(first),
    });
  };

  const createFolder = async (name: string) => {
    await fc.request('/user/dirs', { method: 'POST', query: { path: joinPath(dir, name) } });
    toast({ title: t('created'), description: name, tone: 'ok' });
    setNewFolder(false);
    pendingFocus.current = name;
    await refresh();
  };

  const rename = async (from: DirEntry, to: string) => {
    await fc.request('/user/file-actions/move', { method: 'POST', query: { path: joinPath(dir, from.name ?? ''), target: joinPath(dir, to) } });
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
        await fc.request(`/user/file-actions/${mode}`, { method: 'POST', query: { path: joinPath(dir, n), target: joinPath(dest, n) } });
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

  const onRowClick = (e: MouseEvent<HTMLElement>, row: DirEntry, idx: number) => {
    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
    setActive(idx);
    if (e.shiftKey) {
      selectRange(idx);
      return;
    }
    // Once something is selected, a click adds to or removes from the selection (Esc clears it).
    if (e.metaKey || e.ctrlKey || (selected.size > 0 && e.detail !== 0)) {
      toggle(idx);
      return;
    }
    open(row, e.detail === 0);
  };

  /* ---------- Keyboard ---------- */

  const focusedIndex = () => {
    const tr = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-row]');
    return tr ? rowEls().indexOf(tr) : -1;
  };

  const focusRow = (i: number) => {
    setActive(i);
    rowEls()[i]?.focus();
  };

  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, [role="menu"], [role="dialog"]')) return;
    const onRow = target.hasAttribute('data-row');
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

  useExplorerRequests((r) => {
    if (!perms.write) return;
    if (r === 'upload') fileInput.current?.click();
    else setNewFolder(true);
  });

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
    if (perms.shares) items.push({ label: t('share'), icon: Share2, onSelect: () => share([name]) });
    if (perms.write) {
      items.push(
        { label: t('rename'), icon: Pencil, kbd: 'F2', onSelect: () => setRenaming(e) },
        { label: t('move'), icon: ArrowRightLeft, onSelect: () => setMoveCopy({ mode: 'move', names: [name] }) },
        ...(perms.copy ? [{ label: t('copy'), icon: Copy, onSelect: () => setMoveCopy({ mode: 'copy', names: [name] }) }] : []),
        'separator',
        { label: c('delete'), icon: Trash2, danger: true, onSelect: () => void remove([name]) },
      );
    }
    return items;
  };

  const sortHeader = (id: SortId, label: string, className?: string, before?: ReactNode) => {
    const on = sort.id === id;
    const Arrow = sort.dir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <th scope="col" className={className} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
        {before}
        <button
          type="button"
          className={cx('files-sort', on && 'is-on')}
          onClick={() => setSort(on ? { id, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { id, dir: id === 'name' || id === 'kind' ? 'asc' : 'desc' })}
        >
          {label}
          {on && <Arrow size={12} aria-hidden="true" />}
        </button>
      </th>
    );
  };

  const sortLabels: Record<SortId, string> = { name: t('colName'), modified: t('colModified'), size: t('colSize'), kind: t('colKind') };
  const sortMenu = (
    <Menu
      placement="bottom-end"
      aria-label={t('sort')}
      trigger={
        <Button size="sm" variant="secondary" icon={ArrowUpDown}>
          {t('sortedBy', { col: sortLabels[sort.id] })}
        </Button>
      }
      items={[
        ...(['name', 'modified', 'size', 'kind'] as SortId[]).map((id) => ({
          label: sortLabels[id],
          icon: sort.id === id ? Check : undefined,
          onSelect: () => setSort({ id, dir: sort.id === id ? sort.dir : id === 'name' || id === 'kind' ? 'asc' : 'desc' }),
        })),
        'separator' as const,
        { label: t(sort.id === 'name' || sort.id === 'kind' ? 'orderAz' : sort.id === 'size' ? 'orderSmall' : 'orderOld'), icon: sort.dir === 'asc' ? Check : undefined, onSelect: () => setSort({ ...sort, dir: 'asc' }) },
        { label: t(sort.id === 'name' || sort.id === 'kind' ? 'orderZa' : sort.id === 'size' ? 'orderBig' : 'orderNew'), icon: sort.dir === 'desc' ? Check : undefined, onSelect: () => setSort({ ...sort, dir: 'desc' }) },
      ]}
    />
  );

  const dateWords = { today: (time: string) => t('today', { time }), yesterday: (time: string) => t('yesterday', { time }) };
  const nSel = selection.length;
  const allSelected = rows.length > 0 && nSel === rows.length;
  const selectAll = () => setSelected(new Set(rows.map((r) => r.name ?? '')));
  const selectAllBox = (
    <button
      type="button"
      role="checkbox"
      className={cx('files-all', nSel > 0 && 'is-on')}
      aria-checked={allSelected ? true : nSel > 0 ? 'mixed' : false}
      aria-label={allSelected ? t('clearSel') : t('selectAll')}
      title={allSelected ? t('clearSel') : t('selectAll')}
      disabled={!rows.length}
      onClick={() => (allSelected ? setSelected(new Set()) : selectAll())}
    >
      {allSelected ? <Check size={13} strokeWidth={3} aria-hidden="true" /> : nSel > 0 ? <Minus size={13} strokeWidth={3} aria-hidden="true" /> : null}
    </button>
  );
  const now = Date.now();
  const kindLabel = (e: DirEntry) => (isDir(e) ? t('kindFolder') : t(`kind_${fileKind(e.name ?? '')}`));

  const kindChips = [
    { id: 'all' as KindFilter, label: t('all'), count: entries.length },
    ...KIND_ORDER.filter((k) => kindCounts.has(k)).map((k) => ({ id: k as KindFilter, label: t(`kinds_${k}`), count: kindCounts.get(k) })),
  ];

  const toolbar =
    nSel > 0 ? (
      <div className="files-selbar" role="toolbar" aria-label={t(nSel > 1 ? 'selectedMany' : 'selected', { n: nSel })}>
        <IconButton icon={X} size="sm" label={t('clearSel')} className="files-selbar__clear" onClick={() => setSelected(new Set())} />
        <span className="files-selbar__count">{t(nSel > 1 ? 'selectedMany' : 'selected', { n: nSel })}</span>
        {!allSelected && (
          <Button size="sm" variant="ghost" icon={ListChecks} onClick={selectAll}>
            {t('selectAllN', { n: rows.length })}
          </Button>
        )}
        <span className="files-selbar__sep" aria-hidden="true" />
        {perms.shares && (
          <Button size="sm" variant="ghost" icon={Link2} onClick={() => share(selNames)}>
            {t('share')}
          </Button>
        )}
        <Button size="sm" variant="ghost" icon={Download} loading={downloading} onClick={() => void download(selNames)}>
          {perms.zip && (nSel > 1 || selection.some(isDir)) ? t('downloadZip') : t('download')}
        </Button>
        {perms.write && (
          <>
            {nSel === 1 && (
              <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setRenaming(selection[0])}>
                {t('rename')}
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={ArrowRightLeft} onClick={() => setMoveCopy({ mode: 'move', names: selNames })}>
              {t('move')}
            </Button>
            {perms.copy && (
              <Button size="sm" variant="ghost" icon={Copy} onClick={() => setMoveCopy({ mode: 'copy', names: selNames })}>
                {t('copy')}
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={Trash2} className="files-selbar__bad" onClick={() => void remove(selNames)}>
              {c('delete')}
            </Button>
          </>
        )}
        <span className="files-selbar__size mono">{formatBytes(selection.reduce((n, e) => n + (isDir(e) ? 0 : (e.size ?? 0)), 0), lang)}</span>
      </div>
    ) : (
      <div className="files-toolbar">
        {kindChips.length > 2 ? (
          <FilterChips aria-label={t('filterType')} chips={kindChips} value={activeKind} onChange={setKindFilter} />
        ) : (
          <span />
        )}
        <div className="files-toolbar__end">
          {sortMenu}
          <SegmentedControl
            size="sm"
            aria-label={t('layout')}
            value={view}
            onChange={setView}
            options={[
              { value: 'list', label: <span className="sr-only">{t('viewList')}</span>, icon: List },
              { value: 'grid', label: <span className="sr-only">{t('viewGrid')}</span>, icon: LayoutGrid },
            ]}
          />
        </div>
      </div>
    );

  const tileIcon = (e: DirEntry) => {
    if (isDir(e)) return Folder;
    if (isSymlink(e)) return FileSymlink;
    return KIND_ICON[fileKind(e.name ?? '')];
  };

  const liveBadge = <span className="files-live">{t('live')}</span>;

  let content;
  if (q.isLoading) {
    content = (
      <div className="files-skeleton" aria-busy="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height={18} width={`${70 - i * 9}%`} />
        ))}
      </div>
    );
  } else if (!entries.length) {
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
  } else if (view === 'grid') {
    const dirs = rows.filter(isDir);
    const files = rows.filter((e) => !isDir(e));
    const tile = (e: DirEntry, idx: number) => {
      const name = e.name ?? '';
      const folder = isDir(e);
      const isSel = selected.has(name);
      const Icon = tileIcon(e);
      const kind = folder ? 'folder' : fileKind(name);
      const path = joinPath(dir, name);
      const tab = idx === Math.min(active, rows.length - 1) ? 0 : -1;
      const thumb = !folder && kind === 'image' && streaming && (e.size ?? 0) <= THUMB_MAX && previewKind(name) === 'image';
      return (
        <li
          key={name}
          data-row=""
          tabIndex={tab}
          className={cx('files-tile', folder ? 'files-tile--dir' : 'files-tile--file', isSel && 'is-selected', preview?.path === path && 'is-previewing')}
          aria-label={name}
          aria-selected={isSel}
          onClick={(ev) => onRowClick(ev, e, idx)}
          onMouseDown={(ev) => ev.shiftKey && ev.preventDefault()}
          onFocus={() => setActive(idx)}
        >
          {!folder && (
            <span className={`files-tile__thumb files-kind--${kind}`} aria-hidden="true">
              {thumb ? <img src={streamUrl(fc.api('/user/files'), { path }, fc.actingAs)} alt="" loading="lazy" decoding="async" /> : <Icon size={36} strokeWidth={1.5} />}
              {isLive(e, now) && liveBadge}
            </span>
          )}
          <span className="files-tile__foot">
            <button
              type="button"
              className={cx('files-pick', `files-kind--${kind}`)}
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
              <Icon size={16} className="files-pick__icon" aria-hidden="true" />
              <span className="files-pick__box" aria-hidden="true" />
              <Check size={14} strokeWidth={3} className="files-pick__check" aria-hidden="true" />
            </button>
            <span className="files-tile__text">
              <span className="files-tile__name">{name}</span>
              {!folder && (
                <span className="files-tile__meta">
                  {formatBytes(e.size ?? 0, lang)} · {friendlyDate(e.last_modified ?? null, lang, dateWords)}
                </span>
              )}
            </span>
            <Menu placement="bottom-end" trigger={<IconButton icon={Ellipsis} size="sm" label={t('more', { name })} tabIndex={tab} />} items={rowMenu(e)} />
          </span>
        </li>
      );
    };
    content = (
      <div className={cx('files-gridview', nSel > 0 && 'has-selection')}>
        {dirs.length > 0 && (
          <section aria-label={t('folders')}>
            <h2 className="files-gridview__title">{t('folders')}</h2>
            <ul className="files-grid files-grid--dirs">{dirs.map((e) => tile(e, rows.indexOf(e)))}</ul>
          </section>
        )}
        {files.length > 0 && (
          <section aria-label={t('filesTitle')}>
            <h2 className="files-gridview__title">{t('filesTitle')}</h2>
            <ul className="files-grid">{files.map((e) => tile(e, rows.indexOf(e)))}</ul>
          </section>
        )}
      </div>
    );
  } else {
    content = (
      <table className={cx('files-table', nSel > 0 && 'has-selection')} aria-label={title}>
        <colgroup>
          <col className="files-c-name" />
          <col className="files-c-mod" />
          <col className="files-c-size" />
          <col className="files-c-kind" />
          <col className="files-c-act" />
        </colgroup>
        <thead>
          <tr>
            {sortHeader('name', t('colName'), 'files-c-name', selectAllBox)}
            {sortHeader('modified', t('colModified'), 'files-c-mod')}
            {sortHeader('size', t('colSize'), 'files-c-size')}
            {sortHeader('kind', t('colKind'), 'files-c-kind')}
            <th scope="col" className="files-c-act">
              <span className="sr-only">{c('actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e, idx) => {
            const name = e.name ?? '';
            const folder = isDir(e);
            const isSel = selected.has(name);
            const Icon = tileIcon(e);
            const kind = folder ? 'folder' : fileKind(name);
            const tab = idx === Math.min(active, rows.length - 1) ? 0 : -1;
            const live = isLive(e, now);
            const date = live ? t('liveNow') : friendlyDate(e.last_modified ?? null, lang, dateWords);
            const size = folder ? '' : formatBytes(e.size ?? 0, lang);
            return (
              <tr
                key={name}
                data-row=""
                tabIndex={tab}
                className={cx('files-row', folder && 'files-row--dir', isSel && 'is-selected', preview?.path === joinPath(dir, name) && 'is-previewing')}
                onClick={(ev) => onRowClick(ev, e, idx)}
                onMouseDown={(ev) => ev.shiftKey && ev.preventDefault()}
                onFocus={() => setActive(idx)}
              >
                <td className="files-c-name">
                  <div className="files-name">
                    <button
                      type="button"
                      className={cx('files-pick', `files-kind--${kind}`)}
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
                      <Icon size={17} className="files-pick__icon" aria-hidden="true" />
                      <span className="files-pick__box" aria-hidden="true" />
                      <Check size={14} strokeWidth={3} className="files-pick__check" aria-hidden="true" />
                    </button>
                    <span className="files-name__text">{name}</span>
                    {live && liveBadge}
                    <span className="files-name__meta" aria-hidden="true">
                      {size ? `${date} · ${size}` : date}
                    </span>
                  </div>
                </td>
                <td className="files-c-mod">
                  {e.last_modified && !live ? <time dateTime={new Date(e.last_modified).toISOString()}>{date}</time> : date}
                </td>
                <td className="files-c-size">{size || <span aria-hidden="true">—</span>}</td>
                <td className="files-c-kind">{kindLabel(e)}</td>
                <td className="files-c-act">
                  <div className="files-act">
                    {perms.shares && <IconButton icon={Link2} size="sm" label={t('shareName', { name })} tabIndex={tab} onClick={() => share([name])} />}
                    {!folder && <IconButton icon={Download} size="sm" label={t('downloadName', { name })} tabIndex={tab} onClick={() => void download([name])} />}
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

  const openEntry = preview ? byName.get(baseName(preview.path)) : undefined;
  // Growth is only seen on the second listing: a file opened right away, or
  // before it started growing, switches to live following once it is seen.
  // It stays live until closed (the player notices when the recording ends).
  const openLive = !!openEntry && isLive(openEntry, now);
  useEffect(() => {
    if (openLive) setPreview((p) => (p && !p.live ? { ...p, live: true } : p));
  }, [openLive, preview?.path]);
  const previewDetails = openEntry && (
    <dl className="files-details">
      <dt>{t('colKind')}</dt>
      <dd>{kindLabel(openEntry)}</dd>
      <dt>{t('colSize')}</dt>
      <dd className="mono">{formatBytes(openEntry.size ?? 0, lang)}</dd>
      <dt>{t('colModified')}</dt>
      <dd>{isLive(openEntry, now) ? t('liveNow') : friendlyDate(openEntry.last_modified ?? null, lang, dateWords)}</dd>
      <dt>{t('location')}</dt>
      <dd className="mono">{dir === '/' ? rootName : `${rootName}${dir}`}</dd>
    </dl>
  );

  return (
    <>
      <PreviewLayout
        panel={
          preview && (
            <PreviewModal
              path={preview.path}
              size={preview.size}
              kind={preview.kind}
              live={preview.live}
              details={previewDetails}
              onClose={() => setPreview(null)}
              onDownload={() =>
                void downloadFile(fc, preview.path).catch((e) => toast({ title: c('error'), description: errMsg(e), tone: 'bad' }))
              }
              onPrev={previewIndex > 0 ? () => showPreview(viewable[previewIndex - 1]) : undefined}
              onNext={previewIndex >= 0 && previewIndex < viewable.length - 1 ? () => showPreview(viewable[previewIndex + 1]) : undefined}
              position={previewIndex >= 0 ? `${previewIndex + 1} / ${viewable.length}` : undefined}
            />
          )
        }
      >
        <div className="files-page">
          <header className="files-head">
            {context && <div className="files-context">{context}</div>}
            <div className="files-head__row">
              <nav className="files-trail" aria-label={t('path')}>
                <ol>
                  <li>{dir === '/' ? <span aria-current="page">{rootName}</span> : <Link to={route('/')}>{rootName}</Link>}</li>
                  {segs.map((s, i) => {
                    const p = '/' + segs.slice(0, i + 1).join('/');
                    const last = i === segs.length - 1;
                    return (
                      <li key={p}>
                        <ChevronRight size={18} className="files-trail__sep" aria-hidden="true" />
                        {last ? <span aria-current="page">{s}</span> : <Link to={route(p)}>{s}</Link>}
                      </li>
                    );
                  })}
                </ol>
              </nav>
              {perms.write && (
                <div className={cx('files-head__actions', actionsInSidebar && 'is-in-sidebar')}>
                  <Button icon={FolderPlus} onClick={() => setNewFolder(true)}>
                    {t('newFolder')}
                  </Button>
                  <Button variant="primary" icon={Upload} onClick={() => fileInput.current?.click()}>
                    {t('uploadFiles')}
                  </Button>
                </div>
              )}
            </div>
            {entries.length > 0 && !q.isError && toolbar}
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
                    {dir !== '/' && <Button onClick={() => goTo('/')}>{t('backRoot', { root: rootName })}</Button>}
                  </div>
                }
              />
            </div>
          ) : (
            <div ref={listRef} className={cx('files-card', view === 'grid' && 'files-card--grid')} tabIndex={-1} onKeyDown={onListKeyDown}>
              {content}
            </div>
          )}
          {rows.length > 0 && (
            <p className="files-foot">
              {t('countLine', { dirs: rows.filter(isDir).length, files: rows.filter((e) => !isDir(e)).length })}
            </p>
          )}
        </div>
      </PreviewLayout>

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
      {shareTarget && (
        <ShareDialog mode="create" paths={shareTarget.paths} label={shareTarget.label} isDir={shareTarget.isDir} onClose={() => setShareTarget(null)} />
      )}
    </>
  );
}

const KIND_ORDER: FileKind[] = ['audio', 'video', 'image', 'document', 'archive', 'other'];
const KIND_ICON: Record<FileKind, typeof FileIcon> = {
  audio: FileAudio,
  video: FileVideo,
  image: FileImage,
  document: FileText,
  archive: FileArchive,
  other: FileIcon,
};
/** Images up to this size get a thumbnail in the grid (the whole file is loaded). */
const THUMB_MAX = 15 * 1024 * 1024;
