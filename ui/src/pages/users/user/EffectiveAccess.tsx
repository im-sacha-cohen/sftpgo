import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Check, CircleCheck, Folder, FolderPlus, TriangleAlert, X } from 'lucide-react';
import { ApiError } from '@/api/client';
import type { Permission, User } from '@/api/types';
import { Badge, Button, Card, cx, Select, Skeleton, type Tone, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  analyzeAccess,
  detectRole,
  grants,
  permsFor,
  roleLabel,
  setUserAccess,
  smallestRoleWith,
  type AccessAnalysis,
  type MountRef,
  type ResolvedAccessNode,
} from '@/pages/spaces/model';

export interface EffectiveAccessProps {
  /** The saved user (not the draft): this is what the user gets when signing in. */
  user: User;
  /** Unsaved edits on the page: quick fixes are disabled until they are saved or discarded. */
  dirty: boolean;
  /** Reloads the page from the server after a quick fix. */
  onChanged: () => Promise<void>;
}

const CHECKS: { id: string; label: string; needs: string[] }[] = [
  { id: 'list', label: 'See this folder', needs: ['list'] },
  { id: 'download', label: 'Download a file', needs: ['download'] },
  { id: 'upload', label: 'Upload a file', needs: ['upload'] },
  { id: 'rename', label: 'Rename or delete', needs: ['rename', 'delete'] },
  { id: 'mkdir', label: 'Create a sub-folder', needs: ['create_dirs'] },
];

function roleTone(perms: Permission[]): Tone {
  const r = detectRole(perms);
  if (r === 'edit' || r === 'full') return 'ok';
  if (r === 'upload') return 'warn';
  if (r === 'view') return 'neutral';
  return perms.length ? 'neutral' : 'bad';
}

const depth = (path: string) => (path === '/' ? 0 : path.split('/').length - 1);
const where = (n: ResolvedAccessNode) => n.space ?? (n.path === '/' ? 'the home folder' : n.path);
const placeName = (p: string) => (p === '/' ? 'the home folder' : p);

function whatItIs(n: ResolvedAccessNode) {
  if (n.space) return n.path === '/' ? `Space “${n.space}” · replaces their home` : `Space “${n.space}”`;
  return n.path === '/' ? 'Their home · on this server' : 'Folder in their home';
}

/** Why the node has the rights it has, in a few words. */
function grantReason(n: ResolvedAccessNode) {
  const role = roleLabel(n.perms);
  if (n.inheritedFrom) return `${role}, inherited from ${n.inheritedFrom}`;
  if (n.space) return n.source.startsWith('Through group') ? `${role} in ${n.space} · ${n.source.toLowerCase()}` : `${role} in ${n.space}`;
  if (n.source.startsWith('Set on the user')) return `Set on the user for ${n.path}`;
  return n.path === '/' ? n.source : `${n.source} for ${n.path}`;
}

function checkResult(n: ResolvedAccessNode, needs: string[]) {
  const ok = needs.filter((p) => grants(n.perms, p));
  if (ok.length === needs.length) return { allowed: true, reason: grantReason(n) };
  const role = smallestRoleWith(n.perms, needs);
  const partial = ok.length ? `Only ${ok.join(' and ')} is allowed · ` : '';
  const from = n.inheritedFrom ? ` (it only inherits ${roleLabel(n.perms)} from ${n.inheritedFrom})` : '';
  return { allowed: false, reason: `${partial}Needs ${role.name} in ${where(n)}${from}` };
}

interface Issue {
  id: string;
  tone: 'warn' | 'bad';
  text: string;
  fix?: { label: string; run: () => void; needsSave?: boolean };
}

const mountedBy = (m: MountRef) => (m.kind === 'user' ? 'set on the user' : `through group ${m.from}`);

function findIssues(a: AccessAnalysis, actions: { giveView: (n: ResolvedAccessNode) => void; openSpace: (space: string) => void }): Issue[] {
  const out: Issue[] = [];
  const root = a.nodes.find((n) => n.path === '/');
  if (!root?.perms.length) out.push({ id: 'root', tone: 'bad', text: 'The home folder has no rights: the user can sign in but can’t list anything.' });

  for (const n of a.nodes) {
    if (!n.space || n.path === '/') continue;
    if (!n.perms.length) {
      out.push({
        id: `empty:${n.path}`,
        tone: 'bad',
        text: `${n.space} is mounted at ${n.path} but gives no rights — the user sees it but every action is refused.`,
        fix: { label: 'Give View access', run: () => actions.giveView(n), needsSave: true },
      });
    } else if (n.inheritedFrom) {
      const role = roleLabel(n.perms);
      const r = detectRole(n.perms);
      const risky = r === 'edit' || r === 'full' || (!r && n.perms.some((p) => p !== 'list' && p !== 'download'));
      out.push({
        id: `inherit:${n.path}`,
        tone: 'warn',
        text:
          `${n.space} is mounted at ${n.path} with no role of its own, so it gets ${role} from ${placeName(n.inheritedFrom)}.` +
          (risky ? ' The user can change or delete files in this space.' : ' Set a role on the space to make it explicit.'),
        fix: { label: 'Choose a role', run: () => actions.openSpace(n.space!) },
      });
    } else if (!grants(n.perms, 'list')) {
      out.push({
        id: `nolist:${n.path}`,
        tone: 'warn',
        text: `${n.space} at ${n.path} doesn’t allow listing: the user can’t see what’s inside.`,
        fix: { label: 'Choose a role', run: () => actions.openSpace(n.space!) },
      });
    }
  }

  // two mounts at the same path
  const byPath = new Map<string, MountRef[]>();
  for (const m of a.mounts) byPath.set(m.path, [...(byPath.get(m.path) ?? []), m]);
  for (const [path, list] of byPath) {
    const win = list.find((m) => m.used);
    const lost = list.filter((m) => !m.used && m.space !== win?.space);
    for (const m of list) {
      if (m.kind === 'secondary' && path === '/' && !m.used)
        out.push({
          id: `rootsec:${m.from}:${m.space}`,
          tone: 'warn',
          text: `Group ${m.from} mounts “${m.space}” at /, but only a primary group can replace the home folder: it’s ignored.`,
        });
    }
    if (win && lost.some((m) => !(m.kind === 'secondary' && path === '/')))
      out.push({
        id: `dup:${path}`,
        tone: 'warn',
        text:
          `Several spaces are mounted at ${path}: “${win.space}” (${mountedBy(win)}) wins, ` +
          lost
            .filter((m) => !(m.kind === 'secondary' && path === '/'))
            .map((m) => `“${m.space}” (${mountedBy(m)})`)
            .join(', ') +
          ' is ignored.',
      });
  }

  // a space inside another one
  const used = a.mounts.filter((m) => m.used && m.path !== '/');
  for (const outer of used)
    for (const inner of used)
      if (inner.path.startsWith(outer.path + '/')) {
        const sub = inner.path.slice(outer.path.length + 1);
        out.push({
          id: `nest:${outer.path}:${inner.path}`,
          tone: 'warn',
          text: `“${inner.space}” at ${inner.path} is inside “${outer.space}” at ${outer.path}: in ${inner.path} the user sees “${inner.space}”, not the ${sub} folder of “${outer.space}”.`,
        });
      }

  for (const g of a.unreadableGroups)
    out.push({ id: `group:${g}`, tone: 'warn', text: `Couldn’t read group ${g}: the rights and spaces it gives are not shown here.` });
  return out;
}

export function EffectiveAccess({ user, dirty, onChanged }: EffectiveAccessProps) {
  const { can } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const name = user.username ?? '';
  const q = useQuery({
    queryKey: ['users', name, 'effective', user.updated_at ?? 0],
    queryFn: () => analyzeAccess(user),
  });
  const nodes = q.data?.nodes;
  const [selected, setSelected] = useState<string | null>(null);
  const [fixing, setFixing] = useState<string | null>(null);

  useEffect(() => {
    if (!nodes?.length) return;
    if (selected && nodes.some((n) => n.path === selected)) return;
    setSelected((nodes.find((n) => n.space) ?? nodes.find((n) => n.path === '/') ?? nodes[0]).path);
  }, [nodes, selected]);

  const giveView = async (n: ResolvedAccessNode) => {
    if (!n.space) return;
    setFixing(n.path);
    try {
      await setUserAccess(name, n.space, n.path, 'view');
      await onChanged();
      toast({ title: `View access given on ${n.space}`, description: n.path, tone: 'ok' });
    } catch (err) {
      toast({ title: 'Couldn’t change the access', description: err instanceof ApiError ? err.message : String(err), tone: 'bad' });
    } finally {
      setFixing(null);
    }
  };

  const canEdit = can('edit_users');
  const canSpaces = can('manage_folders');
  const issues = q.data
    ? findIssues(q.data, {
        giveView: (n) => void giveView(n),
        openSpace: (space) => navigate(`/spaces/${encodeURIComponent(space)}`),
      })
    : [];

  const current = nodes && selected ? (permsFor(nodes, selected).node as ResolvedAccessNode) : null;

  return (
    <div className="users-eff">
      <Card
        className="users-eff__tree"
        title={`What ${name} sees when signing in`}
        description="Exactly their file tree, with what they can do in each folder and why."
        actions={
          canSpaces && (
            <Button size="sm" icon={FolderPlus} onClick={() => navigate('/spaces')}>
              Give access to a space
            </Button>
          )
        }
        padded={false}
      >
        {q.isLoading ? (
          <div className="users-eff__pad">
            <Skeleton lines={4} />
          </div>
        ) : q.isError ? (
          <p className="users-eff__pad users-error">{(q.error as Error).message}</p>
        ) : (
          <ul className="users-eff__rows" aria-label="Folders">
            {nodes?.map((n) => (
              <li key={n.path}>
                <button
                  type="button"
                  className={cx('users-eff__row', selected === n.path && 'is-selected')}
                  style={{ ['--eff-depth' as string]: depth(n.path) }}
                  aria-pressed={selected === n.path}
                  onClick={() => setSelected(n.path)}
                >
                  <Folder
                    size={18}
                    strokeWidth={1.8}
                    aria-hidden="true"
                    className={cx('users-eff__icon', n.space && 'is-space')}
                    fill={n.space ? 'currentColor' : 'none'}
                  />
                  <span className="users-eff__main">
                    <span className="mono users-eff__path">{n.path}</span>
                    <span className="users-eff__what">{whatItIs(n)}</span>
                  </span>
                  <span className="users-eff__right">
                    <Badge tone={roleTone(n.perms)}>{roleLabel(n.perms)}</Badge>
                    <span className="users-eff__source">{n.source}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="users-eff__side">
        <Card title="Can they…?">
          {current && nodes ? (
            <div className="users-stack">
              <Select<string>
                aria-label="Folder"
                mono
                size="sm"
                value={selected}
                onChange={setSelected}
                options={nodes.map((n) => ({ value: n.path, label: n.path, description: whatItIs(n) }))}
              />
              <ul className="users-eff__checks">
                {CHECKS.map((c) => {
                  const r = checkResult(current, c.needs);
                  return (
                    <li key={c.id} className="users-eff__check">
                      <span className={cx('users-eff__mark', r.allowed ? 'is-ok' : 'is-no')} aria-hidden="true">
                        {r.allowed ? <Check size={13} strokeWidth={2.6} /> : <X size={13} strokeWidth={2.6} />}
                      </span>
                      <span className="users-eff__check-text">
                        <span className="users-eff__check-label">
                          {c.label}
                          <span className="sr-only">: {r.allowed ? 'yes' : 'no'}</span>
                        </span>
                        <span className="users-eff__reason">{r.reason}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <Skeleton lines={5} />
          )}
        </Card>

        {q.data &&
          (issues.length ? (
            <section className="users-eff__issues" aria-label="Things to check">
              <h3 className="users-eff__issues-title">
                <TriangleAlert size={16} aria-hidden="true" /> Things to check
              </h3>
              <ul className="users-stack">
                {issues.map((i) => (
                  <li key={i.id} className={cx('users-eff__issue', `is-${i.tone}`)}>
                    <p>{i.text}</p>
                    {i.fix && (i.fix.needsSave ? canEdit : canSpaces) && (
                      <div className="users-eff__fix">
                        <Button
                          size="sm"
                          variant={i.fix.needsSave ? 'primary' : 'secondary'}
                          disabled={(i.fix.needsSave && dirty) || fixing !== null}
                          loading={fixing !== null && i.id === `empty:${fixing}`}
                          onClick={i.fix.run}
                        >
                          {i.fix.label}
                        </Button>
                        {i.fix.needsSave && dirty && <span className="users-eff__hint">Save or discard your changes first.</span>}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="users-eff__ok">
              <CircleCheck size={16} aria-hidden="true" /> Everything looks consistent
            </p>
          ))}
      </div>
    </div>
  );
}
