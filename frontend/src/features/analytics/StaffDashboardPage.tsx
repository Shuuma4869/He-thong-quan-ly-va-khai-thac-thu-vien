import { useQuery } from '@tanstack/react-query';
import { BookOpen, Boxes, ClipboardList, ArrowUpRight, CircleCheck, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/auth-context';
import { useAppearance } from '../appearance/appearance-context';
import { getCatalogPage } from '../catalog/catalog-api';
import { listSessions } from '../inventory/inventory-api';

export function StaffDashboardPage() {
  const { user } = useAuth();
  const { values } = useAppearance();
  const owner = user?.id;
  const books = useQuery({ queryKey: ['staff-dashboard', owner, 'books'],
    queryFn: ({ signal }) => getCatalogPage('books', 0, signal), enabled: !!owner, retry: false });
  const copies = useQuery({ queryKey: ['staff-dashboard', owner, 'copies'],
    queryFn: ({ signal }) => getCatalogPage('copies', 0, signal), enabled: !!owner, retry: false });
  const sessions = useQuery({ queryKey: ['staff-dashboard', owner, 'open-sessions'],
    queryFn: ({ signal }) => listSessions('', 'OPEN', 0, signal), enabled: !!owner, retry: false });
  return <section className="staff-dashboard">
    <header className="staff-dashboard-hero"><div><p className="eyebrow">Nhân viên thư viện</p>
      <h1 className="page-title">Bảng điều khiển</h1>
      <p>Số liệu lấy trực tiếp từ danh mục và phiên kiểm kê hiện tại. Tải lại trang để xem thay đổi mới nhất.</p></div>
      <BookOpen size={95} strokeWidth={1} aria-hidden="true"/></header>
    {values.widgets.includes('overview') && <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Metric title="Tác phẩm trong danh mục" href="/nhan-vien/danh-muc" icon={<BookOpen aria-hidden="true" />}
        value={books.data?.page.totalElements} pending={books.isPending} error={books.isError} retry={() => void books.refetch()} />
      <Metric title="Bản sách đã đăng ký" href="/nhan-vien/danh-muc" icon={<Boxes aria-hidden="true" />}
        value={copies.data?.page.totalElements} pending={copies.isPending} error={copies.isError} retry={() => void copies.refetch()} />
      <Metric title="Phiên kiểm kê đang mở" href="/nhan-vien/kiem-ke" icon={<ClipboardList aria-hidden="true" />}
        value={sessions.data?.page.totalElements} pending={sessions.isPending} error={sessions.isError} retry={() => void sessions.refetch()} />
    </div>}
    <div className="staff-dashboard-panels">
      {values.widgets.includes('inventory') && <section className="editorial-card" aria-labelledby="staff-open-sessions">
        <div className="staff-panel-heading"><div><p className="eyebrow">Theo dõi hôm nay</p><h2 id="staff-open-sessions" className="section-title">Phiên kiểm kê đang mở</h2></div>
          <Link className="text-link" to="/nhan-vien/kiem-ke">Xem tất cả <ArrowUpRight size={16}/></Link></div>
        {sessions.isPending ? <p role="status" className="mt-5">Đang tải phiên kiểm kê…</p>
          : sessions.isError ? <button type="button" className="button-secondary mt-5" onClick={() => void sessions.refetch()}>Tải lại phiên kiểm kê</button>
            : sessions.data.items.length ? <ul className="staff-session-list">{sessions.data.items.slice(0, 3).map(item =>
              <li key={item.id}><ClipboardList size={21}/><div><strong>Phiên {item.id.slice(0, 8)}</strong>
                <small>{item.scanCount.toLocaleString('vi-VN')}/{item.snapshotCount.toLocaleString('vi-VN')} lượt quét · Mở {new Date(item.openedAt).toLocaleDateString('vi-VN')}</small></div>
                <Link to={`/nhan-vien/kiem-ke/${item.id}`} aria-label={`Mở phiên ${item.id.slice(0, 8)}`}><ArrowUpRight size={19}/></Link></li>)}</ul>
              : <div className="staff-empty-session"><CircleCheck size={23}/><p>Hiện không có phiên kiểm kê nào đang mở.</p></div>}
      </section>}
      {values.widgets.includes('circulation') && <section className="editorial-card" aria-labelledby="staff-quick-actions">
        <div className="staff-panel-heading"><div><p className="eyebrow">Đi nhanh tới công việc</p><h2 id="staff-quick-actions" className="section-title">Việc thường dùng</h2></div></div>
        <div className="staff-quick-links">
          <Link to="/nhan-vien/danh-muc"><BookOpen size={19}/> Quản lý danh mục <ArrowUpRight size={16}/></Link>
          <Link to="/nhan-vien/luu-thong"><Search size={19}/> Mượn và trả sách <ArrowUpRight size={16}/></Link>
          <Link to="/nhan-vien/bao-cao-luu-thong"><Boxes size={19}/> Báo cáo lưu thông <ArrowUpRight size={16}/></Link>
        </div>
      </section>}
      {values.widgets.includes('acquisition') && <section className="editorial-card" aria-labelledby="staff-acquisition">
        <div className="staff-panel-heading"><div><p className="eyebrow">Phát triển bộ sưu tập</p>
          <h2 id="staff-acquisition" className="section-title">Bổ sung sách</h2></div></div>
        <p className="account-help mt-4">Xem tín hiệu từ dữ liệu danh mục và lập đề xuất có nhân viên xét duyệt.</p>
        <div className="staff-quick-links mt-4"><Link to="/nhan-vien/de-xuat-bo-sung"><BookOpen size={19}/>
          Mở đề xuất bổ sung <ArrowUpRight size={16}/></Link></div>
      </section>}
    </div>
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
