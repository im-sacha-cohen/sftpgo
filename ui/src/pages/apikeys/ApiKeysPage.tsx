import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  DataTable,
  DatePicker,
  Drawer,
  EmptyState,
  IconButton,
  Input,
  Modal,
  SegmentedControl,
  Select,
  useConfirm,
  useToast,
} from '@/components/ui';
import { Page, PageHeader } from '@/app/PageHeader';
import { useCommands } from '@/app/layout-context';
import { api, ApiError } from '@/api/client';
import type { Admin, APIKey, User } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { formatDate, formatRelative } from '@/lib/format';
import { useCommon, useLang, useT, type Dict } from '@/lib/i18n';
import './apikeys.css';

const dict = {
  fr: {
    title: 'Clés d’API',
    crumb: 'Comptes',
    subtitle: 'Accès programmatique à l’API REST au nom d’un administrateur ou d’un utilisateur.',
    add: 'Nouvelle clé',
    name: 'Nom',
    scope: 'Portée',
    scopeAdmin: 'Administrateur',
    scopeUser: 'Utilisateur',
    owner: 'Associée à',
    anyOwner: 'Indiquée à chaque appel',
    anyOwnerHint: 'Sans compte associé, l’appelant précise le compte avec le suffixe « .username » de la clé.',
    expires: 'Expire',
    never: 'Jamais',
    expired: 'Expirée',
    lastUse: 'Dernière utilisation',
    description: 'Description',
    emptyTitle: 'Aucune clé d’API',
    emptyText: 'Créez une clé pour automatiser des tâches via l’API.',
    createdTitle: 'Clé créée',
    createdText: 'Copiez-la maintenant : elle ne sera plus jamais affichée.',
    done: 'J’ai copié la clé',
    revokeTitle: 'Révoquer la clé « {name} » ?',
    revokeMsg: 'Les scripts qui l’utilisent cesseront de fonctionner immédiatement.',
    revoke: 'Révoquer',
    forbidden: 'Seuls les super-administrateurs gèrent les clés d’API.',
    hint: 'Envoyez-la dans l’en-tête X-SFTPGO-API-KEY. Le compte associé doit autoriser l’authentification par clé.',
  },
  en: {
    title: 'API keys',
    crumb: 'Accounts',
    subtitle: 'Programmatic access to the REST API on behalf of an administrator or a user.',
    add: 'New key',
    name: 'Name',
    scope: 'Scope',
    scopeAdmin: 'Administrator',
    scopeUser: 'User',
    owner: 'Bound to',
    anyOwner: 'Given on each call',
    anyOwnerHint: 'Without a bound account, the caller picks the account with the “.username” suffix on the key.',
    expires: 'Expires',
    never: 'Never',
    expired: 'Expired',
    lastUse: 'Last used',
    description: 'Description',
    emptyTitle: 'No API keys',
    emptyText: 'Create a key to automate tasks through the API.',
    createdTitle: 'Key created',
    createdText: 'Copy it now: it will never be shown again.',
    done: 'I copied the key',
    revokeTitle: 'Revoke key “{name}”?',
    revokeMsg: 'Scripts using it will stop working immediately.',
    revoke: 'Revoke',
    forbidden: 'Only super administrators manage API keys.',
    hint: 'Send it in the X-SFTPGO-API-KEY header. The bound account must allow API key authentication.',
  },
} satisfies Dict;

export default function ApiKeysPage() {
  const t = useT(dict);
  const c = useCommon();
  const { lang } = useLang();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const allowed = can('*');

  useCommands(allowed ? [{ id: 'apikeys:new', label: t('add'), group: t('title'), icon: Plus, run: () => setCreating(true) }] : []);

  const keys = useQuery({ queryKey: ['apikeys'], queryFn: () => api.get<APIKey[]>('/apikeys', { limit: 500 }), enabled: allowed });
  const revoke = useMutation({
    mutationFn: (k: APIKey) => api.del(`/apikeys/${encodeURIComponent(k.id ?? '')}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['apikeys'] }),
  });

  if (!allowed) {
    return (
      <Page>
        <PageHeader title={t('title')} crumbs={[{ label: t('crumb') }]} />
        <EmptyState icon={KeyRound} title={t('title')} description={t('forbidden')} />
      </Page>
    );
  }

  const doRevoke = async (k: APIKey) => {
    if (!(await confirm({ title: t('revokeTitle', { name: k.name ?? '' }), message: t('revokeMsg'), confirmLabel: t('revoke'), danger: true }))) return;
    try {
      await revoke.mutateAsync(k);
      toast({ title: c('deleted'), tone: 'ok' });
    } catch (err) {
      toast({ title: c('error'), description: err instanceof ApiError ? err.message : String(err), tone: 'bad' });
    }
  };

  return (
    <Page>
      <PageHeader
        title={t('title')}
        crumbs={[{ label: t('crumb') }]}
        subtitle={t('subtitle')}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
            {t('add')}
          </Button>
        }
      />
      <p className="muted apikeys-hint">{t('hint')}</p>
      <DataTable<APIKey>
        rows={keys.data ?? []}
        rowKey={(k) => k.id ?? ''}
        loading={keys.isLoading}
        empty={<EmptyState icon={KeyRound} title={t('emptyTitle')} description={t('emptyText')} />}
        columns={[
          {
            id: 'name',
            header: t('name'),
            cell: (k) => (
              <span className="apikeys-name">
                <span>{k.name}</span>
                <span className="mono muted">{k.id}</span>
              </span>
            ),
          },
          { id: 'scope', header: t('scope'), cell: (k) => <Badge>{k.scope === 1 ? t('scopeAdmin') : t('scopeUser')}</Badge> },
          { id: 'owner', header: t('owner'), cell: (k) => <span className="mono">{k.admin || k.user || <span className="muted">{t('anyOwner')}</span>}</span> },
          {
            id: 'exp',
            header: t('expires'),
            cell: (k) =>
              !k.expires_at ? (
                <span className="muted">{t('never')}</span>
              ) : k.expires_at < Date.now() ? (
                <Badge tone="bad">{t('expired')}</Badge>
              ) : (
                <span className="muted">{formatDate(k.expires_at, lang, false)}</span>
              ),
          },
          { id: 'use', header: t('lastUse'), cell: (k) => <span className="muted">{formatRelative(k.last_use_at, lang)}</span> },
          {
            id: 'actions',
            header: '',
            align: 'right',
            cell: (k) => <IconButton icon={Trash2} label={t('revoke')} variant="ghost" size="sm" onClick={() => void doRevoke(k)} />,
          },
        ]}
      />
      {creating && (
        <CreateDrawer
          onClose={() => setCreating(false)}
          onCreated={(key) => {
            setCreating(false);
            setNewKey(key);
            void qc.invalidateQueries({ queryKey: ['apikeys'] });
          }}
        />
      )}
      {newKey && (
        <Modal
          open
          onClose={() => setNewKey(null)}
          title={t('createdTitle')}
          description={t('createdText')}
          footer={
            <Button variant="primary" onClick={() => setNewKey(null)}>
              {t('done')}
            </Button>
          }
        >
          <div className="apikeys-secret">
            <code className="mono">{newKey}</code>
            <IconButton
              icon={Copy}
              label={c('copy')}
              onClick={() => {
                void navigator.clipboard?.writeText(newKey);
                toast({ title: c('copied'), tone: 'ok' });
              }}
            />
          </div>
        </Modal>
      )}
    </Page>
  );
}

function CreateDrawer({ onClose, onCreated }: { onClose: () => void; onCreated: (key: string) => void }) {
  const t = useT(dict);
  const c = useCommon();
  const toast = useToast();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<1 | 2>(1);
  const [owner, setOwner] = useState('');
  const [expires, setExpires] = useState<Date | null>(null);
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const admins = useQuery({ queryKey: ['admins'], queryFn: () => api.get<Admin[]>('/admins', { limit: 500 }) });
  const users = useQuery({ queryKey: ['users', 'names'], queryFn: () => api.get<User[]>('/users', { limit: 500 }) });
  const owners = scope === 1 ? (admins.data ?? []).map((a) => a.username ?? '') : (users.data ?? []).map((u) => u.username ?? '');

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await api.post<{ key: string }>('/apikeys', {
        name: name.trim(),
        scope,
        description,
        expires_at: expires ? expires.getTime() : 0,
        ...(owner ? (scope === 1 ? { admin: owner } : { user: owner }) : {}),
      });
      onCreated(res.key);
    } catch (err) {
      toast({ title: c('error'), description: err instanceof ApiError ? err.message : String(err), tone: 'bad' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={t('add')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {c('cancel')}
          </Button>
          <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={() => void create()}>
            {c('create')}
          </Button>
        </>
      }
    >
      <div className="apikeys-form">
        <Input label={t('name')} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        <div className="apikeys-field">
          <span className="apikeys-label">{t('scope')}</span>
          <SegmentedControl
            options={[
              { value: '1', label: t('scopeAdmin') },
              { value: '2', label: t('scopeUser') },
            ]}
            value={String(scope)}
            onChange={(v) => {
              setScope(Number(v) as 1 | 2);
              setOwner('');
            }}
          />
        </div>
        <Select
          label={t('owner')}
          hint={owner ? undefined : t('anyOwnerHint')}
          searchable
          value={owner}
          onChange={setOwner}
          options={[{ value: '', label: t('anyOwner') }, ...owners.map((o) => ({ value: o, label: o }))]}
        />
        <DatePicker label={t('expires')} value={expires} onChange={setExpires} clearable min={new Date()} />
        <Input label={t('description')} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
    </Drawer>
  );
}
