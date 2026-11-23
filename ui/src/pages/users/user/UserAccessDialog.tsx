import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, RadioCards, Select, useToast, type SelectOption } from '@/components/ui';
import { useInvalidateAccess, useSpaces } from '@/pages/spaces/api';
import { errorText } from '@/pages/spaces/parts';
import '@/pages/spaces/spaces.css';
import { normPath, roleById, ROLES, setUserAccess, setUserPathRole, slug, type RoleId } from '@/pages/spaces/model';

/** "home" sets a role on a folder of the user's own files; any other value is a space name. */
const HOME = '\u0000home';

export interface UserAccessTarget {
  /** Space name, or undefined for a folder of their own files. */
  space?: string;
  path?: string;
  role?: RoleId;
}

interface Props {
  open: boolean;
  username: string;
  /** Pre-fills the dialog (changing an existing access). */
  initial?: UserAccessTarget;
  /** Spaces the user already has, with the path they appear at. */
  mounted: Map<string, string>;
  onClose: () => void;
  onDone: () => Promise<void>;
}

export function UserAccessDialog({ open, username, initial, mounted, onClose, onDone }: Props) {
  const toast = useToast();
  const invalidate = useInvalidateAccess();
  const spaces = useSpaces();
  const [target, setTarget] = useState<string | null>(null);
  const [path, setPath] = useState('');
  const [pathEdited, setPathEdited] = useState(false);
  const [role, setRole] = useState<RoleId>('view');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTarget(initial ? (initial.space ?? HOME) : null);
    setPath(initial?.path ?? '');
    setPathEdited(!!initial?.path);
    setRole(initial?.role ?? 'view');
    setTouched(false);
  }, [open, initial]);

  const isHome = target === HOME;
  const space = target && !isHome ? target : null;
  const suggested = space ? (mounted.get(space) ?? '/' + slug(space)) : '';
  const shownPath = pathEdited ? path : suggested;

  const options = useMemo<SelectOption<string>[]>(() => {
    const list: SelectOption<string>[] = (spaces.data ?? []).map((f) => ({
      value: f.name ?? '',
      label: f.name ?? '',
      description: mounted.has(f.name ?? '') ? `Already in their files at ${mounted.get(f.name ?? '')}` : f.description || 'Shared space',
    }));
    list.push({ value: HOME, label: 'A folder of their own files', description: 'Set what they can do in a folder of their home' });
    return list;
  }, [spaces.data, mounted]);

  const targetErr = !target ? 'Pick a space or a folder.' : null;
  const pathErr = !shownPath.trim()
    ? isHome
      ? 'Enter the folder, for example /reports.'
      : 'Enter where it appears.'
    : !shownPath.trim().startsWith('/')
      ? 'Use a path starting with “/”.'
      : space && normPath(shownPath) === '/'
        ? 'A space can’t replace their whole home: pick a folder name.'
        : null;

  const r = roleById(role);
  const where = shownPath.trim() ? normPath(shownPath) : '';
  const summary =
    target && where
      ? `${username} will be able to ${r.does.charAt(0).toLowerCase() + r.does.slice(1).replace(/\.$/, '')} in ${space ? `“${space}”, shown as ${where}` : where}. ${r.not}`
      : null;

  const submit = async () => {
    setTouched(true);
    if (targetErr || pathErr) return;
    setSaving(true);
    try {
      if (space) await setUserAccess(username, space, where, role);
      else await setUserPathRole(username, where, role);
      await invalidate();
      await onDone();
      toast({ title: space ? `Access given to ${space}` : `Role set on ${where}`, description: `${username} · ${r.name} · ${where}`, tone: 'ok' });
      onClose();
    } catch (err) {
      toast({ title: 'Couldn’t change the access', description: errorText(err), tone: 'bad' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title={initial ? 'Change access' : `Give ${username} access`}
      description="Pick the folder, what they can do there, and where they find it."
      size="md"
      closeLabel="Close"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            {initial ? 'Save' : 'Give access'}
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
        <Select<string>
          label="Folder"
          required
          value={target}
          onChange={(v) => {
            setTarget(v);
            if (!initial) {
              setPath(v === HOME ? '/' : '');
              setPathEdited(v === HOME);
            }
          }}
          options={options}
          placeholder={spaces.isLoading ? 'Loading…' : 'Choose a space or a folder…'}
          searchable
          searchPlaceholder="Search spaces…"
          disabled={!!initial}
          error={touched ? (targetErr ?? undefined) : undefined}
        />
        <RadioCards<RoleId>
          label="They can"
          value={role}
          onChange={setRole}
          columns={2}
          options={ROLES.map((x) => ({ value: x.id, label: x.name, description: x.does }))}
        />
        {target && (
          <Input
            label={isHome ? 'Folder in their files' : 'It appears in their files as'}
            mono
            required
            value={shownPath}
            placeholder={isHome ? '/reports' : '/' + slug(space ?? 'space')}
            onChange={(e) => {
              setPathEdited(true);
              setPath(e.target.value);
            }}
            error={touched ? (pathErr ?? undefined) : undefined}
            hint={isHome ? 'The rights also apply to the sub-folders, unless they have their own.' : 'The folder they’ll see at the root of their files.'}
          />
        )}
        {summary && (
          <p className="spaces-summary" aria-live="polite">
            {summary}
          </p>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
