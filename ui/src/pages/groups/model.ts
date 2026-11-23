import type { Group } from '@/api/types';
import { clone, stripStoredSecrets } from '@/pages/users/model';

export function emptyGroup(): Group {
  return {
    name: '',
    description: '',
    user_settings: { permissions: {}, filters: {}, filesystem: { provider: 0 } },
    virtual_folders: [],
  };
}

export function toGroupDraft(g: Group): Group {
  const d = clone(g);
  d.user_settings = d.user_settings ?? {};
  d.user_settings.permissions = d.user_settings.permissions ?? {};
  d.user_settings.filters = d.user_settings.filters ?? {};
  d.user_settings.filesystem = d.user_settings.filesystem ?? { provider: 0 };
  d.virtual_folders = d.virtual_folders ?? [];
  return d;
}

export function cloneGroup(g: Group): Group {
  const d = toGroupDraft(g);
  delete d.id;
  delete d.created_at;
  delete d.updated_at;
  delete d.users;
  delete d.admins;
  d.name = '';
  d.user_settings!.filesystem = stripStoredSecrets(d.user_settings!.filesystem);
  d.virtual_folders = (d.virtual_folders ?? []).map((v) => ({
    name: v.name,
    virtual_path: v.virtual_path,
    quota_size: v.quota_size,
    quota_files: v.quota_files,
    subpath: v.subpath,
  }));
  return d;
}

export function toGroupPayload(d: Group): Group {
  const out = clone(d);
  delete out.users;
  delete out.admins;
  out.virtual_folders = (out.virtual_folders ?? []).map((v) => ({
    name: v.name,
    virtual_path: v.virtual_path,
    quota_size: v.quota_size ?? 0,
    quota_files: v.quota_files ?? 0,
    ...(v.subpath ? { subpath: v.subpath } : {}),
  }));
  return out;
}

export const GROUP_IGNORED = ['id', 'created_at', 'updated_at', 'users', 'admins'];
