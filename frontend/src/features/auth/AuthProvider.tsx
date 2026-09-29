import { useQueryClient } from '@tanstack/react-query';
import { type PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { configureCoreAuth, coreApi } from '../../shared/api/client';
import { AuthContext, type CurrentUser, type Session } from './auth-context';
let restoration: Promise<Session> | null = null;

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isInitializing, setInitializing] = useState(true);
  const tokenRef = useRef<string | null>(null);
  const apply = useCallback((session: Session | null) => {
    tokenRef.current = session?.accessToken ?? null;
    setAccessToken(tokenRef.current);
    setUser(session?.user ?? null);
  }, []);
  const clear = useCallback(() => {
    apply(null);
    queryClient.clear();
  }, [apply, queryClient]);
  const refreshSession = useCallback(async () => {
    restoration ??= coreApi.post<Session>('/auth/refresh', undefined, false).finally(() => { restoration = null; });
    try { apply(await restoration); return true; }
    catch { clear(); return false; }
  }, [apply, clear]);

  useEffect(() => {
    configureCoreAuth({ token: () => tokenRef.current, refresh: refreshSession, clear });
    let live = true;
    void refreshSession().finally(() => { if (live) setInitializing(false); });
    return () => { live = false; configureCoreAuth(null); };
  }, [refreshSession, clear]);

  const login = async (identifier: string, password: string, remember: boolean) => {
    const session = await coreApi.post<Session>('/auth/login', { identifier, password, remember }, false);
    apply(session); return session.user;
  };
  const register = async (fullName: string, email: string, password: string) => {
    const session = await coreApi.post<Session>('/auth/register', { fullName, email, password }, false);
    apply(session); return session.user;
  };
  const logout = async () => {
    try { await coreApi.post<void>('/auth/logout', undefined, false); }
    finally { clear(); }
  };
  return <AuthContext.Provider value={{ user, accessToken, isInitializing, isAuthenticated: !!user,
    login, register, logout, refreshSession }}>{children}</AuthContext.Provider>;
}
