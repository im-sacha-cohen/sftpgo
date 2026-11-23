import { Cloud, Container, HardDrive, Lock, Server, Globe, Database, type LucideIcon } from 'lucide-react';
import type { BaseVirtualFolder, FilesystemConfig, FsProviders, Secret } from '@/api/types';

export const PROVIDERS: { value: FsProviders; icon: LucideIcon }[] = [
  { value: 0, icon: HardDrive },
  { value: 4, icon: Lock },
  { value: 1, icon: Database },
  { value: 2, icon: Cloud },
  { value: 3, icon: Container },
  { value: 5, icon: Server },
  { value: 6, icon: Globe },
];

export function providerIcon(p: number | undefined) {
  return PROVIDERS.find((x) => x.value === (p ?? 0))?.icon ?? HardDrive;
}

/** Fully populated filesystem config, ready to bind to form fields. */
export type FsDraft = Required<Pick<FilesystemConfig, 'provider' | 'osconfig' | 's3config' | 'gcsconfig' | 'azblobconfig' | 'cryptconfig' | 'sftpconfig' | 'httpconfig'>>;

export interface FolderDraft {
  name: string;
  description: string;
  mapped_path: string;
  filesystem: FsDraft;
}

export function emptyFs(): FsDraft {
  return {
    provider: 0,
    osconfig: {},
    s3config: {},
    gcsconfig: {},
    azblobconfig: {},
    cryptconfig: {},
    sftpconfig: { fingerprints: [] },
    httpconfig: {},
  };
}

export function toFsDraft(fs: FilesystemConfig | undefined): FsDraft {
  const e = emptyFs();
  return {
    provider: fs?.provider ?? 0,
    osconfig: { ...e.osconfig, ...fs?.osconfig },
    s3config: { ...e.s3config, ...fs?.s3config },
    gcsconfig: { ...e.gcsconfig, ...fs?.gcsconfig },
    azblobconfig: { ...e.azblobconfig, ...fs?.azblobconfig },
    cryptconfig: { ...e.cryptconfig, ...fs?.cryptconfig },
    sftpconfig: { ...e.sftpconfig, ...fs?.sftpconfig, fingerprints: fs?.sftpconfig?.fingerprints ?? [] },
    httpconfig: { ...e.httpconfig, ...fs?.httpconfig },
  };
}

export function toFolderDraft(f: BaseVirtualFolder): FolderDraft {
  return {
    name: f.name ?? '',
    description: f.description ?? '',
    mapped_path: f.mapped_path ?? '',
    filesystem: toFsDraft(f.filesystem),
  };
}

export function emptyFolderDraft(): FolderDraft {
  return { name: '', description: '', mapped_path: '', filesystem: emptyFs() };
}

/** Removes empty secrets (no status) so the API does not try to validate them. */
function sec(s: Secret | undefined): Secret | undefined {
  if (!s || !s.status) return undefined;
  if (s.status === 'Plain' && !s.payload) return undefined;
  return s;
}

/** Only the block of the selected provider is sent, with secrets cleaned. */
export function fsFromDraft(d: FsDraft): FilesystemConfig {
  const out: FilesystemConfig = { provider: d.provider };
  switch (d.provider) {
    case 0:
      out.osconfig = d.osconfig;
      break;
    case 4:
      out.cryptconfig = { ...d.cryptconfig, passphrase: sec(d.cryptconfig.passphrase) };
      break;
    case 1:
      out.s3config = {
        ...d.s3config,
        access_secret: sec(d.s3config.access_secret),
        sse_customer_key: sec(d.s3config.sse_customer_key),
      };
      break;
    case 2:
      out.gcsconfig = { ...d.gcsconfig, credentials: sec(d.gcsconfig.credentials) };
      break;
    case 3:
      out.azblobconfig = {
        ...d.azblobconfig,
        account_key: sec(d.azblobconfig.account_key),
        sas_url: sec(d.azblobconfig.sas_url),
      };
      break;
    case 5:
      out.sftpconfig = {
        ...d.sftpconfig,
        password: sec(d.sftpconfig.password),
        private_key: sec(d.sftpconfig.private_key),
        key_passphrase: sec(d.sftpconfig.key_passphrase),
      };
      break;
    case 6:
      out.httpconfig = { ...d.httpconfig, password: sec(d.httpconfig.password), api_key: sec(d.httpconfig.api_key) };
      break;
  }
  return out;
}

export function folderFromDraft(d: FolderDraft): BaseVirtualFolder {
  return {
    name: d.name.trim(),
    description: d.description,
    mapped_path: d.mapped_path.trim(),
    filesystem: fsFromDraft(d.filesystem),
  };
}

export function countFolderChanges(a: FolderDraft, b: FolderDraft) {
  let n = 0;
  if (a.name !== b.name) n++;
  if (a.description !== b.description) n++;
  if (a.mapped_path !== b.mapped_path) n++;
  const fa = fsFromDraft(a.filesystem) as Record<string, unknown>;
  const fb = fsFromDraft(b.filesystem) as Record<string, unknown>;
  if (fa.provider !== fb.provider) return n + 1;
  for (const k of Object.keys(fa)) {
    if (k === 'provider') continue;
    const va = (fa[k] ?? {}) as Record<string, unknown>;
    const vb = (fb[k] ?? {}) as Record<string, unknown>;
    new Set([...Object.keys(va), ...Object.keys(vb)]).forEach((s) => {
      if (JSON.stringify(va[s] ?? null) !== JSON.stringify(vb[s] ?? null)) n++;
    });
  }
  return n;
}

/** "bucket/prefix", "host:port/prefix", mapped path… */
export function storageSummary(f: BaseVirtualFolder): string {
  const fs = f.filesystem ?? {};
  switch (fs.provider ?? 0) {
    case 1:
      return [fs.s3config?.bucket, fs.s3config?.key_prefix].filter(Boolean).join('/') || '—';
    case 2:
      return [fs.gcsconfig?.bucket, fs.gcsconfig?.key_prefix].filter(Boolean).join('/') || '—';
    case 3:
      return [fs.azblobconfig?.container, fs.azblobconfig?.key_prefix].filter(Boolean).join('/') || '—';
    case 5:
      return [fs.sftpconfig?.endpoint, fs.sftpconfig?.prefix].filter(Boolean).join('') || '—';
    case 6:
      return fs.httpconfig?.endpoint || '—';
    default:
      return f.mapped_path || '—';
  }
}
