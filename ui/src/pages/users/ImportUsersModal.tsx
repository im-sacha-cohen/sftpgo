import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FileJson } from 'lucide-react';
import type { User } from '@/api/types';
import { Button, FileDrop, Modal, Spinner, useToast } from '@/components/ui';
import { useCommon, useT } from '@/lib/i18n';
import { userApi } from './api';
import { dict } from './i18n';

interface Props {
  open: boolean;
  onClose: () => void;
  existing: User[];
}

function extractUsers(data: unknown): User[] {
  if (Array.isArray(data)) return data as User[];
  if (data && typeof data === 'object' && Array.isArray((data as { users?: unknown }).users)) {
    return (data as { users: User[] }).users;
  }
  return [];
}

/** Imports users from a JSON export: creates the missing accounts one by one. */
export function ImportUsersModal({ open, onClose, existing }: Props) {
  const t = useT(dict);
  const c = useCommon();
  const toast = useToast();
  const qc = useQueryClient();
  const [running, setRunning] = useState(false);

  const onFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    let list: User[] = [];
    try {
      list = extractUsers(JSON.parse(await file.text())).filter((u) => u && typeof u.username === 'string' && u.username);
    } catch {
      list = [];
    }
    if (!list.length) {
      toast({ title: t('importInvalid'), tone: 'bad' });
      return;
    }
    const known = new Set(existing.map((u) => u.username));
    const todo = list.filter((u) => !known.has(u.username));
    setRunning(true);
    const results = await Promise.allSettled(
      todo.map((u) => {
        const body: User = { ...u };
        delete body.id;
        delete body.has_password;
        return userApi.create(body);
      }),
    );
    setRunning(false);
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    toast({
      title: t('importDone', { ok: results.length - failed.length, skip: list.length - todo.length, ko: failed.length }),
      description: failed[0] ? String(failed[0].reason?.message ?? '') : undefined,
      tone: failed.length ? 'warn' : 'ok',
    });
    await qc.invalidateQueries({ queryKey: ['users'] });
    if (!failed.length) onClose();
  };

  return (
    <Modal
      open={open}
      onClose={() => !running && onClose()}
      title={t('importTitle')}
      description={t('importHint')}
      footer={
        <Button onClick={onClose} disabled={running}>
          {c('close')}
        </Button>
      }
    >
      {running ? (
        <div className="users-toolbar">
          <Spinner size={16} label={null} /> {t('importRunning')}
        </div>
      ) : (
        <FileDrop icon={FileJson} accept=".json,application/json" label={t('importTitle')} onFiles={(f) => void onFiles(f)} />
      )}
    </Modal>
  );
}
