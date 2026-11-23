import { useState } from 'react';
import { CornerDownRight, Plus, Trash2 } from 'lucide-react';
import type { Permission } from '@/api/types';
import { Badge, Button, Checkbox, IconButton, Input, Switch } from '@/components/ui';
import { useT } from '@/lib/i18n';
import { dict, type UsersKey } from '../i18n';
import {
  ALL_PERMS,
  COMMON_PERMS,
  cleanVirtualPath,
  hasPerm,
  sameValue,
  sortPaths,
  type InheritedPerm,
  type PermMap,
} from '../model';

interface Props {
  value: PermMap;
  /** Value as loaded, to tag modified rows. */
  initial?: PermMap;
  inherited?: InheritedPerm[];
  onChange: (v: PermMap) => void;
  /** Users must define "/"; groups may not. */
  requireRoot?: boolean;
  readOnly?: boolean;
}

/** Expands "*" and the "delete"/"rename" shortcuts, then toggles `p`. */
function toggle(list: Permission[], p: Permission): Permission[] {
  let cur = list.includes('*') ? [...ALL_PERMS] : [...list];
  if (p === '*') return list.includes('*') ? [] : ['*'];
  if (p === 'delete' || p === 'rename') {
    const kids = [`${p}_files`, `${p}_dirs`] as Permission[];
    // "delete"/"rename" also cover their _files/_dirs variants: toggle the whole family
    if (cur.includes(p) || kids.every((k) => cur.includes(k))) return cur.filter((x) => x !== p && !kids.includes(x));
    cur = cur.filter((x) => !kids.includes(x));
  } else if (cur.includes(p)) return cur.filter((x) => x !== p);
  const parent = p === 'delete_files' || p === 'delete_dirs' ? 'delete' : p === 'rename_files' || p === 'rename_dirs' ? 'rename' : null;
  if (parent && cur.includes(parent)) {
    const sibling = (p.endsWith('_files') ? p.replace('_files', '_dirs') : p.replace('_dirs', '_files')) as Permission;
    cur = cur.filter((x) => x !== parent);
    return cur.includes(sibling) ? cur : [...cur, sibling];
  }
  cur.push(p);
  if (ALL_PERMS.every((x) => cur.includes(x))) return ['*'];
  return cur;
}

export function PermissionMatrix({ value, initial, inherited = [], onChange, requireRoot = true, readOnly }: Props) {
  const t = useT(dict);
  const [showAll, setShowAll] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [pathError, setPathError] = useState<string | null>(null);
  const cols = showAll ? ALL_PERMS : COMMON_PERMS;
  const paths = sortPaths(Object.keys(value));
  const rootOverride = inherited.find((i) => i.path === '/' && i.overrides);
  const inheritedRows = inherited.filter((i) => !i.overrides);

  const setRow = (path: string, perms: Permission[]) => onChange({ ...value, [path]: perms });
  const removeRow = (path: string) => {
    const next = { ...value };
    delete next[path];
    onChange(next);
  };
  const addPath = (raw: string, perms: Permission[] = ['list', 'download']) => {
    if (!raw.trim()) return;
    const p = cleanVirtualPath(raw);
    if (!raw.trim().startsWith('/')) {
      setPathError(t('pathInvalid'));
      return;
    }
    if (value[p]) {
      setPathError(t('pathExists'));
      return;
    }
    onChange({ ...value, [p]: perms });
    setNewPath('');
    setPathError(null);
  };

  const tag = (path: string) => {
    if (initial && !initial[path]) return <Badge tone="accent">{t('tagNew')}</Badge>;
    if (initial && !sameValue(initial[path], value[path])) return <Badge tone="warn">{t('tagModified')}</Badge>;
    if (path === '/') return <Badge tone="neutral">{t('tagDefault')}</Badge>;
    return null;
  };

  return (
    <div className="users-matrix">
      <div className="users-matrix__toolbar">
        <p className="muted users-small">{t('permHint')}</p>
        <Switch size="sm" checked={showAll} onChange={setShowAll} label={t('allPerms')} />
      </div>
      <div className="users-matrix__scroll">
        <table className="users-matrix__table">
          <thead>
            <tr>
              <th className="users-matrix__path">{t('colPath')}</th>
              {cols.map((p) => (
                <th key={p}>{t(`p_${p}` as UsersKey)}</th>
              ))}
              <th className="users-matrix__star">{t('colAll')}</th>
              <th aria-hidden="true" />
            </tr>
          </thead>
          <tbody>
            {paths.map((path) => {
              const list = value[path] ?? [];
              const overridden = path === '/' && rootOverride;
              return (
                <tr key={path} className={overridden ? 'is-overridden' : undefined}>
                  <td className="users-matrix__path">
                    <span className="mono">{path}</span>
                    {tag(path)}
                    {overridden && <Badge tone="warn">{t('tagOverridden', { group: rootOverride.group })}</Badge>}
                  </td>
                  {cols.map((p) => (
                    <td key={p}>
                      <Checkbox
                        checked={hasPerm(list, p)}
                        onChange={() => setRow(path, toggle(list, p))}
                        disabled={readOnly}
                        aria-label={`${path} · ${t(`p_${p}` as UsersKey)}`}
                      />
                    </td>
                  ))}
                  <td className="users-matrix__star">
                    <Checkbox
                      checked={list.includes('*')}
                      onChange={() => setRow(path, toggle(list, '*'))}
                      disabled={readOnly}
                      aria-label={`${path} · *`}
                    />
                  </td>
                  <td className="users-matrix__act">
                    {!readOnly && !(requireRoot && path === '/') && (
                      <IconButton size="sm" icon={Trash2} label={t('removePath', { path })} onClick={() => removeRow(path)} />
                    )}
                  </td>
                </tr>
              );
            })}
            {inheritedRows.map((i) => (
              <tr key={`inh-${i.path}`} className="is-inherited">
                <td className="users-matrix__path">
                  <CornerDownRight size={13} aria-hidden="true" className="muted" />
                  <span className="mono">{i.path}</span>
                  <Badge tone="neutral">{t('tagInherited', { group: i.group })}</Badge>
                </td>
                {cols.map((p) => (
                  <td key={p}>
                    <Checkbox checked={hasPerm(i.perms, p)} onChange={() => {}} disabled aria-label={`${i.path} · ${p}`} />
                  </td>
                ))}
                <td className="users-matrix__star">
                  <Checkbox checked={i.perms.includes('*')} onChange={() => {}} disabled aria-label={`${i.path} · *`} />
                </td>
                <td className="users-matrix__act">
                  {!readOnly && (
                    <Button size="sm" variant="ghost" onClick={() => addPath(i.path, [...i.perms])}>
                      {t('override')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {requireRoot && !value['/'] && <p className="users-error">{t('rootRequired')}</p>}
      {!readOnly && (
        <form
          className="users-matrix__add"
          onSubmit={(e) => {
            e.preventDefault();
            addPath(newPath);
          }}
        >
          <Input
            size="sm"
            mono
            value={newPath}
            placeholder={t('pathPlaceholder')}
            onChange={(e) => {
              setNewPath(e.target.value);
              setPathError(null);
            }}
            error={pathError}
            aria-label={t('addPath')}
          />
          <Button size="sm" type="submit" icon={Plus} disabled={!newPath.trim()}>
            {t('addPath')}
          </Button>
        </form>
      )}
    </div>
  );
}
