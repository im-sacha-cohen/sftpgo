import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Download, FileText, History, RotateCcw, Search } from 'lucide-react';
import {
  Badge,
  Button,
  DataTable,
  DatePicker,
  Drawer,
  EmptyState,
  FilterChips,
  Input,
  KeyValue,
  MultiSelect,
  StatusDot,
  Tabs,
  useToast,
  type Column,
  type DatePickerLabels,
  type KeyValueItem,
  type Tone,
} from '@/components/ui';
import { Page, PageHeader } from '@/app/PageHeader';
import { useCommands } from '@/app/layout-context';
import { ApiError, api, request, type Query } from '@/api/client';
import type { FsEvent, LogEvent, ProviderEvent } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { formatBytes } from '@/lib/format';
import { useCommon, useLang, useT, type Lang } from '@/lib/i18n';
import { dict, type EventsKey } from './i18n';
import './events.css';

type TabId = 'fs' | 'provider' | 'log';
type Range = '1h' | '24h' | '7d' | '30d' | 'all' | 'custom';
type AnyEvent = FsEvent | ProviderEvent | LogEvent;

const PATHS: Record<TabId, string> = { fs: '/events/fs', provider: '/events/provider', log: '/events/logs' };
const PAGE = 100;
const FS_ACTIONS = ['upload', 'first-upload', 'download', 'first-download', 'delete', 'rename', 'mkdir', 'rmdir', 'ssh_cmd'];
const PROTOCOLS = ['SSH', 'SFTP', 'SCP', 'FTP', 'DAV', 'HTTP', 'HTTPShare', 'DataRetention', 'EventAction', 'OIDC'];
const PROVIDER_ACTIONS = ['add', 'update', 'delete'];
const OBJECT_TYPES = ['user', 'folder', 'group', 'admin', 'api_key', 'share', 'event_action', 'event_rule', 'role'];
const RANGE_MS: Record<Exclude<Range, 'all' | 'custom'>, number> = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
};

interface Filters {
  range: Range;
  from: Date | null;
  to: Date | null;
  username: string;
  ip: string;
  actions: string[];
  statuses: string[];
  protocols: string[];
  objectTypes: string[];
  objectName: string;
}

const emptyFilters = (): Filters => ({
  range: '24h',
  from: null,
  to: null,
  username: '',
  ip: '',
  actions: [],
  statuses: [],
  protocols: [],
  objectTypes: [],
  objectName: '',
});

const EN_DATE_LABELS: Partial<DatePickerLabels> = {
  placeholder: 'Pick a date',
  dialog: 'Pick a date',
  today: 'Today',
  now: 'Now',
  clear: 'Clear',
  clearDate: 'Clear date',
  prevMonth: 'Previous month',
  nextMonth: 'Next month',
  time: 'Time',
  hours: 'Hours',
  minutes: 'Minutes',
  done: 'Done',
};

/** ms → ns as an exact decimal string (Number would lose precision). */
const ns = (ms: number) => `${Math.floor(ms)}000000`;
const tsMs = (e: AnyEvent) => Math.floor((e.timestamp ?? 0) / 1e6);

function formatTs(e: AnyEvent, lang: Lang) {
  const d = new Date(tsMs(e));
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  const date = lang === 'fr' ? `${p(d.getDate())}/${p(d.getMonth() + 1)}` : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  return `${date} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

function buildQuery(tab: TabId, f: Filters): Query {
  const now = Date.now();
  const from = f.range === 'custom' ? f.from?.getTime() : f.range === 'all' ? undefined : now - RANGE_MS[f.range];
  const to = f.range === 'custom' ? f.to?.getTime() : undefined;
  const q: Query = {
    start_timestamp: from ? ns(from) : undefined,
    end_timestamp: to ? ns(to) : undefined,
    username: f.username.trim() || undefined,
    ip: f.ip.trim() || undefined,
    order: 'DESC',
    limit: PAGE,
  };
  if (tab === 'fs') {
    if (f.actions.length) q.actions = f.actions.join(',');
    if (f.statuses.length) q.statuses = f.statuses.join(',');
    if (f.protocols.length) q.protocols = f.protocols.join(',');
  } else if (tab === 'provider') {
    if (f.actions.length) q.actions = f.actions.join(',');
    if (f.objectTypes.length) q.object_types = f.objectTypes.join(',');
    if (f.objectName.trim()) q.object_name = f.objectName.trim();
  } else {
    if (f.statuses.length) q.events = f.statuses.join(',');
    if (f.protocols.length) q.protocols = f.protocols.join(',');
  }
  return q;
}

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return v;
}

const isNoPlugin = (e: unknown) =>
  e instanceof ApiError && (e.status === 501 || /searcher/i.test(`${e.detail} ${e.message}`));

export default function EventsPage() {
  const t = useT(dict);
  const tc = useCommon();
  const { lang } = useLang();
  const toast = useToast();
  const { can } = useAuth();
  const allowed = can('view_events');
  const [tab, setTab] = useState<TabId>('fs');
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [selected, setSelected] = useState<AnyEvent | null>(null);
  const [exporting, setExporting] = useState(false);
  const debounced = useDebounced(filters);
  const set = (p: Partial<Filters>) => setFilters((f) => ({ ...f, ...p }));

  // Range presets are resolved when the query key changes; the key holds the preset, not "now".
  const baseQuery = useMemo(() => buildQuery(tab, debounced), [tab, debounced]);

  const events = useInfiniteQuery({
    queryKey: ['events', tab, debounced],
    queryFn: ({ pageParam, signal }) =>
      api.get<AnyEvent[]>(PATHS[tab], { ...baseQuery, from_id: pageParam || undefined }, signal),
    initialPageParam: '',
    getNextPageParam: (last) => (last && last.length >= PAGE ? last[last.length - 1]?.id ?? undefined : undefined),
    enabled: allowed,
    retry: (n, e) => !isNoPlugin(e) && n < 2,
  });

  const rows = useMemo(() => {
    const seen = new Set<string>();
    const out: AnyEvent[] = [];
    for (const page of events.data?.pages ?? [])
      for (const e of page ?? []) {
        const k = e.id ?? `${e.timestamp}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(e);
      }
    return out;
  }, [events.data]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const res = await request<Response>(PATHS[tab], { query: { ...buildQuery(tab, filters), limit: 1000, csv_export: true }, raw: true });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sftpgo-events-${tab}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: t('exported'), tone: 'ok' });
    } catch (e) {
      toast({ title: tc('error'), description: (e as Error).message, tone: 'bad' });
    } finally {
      setExporting(false);
    }
  };

  useCommands(
    allowed
      ? [
          { id: 'events:fs', label: `${t('title')} · ${t('tabFs')}`, group: t('title'), icon: History, run: () => setTab('fs') },
          { id: 'events:provider', label: `${t('title')} · ${t('tabProvider')}`, group: t('title'), icon: History, run: () => setTab('provider') },
          { id: 'events:log', label: `${t('title')} · ${t('tabLog')}`, group: t('title'), icon: History, run: () => setTab('log') },
          { id: 'events:csv', label: t('exportCsv'), group: t('title'), icon: Download, run: exportCsv },
        ]
      : [],
  );

  const crumbs = [{ label: t('monitoring') }];
  if (!allowed) {
    return (
      <Page>
        <PageHeader title={t('title')} crumbs={crumbs} />
        <EmptyState icon={History} title={tc('forbidden')} description={t('forbidden')} />
      </Page>
    );
  }

  const noPlugin = isNoPlugin(events.error);
  const opt = (keys: string[], prefix: string) => keys.map((k) => ({ value: k, label: t(`${prefix}${k}` as EventsKey) }));
  const protoOpts = PROTOCOLS.map((p) => ({ value: p, label: p }));
  const dateLabels = lang === 'en' ? EN_DATE_LABELS : undefined;
  const locale = lang === 'en' ? 'en-GB' : 'fr-FR';

  const time: Column<AnyEvent> = { id: 'time', header: t('colTime'), width: 190, cell: (e) => <span className="ev-time">{formatTs(e, lang)}</span> };
  const user: Column<AnyEvent> = { id: 'user', header: t('colUser'), cell: (e) => <span className="mono ev-nowrap">{(e as FsEvent).username || '—'}</span> };
  const ip: Column<AnyEvent> = { id: 'ip', header: t('colIp'), width: 130, cell: (e) => <span className="mono ev-muted ev-nowrap">{e.ip || '—'}</span> };
  const proto: Column<AnyEvent> = {
    id: 'protocol',
    header: t('colProtocol'),
    width: 100,
    cell: (e) => ((e as FsEvent).protocol ? <Badge mono>{(e as FsEvent).protocol}</Badge> : '—'),
  };

  const fsStatusTone = (s?: number): Tone => (s === 1 ? 'ok' : s === 3 ? 'warn' : 'bad');
  const logTone = (s?: number): Tone => (s === 5 ? 'ok' : s === 3 ? 'neutral' : 'bad');

  const columns: Column<AnyEvent>[] =
    tab === 'fs'
      ? [
          time,
          {
            id: 'action',
            header: t('colAction'),
            width: 140,
            cell: (e) => <Badge>{t(`a_${(e as FsEvent).action}` as EventsKey)}</Badge>,
          },
          user,
          {
            id: 'path',
            header: t('colPath'),
            cell: (e) => {
              const f = e as FsEvent;
              return (
                <span className="ev-path">
                  {f.ssh_cmd ? `${f.ssh_cmd} ` : ''}
                  {f.virtual_path}
                  {f.virtual_target_path ? ` → ${f.virtual_target_path}` : ''}
                </span>
              );
            },
          },
          {
            id: 'size',
            header: t('colSize'),
            align: 'right',
            width: 100,
            cell: (e) => <span className="mono ev-nowrap">{(e as FsEvent).file_size ? formatBytes((e as FsEvent).file_size, lang) : '—'}</span>,
          },
          proto,
          ip,
          {
            id: 'status',
            header: t('colStatus'),
            width: 130,
            cell: (e) => <StatusDot tone={fsStatusTone((e as FsEvent).status)} label={t(`s${(e as FsEvent).status ?? 2}` as EventsKey)} />,
          },
        ]
      : tab === 'provider'
        ? [
            time,
            {
              id: 'action',
              header: t('colAction'),
              width: 130,
              cell: (e) => {
                const a = (e as ProviderEvent).action;
                return <Badge tone={a === 'delete' ? 'bad' : a === 'add' ? 'ok' : 'accent'}>{t(`pa_${a}` as EventsKey)}</Badge>;
              },
            },
            {
              id: 'object',
              header: t('colObject'),
              cell: (e) => {
                const p = e as ProviderEvent;
                return (
                  <span className="ev-object">
                    <span className="ev-muted">{t(`o_${p.object_type}` as EventsKey)}</span>
                    <span className="mono">{p.object_name}</span>
                  </span>
                );
              },
            },
            user,
            ip,
          ]
        : [
            time,
            {
              id: 'event',
              header: t('colEvent'),
              width: 190,
              cell: (e) => {
                const l = e as LogEvent;
                return <StatusDot tone={logTone(l.event)} label={t(`l${l.event ?? 1}` as EventsKey)} />;
              },
            },
            proto,
            user,
            ip,
            { id: 'message', header: t('colMessage'), cell: (e) => <span className="ev-msg">{(e as LogEvent).message}</span> },
          ];

  const activeFilters =
    debounced.username || debounced.ip || debounced.actions.length || debounced.statuses.length || debounced.protocols.length || debounced.objectTypes.length || debounced.objectName || debounced.range !== '24h';

  return (
    <Page wide>
      <PageHeader
        title={t('title')}
        crumbs={crumbs}
        subtitle={t('subtitle')}
        actions={
          <Button icon={Download} onClick={exportCsv} loading={exporting} disabled={noPlugin}>
            {t('exportCsv')}
          </Button>
        }
      >
        <Tabs<TabId>
          aria-label={t('title')}
          value={tab}
          onChange={(id) => {
            setTab(id);
            set({ actions: [], statuses: [], protocols: [], objectTypes: [], objectName: '' });
          }}
          tabs={[
            { id: 'fs', label: t('tabFs') },
            { id: 'provider', label: t('tabProvider') },
            { id: 'log', label: t('tabLog') },
          ]}
        />
      </PageHeader>

      {noPlugin ? (
        <EmptyState
          icon={History}
          title={t('noPlugin')}
          description={t('noPluginHint')}
          action={
            <Button icon={FileText} onClick={() => window.open('https://docs.sftpgo.com/latest/plugins/', '_blank', 'noopener,noreferrer')}>
              {t('docs')}
            </Button>
          }
        />
      ) : (
        <>
          <div className="ev-filters">
            <FilterChips<Range>
              aria-label={t('from')}
              value={filters.range}
              onChange={(r) => set({ range: r, from: null, to: null })}
              chips={[
                { id: '1h', label: t('range1h') },
                { id: '24h', label: t('range24h') },
                { id: '7d', label: t('range7d') },
                { id: '30d', label: t('range30d') },
                { id: 'all', label: t('rangeAll') },
              ]}
            />
            <div className="ev-filters__row">
              <DatePicker
                aria-label={t('from')}
                size="sm"
                withTime
                clearable
                locale={locale}
                labels={dateLabels}
                placeholder={t('from')}
                value={filters.range === 'custom' ? filters.from : null}
                max={filters.to ?? undefined}
                onChange={(d) => set({ range: d || filters.to ? 'custom' : '24h', from: d })}
              />
              <DatePicker
                aria-label={t('to')}
                size="sm"
                withTime
                clearable
                locale={locale}
                labels={dateLabels}
                placeholder={t('to')}
                value={filters.range === 'custom' ? filters.to : null}
                min={filters.from ?? undefined}
                onChange={(d) => set({ range: d || filters.from ? 'custom' : '24h', to: d })}
              />
              <Input
                aria-label={t('username')}
                size="sm"
                mono
                placeholder={t('username')}
                prefix={<Search size={14} aria-hidden="true" />}
                value={filters.username}
                onChange={(e) => set({ username: e.target.value })}
              />
              <Input aria-label={t('ip')} size="sm" mono placeholder={t('ip')} value={filters.ip} onChange={(e) => set({ ip: e.target.value })} />
              {tab === 'fs' && (
                <>
                  <MultiSelect aria-label={t('action')} size="sm" placeholder={t('allActions')} values={filters.actions} onChange={(v) => set({ actions: v })} options={opt(FS_ACTIONS, 'a_')} />
                  <MultiSelect aria-label={t('status')} size="sm" placeholder={t('allStatuses')} values={filters.statuses} onChange={(v) => set({ statuses: v })} options={opt(['1', '2', '3'], 's')} />
                  <MultiSelect aria-label={t('protocol')} size="sm" placeholder={t('allProtocols')} values={filters.protocols} onChange={(v) => set({ protocols: v })} options={protoOpts} />
                </>
              )}
              {tab === 'provider' && (
                <>
                  <MultiSelect aria-label={t('action')} size="sm" placeholder={t('allActions')} values={filters.actions} onChange={(v) => set({ actions: v })} options={opt(PROVIDER_ACTIONS, 'pa_')} />
                  <MultiSelect aria-label={t('objectType')} size="sm" placeholder={t('allObjects')} values={filters.objectTypes} onChange={(v) => set({ objectTypes: v })} options={opt(OBJECT_TYPES, 'o_')} />
                  <Input aria-label={t('objectName')} size="sm" mono placeholder={t('objectName')} value={filters.objectName} onChange={(e) => set({ objectName: e.target.value })} />
                </>
              )}
              {tab === 'log' && (
                <>
                  <MultiSelect aria-label={t('event')} size="sm" placeholder={t('allEvents')} values={filters.statuses} onChange={(v) => set({ statuses: v })} options={opt(['1', '2', '3', '4', '5'], 'l')} />
                  <MultiSelect aria-label={t('protocol')} size="sm" placeholder={t('allProtocols')} values={filters.protocols} onChange={(v) => set({ protocols: v })} options={protoOpts} />
                </>
              )}
              {activeFilters ? (
                <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setFilters(emptyFilters())}>
                  {t('reset')}
                </Button>
              ) : null}
            </div>
          </div>

          {events.error ? (
            <EmptyState
              icon={History}
              title={t('loadError')}
              description={(events.error as Error).message}
              action={<Button onClick={() => events.refetch()}>{tc('retry')}</Button>}
            />
          ) : (
            <>
              <DataTable
                dense
                columns={columns}
                rows={rows}
                rowKey={(e) => e.id ?? `${e.timestamp}`}
                loading={events.isLoading}
                onRowClick={setSelected}
                empty={<EmptyState compact icon={History} title={t('noEvents')} description={t('noEventsHint')} />}
              />
              <div className="ev-foot">
                <span className="ev-muted">{rows.length ? t('shown', { n: rows.length }) : ''}</span>
                {events.hasNextPage && (
                  <Button size="sm" onClick={() => events.fetchNextPage()} loading={events.isFetchingNextPage}>
                    {t('loadMore')}
                  </Button>
                )}
              </div>
            </>
          )}
        </>
      )}

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={t('details')} closeLabel={tc('close')} size="md">
        {selected && <EventDetails event={selected} tab={tab} />}
      </Drawer>
    </Page>
  );
}

function EventDetails({ event, tab }: { event: AnyEvent; tab: TabId }) {
  const t = useT(dict);
  const { lang } = useLang();
  const items: KeyValueItem[] = [{ label: t('colTime'), value: formatTs(event, lang), mono: true }];
  const skip = new Set(['timestamp', 'object_data']);
  for (const [k, v] of Object.entries(event)) {
    if (skip.has(k) || v === '' || v === null || v === undefined || v === 0) continue;
    let value: string = String(v);
    if (k === 'file_size') value = formatBytes(Number(v), lang);
    if (k === 'elapsed') value = `${v} ms`;
    if (tab === 'fs' && k === 'action') value = t(`a_${v}` as EventsKey);
    if (tab === 'fs' && k === 'status') value = t(`s${v}` as EventsKey);
    if (tab === 'provider' && k === 'action') value = t(`pa_${v}` as EventsKey);
    if (tab === 'provider' && k === 'object_type') value = t(`o_${v}` as EventsKey);
    if (tab === 'log' && k === 'event') value = t(`l${v}` as EventsKey);
    items.push({ key: k, label: <span className="mono ev-muted">{k}</span>, value, mono: true });
  }
  let objectData: string | null = null;
  const raw = (event as ProviderEvent).object_data;
  if (raw) {
    try {
      const bin = atob(raw);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      const text = new TextDecoder().decode(bytes);
      objectData = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      objectData = raw;
    }
  }
  return (
    <div className="ev-details">
      <KeyValue items={items} labelWidth={150} />
      {objectData && (
        <>
          <h3 className="ev-details__title">{t('objectData')}</h3>
          <pre className="ev-json">{objectData}</pre>
        </>
      )}
    </div>
  );
}
