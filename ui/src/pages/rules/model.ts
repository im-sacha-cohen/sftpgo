import { BadgeCheck, CalendarClock, Database, FileUp, Hand, LogIn, ShieldBan, type LucideIcon } from 'lucide-react';
import type {
  ConditionPattern,
  EventActionOptions,
  EventConditions,
  EventRule,
  EventRuleMinimal,
  EventTriggerTypes,
  Schedule,
} from '@/api/types';

export type FsEventName = NonNullable<EventConditions['fs_events']>[number];
export type ProviderEventName = NonNullable<EventConditions['provider_events']>[number];
export type ProtocolName = NonNullable<NonNullable<EventConditions['options']>['protocols']>[number];
export type ProviderObjectName = NonNullable<NonNullable<EventConditions['options']>['provider_objects']>[number];

export const TRIGGERS: { type: EventTriggerTypes; key: TriggerKey; icon: LucideIcon }[] = [
  { type: 1, key: 'fs', icon: FileUp },
  { type: 3, key: 'schedule', icon: CalendarClock },
  { type: 6, key: 'onDemand', icon: Hand },
  { type: 2, key: 'provider', icon: Database },
  { type: 7, key: 'idp', icon: LogIn },
  { type: 4, key: 'ipBlocked', icon: ShieldBan },
  { type: 5, key: 'certificate', icon: BadgeCheck },
];
export type TriggerKey = 'fs' | 'provider' | 'schedule' | 'ipBlocked' | 'certificate' | 'onDemand' | 'idp';

export function triggerInfo(type: number | undefined) {
  return TRIGGERS.find((x) => x.type === type) ?? TRIGGERS[0];
}

export const FS_EVENTS: FsEventName[] = [
  'upload',
  'first-upload',
  'pre-upload',
  'download',
  'first-download',
  'pre-download',
  'delete',
  'pre-delete',
  'rename',
  'copy',
  'mkdir',
  'rmdir',
  'ssh_cmd',
];
export const SYNC_REQUIRED_EVENTS: FsEventName[] = ['pre-upload', 'pre-download', 'pre-delete'];
export const SYNC_ALLOWED_EVENTS: FsEventName[] = ['upload', 'pre-upload', 'pre-download', 'pre-delete'];
export const PROVIDER_EVENTS: ProviderEventName[] = ['add', 'update', 'delete'];
export const PROTOCOLS: ProtocolName[] = ['SFTP', 'SCP', 'SSH', 'FTP', 'DAV', 'HTTP', 'HTTPShare', 'OIDC'];
export const PROVIDER_OBJECTS: ProviderObjectName[] = [
  'user',
  'group',
  'admin',
  'api_key',
  'share',
  'event_action',
  'event_rule',
];

/* ------------------------------------------------------------------ conditions */

export type CondField = 'name' | 'group' | 'role' | 'path' | 'status' | 'min_size' | 'max_size';
export type CondOp = 'match' | 'notMatch';

export interface CondRow {
  id: string;
  field: CondField;
  op: CondOp;
  /** Pattern for name/group/role/path, bytes (as string) for sizes. */
  value: string;
  /** Selected statuses for "status". */
  statuses?: number[];
}

/** Which condition fields apply to which trigger (mirrors EventConditions.validate). */
export function fieldsForTrigger(trigger: number): CondField[] {
  switch (trigger) {
    case 1:
      return ['path', 'name', 'group', 'role', 'status', 'min_size', 'max_size'];
    case 2:
      return ['name', 'group', 'role'];
    case 3:
    case 6:
      return ['name', 'group', 'role'];
    case 7:
      return ['name'];
    default:
      return [];
  }
}

let seq = 0;
export const rowId = () => `r${Date.now().toString(36)}${(seq++).toString(36)}`;

function patternRows(list: ConditionPattern[] | undefined, field: CondField): CondRow[] {
  return (list ?? []).map((p) => ({
    id: rowId(),
    field,
    op: p.inverse_match ? 'notMatch' : 'match',
    value: p.pattern ?? '',
  }));
}

/* ------------------------------------------------------------------ draft */

export interface StepDraft {
  name: string;
  options: Required<EventActionOptions>;
}

export interface RuleDraft {
  name: string;
  description: string;
  status: 0 | 1;
  trigger: EventTriggerTypes;
  fs_events: FsEventName[];
  provider_events: ProviderEventName[];
  provider_objects: ProviderObjectName[];
  protocols: ProtocolName[];
  schedules: Schedule[];
  idp_login_event: 0 | 1 | 2;
  conditions: CondRow[];
  concurrent_execution: boolean;
  steps: StepDraft[];
}

export function emptyRuleDraft(): RuleDraft {
  return {
    name: '',
    description: '',
    status: 1,
    trigger: 1,
    fs_events: ['upload'],
    provider_events: ['add'],
    provider_objects: [],
    protocols: [],
    schedules: [{ hour: '2', day_of_week: '*', day_of_month: '*', month: '*' }],
    idp_login_event: 0,
    conditions: [],
    concurrent_execution: false,
    steps: [],
  };
}

export function toRuleDraft(r: EventRule): RuleDraft {
  const c = r.conditions ?? {};
  const o = c.options ?? {};
  const base = emptyRuleDraft();
  const conditions: CondRow[] = [
    ...patternRows(o.fs_paths, 'path'),
    ...patternRows(o.names, 'name'),
    ...patternRows(o.group_names, 'group'),
    ...patternRows(o.role_names, 'role'),
  ];
  if (o.event_statuses?.length)
    conditions.push({ id: rowId(), field: 'status', op: 'match', value: '', statuses: [...o.event_statuses] });
  if (o.min_size) conditions.push({ id: rowId(), field: 'min_size', op: 'match', value: String(o.min_size) });
  if (o.max_size) conditions.push({ id: rowId(), field: 'max_size', op: 'match', value: String(o.max_size) });
  const steps = [...(r.actions ?? [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((a) => ({
      name: a.name ?? '',
      options: {
        is_failure_action: !!a.relation_options?.is_failure_action,
        stop_on_failure: !!a.relation_options?.stop_on_failure,
        execute_sync: !!a.relation_options?.execute_sync,
      },
    }));
  return {
    name: r.name ?? '',
    description: r.description ?? '',
    status: r.status === 0 ? 0 : 1,
    trigger: r.trigger ?? 1,
    fs_events: c.fs_events?.length ? [...c.fs_events] : r.trigger === 1 ? [] : base.fs_events,
    provider_events: c.provider_events?.length ? [...c.provider_events] : r.trigger === 2 ? [] : base.provider_events,
    provider_objects: [...(o.provider_objects ?? [])],
    protocols: [...(o.protocols ?? [])],
    schedules: c.schedules?.length ? c.schedules.map((s) => ({ ...s })) : base.schedules,
    idp_login_event: c.idp_login_event ?? 0,
    conditions,
    concurrent_execution: !!o.concurrent_execution,
    steps,
  };
}

/** Builds the API payload, keeping only what applies to the selected trigger. */
export function ruleFromDraft(d: RuleDraft): EventRuleMinimal {
  const allowed = new Set(fieldsForTrigger(d.trigger));
  const rows = d.conditions.filter((r) => allowed.has(r.field));
  const pats = (f: CondField): ConditionPattern[] | undefined => {
    const list = rows
      .filter((r) => r.field === f && r.value.trim())
      .map((r) => ({ pattern: r.value.trim(), ...(r.op === 'notMatch' ? { inverse_match: true } : {}) }));
    return list.length ? list : undefined;
  };
  const num = (f: CondField) => {
    const r = rows.find((x) => x.field === f);
    const n = r ? Number(r.value) : 0;
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const statuses = rows.find((r) => r.field === 'status')?.statuses ?? [];
  const options: NonNullable<EventConditions['options']> = {
    names: pats('name'),
    group_names: pats('group'),
    role_names: pats('role'),
    fs_paths: pats('path'),
    event_statuses: statuses.length ? (statuses as (1 | 2 | 3)[]) : undefined,
    min_size: num('min_size'),
    max_size: num('max_size'),
    protocols: d.trigger === 1 && d.protocols.length ? d.protocols : undefined,
    provider_objects: d.trigger === 2 && d.provider_objects.length ? d.provider_objects : undefined,
    concurrent_execution: d.trigger !== 6 && d.concurrent_execution ? true : undefined,
  };
  const conditions: EventConditions = { options: clean(options) };
  if (d.trigger === 1) conditions.fs_events = d.fs_events;
  if (d.trigger === 2) conditions.provider_events = d.provider_events;
  if (d.trigger === 3) conditions.schedules = d.schedules;
  if (d.trigger === 7) conditions.idp_login_event = d.idp_login_event;
  return {
    name: d.name.trim(),
    description: d.description,
    status: d.status,
    trigger: d.trigger,
    conditions,
    actions: d.steps.map((s, i) => ({ name: s.name, order: i + 1, relation_options: s.options })),
  };
}

function clean<T extends object>(o: T): T {
  const out = {} as T;
  for (const [k, v] of Object.entries(o)) if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  return out;
}

/** Number of changed sections between two drafts. */
export function countRuleChanges(a: RuleDraft, b: RuleDraft) {
  const pa = ruleFromDraft(a);
  const pb = ruleFromDraft(b);
  let n = 0;
  (['name', 'description', 'status', 'trigger'] as const).forEach((k) => {
    if ((pa[k] ?? '') !== (pb[k] ?? '')) n++;
  });
  const ca = pa.conditions ?? {};
  const cb = pb.conditions ?? {};
  (['fs_events', 'provider_events', 'schedules', 'idp_login_event'] as const).forEach((k) => {
    if (JSON.stringify(ca[k] ?? null) !== JSON.stringify(cb[k] ?? null)) n++;
  });
  const oa = (ca.options ?? {}) as Record<string, unknown>;
  const ob = (cb.options ?? {}) as Record<string, unknown>;
  new Set([...Object.keys(oa), ...Object.keys(ob)]).forEach((k) => {
    if (JSON.stringify(oa[k] ?? null) !== JSON.stringify(ob[k] ?? null)) n++;
  });
  const sa = pa.actions ?? [];
  const sb = pb.actions ?? [];
  const len = Math.max(sa.length, sb.length);
  for (let i = 0; i < len; i++) if (JSON.stringify(sa[i] ?? null) !== JSON.stringify(sb[i] ?? null)) n++;
  return n;
}

/* ------------------------------------------------------------------ schedules */

export type SchedulePreset = 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';

const isNum = (s: string | undefined, min: number, max: number) =>
  !!s && /^\d+$/.test(s) && Number(s) >= min && Number(s) <= max;

export function schedulePreset(s: Schedule): SchedulePreset {
  const { hour = '*', day_of_week: dow = '*', day_of_month: dom = '*', month = '*' } = s;
  if (month !== '*') return 'custom';
  if (hour === '*' && dow === '*' && dom === '*') return 'hourly';
  if (!isNum(hour, 0, 23)) return 'custom';
  if (dow === '*' && dom === '*') return 'daily';
  if (isNum(dow, 0, 6) && dom === '*') return 'weekly';
  if (dow === '*' && isNum(dom, 1, 31)) return 'monthly';
  return 'custom';
}

export function presetSchedule(preset: SchedulePreset, prev: Schedule): Schedule {
  const hour = isNum(prev.hour, 0, 23) ? prev.hour! : '2';
  switch (preset) {
    case 'hourly':
      return { hour: '*', day_of_week: '*', day_of_month: '*', month: '*' };
    case 'daily':
      return { hour, day_of_week: '*', day_of_month: '*', month: '*' };
    case 'weekly':
      return { hour, day_of_week: isNum(prev.day_of_week, 0, 6) ? prev.day_of_week : '1', day_of_month: '*', month: '*' };
    case 'monthly':
      return { hour, day_of_week: '*', day_of_month: isNum(prev.day_of_month, 1, 31) ? prev.day_of_month : '1', month: '*' };
    default:
      return { ...prev };
  }
}

export const pad2 = (h: string | undefined) => (isNum(h, 0, 23) ? `${h!.padStart(2, '0')}:00` : h ?? '*');
