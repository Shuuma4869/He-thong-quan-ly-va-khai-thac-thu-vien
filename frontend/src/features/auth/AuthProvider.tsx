import { useQueryClient } from '@tanstack/react-query';
import { type PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react';
import { configureCoreAuth, coreApi } from '../../shared/api/client';
import { AuthContext, type CurrentUser, type Session } from './auth-context';
let restoration: Promise<Session> | null = null;
const logoutMarker = 'lams.logout-pending';
function hasPendingLogout() {
  try { return sessionStorage.getItem(logoutMarker) === '1'; } catch { return false; }
}
function rememberPendingLogout(pending: boolean) {
  try { if (pending) sessionStorage.setItem(logoutMarker, '1'); else sessionStorage.removeItem(logoutMarker); } catch { /* Storage may be unavailable in a restricted browser. */ }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isInitializing, setInitializing] = useState(true);
  const [logoutFailed, setLogoutFailed] = useState(hasPendingLogout);
  const [isLoggingOut, setLoggingOut] = useState(false);
  const tokenRef = useRef<string | null>(null);
  const generation = useRef(0);
  const endingSession = useRef<Promise<void> | null>(null);
  const pendingLogout = useRef(hasPendingLogout());
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
    if (endingSession.current || pendingLogout.current || hasPendingLogout()) return false;
    const startedAt = generation.current;
    restoration ??= coreApi.post<Session>('/auth/refresh', undefined, false).finally(() => { restoration = null; });
    try {
      const session = await restoration;
      if (generation.current !== startedAt) return false;
      apply(session); return true;
    } catch {
      if (generation.current === startedAt) {
        if (tokenRef.current) clear();
        else apply(null);
      }
      return false;
    }
  }, [apply, clear]);

  useEffect(() => {
    const sessionGeneration = generation;
    configureCoreAuth({ token: () => tokenRef.current, refresh: refreshSession, clear, generation: () => generation.current });
    let live = true;
    void refreshSession().finally(() => { if (live) setInitializing(false); });
    return () => { live = false; sessionGeneration.current++; configureCoreAuth(null); };
  }, [refreshSession, clear]);

  const login = async (identifier: string, password: string, remember: boolean) => {
    await endingSession.current?.catch(() => {});
    const session = await coreApi.post<Session>('/auth/login', { identifier, password, remember }, false);
    generation.current++;
    queryClient.clear();
    pendingLogout.current = false;
    rememberPendingLogout(false); setLogoutFailed(false);
    apply(session); return session.user;
  };
  const register = async (fullName: string, email: string, password: string) => {
    await endingSession.current?.catch(() => {});
    const session = await coreApi.post<Session>('/auth/register', { fullName, email, password }, false);
    generation.current++;
    queryClient.clear();
    pendingLogout.current = false;
    rememberPendingLogout(false); setLogoutFailed(false);
    apply(session); return session.user;
  };
  const logout = async () => {
    if (endingSession.current) return endingSession.current;
    const inFlight = restoration;
    pendingLogout.current = true;
    rememberPendingLogout(true);
    setLoggingOut(true);
    clear();
    const ending = (async () => {
      // Let a pending rotation set its cookie before revoking that cookie's family.
      await inFlight?.catch(() => {});
      await coreApi.post<void>('/auth/logout', undefined, false);
      pendingLogout.current = false;
      rememberPendingLogout(false);
      setLogoutFailed(false);
    })();
    endingSession.current = ending;
    try { await ending; }
    catch (error) { setLogoutFailed(true); throw error; }
    finally { if (endingSession.current === ending) endingSession.current = null; setLoggingOut(false); }
  };
  return <AuthContext.Provider value={{ user, accessToken, isInitializing, isAuthenticated: !!user,
    login, register, logout, refreshSession }}>
    {logoutFailed && <div role="alert" className="session-recovery-notice">
      <p>Đã thoát tài khoản trên ứng dụng này, nhưng chưa xác nhận thu hồi phiên trên máy chủ. Hãy kết nối lại và thử đóng phiên trước khi dùng chung thiết bị.</p>
      <button type="button" className="button-secondary" disabled={isLoggingOut}
        onClick={() => void logout().catch(() => {})}>{isLoggingOut ? 'Đang đóng phiên…' : 'Thử đóng phiên lại'}</button>
    </div>}
    {children}
  </AuthContext.Provider>;
}
