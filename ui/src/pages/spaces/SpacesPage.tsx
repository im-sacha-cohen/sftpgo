import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Folder, FolderOpen, Info, MoreHorizontal, Plus, Settings2, Trash2, UserPlus, X } from 'lucide-react';
import { Page, PageHeader } from '@/app/PageHeader';
import { useCommands } from '@/app/layout-context';
import { Button, Card, EmptyState, IconButton, Menu, Select, Skeleton, useConfirm, useToast } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { formatBytes } from '@/lib/format';
import { accessCount, folderGroups, spaceApi, useInvalidateAccess, useSpaceMembers, useSpaces, type SpaceFolder } from './api';
import { GiveAccessDialog, memberKey } from './GiveAccessDialog';
import { ROLES, roleById, roleLabel, setMemberAccess, type Member, type RoleId } from './model';
import { NewSpaceDialog } from './NewSpaceDialog';
import { accessSentence, errorText, MemberAvatar, plural, storageWords } from './parts';
import './spaces.css';

const PANEL_ID = 'spaces-detail';

export default function SpacesPage() {
  const { name: wanted } = useParams();
  const navigate = useNavigate();
  const { can } = useAuth();
  const spaces = useSpaces();
  const [newOpen, setNewOpen] = useState(false);
  const [giveOpen, setGiveOpen] = useState(false);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  const canManage = can('manage_folders');
  const list = useMemo(() => [...(spaces.data ?? [])].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')), [spaces.data]);
  const selected: SpaceFolder | undefined = list.find((f) => f.name === wanted) ?? list[0];

  // a stale /spaces/:name (deleted, renamed) falls back to the first space
  useEffect(() => {
    if (wanted && spaces.data && !list.some((f) => f.name === wanted)) navigate('/spaces', { replace: true });
  }, [wanted, spaces.data, list, navigate]);

  const select = (f: SpaceFolder, opts?: { focus?: boolean; reveal?: boolean }) => {
    const name = f.name ?? '';
    navigate(`/spaces/${encodeURIComponent(name)}`, { replace: true });
    if (opts?.focus) cardRefs.current.get(name)?.focus();
    if (opts?.reveal) {
      // when the detail is stacked under the list (narrow screens), bring it into view
      const panel = panelRef.current;
      const l = listRef.current;
      if (panel && l && panel.getBoundingClientRect().top >= l.getBoundingClientRect().bottom - 1) {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        panel.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      }
    }
  };

  const onCardKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = -1;
    if (e.key === 'ArrowDown') next = Math.min(index + 1, list.length - 1);
    else if (e.key === 'ArrowUp') next = Math.max(index - 1, 0);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else return;
    e.preventDefault();
    if (list[next]) select(list[next], { focus: true });
  };

  useCommands([
    ...(canManage ? [{ id: 'spaces:new', label: 'New space', group: 'Spaces', icon: Plus, run: () => setNewOpen(true) }] : []),
    ...(selected
      ? [{ id: 'spaces:give', label: `Give access to ${selected.name}`, group: 'Spaces', icon: UserPlus, run: () => setGiveOpen(true) }]
      : []),
  ]);

  let left;
  if (spaces.isLoading) {
    left = (
      <div className="spaces-list" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="spaces-card spaces-card--skeleton">
            <Skeleton width={40} height={40} />
            <span className="spaces-card__text">
              <Skeleton width="60%" height={14} />
              <Skeleton width="40%" height={12} />
            </span>
          </div>
        ))}
      </div>
    );
  } else if (spaces.isError) {
    left = (
      <EmptyState
        icon={Folder}
        title="Couldn’t load the spaces"
        description={errorText(spaces.error)}
        action={<Button onClick={() => void spaces.refetch()}>Retry</Button>}
        compact
      />
    );
  } else if (!list.length) {
    left = (
      <EmptyState
        icon={Folder}
        title="No spaces yet"
        description="Create one, then give people access to it."
        action={
          canManage ? (
            <Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>
              New space
            </Button>
          ) : undefined
        }
        compact
      />
    );
  } else {
    left = (
      <ul className="spaces-list" aria-label="Spaces">
        {list.map((f, i) => {
          const name = f.name ?? '';
          const isSel = selected?.name === name;
          const n = accessCount(f);
          return (
            <li key={name}>
              <button
                type="button"
                ref={(el) => {
                  if (el) cardRefs.current.set(name, el);
                  else cardRefs.current.delete(name);
                }}
                className="spaces-card"
                aria-current={isSel ? 'true' : undefined}
                aria-controls={PANEL_ID}
                tabIndex={isSel ? 0 : -1}
                onClick={() => select(f, { reveal: true })}
                onKeyDown={(e) => onCardKey(e, i)}
              >
                <span className="spaces-card__icon" aria-hidden="true">
                  <Folder size={20} />
                </span>
                <span className="spaces-card__text">
                  <span className="spaces-card__name">{name}</span>
                  <span className="spaces-card__meta">
                    {n ? `${n} with access` : 'Nobody yet'} · {formatBytes(f.used_quota_size ?? 0, 'en')}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <Page>
      <div className="spaces">
        <div className="spaces__side" ref={listRef}>
          <PageHeader
            title="Spaces"
            actions={
              canManage ? (
                <Button variant="primary" icon={Plus} onClick={() => setNewOpen(true)}>
                  New space
                </Button>
              ) : undefined
            }
          />
          <p className="spaces__intro">A space is a shared folder. Give people access to it and choose what they can do.</p>
          {left}
        </div>
        <section className="spaces__main" id={PANEL_ID} ref={panelRef} aria-label={selected?.name ?? 'Space'}>
          {selected ? <SpaceDetail key={selected.name} space={selected} onGiveAccess={() => setGiveOpen(true)} /> : null}
        </section>
      </div>

      <NewSpaceDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        taken={list.map((f) => f.name ?? '')}
        onCreated={(name) => {
          setNewOpen(false);
          navigate(`/spaces/${encodeURIComponent(name)}`, { replace: true });
          setGiveOpen(true);
        }}
      />
      {/* the space name may not be in the list yet right after "New space" */}
      <GiveAccessForSelected open={giveOpen} onClose={() => setGiveOpen(false)} space={wanted ?? selected?.name} folder={selected} />
    </Page>
  );
}

function GiveAccessForSelected({ open, onClose, space, folder }: { open: boolean; onClose: () => void; space?: string; folder?: SpaceFolder }) {
  const sameFolder = folder?.name === space ? folder : undefined;
  const existing = useMemo(
    () => [...(sameFolder?.users ?? []).map((u) => memberKey('user', u)), ...folderGroups(sameFolder).map((g) => memberKey('group', g))],
    [sameFolder],
  );
  if (!space) return null;
  return <GiveAccessDialog open={open} onClose={onClose} space={space} existing={existing} />;
}

/* ---------- right column ---------- */

function SpaceDetail({ space, onGiveAccess }: { space: SpaceFolder; onGiveAccess: () => void }) {
  const name = space.name ?? '';
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const invalidate = useInvalidateAccess();
  const { can, session } = useAuth();
  const members = useSpaceMembers(space);
  const [deleting, setDeleting] = useState(false);

  const people = space.users?.length ?? 0;
  const groups = folderGroups(space).length;
  const subtitle = [storageWords(space.filesystem?.provider), formatBytes(space.used_quota_size ?? 0, 'en'), accessSentence(people, groups)].join(' · ');

  const remove = async () => {
    const list = members.data ?? [];
    const ok = await confirm({
      title: `Delete the space “${name}”?`,
      message: (
        <>
          {list.length ? `${plural(list.length, 'member loses', 'members lose')} access. ` : ''}
          This only removes the space from SFTPGo: the files stay on disk{space.mapped_path ? ` in ${space.mapped_path}` : ''}.
        </>
      ),
      confirmLabel: 'Delete space',
      cancelLabel: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    setDeleting(true);
    try {
      // unmount it from every member first so nobody keeps rights on a dead path
      for (const m of list) await setMemberAccess(m, name, null, null);
      await spaceApi.remove(name);
      toast({ title: `Space ${name} deleted`, description: 'The files are still on disk.', tone: 'ok' });
      navigate('/spaces', { replace: true });
    } catch (err) {
      toast({ title: 'Couldn’t delete the space', description: errorText(err), tone: 'bad' });
    } finally {
      setDeleting(false);
      await invalidate();
    }
  };

  return (
    <div className="spaces-detail">
      <div className="spaces-detail__head">
        <span className="spaces-detail__tile" aria-hidden="true">
          <Folder size={34} strokeWidth={1.8} />
        </span>
        <div className="spaces-detail__titles">
          <h2 className="spaces-detail__name">{name}</h2>
          <p className="spaces-detail__sub">{subtitle}</p>
          {space.description && <p className="spaces-detail__desc">{space.description}</p>}
        </div>
        <div className="spaces-detail__actions">
          {can('view_user_files') && !session?.role && (
            <Button icon={FolderOpen} onClick={() => navigate(`/browse/s/${encodeURIComponent(name)}`)}>
              Browse files
            </Button>
          )}
          <Button variant="primary" icon={UserPlus} onClick={onGiveAccess}>
            Give access
          </Button>
          <Menu
            aria-label="More actions"
            placement="bottom-end"
            trigger={<IconButton icon={MoreHorizontal} label="More" variant="secondary" loading={deleting} />}
            items={[
              { label: 'Advanced settings', icon: Settings2, onSelect: () => navigate(`/folders/${encodeURIComponent(name)}?tab=settings`) },
              'separator',
              { label: 'Delete space', icon: Trash2, danger: true, disabled: !can('manage_folders'), onSelect: () => void remove() },
            ]}
          />
        </div>
      </div>

      <Card title="Who has access" actions={<span className="spaces-note-inline">Changes apply at the next sign-in</span>} padded={false}>
        {members.isLoading ? (
          <div className="spaces-members" aria-busy="true">
            {Array.from({ length: Math.max(1, Math.min(people + groups, 4)) }, (_, i) => (
              <div key={i} className="spaces-member">
                <Skeleton circle width={40} height={40} />
                <span className="spaces-member__id">
                  <Skeleton width="40%" height={14} />
                  <Skeleton width="60%" height={12} />
                </span>
              </div>
            ))}
          </div>
        ) : members.isError ? (
          <EmptyState
            title="Couldn’t load who has access"
            description={errorText(members.error)}
            action={<Button onClick={() => void members.refetch()}>Retry</Button>}
            compact
          />
        ) : !members.data?.length ? (
          <EmptyState
            icon={UserPlus}
            title="Nobody has access yet"
            action={
              <Button variant="primary" icon={UserPlus} onClick={onGiveAccess}>
                Give access
              </Button>
            }
            compact
          />
        ) : (
          <ul className="spaces-members">
            {members.data.map((m) => (
              <MemberRow key={memberKey(m.kind, m.name)} member={m} space={name} />
            ))}
          </ul>
        )}
      </Card>

      <div className="spaces-roles" role="list" aria-label="What each role can do">
        {ROLES.map((r) => (
          <div key={r.id} className="spaces-role" role="listitem">
            <span className="spaces-role__name">{r.name}</span>
            <span className="spaces-role__does">{r.does}</span>
            <span className="spaces-role__not">{r.not}</span>
          </div>
        ))}
      </div>

      <p className="spaces-callout">
        <Info size={16} aria-hidden="true" />
        <span>Nobody else can see this space. Each person finds it in their files at the path shown, with exactly the role you picked.</span>
      </p>
    </div>
  );
}

function MemberRow({ member, space }: { member: Member; space: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const invalidate = useInvalidateAccess();
  const { can } = useAuth();
  const [role, setRole] = useState<RoleId | null>(member.role);
  const [busy, setBusy] = useState(false);
  useEffect(() => setRole(member.role), [member.role]);

  const isUser = member.kind === 'user';
  const editable = isUser ? can('edit_users') : can('manage_groups');
  const kindLine = isUser
    ? `User${member.description ? ` · ${member.description}` : ''}`
    : `Group · ${plural(member.size ?? 0, 'person', 'people')}`;

  const change = async (next: RoleId) => {
    if (next === role) return;
    const prev = role;
    setRole(next);
    setBusy(true);
    try {
      await setMemberAccess(member, space, member.path, next);
      toast({ title: `${member.name} now has the role ${roleById(next).name}`, description: `${roleById(next).does} · ${space} · ${member.path}`, tone: 'ok' });
      await invalidate();
    } catch (err) {
      setRole(prev);
      toast({ title: `Couldn’t change the role of ${member.name}`, description: errorText(err), tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Remove ${member.name} from “${space}”?`,
      message: isUser
        ? `${member.name} won’t see ${member.path} in their files any more. The files stay where they are.`
        : `The members of ${member.name} won’t see ${member.path} in their files any more, unless they have access on their own. The files stay where they are.`,
      confirmLabel: 'Remove access',
      cancelLabel: 'Cancel',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await setMemberAccess(member, space, null, null);
      toast({ title: `${member.name} no longer has access to ${space}`, tone: 'ok' });
      await invalidate();
    } catch (err) {
      toast({ title: `Couldn’t remove ${member.name}`, description: errorText(err), tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="spaces-member">
      <MemberAvatar name={member.name} kind={member.kind} />
      <span className="spaces-member__id">
        <span className="spaces-member__name">{member.name}</span>
        <span className="spaces-member__kind">{kindLine}</span>
      </span>
      <span className="spaces-member__path">
        Sees it as <span className="mono">{member.path}</span>
      </span>
      <div className="spaces-member__role">
        <Select<RoleId>
          aria-label={`Role of ${member.name}`}
          size="sm"
          value={role}
          onChange={(v) => void change(v)}
          placeholder={
            member.inherited ? `${roleLabel(member.inherited.perms)} (from ${member.inherited.from})` : roleLabel(member.perms)
          }
          options={ROLES.map((r) => ({ value: r.id, label: r.name, description: r.does }))}
          disabled={busy || !editable}
        />
      </div>
      <IconButton icon={X} label={`Remove ${member.name}`} size="sm" disabled={busy || !editable} onClick={() => void remove()} />
    </li>
  );
}
