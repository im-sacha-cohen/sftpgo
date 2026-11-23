import { useEffect, useState } from 'react';
import { Button, Input, Modal, Textarea, useToast } from '@/components/ui';
import { spaceApi, useInvalidateAccess, useSpacesBaseDir } from './api';
import { slug } from './model';
import { errorText } from './parts';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Names already used by folders. */
  taken: string[];
  onCreated: (name: string) => void;
}

export function NewSpaceDialog({ open, onClose, taken, onCreated }: Props) {
  const toast = useToast();
  const root = useSpacesBaseDir(open);
  const invalidate = useInvalidateAccess();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [locationEdited, setLocationEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setLocation('');
    setLocationEdited(false);
    setDescription('');
    setTouched(false);
  }, [open]);

  const folderName = name.trim() ? slug(name) : '';
  const shownLocation = locationEdited ? location : folderName && root ? root + folderName : '';

  const nameErr = !name.trim()
    ? 'Give the space a name.'
    : taken.includes(folderName)
      ? `A space or folder named “${folderName}” already exists.`
      : null;
  const locErr = !shownLocation.trim() ? 'Enter a location.' : !shownLocation.trim().startsWith('/') ? 'Use an absolute path, starting with “/”.' : null;

  const submit = async () => {
    setTouched(true);
    if (nameErr || locErr) return;
    setSaving(true);
    try {
      await spaceApi.create({ name: folderName, mapped_path: shownLocation.trim(), description: description.trim() || undefined });
      await invalidate();
      toast({ title: `Space ${folderName} created`, tone: 'ok' });
      onCreated(folderName);
    } catch (err) {
      toast({ title: 'Couldn’t create the space', description: errorText(err), tone: 'bad' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      title="New space"
      description="A shared folder you can give people access to."
      size="sm"
      closeLabel="Close"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            Create space
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
        <Input
          label="Name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Factures ACME"
          error={touched ? (nameErr ?? undefined) : undefined}
          hint={
            folderName ? (
              <>
                Folder name: <span className="mono">{folderName}</span>
              </>
            ) : (
              'Letters, digits, “-”, “_” and “.” are kept; the rest becomes “-”.'
            )
          }
        />
        <Input
          label="Location on the server"
          mono
          required
          value={shownLocation}
          placeholder={(root || '/path/on/the/server/') + 'name'}
          onChange={(e) => {
            setLocationEdited(true);
            setLocation(e.target.value);
          }}
          error={touched ? (locErr ?? undefined) : undefined}
          hint="Absolute path on the server disk. Use Advanced settings for S3, Azure, Google Cloud…"
        />
        <Textarea label="Description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
