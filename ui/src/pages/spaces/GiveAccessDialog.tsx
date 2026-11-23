import { useEffect, useMemo, useState } from 'react';
import { UserRound, Users } from 'lucide-react';
import { Button, Input, Modal, MultiSelect, RadioCards, useToast, type SelectOption } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { usePeople, useInvalidateAccess } from './api';
import { normPath, ROLES, roleById, setMemberAccess, slug, type MemberKind, type RoleId } from './model';
import { errorText, joinWords, pathError } from './parts';

type PickId = `user:${string}` | `group:${string}`;

export const memberKey = (kind: MemberKind, name: string): PickId => `${kind}:${name}` as PickId;

function parsePick(id: PickId): { kind: MemberKind; name: string } {
  const i = id.indexOf(':');
  return { kind: id.slice(0, i) as MemberKind, name: id.slice(i + 1) };
}

const VERB: Record<RoleId, (space: string) => string> = {
  view: (s) => `see and download the files of ${s}`,
  upload: (s) => `add files to ${s}`,
  edit: (s) => `view, upload, rename and delete files in ${s}`,
  full: (s) => `do everything in ${s}`,
};

/** "Can’t add, rename or delete anything." → "They won’t be able to add, rename or delete anything there." */
function notSentence(role: RoleId) {
  const not = roleById(role).not;
  const m = /^Can[’']t (.*?)\.?$/.exec(not);
  if (!m) return not;
  // "download, rename or delete" → "download, rename or delete anything there"
  const what = /\b(or|and) \w+$/.test(m[1]) ? `${m[1]} anything there` : m[1].replace(/ anything$/, ' anything there');
  return `They won’t be able to ${what}.`;
}

const capFirst = (s: string) => (s.startsWith('the ') ? 'T' + s.slice(1) : s);

interface Props {
  open: boolean;
  onClose: () => void;
  space: string;
  /** Keys (`user:x`, `group:y`) of the current members, left out of the picker. */
  existing: string[];
}

export function GiveAccessDialog({ open, onClose, space, existing }: Props) {
  const { can } = useAuth();
  const toast = useToast();
  const invalidate = useInvalidateAccess();
  const { users, groups } = usePeople(open);
  const [who, setWho] = useState<PickId[]>([]);
  const [role, setRole] = useState<RoleId>('view');
  const [path, setPath] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  // fresh form each time the dialog opens
  useEffect(() => {
    if (!open) return;
    setWho([]);
    setRole('view');
    setPath('/' + slug(space));
    setTouched(false);
  }, [open, space]);

  const groupSize = useMemo(() => new Map((groups.data ?? []).map((g) => [g.name ?? '', g.users?.length ?? 0])), [groups.data]);

  const options = useMemo<SelectOption<PickId>[]>(() => {
    const taken = new Set(existing);
    const u: SelectOption<PickId>[] = (users.data ?? [])
      .map((x) => x.username ?? '')
      .filter((n) => n && !taken.has(memberKey('user', n)))
      .sort((a, b) => a.localeCompare(b))
      .map((n) => ({
        value: memberKey('user', n),
        label: n,
        description: users.data?.find((x) => x.username === n)?.description || undefined,
        icon: UserRound,
      }));
    const g: SelectOption<PickId>[] = (groups.data ?? [])
      .map((x) => x.name ?? '')
      .filter((n) => n && !taken.has(memberKey('group', n)))
      .sort((a, b) => a.localeCompare(b))
      .map((n) => ({ value: memberKey('group', n), label: `${n} · group of ${groupSize.get(n) ?? 0}`, icon: Users }));
    return [...u, ...g];
  }, [users.data, groups.data, existing, groupSize]);

  const pErr = pathError(path);
  const loading = users.isLoading || groups.isLoading;
  const loadError = users.error ?? groups.error;

  const whoWords = who.map((id) => {
    const { kind, name } = parsePick(id);
    if (kind === 'user') return name;
    const n = groupSize.get(name) ?? 0;
    return n === 1 ? `the member of ${name}` : n ? `the ${n} members of ${name}` : `the members of ${name}`;
  });
  const summary = who.length
    ? `${capFirst(joinWords(whoWords))} will be able to ${VERB[role](space)}${pErr ? '' : `, in ${normPath(path)}`}. ${notSentence(role)}`
    : null;

  const submit = async () => {
    setTouched(true);
    if (!who.length || pErr) return;
    setSaving(true);
    const p = normPath(path);
    const failed: PickId[] = [];
    const errors: string[] = [];
    for (const id of who) {
      try {
        await setMemberAccess(parsePick(id), space, p, role);
      } catch (err) {
        failed.push(id);
        errors.push(`${parsePick(id).name}: ${errorText(err)}`);
      }
    }
    setSaving(false);
    const done = who.length - failed.length;
    if (done) await invalidate();
    if (failed.length) {
      setWho(failed);
      toast({
        title: done ? `Access given to ${done} of ${who.length}` : 'Couldn’t give access',
        description: errors.join(' · '),
        tone: 'bad',
        duration: 0,
      });
      return;
    }
    toast({ title: `Access given to ${space}`, description: `${joinWords(whoWords)} · ${roleById(role).name} · ${p}`, tone: 'ok' });
    onClose();
  };

  const canPick = can('edit_users') || can('manage_groups');

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title={`Give access to “${space}”`}
      description="Pick who, what they can do, and where they will find it."
      size="md"
      closeLabel="Close"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} disabled={!canPick} onClick={() => void submit()}>
            Give access
          </Button>
        </>
      }
    >
      <form
        className="spaces-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <MultiSelect<PickId>
          label="Who"
          required
          values={who}
          onChange={setWho}
          options={options}
          placeholder={loading ? 'Loading…' : 'Choose people or groups…'}
          searchPlaceholder="Search people and groups…"
          emptyLabel={loading ? 'Loading…' : 'Nobody left to add'}
          clearLabel="Clear"
          countLabel={(n) => `${n} selected`}
          error={
            loadError
              ? errorText(loadError)
              : !canPick
                ? 'You can’t change users or groups.'
                : touched && !who.length
                  ? 'Pick at least one person or group.'
                  : undefined
          }
          disabled={!canPick}
        />
        <RadioCards<RoleId>
          label="They can"
          value={role}
          onChange={setRole}
          columns={2}
          options={ROLES.map((r) => ({ value: r.id, label: r.name, description: r.does }))}
        />
        <Input
          label="It appears in their files as"
          mono
          required
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onBlur={() => setTouched(true)}
          error={touched || path !== '/' + slug(space) ? (pErr ?? undefined) : undefined}
          hint="The folder they’ll see at the root of their files."
        />
        {summary && (
          <p className="spaces-summary" aria-live="polite">
            {summary}
          </p>
        )}
        {/* lets Enter in the path field submit */}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
