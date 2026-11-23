import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  can as canFn,
  getSession,
  login as apiLogin,
  loginAny as apiLoginAny,
  logout as apiLogout,
  onSessionChange,
  type Session,
  type SessionKind,
} from '@/api/client';

interface AuthValue {
  session: Session | null;
  /** Set when the session ended because the token expired (not a manual logout). */
  expired: { kind: SessionKind; username: string } | null;
  login: (kind: SessionKind, username: string, password: string, otp?: string) => Promise<Session>;
  /** Signs in trying each account kind of `order` in turn (no kind picked by the person). */
  loginAny: (order: SessionKind[], username: string, password: string, otp?: string) => Promise<Session>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
  clearExpired: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<Session | null>(getSession);
  const [expired, setExpired] = useState<AuthValue['expired']>(null);

  useEffect(
    () =>
      onSessionChange((s, reason) => {
        setSession((prev) => {
          if (!s && reason === 'expired' && prev) setExpired({ kind: prev.kind, username: prev.username });
          return s;
        });
        if (s) setExpired(null);
      }),
    [],
  );

  // Proactively mark the session expired when the JWT reaches its end.
  useEffect(() => {
    if (!session) return;
    const ms = session.expiresAt - Date.now();
    const id = window.setTimeout(() => setExpired({ kind: session.kind, username: session.username }), Math.max(0, ms));
    return () => window.clearTimeout(id);
  }, [session]);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      expired,
      login: (kind, u, p, otp) => apiLogin(kind, u, p, otp),
      loginAny: (order, u, p, otp) => apiLoginAny(order, u, p, otp),
      logout: async () => {
        await apiLogout();
        setExpired(null);
        qc.clear();
      },
      can: (perm) => (session ? canFn(perm) : false),
      clearExpired: () => setExpired(null),
    }),
    [session, expired, qc],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
