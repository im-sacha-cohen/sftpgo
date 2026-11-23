import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { BaseEventAction, EventRule } from '@/api/types';

/** Fetches every page of a list endpoint (the API caps `limit` at 500). */
export async function fetchAll<T>(path: string, signal?: AbortSignal): Promise<T[]> {
  const out: T[] = [];
  const limit = 500;
  for (let offset = 0; ; offset += limit) {
    const page = (await api.get<T[]>(path, { limit, offset, order: 'ASC' }, signal)) ?? [];
    out.push(...page);
    if (page.length < limit) break;
  }
  return out;
}

export function useEventActions(enabled = true) {
  return useQuery({
    queryKey: ['eventactions'],
    queryFn: ({ signal }) => fetchAll<BaseEventAction>('/eventactions', signal),
    enabled,
  });
}

export function useEventRules(enabled = true) {
  return useQuery({
    queryKey: ['eventrules'],
    queryFn: ({ signal }) => fetchAll<EventRule>('/eventrules', signal),
    enabled,
  });
}

export const enc = encodeURIComponent;
