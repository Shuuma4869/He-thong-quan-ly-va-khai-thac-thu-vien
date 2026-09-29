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
        <div className="shell flex h-16 items-center justify-between">
          <Link to="/"><BrandLogo variant="compact" /></Link>
          <nav aria-label="Điều hướng chính" className="flex items-center gap-5 text-sm">
            <Link className="nav-link" to="/">Trang chủ</Link>
            {auth.user ? <><span>{auth.user.fullName} · {auth.user.memberCode}</span>
              <button className="button-secondary" type="button" onClick={() => void signOut()}>Đăng xuất</button></>
              : <Link className="button-secondary" to="/dang-nhap"><LogIn size={16} /> Đăng nhập</Link>}
          </nav>
        </div>
      </header>
      <main><Outlet /></main>
    </div>
  );
}
