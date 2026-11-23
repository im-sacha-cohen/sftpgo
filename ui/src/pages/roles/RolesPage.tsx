import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge, Button, DataTable, Drawer, EmptyState, IconButton, Input, Textarea, useConfirm, useToast } from '@/components/ui';
import { Page, PageHeader } from '@/app/PageHeader';
import { useCommands } from '@/app/layout-context';
import { api, ApiError } from '@/api/client';
import type { Role } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { useCommon, useLang, useT, type Dict } from '@/lib/i18n';
import './roles.css';

const dict = {
  fr: {
    title: 'Rôles',
    crumb: 'Comptes',
    subtitle: 'Un rôle cloisonne des administrateurs : ils ne voient et ne gèrent que les utilisateurs du même rôle.',
    add: 'Nouveau rôle',
    edit: 'Modifier le rôle',
    name: 'Nom',
    nameHint: 'Lettres, chiffres, tirets. Non modifiable ensuite.',
    description: 'Description',
    admins: 'Administrateurs',
    users: 'Utilisateurs',
    created: 'Créé',
    none: 'Aucun',
    emptyTitle: 'Aucun rôle',
    emptyText: 'Créez un rôle pour déléguer la gestion d’une partie des comptes.',
    savedOk: 'Rôle enregistré',
    forbidden: 'Seuls les super-administrateurs gèrent les rôles.',
    members: 'Membres',
  },
  en: {
    title: 'Roles',
    crumb: 'Accounts',
    subtitle: 'A role scopes administrators: they only see and manage users with the same role.',
    add: 'New role',
    edit: 'Edit role',
    name: 'Name',
    nameHint: 'Letters, digits, dashes. Cannot be changed later.',
    description: 'Description',
    admins: 'Administrators',
    users: 'Users',
    created: 'Created',
    none: 'None',
    emptyTitle: 'No roles',
    emptyText: 'Create a role to delegate the management of part of the accounts.',
    savedOk: 'Role saved',
    forbidden: 'Only super administrators manage roles.',
    members: 'Members',
  },
} satisfies Dict;

export default function RolesPage() {
  const t = useT(dict);
  const c = useCommon();
  const { lang } = useLang();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Role | 'new' | null>(null);
  const allowed = can('*');

  useCommands(allowed ? [{ id: 'roles:new', label: t('add'), group: t('title'), icon: Plus, run: () => setEditing('new') }] : []);

  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api.get<Role[]>('/roles', { limit: 500 }), enabled: allowed });
  const del = useMutation({
    mutationFn: (r: Role) => api.del(`/roles/${encodeURIComponent(r.name ?? '')}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });

  if (!allowed) {
    return (
      <Page>
        <PageHeader title={t('title')} crumbs={[{ label: t('crumb') }]} />
        <EmptyState icon={ShieldCheck} title={t('title')} description={t('forbidden')} />
      </Page>
    );
  }

  const remove = async (r: Role) => {
    if (!(await confirm({ title: c('confirmDelete', { name: r.name ?? '' }), message: c('confirmDeleteMsg'), confirmLabel: c('delete'), danger: true })))
      return;
    try {
      await del.mutateAsync(r);
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
          <Button variant="primary" icon={Plus} onClick={() => setEditing('new')}>
            {t('add')}
          </Button>
        }
      />
      <DataTable<Role>
        rows={roles.data ?? []}
        rowKey={(r) => r.name ?? ''}
        loading={roles.isLoading}
        onRowClick={(r) => setEditing(r)}
        empty={<EmptyState icon={ShieldCheck} title={t('emptyTitle')} description={t('emptyText')} />}
        columns={[
          {
            id: 'name',
            header: t('name'),
            cell: (r) => (
              <span className="roles-name">
                <span className="mono">{r.name}</span>
                {r.description && <span className="muted">{r.description}</span>}
              </span>
            ),
          },
          { id: 'admins', header: t('admins'), cell: (r) => <Members names={r.admins} base="/admins" none={t('none')} /> },
          { id: 'users', header: t('users'), cell: (r) => <Members names={r.users} base="/users" none={t('none')} /> },
          { id: 'created', header: t('created'), cell: (r) => <span className="muted">{formatDate(r.created_at, lang, false)}</span> },
          {
            id: 'actions',
            header: '',
            align: 'right',
            cell: (r) => (
              <span className="roles-actions" onClick={(e) => e.stopPropagation()}>
                <IconButton icon={Pencil} label={c('edit')} variant="ghost" size="sm" onClick={() => setEditing(r)} />
                <IconButton icon={Trash2} label={c('delete')} variant="ghost" size="sm" onClick={() => void remove(r)} />
              </span>
            ),
          },
        ]}
      />
      {editing && (
        <RoleDrawer
          role={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast({ title: t('savedOk'), tone: 'ok' });
            void qc.invalidateQueries({ queryKey: ['roles'] });
          }}
        />
      )}
    </Page>
  );
}

function Members({ names, base, none }: { names?: string[]; base: string; none: string }) {
  if (!names?.length) return <span className="muted">{none}</span>;
  const shown = names.slice(0, 3);
  return (
    <span className="roles-members" onClick={(e) => e.stopPropagation()}>
      {shown.map((n) => (
        <Link key={n} to={`${base}/${encodeURIComponent(n)}`} className="mono">
          {n}
        </Link>
      ))}
      {names.length > shown.length && <Badge>+{names.length - shown.length}</Badge>}
    </span>
  );
}

function RoleDrawer({ role, onClose, onSaved }: { role: Role | null; onClose: () => void; onSaved: () => void }) {
  const t = useT(dict);
  const c = useCommon();
  const toast = useToast();
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (role) await api.put(`/roles/${encodeURIComponent(role.name ?? '')}`, { ...role, description });
      else await api.post('/roles', { name: name.trim(), description });
      onSaved();
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
      title={role ? t('edit') : t('add')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {c('cancel')}
          </Button>
          <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={() => void save()}>
            {c('save')}
          </Button>
        </>
      }
    >
      <form
        className="roles-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Input label={t('name')} hint={role ? undefined : t('nameHint')} value={name} onChange={(e) => setName(e.target.value)} disabled={!!role} mono autoFocus={!role} />
        <Textarea label={t('description')} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        {role && (
          <div className="roles-detail">
            <span className="muted">{t('members')}</span>
            <Members names={[...(role.admins ?? [])]} base="/admins" none={`${t('admins')} : ${t('none')}`} />
            <Members names={[...(role.users ?? [])]} base="/users" none={`${t('users')} : ${t('none')}`} />
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}
