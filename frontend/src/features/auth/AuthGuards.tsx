import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { type Role, useAuth } from './auth-context';
import { afterAuthentication, authLink } from './auth-navigation';

export function GuestRoute() {
  const { user, isInitializing } = useAuth();
  const location = useLocation();
  if (isInitializing) return <div role="status" className="p-8">Đang khôi phục phiên đăng nhập…</div>;
  return user ? <Navigate to={afterAuthentication(user, location.search)} replace /> : <Outlet />;
}

export function ProtectedRoute() {
  const { user, isInitializing } = useAuth();
  const location = useLocation();
  if (isInitializing) return <div role="status" className="p-8">Đang khôi phục phiên đăng nhập…</div>;
  return user ? <Outlet /> : <Navigate to={authLink('/dang-nhap', location.pathname + location.search + location.hash)} replace />;
}

export function RoleGuard({ allowed }: { allowed: Role[] }) {
  const { user } = useAuth();
  return user?.roles.some(role => allowed.includes(role)) ? <Outlet />
    : <main className="shell py-16"><h1 className="text-3xl font-semibold">403 · Không có quyền truy cập</h1>
      <p className="mt-3 text-muted">Tài khoản của bạn không có quyền mở trang này.</p>
      <div className="mt-6 flex flex-wrap gap-3"><Link className="button-primary" to="/sach">Về danh mục sách</Link>
        <Link className="button-secondary" to="/">Về trang chủ</Link></div></main>;
}
