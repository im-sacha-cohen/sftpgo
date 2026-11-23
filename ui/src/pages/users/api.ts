import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { BaseVirtualFolder, ConnectionStatus, Group, Role, User } from '@/api/types';
import { useAuth } from '@/lib/auth';

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

export function useUsers() {
  return useQuery({
    queryKey: ['users', 'all'],
    queryFn: ({ signal }) => fetchAll<User>('/users', signal),
  });
}

export function useUser(username: string | undefined) {
  return useQuery({
    queryKey: ['users', 'one', username],
    queryFn: ({ signal }) => api.get<User>(`/users/${encodeURIComponent(username!)}`, undefined, signal),
    enabled: !!username,
  });
}

export function useGroups(enabled = true) {
  const { can } = useAuth();
  return useQuery({
    queryKey: ['groups', 'all'],
    queryFn: ({ signal }) => fetchAll<Group>('/groups', signal),
    enabled: enabled && can('manage_groups'),
  });
}

export function useGroup(name: string | undefined) {
  const { can } = useAuth();
  return useQuery({
    queryKey: ['groups', 'one', name],
    queryFn: ({ signal }) => api.get<Group>(`/groups/${encodeURIComponent(name!)}`, undefined, signal),
    enabled: !!name && can('manage_groups'),
  });
}

export function useFolders(enabled = true) {
  const { can } = useAuth();
  return useQuery({
    queryKey: ['folders', 'all'],
    queryFn: ({ signal }) => fetchAll<BaseVirtualFolder>('/folders', signal),
    enabled: enabled && can('manage_folders'),
  });
}

export function useRoles(enabled = true) {
  const { can } = useAuth();
  return useQuery({
    queryKey: ['roles', 'all'],
    queryFn: ({ signal }) => fetchAll<Role>('/roles', signal),
    // listing roles requires a super admin ("*")
    enabled: enabled && can('*'),
  });
}

export function useLiveConnections() {
  const { can } = useAuth();
  return useQuery({
    queryKey: ['connections'],
    queryFn: () => api.get<ConnectionStatus[]>('/connections'),
    enabled: can('view_conns'),
    refetchInterval: 5000,
  });
}

export function useCloseConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/connections/${encodeURIComponent(id)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}

export const userApi = {
  create: (u: User) => api.post<User>('/users', u),
  update: (u: User) => api.put(`/users/${encodeURIComponent(u.username!)}`, u),
  remove: (username: string) => api.del(`/users/${encodeURIComponent(username)}`),
  disable2fa: (username: string) => api.put(`/users/${encodeURIComponent(username)}/2fa/disable`),
  quotaScan: (username: string) => api.post(`/quotas/users/${encodeURIComponent(username)}/scan`),
  /** Sets status on a full user object (PUT needs the whole object; stored secrets are preserved). */
  setStatus: (u: User, status: 0 | 1) => {
    const body: User = { ...u, status };
    delete body.password;
    return api.put(`/users/${encodeURIComponent(u.username!)}`, body);
  },
};

export const groupApi = {
  create: (g: Group) => api.post<Group>('/groups', g),
  update: (g: Group) => api.put(`/groups/${encodeURIComponent(g.name!)}`, g),
  remove: (name: string) => api.del(`/groups/${encodeURIComponent(name)}`),
};

/** Triggers a browser download of a JSON document. */
export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
