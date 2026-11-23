import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { BaseVirtualFolder, Group, User } from '@/api/types';
import { useAuth } from '@/lib/auth';
import { loadMembers } from './model';

const PAGE = 500;

/** Fetches every page of a list endpoint (limit 500). */
export async function fetchAll<T>(path: string, signal?: AbortSignal): Promise<T[]> {
  const out: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await api.get<T[]>(path, { offset, limit: PAGE, order: 'ASC' }, signal);
    out.push(...(page ?? []));
    if (!page || page.length < PAGE) break;
  }
  return out;
}

/** The folder list returns `groups` too, but the OpenAPI schema misses it. */
export type SpaceFolder = BaseVirtualFolder & { groups?: string[] };

export const folderGroups = (f: SpaceFolder | undefined) => f?.groups ?? [];
export const accessCount = (f: SpaceFolder | undefined) => (f?.users?.length ?? 0) + folderGroups(f).length;

export function useSpaces() {
  const { can } = useAuth();
  return useQuery({
    queryKey: ['folders', 'spaces'],
    queryFn: ({ signal }) => fetchAll<SpaceFolder>('/folders', signal),
    enabled: can('manage_folders'),
  });
}

export function useSpaceMembers(folder: SpaceFolder | undefined) {
  return useQuery({
    // the member lists are part of the key so a new listing reloads the members
    queryKey: ['folders', 'members', folder?.name, folder?.users ?? [], folderGroups(folder)],
    queryFn: () => loadMembers(folder!),
    enabled: !!folder,
  });
}

/** Where new spaces are stored by default, from the server's users base dir. */
export function useSpacesBaseDir(enabled: boolean) {
  const q = useQuery({
    queryKey: ['spaces', 'defaults'],
    queryFn: ({ signal }) => api.get<{ base_dir: string }>('/spaces/defaults', undefined, signal),
    enabled,
    staleTime: Infinity,
  });
  const dir = q.data?.base_dir ?? '';
  return dir ? dir.replace(/\/+$/, '') + '/' : '';
}

/** Users and groups that can be picked in "Give access". */
export function usePeople(enabled: boolean) {
  const { can } = useAuth();
  const users = useQuery({
    queryKey: ['users', 'spaces-picker'],
    queryFn: ({ signal }) => fetchAll<User>('/users', signal),
    enabled: enabled && can('edit_users'),
  });
  const groups = useQuery({
    queryKey: ['groups', 'spaces-picker'],
    queryFn: ({ signal }) => fetchAll<Group>('/groups', signal),
    enabled: enabled && can('manage_groups'),
  });
  return { users, groups };
}

/** Everything that shows who has access to what. */
export function useInvalidateAccess() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ['folders'] }),
      qc.invalidateQueries({ queryKey: ['users'] }),
      qc.invalidateQueries({ queryKey: ['groups'] }),
    ]);
}

export const spaceApi = {
  create: (f: { name: string; mapped_path: string; description?: string }) =>
    api.post<SpaceFolder>('/folders', { ...f, filesystem: { provider: 0 } }),
  remove: (name: string) => api.del(`/folders/${encodeURIComponent(name)}`),
};
