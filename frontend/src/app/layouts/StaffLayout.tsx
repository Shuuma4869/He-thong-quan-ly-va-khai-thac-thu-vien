import { BarChart3, BookCopy, ClipboardList, Library, Menu } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';

const navigation = [
  { label: 'Bảng điều khiển', icon: BarChart3, to: '/nhan-vien/bang-dieu-khien' },
  { label: 'Quầy lưu thông', icon: BookCopy, to: '/nhan-vien/luu-thong' },
  { label: 'Kiểm kê', icon: ClipboardList, to: '/nhan-vien/kiem-ke' },
];

export function StaffLayout() {
  return (
    <div className="staff-shell">
      <aside className="staff-sidebar" aria-label="Điều hướng nhân viên">
        <div className="flex items-center gap-2 px-3 py-2 font-semibold"><Library size={20} /> LAMS Staff</div>
        <nav className="mt-8 grid gap-1">
          {navigation.map(({ label, icon: Icon, to }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `staff-nav ${isActive ? 'staff-nav-active' : ''}`}>
              <Icon size={18} /> {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="staff-topbar"><button className="icon-button" aria-label="Mở menu"><Menu size={20} /></button><span>Nền tảng vận hành thư viện</span></header>
        <main className="p-5 md:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
