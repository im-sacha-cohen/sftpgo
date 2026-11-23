import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListFilter, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Drawer,
  EmptyState,
  IconButton,
  Input,
  SegmentedControl,
  Tabs,
  useConfirm,
  useToast,
} from '@/components/ui';
import { Page, PageHeader } from '@/app/PageHeader';
import { useCommands } from '@/app/layout-context';
import { api, ApiError } from '@/api/client';
import type { IPListEntry, ServicesStatus } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { useCommon, useLang, useT, type Dict } from '@/lib/i18n';
import './iplists.css';

const dict = {
  fr: {
    title: 'Listes IP',
    crumb: 'Sécurité',
    subtitle: 'Adresses et réseaux autorisés, bloqués ou exemptés.',
    tAllow: 'Liste d’autorisation',
    tDefender: 'Defender',
    tSafe: 'Exemptés des limiteurs',
    helpAllow: 'Quand la liste d’autorisation est active, seules ces adresses peuvent se connecter.',
    helpDefender: 'Règles permanentes du Defender : « Bloquer » interdit l’adresse, « Autoriser » l’exempte du Defender.',
    helpSafe: 'Ces adresses ne sont jamais ralenties par les limiteurs de débit.',
    listOff: 'Cette liste n’est pas activée dans la configuration du serveur : ses règles sont ignorées.',
    add: 'Ajouter une règle',
    edit: 'Modifier la règle',
    ip: 'Adresse ou réseau',
    ipHint: 'Une IP (203.0.113.7) ou un réseau CIDR (10.0.0.0/8, 2001:db8::/32).',
    ipInvalid: 'Adresse IP ou réseau CIDR invalide.',
    mode: 'Effet',
    allow: 'Autoriser',
    deny: 'Bloquer',
    protocols: 'Protocoles',
    allProtocols: 'Tous les protocoles',
    description: 'Description',
    created: 'Ajoutée',
    filter: 'Filtrer (début d’adresse)',
    emptyTitle: 'Aucune règle',
    emptyText: 'Ajoutez une adresse ou un réseau à cette liste.',
    savedOk: 'Règle enregistrée',
    deleteTitle: 'Supprimer la règle {ip} ?',
    forbidden: 'Vous n’avez pas la permission de gérer les listes IP.',
  },
  en: {
    title: 'IP lists',
    crumb: 'Security',
    subtitle: 'Allowed, blocked or exempted addresses and networks.',
    tAllow: 'Allow list',
    tDefender: 'Defender',
    tSafe: 'Rate limiter safe list',
    helpAllow: 'When the allow list is enabled, only these addresses can connect.',
    helpDefender: 'Permanent Defender rules: “Block” denies the address, “Allow” exempts it from the Defender.',
    helpSafe: 'These addresses are never throttled by rate limiters.',
    listOff: 'This list is not enabled in the server configuration: its rules are ignored.',
    add: 'Add rule',
    edit: 'Edit rule',
    ip: 'Address or network',
    ipHint: 'An IP (203.0.113.7) or a CIDR network (10.0.0.0/8, 2001:db8::/32).',
    ipInvalid: 'Invalid IP address or CIDR network.',
    mode: 'Effect',
    allow: 'Allow',
    deny: 'Block',
    protocols: 'Protocols',
    allProtocols: 'All protocols',
    description: 'Description',
    created: 'Added',
    filter: 'Filter (address prefix)',
    emptyTitle: 'No rules',
    emptyText: 'Add an address or a network to this list.',
    savedOk: 'Rule saved',
    deleteTitle: 'Delete rule {ip}?',
    forbidden: 'You do not have permission to manage IP lists.',
  },
} satisfies Dict;

const PROTOCOLS = [
  { bit: 1, label: 'SSH' },
  { bit: 2, label: 'FTP' },
  { bit: 4, label: 'WebDAV' },
  { bit: 8, label: 'HTTP' },
];

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}(\/(3[0-2]|[12]?\d))?$/;
const IPV6 = /^[0-9a-fA-F:]+(%\w+)?(\/(12[0-8]|1[01]\d|\d?\d))?$/;
export function isIpOrCidr(v: string) {
  const s = v.trim();
  return IPV4.test(s) || (s.includes(':') && IPV6.test(s));
}

type ListType = 1 | 2 | 3;

export default function IpListsPage() {
  const t = useT(dict);
  const c = useCommon();
  const { lang } = useLang();
  const { can } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const type = (Number(params.get('list')) || 1) as ListType;
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<IPListEntry | 'new' | null>(null);
  const allowed = can('manage_ip_lists');

  useCommands(allowed ? [{ id: 'iplists:add', label: t('add'), group: t('title'), icon: Plus, run: () => setEditing('new') }] : []);

  const status = useQuery({ queryKey: ['status'], queryFn: () => api.get<ServicesStatus>('/status'), enabled: can('view_status') });
  const list = useQuery({
    queryKey: ['iplists', type, filter],
    queryFn: () => api.get<IPListEntry[]>(`/iplists/${type}`, { filter: filter.trim() || undefined, limit: 500 }),
    enabled: allowed,
  });

  const del = useMutation({
    mutationFn: (e: IPListEntry) => api.del(`/iplists/${type}/${encodeURIComponent(e.ipornet ?? '')}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['iplists'] }),
  });

  const listActive =
    type === 1 ? status.data?.allow_list?.is_active : type === 2 ? status.data?.defender?.is_active : status.data?.rate_limiters?.is_active;

  if (!allowed) {
    return (
      <Page>
        <PageHeader title={t('title')} crumbs={[{ label: t('crumb') }]} />
        <EmptyState icon={ListFilter} title={t('title')} description={t('forbidden')} />
      </Page>
    );
  }

  const remove = async (e: IPListEntry) => {
    if (!(await confirm({ title: t('deleteTitle', { ip: e.ipornet ?? '' }), message: c('confirmDeleteMsg'), confirmLabel: c('delete'), danger: true })))
      return;
    try {
      await del.mutateAsync(e);
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
      >
        <Tabs
          tabs={[
            { id: '1', label: t('tAllow') },
            { id: '2', label: t('tDefender') },
            { id: '3', label: t('tSafe') },
          ]}
          value={String(type)}
          onChange={(v) => setParams({ list: v }, { replace: true })}
        />
      </PageHeader>

      <div className="ipl-help">
        <p className="muted">{type === 1 ? t('helpAllow') : type === 2 ? t('helpDefender') : t('helpSafe')}</p>
        {status.data && !listActive && <Badge tone="warn">{t('listOff')}</Badge>}
        <div className="ipl-filter">
          <Input aria-label={t('filter')} placeholder={t('filter')} value={filter} onChange={(e) => setFilter(e.target.value)} mono />
        </div>
      </div>

      <DataTable<IPListEntry>
        rows={list.data ?? []}
        rowKey={(e) => e.ipornet ?? ''}
        loading={list.isLoading}
        onRowClick={(e) => setEditing(e)}
        empty={<EmptyState icon={ListFilter} title={t('emptyTitle')} description={t('emptyText')} />}
        columns={[
          { id: 'ip', header: t('ip'), cell: (e) => <span className="mono ipl-ip">{e.ipornet}</span> },
          ...(type === 2
            ? [
                {
                  id: 'mode',
                  header: t('mode'),
                  cell: (e: IPListEntry) => <Badge tone={e.mode === 2 ? 'bad' : 'ok'}>{e.mode === 2 ? t('deny') : t('allow')}</Badge>,
                },
              ]
            : []),
          {
            id: 'proto',
            header: t('protocols'),
            cell: (e) =>
              !e.protocols ? (
                <span className="muted">{t('allProtocols')}</span>
              ) : (
                <span className="ipl-protos">
                  {PROTOCOLS.filter((p) => (e.protocols! & p.bit) !== 0).map((p) => (
                    <Badge key={p.bit} mono>
                      {p.label}
                    </Badge>
                  ))}
                </span>
              ),
          },
          { id: 'desc', header: t('description'), cell: (e) => <span className="muted">{e.description}</span> },
          { id: 'created', header: t('created'), cell: (e) => <span className="muted">{formatDate(e.created_at, lang)}</span> },
          {
            id: 'actions',
            header: '',
            align: 'right',
            cell: (e) => (
              <span className="ipl-actions" onClick={(ev) => ev.stopPropagation()}>
                <IconButton icon={Pencil} label={c('edit')} variant="ghost" size="sm" onClick={() => setEditing(e)} />
                <IconButton icon={Trash2} label={c('delete')} variant="ghost" size="sm" onClick={() => void remove(e)} />
              </span>
            ),
          },
        ]}
      />

      {editing && (
        <EntryDrawer
          type={type}
          entry={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            toast({ title: t('savedOk'), tone: 'ok' });
            void qc.invalidateQueries({ queryKey: ['iplists'] });
          }}
        />
      )}
    </Page>
  );
}

function EntryDrawer({ type, entry, onClose, onSaved }: { type: ListType; entry: IPListEntry | null; onClose: () => void; onSaved: () => void }) {
  const t = useT(dict);
  const c = useCommon();
  const toast = useToast();
  const [ip, setIp] = useState(entry?.ipornet ?? '');
  const [mode, setMode] = useState<1 | 2>((entry?.mode as 1 | 2) ?? (type === 2 ? 2 : 1));
  const [protocols, setProtocols] = useState(entry?.protocols ?? 0);
  const [description, setDescription] = useState(entry?.description ?? '');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setTouched(false), [entry]);

  const ipError = touched && !isIpOrCidr(ip) ? t('ipInvalid') : undefined;
  const allProtocols = protocols === 0;
  const body = useMemo(
    () => ({ ipornet: ip.trim(), type, mode: type === 2 ? mode : 1, protocols, description: description.trim() }),
    [ip, type, mode, protocols, description],
  );

  const save = async () => {
    setTouched(true);
    if (!isIpOrCidr(ip)) return;
    setBusy(true);
    try {
      if (entry) await api.put(`/iplists/${type}/${encodeURIComponent(entry.ipornet ?? '')}`, body);
      else await api.post(`/iplists/${type}`, body);
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
      title={entry ? t('edit') : t('add')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {c('cancel')}
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void save()}>
            {c('save')}
          </Button>
        </>
      }
    >
      <form
        className="ipl-form"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Input
          label={t('ip')}
          hint={t('ipHint')}
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          onBlur={() => setTouched(true)}
          error={ipError}
          disabled={!!entry}
          mono
          autoFocus={!entry}
        />
        {type === 2 && (
          <div className="ipl-field">
            <span className="ipl-label">{t('mode')}</span>
            <SegmentedControl
              options={[
                { value: '2', label: t('deny') },
                { value: '1', label: t('allow') },
              ]}
              value={String(mode)}
              onChange={(v) => setMode(Number(v) as 1 | 2)}
            />
          </div>
        )}
        <div className="ipl-field">
          <span className="ipl-label">{t('protocols')}</span>
          <Checkbox checked={allProtocols} onChange={(v) => setProtocols(v ? 0 : 1)} label={t('allProtocols')} />
          {!allProtocols && (
            <div className="ipl-proto-grid">
              {PROTOCOLS.map((p) => (
                <Checkbox
                  key={p.bit}
                  checked={(protocols & p.bit) !== 0}
                  onChange={(v) => setProtocols((cur) => (v ? cur | p.bit : cur & ~p.bit) || 0)}
                  label={p.label}
                />
              ))}
            </div>
          )}
        </div>
        <Input label={t('description')} value={description} onChange={(e) => setDescription(e.target.value)} />
        <button type="submit" hidden />
      </form>
    </Drawer>
  );
}
