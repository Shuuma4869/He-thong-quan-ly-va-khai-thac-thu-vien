import { createContext, useContext } from 'react';

export type Role = 'READER' | 'LIBRARIAN' | 'ADMIN';
export type CurrentUser = { id: string; memberCode: string; email: string; fullName: string; roles: Role[] };
export type Session = { accessToken: string; accessTokenExpiresAt: string; user: CurrentUser };
export type AuthState = {
  user: CurrentUser | null; accessToken: string | null; isInitializing: boolean; isAuthenticated: boolean;
  login: (identifier: string, password: string, remember: boolean) => Promise<CurrentUser>;
  register: (fullName: string, email: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>; refreshSession: () => Promise<boolean>;
};

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider chưa được khởi tạo.');
  return context;
}

export function destinationFor(user: CurrentUser) {
  return user.roles.some(role => role === 'LIBRARIAN' || role === 'ADMIN')
    ? '/nhan-vien/bang-dieu-khien' : '/';
}
