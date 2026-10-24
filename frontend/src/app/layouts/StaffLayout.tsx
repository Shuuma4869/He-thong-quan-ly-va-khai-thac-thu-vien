import { BarChart3, BookCopy, ClipboardList, Users, UserRound } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../features/auth/auth-context';
import { BrandLogo } from '../../shared/branding/BrandLogo';

const navigation = [
  { label: 'Bảng điều khiển', icon: BarChart3, to: '/nhan-vien/bang-dieu-khien' },
  { label: 'Thành viên', icon: Users, to: '/nhan-vien/thanh-vien' },
  { label: 'Danh mục', icon: BookCopy, to: '/nhan-vien/danh-muc' },
  { label: 'Hồ sơ của tôi', icon: UserRound, to: '/ho-so' },
  { label: 'Quầy lưu thông', icon: BookCopy, to: '/nhan-vien/luu-thong' },
  { label: 'Báo cáo mượn', icon: BarChart3, to: '/nhan-vien/bao-cao-luu-thong' },
  { label: 'Kiểm kê', icon: ClipboardList, to: '/nhan-vien/kiem-ke' },
];

export function StaffLayout() {
  const auth = useAuth();
  const navigate = useNavigate();
  const signOut = async () => { await auth.logout(); navigate('/dang-nhap', { replace: true }); };
  return (
    <div className="staff-shell">
      <aside className="staff-sidebar" aria-label="Điều hướng nhân viên">
        <div className="px-3 py-2"><BrandLogo variant="compact" /></div>
        <nav className="mt-8 grid gap-1">
          {navigation.map(({ label, icon: Icon, to }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `staff-nav ${isActive ? 'staff-nav-active' : ''}`}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="staff-topbar"><span>Nền tảng vận hành thư viện</span><button className="ml-auto text-link" type="button" onClick={() => void signOut()}>Đăng xuất</button></header>
        <nav className="staff-mobile-nav" aria-label="Điều hướng nhân viên trên điện thoại">
          {navigation.map(({ label, to }) => <NavLink key={to} to={to}
            className={({ isActive }) => `staff-nav ${isActive ? 'staff-nav-active' : ''}`}>{label}</NavLink>)}
        </nav>
        <main className="p-5 md:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
