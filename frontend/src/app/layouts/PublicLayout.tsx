import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/auth-context';
import { BrandLogo } from '../../shared/branding/BrandLogo';

export function PublicLayout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { setOpen(false); }, [location.pathname, location.hash]);
  useEffect(() => {
    if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
  }, [location.pathname, location.hash]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setOpen(false); menuButton.current?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  const signOut = async () => { await logout(); navigate('/', { replace: true }); };
  return <div className="landing-page">
    <header className="landing-header">
      <div className="landing-container landing-header-inner">
        <Link to="/" aria-label="LAMS, về trang chủ"><BrandLogo variant="compact" /></Link>
        <nav className="landing-nav" aria-label="Điều hướng chính">
          <NavLink to="/" end>Trang chủ</NavLink><NavLink to="/sach">Khám phá sách</NavLink>
          <Link to="/#the-loai">Thể loại</Link>
          {user && <Link to="/thu-vien-cua-toi">Thư viện của tôi</Link>}
        </nav>
        <div className="landing-actions">
          {user ? <><Link className="landing-user-name" to="/ho-so">{user.fullName} · {user.memberCode}</Link>
            <Link className="landing-sign-in" to="/cai-dat/giao-dien">Giao diện</Link>
            <button type="button" className="landing-sign-in" onClick={() => void signOut()}>Đăng xuất</button></>
            : <><Link className="landing-sign-in" to="/cai-dat/giao-dien">Giao diện</Link><Link className="landing-sign-in" to="/dang-nhap">Đăng nhập</Link>
              <Link className="button-primary" to="/dang-ky">Đăng ký <ArrowRight size={16}/></Link></>}
        </div>
        <button ref={menuButton} type="button" className="landing-menu-toggle" aria-label={open ? 'Đóng menu' : 'Mở menu'}
          aria-expanded={open} aria-controls="landing-mobile-menu" onClick={() => setOpen(value => !value)}>
          {open ? <X size={22}/> : <Menu size={22}/>}
        </button>
      </div>
      {open && <nav id="landing-mobile-menu" className="landing-mobile-menu" aria-label="Điều hướng di động">
        <NavLink to="/" end>Trang chủ</NavLink><NavLink to="/sach">Khám phá sách</NavLink>
        <Link to="/#the-loai">Thể loại</Link>
        <Link to="/cai-dat/giao-dien">Giao diện</Link>
        {user ? <><Link to="/thu-vien-cua-toi">Thư viện của tôi</Link><Link to="/ho-so">Hồ sơ của tôi</Link>
          <button type="button" onClick={() => void signOut()}>Đăng xuất</button></>
          : <><Link to="/dang-nhap">Đăng nhập</Link><Link to="/dang-ky">Đăng ký</Link></>}
      </nav>}
    </header>
    <main><Outlet /></main>
    <footer className="landing-footer">
      <div className="landing-container landing-footer-grid">
        <div><BrandLogo variant="compact"/><p>Tra cứu tác phẩm, tìm ấn bản và kết nối với thư viện của bạn.</p></div>
        <div><h2>Khám phá</h2><Link to="/sach">Danh mục sách</Link><Link to="/#the-loai">Thể loại</Link></div>
        <div><h2>Tài khoản</h2>{user ? <><Link to="/thu-vien-cua-toi">Thư viện của tôi</Link><Link to="/ho-so">Hồ sơ</Link></>
          : <><Link to="/dang-nhap">Đăng nhập</Link><Link to="/dang-ky">Đăng ký</Link></>}</div>
      </div>
      <div className="landing-container landing-footer-bottom"><span>© {new Date().getFullYear()} LAMS</span>
        <span>Ảnh không gian thư viện: Olga Lioncat / Pexels</span></div>
    </footer>
  </div>;
}
