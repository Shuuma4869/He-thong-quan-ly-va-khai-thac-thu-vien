import { BookOpen, LogIn } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';

export function ReaderLayout() {
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line bg-surface/95">
        <div className="shell flex h-16 items-center justify-between">
          <Link className="flex items-center gap-2 font-semibold" to="/">
            <span className="brand-mark" aria-hidden="true"><BookOpen size={19} /></span>
            <span>LAMS</span>
          </Link>
          <nav aria-label="Điều hướng chính" className="flex items-center gap-5 text-sm">
            <Link className="nav-link" to="/">Trang chủ</Link>
            <Link className="button-secondary" to="/dang-nhap"><LogIn size={16} /> Đăng nhập</Link>
          </nav>
        </div>
      </header>
      <main><Outlet /></main>
    </div>
  );
}
