import { LogIn } from 'lucide-react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/auth-context';
import { BrandLogo } from '../../shared/branding/BrandLogo';

export function ReaderLayout() {
  const auth = useAuth();
  const navigate = useNavigate();
  const signOut = async () => { await auth.logout(); navigate('/', { replace: true }); };
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line bg-surface/95">
        <div className="shell flex min-h-16 flex-wrap items-center justify-between gap-3 py-3">
          <Link to="/"><BrandLogo variant="compact" /></Link>
          <nav aria-label="Điều hướng chính" className="flex min-w-0 flex-wrap items-center gap-3 text-sm">
            <Link className="nav-link" to="/">Trang chủ</Link>
            <Link className="nav-link" to="/sach">Danh mục sách</Link>
            {auth.user ? <><span className="break-all">{auth.user.fullName} · {auth.user.memberCode}</span>
              <Link className="nav-link" to="/ho-so">Hồ sơ của tôi</Link>
              <Link className="nav-link" to="/thu-vien-cua-toi">Thư viện của tôi</Link>
              {auth.user.roles.some(role => role === 'LIBRARIAN' || role === 'ADMIN')
                && <Link className="nav-link" to="/nhan-vien/thanh-vien">Thành viên</Link>}
              <button className="button-secondary" type="button" onClick={() => void signOut()}>Đăng xuất</button></>
              : <Link className="button-secondary" to="/dang-nhap"><LogIn size={16} /> Đăng nhập</Link>}
          </nav>
        </div>
      </header>
      <main><Outlet /></main>
    </div>
  );
}
