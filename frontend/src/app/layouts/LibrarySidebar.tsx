import { useEffect, useRef } from 'react';
import { BarChart3, BookCopy, BookOpen, ChevronLeft, ChevronRight, ClipboardList, Heart, House, LibraryBig, Lightbulb, SlidersHorizontal,
  LogIn, Star, Bell, UserRound, Users, X, type LucideIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../features/auth/auth-context';
import { useAppearance } from '../../features/appearance/appearance-context';
import { BrandLogo } from '../../shared/branding/BrandLogo';
import { sidebarItemActive } from './sidebarItemActive';

type Item = { label: string; to: string; icon: LucideIcon };
type Group = { title: string; items: Item[] };
const readerPublic: Group[] = [{ title: 'Khám phá', items: [
  { label: 'Trang chủ', to: '/', icon: House }, { label: 'Khám phá sách', to: '/sach', icon: BookOpen },
  { label: 'Tác giả', to: '/tac-gia', icon: UserRound }, { label: 'Thể loại', to: '/the-loai', icon: LibraryBig },
] }];
const staffGroups: Group[] = [
  { title: 'Vận hành', items: [
    { label: 'Bảng điều khiển', to: '/nhan-vien/bang-dieu-khien', icon: BarChart3 },
    { label: 'Quầy lưu thông', to: '/nhan-vien/luu-thong', icon: ClipboardList },
    { label: 'Kiểm kê kệ sách', to: '/nhan-vien/kiem-ke', icon: BookCopy },
    { label: 'Báo cáo mượn', to: '/nhan-vien/bao-cao-luu-thong', icon: BarChart3 },
    { label: 'Đề xuất bổ sung', to: '/nhan-vien/de-xuat-bo-sung', icon: Lightbulb },
  ] },
  { title: 'Danh mục & tài khoản', items: [
    { label: 'Danh mục', to: '/nhan-vien/danh-muc', icon: BookCopy },
    { label: 'Thành viên', to: '/nhan-vien/thanh-vien', icon: Users },
    { label: 'Hồ sơ', to: '/ho-so', icon: UserRound },
  ] },
];

export function LibrarySidebar({ mode, open, onClose, trigger }: {
  mode: 'reader' | 'staff'; open: boolean; onClose: () => void; trigger: React.RefObject<HTMLButtonElement | null>;
}) {
  const { user } = useAuth();
  const appearance = useAppearance();
  const location = useLocation();
  const panel = useRef<HTMLElement>(null);
  const previousLocation = useRef(location.pathname + location.hash);
  const collapsed = appearance.values.sidebarState === 'collapsed';
  const toggle = () => void appearance.save({ ...appearance.values,
    sidebarState: collapsed ? 'expanded' : 'collapsed' }).catch(() => {});
  const baseGroups = mode === 'staff' ? (user?.roles.includes('ADMIN') ? staffGroups.map(group =>
    group.title === 'Danh mục & tài khoản' ? { ...group, items: [...group.items,
      { label: 'Quản trị tài khoản', to: '/nhan-vien/tai-khoan', icon: Users },
      { label: 'Báo cáo đánh giá', to: '/nhan-vien/bao-cao-danh-gia', icon: Star }] } : group) : staffGroups) : [
    ...readerPublic,
    ...(user ? [{ title: 'Thư viện của tôi', items: [
      { label: 'Thư viện của tôi', to: '/thu-vien-cua-toi', icon: LibraryBig },
      { label: 'Sách yêu thích', to: '/thu-vien-cua-toi#sach-yeu-thich', icon: Heart },
      { label: 'Đánh giá của tôi', to: '/thu-vien-cua-toi#danh-gia', icon: Star },
      { label: 'Mượn và giữ chỗ', to: '/muon-va-giu-cho', icon: BookCopy },
      { label: 'Thông báo', to: '/thong-bao', icon: Bell },
      { label: 'Hồ sơ', to: '/ho-so', icon: UserRound },
    ] }] : [{ title: 'Tài khoản', items: [
      { label: 'Đăng nhập', to: '/dang-nhap', icon: LogIn },
      { label: 'Đăng ký', to: '/dang-ky', icon: UserRound },
    ] }]),
  ];
  useEffect(() => {
    const current = location.pathname + location.hash;
    if (current !== previousLocation.current) { previousLocation.current = current; onClose(); }
  }, [location.pathname, location.hash, onClose]);
  useEffect(() => {
    if (!open) return;
    const prior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.querySelector<HTMLElement>('button, a')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { onClose(); trigger.current?.focus(); }
      if (event.key !== 'Tab' || !panel.current) return;
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>('a, button:not([disabled])'));
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prior?.focus(); };
  }, [open, onClose, trigger]);
  const groups = [...baseGroups, { title: 'Tùy chỉnh', items: [{ label: 'Giao diện', to: '/cai-dat/giao-dien', icon: SlidersHorizontal }] }];
  const contents = (compact: boolean) => <>
    <div className="library-sidebar-brand"><Link to="/" aria-label="LAMS — Trang chủ"><BrandLogo variant="compact"/></Link>
      <button type="button" className="library-sidebar-close" onClick={onClose} aria-label="Đóng menu"><X size={20}/></button></div>
    <nav aria-label={mode === 'staff' ? 'Điều hướng nhân viên' : 'Điều hướng thư viện'}>
      {groups.map(group => <div className="library-nav-group" key={group.title}>
        <p>{group.title}</p>{group.items.map(({ label, to, icon: Icon }) =>
          <Link key={to} to={to} title={compact ? label : undefined} aria-label={compact ? label : undefined}
            aria-current={sidebarItemActive(location.pathname, location.hash, to) ? 'page' : undefined}
            className={`library-nav-link ${sidebarItemActive(location.pathname, location.hash, to) ? 'library-nav-active' : ''}`}>
            <Icon size={18} aria-hidden="true"/><span>{label}</span></Link>)}
      </div>)}
    </nav>
    {compact && <button type="button" className="library-sidebar-toggle" aria-label={collapsed ? 'Mở rộng thanh điều hướng' : 'Thu gọn thanh điều hướng'}
      aria-expanded={!collapsed} onClick={toggle}>{collapsed ? <ChevronRight size={18}/> : <ChevronLeft size={18}/>}<span>{collapsed ? 'Mở rộng' : 'Thu gọn'}</span></button>}
  </>;
  return <>
    <aside className={`library-sidebar-desktop ${collapsed ? 'is-collapsed' : ''}`}>{contents(true)}</aside>
    {open && <div className="library-drawer-layer"><button className="library-drawer-backdrop" type="button"
      aria-label="Đóng menu thư viện" onClick={onClose}/>
      <aside ref={panel} className="library-sidebar-drawer" role="dialog" aria-modal="true" aria-label="Menu thư viện">{contents(false)}</aside>
    </div>}
  </>;
}
