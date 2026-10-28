import { useCallback, useRef, useState } from 'react';
import { Menu, SlidersHorizontal } from 'lucide-react';
import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/auth-context';
import { LibrarySidebar } from './LibrarySidebar';
import { SearchCommand } from '../../features/catalog/SearchCommand';
import { BackToTop } from './BackToTop';

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
          <span className="library-topbar-section"><span className="library-topbar-section-full">Nền tảng vận hành thư viện</span>
            <span className="library-topbar-section-short">LAMS</span></span>
          <SearchCommand/>
          <Link className="library-topbar-action library-appearance-shortcut" to="/cai-dat/giao-dien" aria-label="Cài đặt giao diện" title="Cài đặt giao diện"><SlidersHorizontal size={18}/></Link>
          <span className="library-topbar-user">{auth.user?.fullName}</span>
          <button className="library-topbar-action" type="button" onClick={() => void signOut()}>Đăng xuất</button>
        </header>
        <main className="library-main staff-main"><Outlet /></main><BackToTop/>
      </div>
    </div>
  );
}
