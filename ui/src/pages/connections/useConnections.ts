import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client';
import type { ConnectionStatus, Transfer } from '@/api/types';

export function useConnections(opts: { enabled?: boolean; refetchInterval?: number | false } = {}) {
  return useQuery({
    queryKey: ['connections'],
    queryFn: () => api.get<ConnectionStatus[]>('/connections'),
    enabled: opts.enabled ?? true,
    refetchInterval: opts.refetchInterval ?? 5000,
  });
}

export function useCloseConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/connections/${encodeURIComponent(id)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}

/** Average speed of a transfer since it started, in bytes/s. */
export function transferSpeed(t: Transfer, now = Date.now()) {
  if (!t.start_time || !t.size) return 0;
  const secs = (now - t.start_time) / 1000;
  return secs > 0 ? t.size / secs : 0;
}

/** SFTPGo reports HTTP/WebDAV connections with protocol strings outside the OpenAPI enum. */
export function protocolLabel(p?: string) {
  switch (p) {
    case 'DAV':
      return 'WebDAV';
    case 'SSH':
      return 'SSH';
    case undefined:
    case '':
      return '—';
    default:
      return p;
  }
}
