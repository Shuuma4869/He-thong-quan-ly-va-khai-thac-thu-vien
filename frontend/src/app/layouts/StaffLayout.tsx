import { useCallback, useRef, useState } from 'react';
import { Menu } from 'lucide-react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/auth-context';
import { LibrarySidebar } from './LibrarySidebar';

export function StaffLayout() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const signOut = async () => { await auth.logout(); navigate('/dang-nhap', { replace: true }); };
  return (
    <div className="library-workspace staff-workspace">
      <LibrarySidebar mode="staff" open={menuOpen} onClose={closeMenu} trigger={trigger}/>
      <div className="library-workspace-body">
        <header className="library-topbar">
          <button ref={trigger} type="button" className="library-menu-button" aria-label="Mở menu nhân viên"
            aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Menu size={21}/></button>
          <span className="library-topbar-section">Nền tảng vận hành thư viện</span>
          <Link className="library-topbar-search" to="/sach">Xem danh mục</Link>
          <span className="library-topbar-user">{auth.user?.fullName}</span>
          <button className="library-topbar-action" type="button" onClick={() => void signOut()}>Đăng xuất</button>
        </header>
        <main className="library-main staff-main"><Outlet /></main>
      </div>
    </div>
  );
}
