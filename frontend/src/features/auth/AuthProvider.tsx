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
  const generation = useRef(0);
  const endingSession = useRef<Promise<void> | null>(null);
  const apply = useCallback((session: Session | null) => {
    tokenRef.current = session?.accessToken ?? null;
    setAccessToken(tokenRef.current);
    setUser(session?.user ?? null);
  }, []);
  const clear = useCallback(() => {
    generation.current++;
    apply(null);
    queryClient.clear();
  }, [apply, queryClient]);
  const refreshSession = useCallback(async () => {
    if (endingSession.current) return false;
    const startedAt = generation.current;
    restoration ??= coreApi.post<Session>('/auth/refresh', undefined, false).finally(() => { restoration = null; });
    try {
      const session = await restoration;
      if (generation.current !== startedAt) return false;
      apply(session); return true;
    } catch {
      if (generation.current === startedAt) clear();
      return false;
    }
  }, [apply, clear]);

  useEffect(() => {
    const sessionGeneration = generation;
    configureCoreAuth({ token: () => tokenRef.current, refresh: refreshSession, clear });
    let live = true;
    void refreshSession().finally(() => { if (live) setInitializing(false); });
    return () => { live = false; sessionGeneration.current++; configureCoreAuth(null); };
  }, [refreshSession, clear]);

  const login = async (identifier: string, password: string, remember: boolean) => {
    await endingSession.current?.catch(() => {});
    const session = await coreApi.post<Session>('/auth/login', { identifier, password, remember }, false);
    generation.current++;
    queryClient.clear();
    apply(session); return session.user;
  };
  const register = async (fullName: string, email: string, password: string) => {
    await endingSession.current?.catch(() => {});
    const session = await coreApi.post<Session>('/auth/register', { fullName, email, password }, false);
    generation.current++;
    queryClient.clear();
    apply(session); return session.user;
  };
  const logout = async () => {
    const inFlight = restoration;
    clear();
    const ending = (async () => {
      // Let a pending rotation set its cookie before revoking that cookie's family.
      await inFlight?.catch(() => {});
      await coreApi.post<void>('/auth/logout', undefined, false);
    })();
    endingSession.current = ending;
    try { await ending; }
    finally { if (endingSession.current === ending) endingSession.current = null; }
  };
  return <AuthContext.Provider value={{ user, accessToken, isInitializing, isAuthenticated: !!user,
    login, register, logout, refreshSession }}>{children}</AuthContext.Provider>;
}
