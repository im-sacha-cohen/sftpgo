import { useQuery } from '@tanstack/react-query';
import type { BaseVirtualFolder, Group } from '@/api/types';
import { fetchAll } from '@/pages/actions/api';

export function useFolders(enabled = true) {
  return useQuery({
    queryKey: ['folders'],
    queryFn: ({ signal }) => fetchAll<BaseVirtualFolder>('/folders', signal),
    enabled,
  });
}

/** Groups are only used to show which groups mount a folder; failures are tolerated. */
export function useGroupsByFolder(enabled = true) {
  return useQuery({
    queryKey: ['groups', 'by-folder'],
    queryFn: async ({ signal }) => {
      const groups = await fetchAll<Group>('/groups', signal);
      const map = new Map<string, string[]>();
      groups.forEach((g) =>
        (g.virtual_folders ?? []).forEach((f) => {
          const k = f.name ?? '';
          map.set(k, [...(map.get(k) ?? []), g.name ?? '']);
        }),
      );
      return map;
    },
    enabled,
    retry: false,
  });
}
