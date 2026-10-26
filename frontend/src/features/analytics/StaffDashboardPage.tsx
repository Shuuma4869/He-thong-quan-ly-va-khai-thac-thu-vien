import { useQuery } from '@tanstack/react-query';
import { BookOpen, Boxes, ClipboardList } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/auth-context';
import { getCatalogPage } from '../catalog/catalog-api';
import { listSessions } from '../inventory/inventory-api';

export function StaffDashboardPage() {
  const { user } = useAuth();
  const owner = user?.id;
  const books = useQuery({ queryKey: ['staff-dashboard', owner, 'books'],
    queryFn: ({ signal }) => getCatalogPage('books', 0, signal), enabled: !!owner, retry: false });
  const copies = useQuery({ queryKey: ['staff-dashboard', owner, 'copies'],
    queryFn: ({ signal }) => getCatalogPage('copies', 0, signal), enabled: !!owner, retry: false });
  const sessions = useQuery({ queryKey: ['staff-dashboard', owner, 'open-sessions'],
    queryFn: ({ signal }) => listSessions('', 'OPEN', 0, signal), enabled: !!owner, retry: false });
  return <section>
    <p className="eyebrow">Nhân viên thư viện</p>
    <h1 className="page-title">Bảng điều khiển</h1>
    <p className="mt-2 text-muted">Số liệu lấy trực tiếp từ danh mục và phiên kiểm kê hiện tại. Tải lại trang để xem thay đổi mới nhất.</p>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Metric title="Tác phẩm trong danh mục" href="/nhan-vien/danh-muc" icon={<BookOpen aria-hidden="true" />}
        value={books.data?.page.totalElements} pending={books.isPending} error={books.isError} retry={() => void books.refetch()} />
      <Metric title="Bản sách đã đăng ký" href="/nhan-vien/danh-muc" icon={<Boxes aria-hidden="true" />}
        value={copies.data?.page.totalElements} pending={copies.isPending} error={copies.isError} retry={() => void copies.refetch()} />
      <Metric title="Phiên kiểm kê đang mở" href="/nhan-vien/kiem-ke" icon={<ClipboardList aria-hidden="true" />}
        value={sessions.data?.page.totalElements} pending={sessions.isPending} error={sessions.isError} retry={() => void sessions.refetch()} />
    </div>
    <section className="editorial-card mt-6" aria-labelledby="staff-quick-actions">
      <h2 id="staff-quick-actions" className="section-title">Việc thường dùng</h2>
      <div className="flex flex-wrap gap-3 mt-4">
        <Link className="button-secondary" to="/nhan-vien/danh-muc">Quản lý danh mục</Link>
        <Link className="button-secondary" to="/nhan-vien/luu-thong">Mượn và trả sách</Link>
        <Link className="button-secondary" to="/nhan-vien/kiem-ke">Kiểm kê</Link>
        <Link className="button-secondary" to="/nhan-vien/bao-cao-luu-thong">Báo cáo lưu thông</Link>
      </div>
    </section>
  </section>;
}

function Metric({ title, href, icon, value, pending, error, retry }: {
  title: string; href: string; icon: ReactNode; value?: number; pending: boolean; error: boolean; retry: () => void;
}) {
  return <article className="metric-card">
    {icon}<span>{title}</span>
    {pending ? <strong role="status">Đang tải…</strong>
      : error ? <><strong>Không tải được</strong><button type="button" className="text-link" onClick={retry}>Thử lại</button></>
        : <strong>{value?.toLocaleString('vi-VN') ?? '—'}</strong>}
    <Link className="text-link text-sm" to={href}>Mở chức năng →</Link>
  </article>;
}
