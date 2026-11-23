import {
  Archive,
  ArrowLeftRight,
  CalendarX,
  DatabaseBackup,
  FolderCog,
  FolderTree,
  Gauge,
  Globe,
  KeyRound,
  Mail,
  RotateCw,
  Terminal,
  UserCheck,
  UserX,
  type LucideIcon,
} from 'lucide-react';
import type {
  BaseEventAction,
  BaseEventActionOptions,
  EventActionTypes,
  FilesystemActionTypes,
  KeyValue,
  Secret,
} from '@/api/types';

/** Every action type, in the order shown by the type picker. */
export const ACTION_TYPES: { type: EventActionTypes; key: ActionTypeKey; icon: LucideIcon }[] = [
  { type: 1, key: 'http', icon: Globe },
  { type: 3, key: 'email', icon: Mail },
  { type: 2, key: 'command', icon: Terminal },
  { type: 9, key: 'filesystem', icon: FolderTree },
  { type: 4, key: 'backup', icon: DatabaseBackup },
  { type: 8, key: 'retention', icon: Archive },
  { type: 5, key: 'userQuota', icon: Gauge },
  { type: 6, key: 'folderQuota', icon: FolderCog },
  { type: 7, key: 'transferQuota', icon: ArrowLeftRight },
  { type: 11, key: 'pwdExpiration', icon: KeyRound },
  { type: 12, key: 'userExpiration', icon: CalendarX },
  { type: 14, key: 'inactivity', icon: UserX },
  { type: 13, key: 'idpCheck', icon: UserCheck },
  { type: 15, key: 'rotateLog', icon: RotateCw },
];

export type ActionTypeKey =
  | 'http'
  | 'email'
  | 'command'
  | 'filesystem'
  | 'backup'
  | 'retention'
  | 'userQuota'
  | 'folderQuota'
  | 'transferQuota'
  | 'pwdExpiration'
  | 'userExpiration'
  | 'inactivity'
  | 'idpCheck'
  | 'rotateLog';

export function actionTypeInfo(type: number | undefined) {
  return ACTION_TYPES.find((a) => a.type === type) ?? ACTION_TYPES[0];
}

export const FS_ACTION_TYPES: { type: FilesystemActionTypes; key: FsActionKey }[] = [
  { type: 1, key: 'rename' },
  { type: 6, key: 'copy' },
  { type: 2, key: 'delete' },
  { type: 3, key: 'mkdir' },
  { type: 4, key: 'exist' },
  { type: 5, key: 'compress' },
];
export type FsActionKey = 'rename' | 'copy' | 'delete' | 'mkdir' | 'exist' | 'compress';

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE'] as const;

/** The full editable shape of an action (every option block always present). */
export interface ActionDraft {
  name: string;
  description: string;
  type: EventActionTypes;
  options: Required<
    Pick<
      BaseEventActionOptions,
      | 'http_config'
      | 'cmd_config'
      | 'email_config'
      | 'retention_config'
      | 'fs_config'
      | 'pwd_expiration_config'
      | 'user_inactivity_config'
      | 'idp_config'
    >
  >;
}

export function emptyActionDraft(type: EventActionTypes = 1): ActionDraft {
  return {
    name: '',
    description: '',
    type,
    options: {
      http_config: { method: 'POST', timeout: 20, headers: [], query_parameters: [], parts: [] },
      cmd_config: { cmd: '', args: [], timeout: 20, env_vars: [] },
      email_config: { recipients: [], bcc: [], subject: '', body: '', content_type: 0, attachments: [] },
      retention_config: { folders: [] },
      fs_config: { type: 1, renames: [], copy: [], deletes: [], mkdirs: [], exist: [], compress: { name: '', paths: [] } },
      pwd_expiration_config: { threshold: 7 },
      user_inactivity_config: { disable_threshold: 0, delete_threshold: 0 },
      idp_config: { mode: 0, template_user: '', template_admin: '' },
    },
  };
}

export function toActionDraft(a: BaseEventAction): ActionDraft {
  const base = emptyActionDraft(a.type ?? 1);
  const o = a.options ?? {};
  return {
    name: a.name ?? '',
    description: a.description ?? '',
    type: a.type ?? 1,
    options: {
      http_config: { ...base.options.http_config, ...stripEmpty(o.http_config) },
      cmd_config: { ...base.options.cmd_config, ...stripEmpty(o.cmd_config) },
      email_config: { ...base.options.email_config, ...stripEmpty(o.email_config) },
      retention_config: { ...base.options.retention_config, ...stripEmpty(o.retention_config) },
      fs_config: {
        ...base.options.fs_config,
        ...stripEmpty(o.fs_config),
        compress: { ...base.options.fs_config.compress, ...stripEmpty(o.fs_config?.compress) },
      },
      pwd_expiration_config: { ...base.options.pwd_expiration_config, ...stripEmpty(o.pwd_expiration_config) },
      user_inactivity_config: { ...base.options.user_inactivity_config, ...stripEmpty(o.user_inactivity_config) },
      idp_config: { ...base.options.idp_config, ...stripEmpty(o.idp_config) },
    },
  };
}

function stripEmpty<T extends object>(o: T | undefined): Partial<T> {
  if (!o) return {};
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined) continue;
    (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

const kv = (rows: KeyValue[] | undefined) => (rows ?? []).filter((r) => (r.key ?? '').trim() !== '');
const strs = (rows: string[] | undefined) => (rows ?? []).map((s) => s.trim()).filter(Boolean);

/** A secret is only sent when it was typed (Plain) or already stored (kept as-is). */
export function secretForSave(s: Secret | undefined): Secret | undefined {
  if (!s || !s.status) return undefined;
  if (s.status === 'Plain' && !s.payload) return undefined;
  return s;
}

/** Build the API payload: only the option block matching the type is sent. */
export function actionFromDraft(d: ActionDraft): BaseEventAction {
  const o = d.options;
  const options: BaseEventActionOptions = {};
  switch (d.type) {
    case 1: {
      const h = o.http_config;
      const parts = (h.parts ?? [])
        .filter((p) => (p.name ?? '').trim())
        .map((p) => ({ ...p, headers: kv(p.headers) }));
      options.http_config = {
        endpoint: h.endpoint?.trim(),
        method: h.method,
        username: h.username || undefined,
        password: secretForSave(h.password),
        headers: kv(h.headers),
        query_parameters: kv(h.query_parameters),
        timeout: h.timeout,
        skip_tls_verify: h.skip_tls_verify,
        body: parts.length ? undefined : h.body,
        parts,
      };
      break;
    }
    case 2:
      options.cmd_config = {
        cmd: o.cmd_config.cmd?.trim(),
        args: (o.cmd_config.args ?? []).filter((x) => x !== ''),
        timeout: o.cmd_config.timeout,
        env_vars: kv(o.cmd_config.env_vars),
      };
      break;
    case 3:
      options.email_config = {
        ...o.email_config,
        recipients: strs(o.email_config.recipients),
        bcc: strs(o.email_config.bcc),
        attachments: strs(o.email_config.attachments),
      };
      break;
    case 8:
      options.retention_config = {
        folders: (o.retention_config.folders ?? []).filter((f) => (f.path ?? '').trim()),
      };
      break;
    case 9: {
      const f = o.fs_config;
      const pairs = <T extends KeyValue>(rows: T[] | undefined) =>
        (rows ?? []).filter((r) => (r.key ?? '').trim() && (r.value ?? '').trim());
      options.fs_config = { type: f.type };
      if (f.type === 1) options.fs_config.renames = pairs(f.renames);
      if (f.type === 6) options.fs_config.copy = pairs(f.copy);
      if (f.type === 2) options.fs_config.deletes = strs(f.deletes);
      if (f.type === 3) options.fs_config.mkdirs = strs(f.mkdirs);
      if (f.type === 4) options.fs_config.exist = strs(f.exist);
      if (f.type === 5) options.fs_config.compress = { name: f.compress?.name?.trim(), paths: strs(f.compress?.paths) };
      break;
    }
    case 11:
      options.pwd_expiration_config = o.pwd_expiration_config;
      break;
    case 13:
      options.idp_config = o.idp_config;
      break;
    case 14:
      options.user_inactivity_config = o.user_inactivity_config;
      break;
    default:
      break;
  }
  return { name: d.name.trim(), description: d.description, type: d.type, options };
}

/** Stable JSON used to compare a draft with what was loaded. */
export function actionSignature(d: ActionDraft) {
  return JSON.stringify(actionFromDraft(d));
}

/** Count of top-level differences between two drafts (for the SaveBar). */
export function countActionChanges(a: ActionDraft, b: ActionDraft) {
  const pa = actionFromDraft(a);
  const pb = actionFromDraft(b);
  let n = 0;
  if (pa.name !== pb.name) n++;
  if ((pa.description ?? '') !== (pb.description ?? '')) n++;
  if (pa.type !== pb.type) n++;
  const oa = (pa.options ?? {}) as Record<string, unknown>;
  const ob = (pb.options ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(oa), ...Object.keys(ob)]);
  keys.forEach((k) => {
    const va = (oa[k] ?? {}) as Record<string, unknown>;
    const vb = (ob[k] ?? {}) as Record<string, unknown>;
    const sub = new Set([...Object.keys(va), ...Object.keys(vb)]);
    sub.forEach((s) => {
      if (JSON.stringify(va[s] ?? null) !== JSON.stringify(vb[s] ?? null)) n++;
    });
  });
  return n;
}

/** Short technical summary of what an action targets ("POST erp.example.com/hooks", "compta@…"). */
export function actionTarget(a: BaseEventAction): string {
  const o = a.options ?? {};
  switch (a.type) {
    case 1: {
      const h = o.http_config ?? {};
      let ep = h.endpoint ?? '';
      try {
        const u = new URL(ep);
        ep = u.host + (u.pathname === '/' ? '' : decodeURIComponent(u.pathname)) + decodeURIComponent(u.search);
      } catch {
        /* keep raw */
      }
      return `${h.method ?? 'POST'} ${ep}`.trim();
    }
    case 2:
      return [o.cmd_config?.cmd, ...(o.cmd_config?.args ?? [])].filter(Boolean).join(' ');
    case 3:
      return (o.email_config?.recipients ?? []).join(', ');
    case 8:
      return (o.retention_config?.folders ?? []).map((f) => `${f.path} · ${f.retention} h`).join(', ');
    case 9: {
      const f = o.fs_config ?? {};
      switch (f.type) {
        case 1:
          return (f.renames ?? []).map((r) => `${r.key} → ${r.value}`).join(', ');
        case 6:
          return (f.copy ?? []).map((r) => `${r.key} → ${r.value}`).join(', ');
        case 2:
          return (f.deletes ?? []).join(', ');
        case 3:
          return (f.mkdirs ?? []).join(', ');
        case 4:
          return (f.exist ?? []).join(', ');
        case 5:
          return `${f.compress?.name ?? ''} ← ${(f.compress?.paths ?? []).join(', ')}`;
        default:
          return '';
      }
    }
    case 11:
      return `≤ ${o.pwd_expiration_config?.threshold ?? 0} j`;
    case 14: {
      const u = o.user_inactivity_config ?? {};
      return [u.disable_threshold ? `⏸ ${u.disable_threshold} j` : '', u.delete_threshold ? `✕ ${u.delete_threshold} j` : '']
        .filter(Boolean)
        .join(' · ');
    }
    default:
      return '';
  }
}

/** Action types that cannot be used with IP-blocked / certificate triggers. */
export const NOT_FOR_IP_CERT: number[] = [5, 6, 7, 8, 9, 11, 12];
