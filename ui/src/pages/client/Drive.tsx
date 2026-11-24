// "Drive" layout of the file screens: a sidebar (New button, folder tree,
// links) next to the explorer. Used by the user's "My files" and by the
// administrator's Files page.
import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Folder, FolderPlus, Plus, Upload, type LucideIcon } from 'lucide-react';
import { Button, cx, Menu } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { dirKey, isDir, joinPath, listDir, splitPath, useClientPerms } from './api';
import { useFilesClient } from './fsclient';
import { filesDict } from './i18n';
import './drive.css';

/* ---------- Sidebar → explorer requests ---------- */

export type ExplorerRequest = 'upload' | 'mkdir';
const EVENT = 'sftpgo-explorer-request';

export function requestExplorer(r: ExplorerRequest) {
  window.dispatchEvent(new CustomEvent<ExplorerRequest>(EVENT, { detail: r }));
}

/** The explorer listens to the sidebar's New menu. */
export function useExplorerRequests(handler: (r: ExplorerRequest) => void) {
  useEffect(() => {
    const on = (e: Event) => handler((e as CustomEvent<ExplorerRequest>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  });
}

/* ---------- Layout ---------- */

export function DriveLayout({ sidebar, children, label }: { sidebar: ReactNode; children: ReactNode; label: string }) {
  return (
    <div className="drive">
      <aside className="drive__side" aria-label={label}>
        {sidebar}
      </aside>
      <div className="drive__main">{children}</div>
    </div>
  );
}

/** "New" menu: upload files, new folder (hidden without write access). */
export function NewButton() {
  const t = useT(filesDict);
  const perms = useClientPerms();
  if (!perms.write) return null;
  return (
    <Menu
      placement="bottom-start"
      trigger={
        <Button variant="primary" icon={Plus} className="drive__new">
          {t('newMenu')}
        </Button>
      }
      items={[
        { label: t('uploadFiles'), icon: Upload, onSelect: () => requestExplorer('upload') },
        { label: t('newFolder'), icon: FolderPlus, onSelect: () => requestExplorer('mkdir') },
      ]}
    />
  );
}

/* ---------- Folder tree ---------- */

interface TreeProps {
  /** Label and icon of the root node. */
  rootLabel: string;
  rootIcon?: LucideIcon;
  /** Folder currently open in the explorer. */
  current: string;
  route: (dir: string) => string;
}

/** Folders of the account, loaded as they are expanded; the path to the open folder is expanded. */
export function FolderTree({ rootLabel, rootIcon = Folder, current, route }: TreeProps) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(['/']));
  // Expand the ancestors of the folder being shown.
  useEffect(() => {
    const segs = splitPath(current);
    setOpen((o) => {
      const n = new Set(o);
      let changed = false;
      for (let i = 0; i < segs.length; i++) {
        const p = '/' + segs.slice(0, i).join('/');
        if (!n.has(p)) {
          n.add(p);
          changed = true;
        }
      }
      return changed ? n : o;
    });
  }, [current]);
  const toggle = (p: string) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });
  return (
    <nav aria-label={rootLabel}>
      <ul className="drive-tree">
        <TreeNode path="/" label={rootLabel} icon={rootIcon} depth={0} open={open} toggle={toggle} current={current} route={route} />
      </ul>
    </nav>
  );
}

interface NodeProps {
  path: string;
  label: string;
  icon: LucideIcon;
  depth: number;
  open: Set<string>;
  toggle: (p: string) => void;
  current: string;
  route: (dir: string) => string;
}

function TreeNode({ path, label, icon: Icon, depth, open, toggle, current, route }: NodeProps) {
  const fc = useFilesClient();
  const expanded = open.has(path);
  const q = useQuery({
    queryKey: dirKey(fc, path),
    queryFn: ({ signal }) => listDir(fc, path, signal),
    enabled: expanded,
    staleTime: 30_000,
  });
  const children = (q.data ?? [])
    .filter(isDir)
    .map((e) => e.name ?? '')
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const leaf = q.isSuccess && children.length === 0;
  const isCurrent = current === path;
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <li>
      <div className={cx('drive-tree__row', isCurrent && 'is-current')} style={{ paddingLeft: 6 + depth * 16 }}>
        {leaf ? (
          <span className="drive-tree__toggle" aria-hidden="true" />
        ) : (
          <button type="button" className="drive-tree__toggle" aria-label={label} aria-expanded={expanded} onClick={() => toggle(path)}>
            <Chevron size={14} aria-hidden="true" />
          </button>
        )}
        <Link to={route(path)} className="drive-tree__link" aria-current={isCurrent ? 'page' : undefined}>
          <Icon size={16} className={depth === 0 ? 'drive-tree__icon' : 'drive-tree__icon is-folder'} aria-hidden="true" />
          <span className="drive-tree__label">{label}</span>
        </Link>
      </div>
      {expanded && children.length > 0 && (
        <ul>
          {children.map((name) => (
            <TreeNode
              key={name}
              path={joinPath(path, name)}
              label={name}
              icon={Folder}
              depth={depth + 1}
              open={open}
              toggle={toggle}
              current={current}
              route={route}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

/** Section title of the sidebar ("PEOPLE 3"). */
export function SideTitle({ children, count }: { children: ReactNode; count?: number | string }) {
  return (
    <h2 className="drive-side-title">
      <span>{children}</span>
      {count !== undefined && <span className="drive-side-title__count">{count}</span>}
    </h2>
  );
}

/** Plain link of the sidebar ("Shared links"). */
export function SideLink({ to, icon: Icon, children }: { to: string; icon: LucideIcon; children: ReactNode }) {
  return (
    <Link to={to} className="drive-side-link">
      <Icon size={17} aria-hidden="true" />
      {children}
    </Link>
  );
}
