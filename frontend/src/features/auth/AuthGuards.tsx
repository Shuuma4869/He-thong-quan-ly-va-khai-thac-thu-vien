import { Navigate, Outlet } from 'react-router-dom';
import { destinationFor, type Role, useAuth } from './auth-context';

export function GuestRoute() {
  const { user, isInitializing } = useAuth();
  if (isInitializing) return <div role="status" className="p-8">Đang khôi phục phiên đăng nhập…</div>;
  return user ? <Navigate to={destinationFor(user)} replace /> : <Outlet />;
}

export function ProtectedRoute() {
  const { user, isInitializing } = useAuth();
  if (isInitializing) return <div role="status" className="p-8">Đang khôi phục phiên đăng nhập…</div>;
  return user ? <Outlet /> : <Navigate to="/dang-nhap" replace />;
}

export function RoleGuard({ allowed }: { allowed: Role[] }) {
  const { user } = useAuth();
  return user?.roles.some(role => allowed.includes(role)) ? <Outlet />
    : <main className="shell py-16"><h1 className="text-3xl font-semibold">403 · Không có quyền truy cập</h1>
      <p className="mt-3 text-muted">Tài khoản của bạn không có quyền mở trang này.</p></main>;
}
