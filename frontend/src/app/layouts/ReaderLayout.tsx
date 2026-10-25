import { useCallback, useRef, useState } from 'react';
import { LogIn, Menu, Search } from 'lucide-react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/auth-context';
import { BrandLogo } from '../../shared/branding/BrandLogo';
import { LibrarySidebar } from './LibrarySidebar';

export function ReaderLayout() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const signOut = async () => { await auth.logout(); navigate('/', { replace: true }); };
  return (
    <div className="library-workspace">
      <LibrarySidebar mode="reader" open={menuOpen} onClose={closeMenu} trigger={trigger}/>
      <div className="library-workspace-body">
        <header className="library-topbar">
          <button ref={trigger} type="button" className="library-menu-button" aria-label="Mở menu thư viện"
            aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={21}/></button>
          <Link className="library-topbar-brand" to="/"><BrandLogo variant="compact" /></Link>
          <Link className="library-topbar-search" to="/sach"><Search size={17}/> Tìm sách</Link>
          {auth.user ? <><span className="library-topbar-user">{auth.user.fullName}</span>
            {auth.user.roles.some(role => role === 'LIBRARIAN' || role === 'ADMIN') &&
              <Link className="library-topbar-staff" to="/nhan-vien/bang-dieu-khien">Khu nhân viên</Link>}
            <button className="library-topbar-action" type="button" onClick={() => void signOut()}>Đăng xuất</button></>
            : <Link className="library-topbar-action" to="/dang-nhap"><LogIn size={16}/> Đăng nhập</Link>}
        </header>
        <main className="library-main"><Outlet /></main>
      </div>
    </div>
  );
}
