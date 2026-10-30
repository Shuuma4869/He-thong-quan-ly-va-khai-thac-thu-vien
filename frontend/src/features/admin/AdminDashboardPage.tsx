import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, BookOpen, Boxes, ClipboardList, Flag, RefreshCw, ShieldCheck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/auth-context';
import { getCatalogPage } from '../catalog/catalog-api';
import { getLoans } from '../circulation/circulation-api';
import { listSessions } from '../inventory/inventory-api';
import { listStaffWorkItems } from '../notifications/staff-work-inbox-api';
import { listAccounts } from './accounts-api';
import { listReviewReports } from '../reviews/moderation-api';

export function AdminDashboardPage() {
  const { user } = useAuth();
  const owner = user?.id;
  const books = useQuery({ queryKey: ['admin-dashboard', owner, 'books'],
    queryFn: ({ signal }) => getCatalogPage('books', 0, signal), enabled: !!owner, retry: false });
  const loans = useQuery({ queryKey: ['admin-dashboard', owner, 'active-loans'],
    queryFn: ({ signal }) => getLoans({ page: 0, status: 'ACTIVE' }, true, signal), enabled: !!owner, retry: false });
  const holds = useQuery({ queryKey: ['admin-dashboard', owner, 'open-holds'],
    queryFn: ({ signal }) => listStaffWorkItems({ page: 0 }, signal), enabled: !!owner, retry: false });
  const sessions = useQuery({ queryKey: ['admin-dashboard', owner, 'open-inventory'],
    queryFn: ({ signal }) => listSessions('', 'OPEN', 0, signal), enabled: !!owner, retry: false });
  const lockedAccounts = useQuery({ queryKey: ['admin-dashboard', owner, 'locked-accounts'],
    queryFn: ({ signal }) => listAccounts('', 'LOCKED', 0, signal), enabled: !!owner, retry: false });
  const reports = useQuery({ queryKey: ['admin-dashboard', owner, 'open-review-reports'],
    queryFn: ({ signal }) => listReviewReports('OPEN', 0, signal), enabled: !!owner, retry: false });
  const queries = [books, loans, holds, sessions, lockedAccounts, reports];
  const refreshing = queries.some(query => query.isFetching);
  return <section className="admin-dashboard" aria-labelledby="admin-dashboard-heading">
    <header className="admin-dashboard-hero">
      <div>
        <p className="eyebrow">Trung tâm quản trị</p>
        <h1 id="admin-dashboard-heading" className="page-title">Quản trị hệ thống</h1>
        <p>Theo dõi tài khoản, kiểm duyệt và hoạt động thư viện từ các nguồn dữ liệu trực tiếp.</p>
        <button className="button-secondary mt-4" type="button" disabled={refreshing}
          onClick={() => void Promise.all(queries.map(query => query.refetch()))}>
          <RefreshCw size={16}/>{refreshing ? 'Đang cập nhật…' : 'Cập nhật số liệu'}
        </button>
      </div>
      <ShieldCheck size={82} strokeWidth={1} aria-hidden="true"/>
    </header>
    <p className="dashboard-data-note">Mỗi chỉ số được tải độc lập; lỗi ở một nguồn không làm sai các chỉ số còn lại.
      {loans.data && ` Lượt mượn cập nhật ${new Date(loans.data.asOf).toLocaleString('vi-VN')}.`}</p>
    <div className="admin-dashboard-metrics">
      <Metric title="Tác phẩm trong danh mục" icon={<BookOpen aria-hidden="true"/>}
        value={books.data?.page.totalElements} query={books} href="/nhan-vien/danh-muc"/>
      <Metric title="Lượt mượn đang mở" icon={<Boxes aria-hidden="true"/>}
        value={loans.data?.page.totalElements} query={loans} href="/nhan-vien/luu-thong"/>
      <Metric title="Giữ chỗ cần xử lý" icon={<ClipboardList aria-hidden="true"/>}
        value={holds.data?.totalElements} query={holds} href="/nhan-vien/hop-thu"/>
      <Metric title="Phiên kiểm kê đang mở" icon={<Boxes aria-hidden="true"/>}
        value={sessions.data?.page.totalElements} query={sessions} href="/nhan-vien/kiem-ke"/>
      <Metric title="Tài khoản đang khóa" icon={<Users aria-hidden="true"/>}
        value={lockedAccounts.data?.totalElements} query={lockedAccounts} href="/nhan-vien/tai-khoan"/>
      <Metric title="Báo cáo đánh giá chờ xử lý" icon={<Flag aria-hidden="true"/>}
        value={reports.data?.totalElements} query={reports} href="/nhan-vien/bao-cao-danh-gia"/>
    </div>
    <div className="admin-dashboard-panels">
      <section className="editorial-card" aria-labelledby="admin-governance-heading">
        <p className="eyebrow">Quản trị & tuân thủ</p>
        <h2 className="section-title" id="admin-governance-heading">Quyết định có thể kiểm tra</h2>
        <p className="account-help">Mọi thay đổi trạng thái và vai trò đều yêu cầu lý do, kiểm tra phiên bản và được ghi vào dòng thời gian kiểm toán của tài khoản.</p>
        <div className="admin-dashboard-actions">
          <Link to="/nhan-vien/tai-khoan">Tài khoản, vai trò & nhật ký <ArrowUpRight size={17}/></Link>
          <Link to="/nhan-vien/bao-cao-danh-gia">Kiểm duyệt báo cáo đánh giá <ArrowUpRight size={17}/></Link>
        </div>
      </section>
      <section className="editorial-card" aria-labelledby="admin-operations-heading">
        <p className="eyebrow">Vận hành thư viện</p>
        <h2 className="section-title" id="admin-operations-heading">Mở không gian làm việc</h2>
        <div className="admin-dashboard-actions">
          <Link to="/nhan-vien/hop-thu">Hộp thư công việc <ArrowUpRight size={17}/></Link>
          <Link to="/nhan-vien/giu-cho">Quản lý giữ chỗ <ArrowUpRight size={17}/></Link>
          <Link to="/nhan-vien/bao-cao-luu-thong">Báo cáo lưu thông <ArrowUpRight size={17}/></Link>
        </div>
      </section>
    </div>
  </section>;
}

function Metric({ title, icon, value, query, href }: {
  title: string; icon: ReactNode; value?: number;
  query: { isPending: boolean; isError: boolean; refetch: () => Promise<unknown> }; href: string;
}) {
  return <article className="metric-card admin-metric-card">
    {icon}<span>{title}</span>
    {query.isPending ? <strong role="status">Đang tải…</strong>
      : query.isError ? <><strong>Không tải được</strong>
        <button type="button" className="text-link" onClick={() => void query.refetch()}>Thử lại</button></>
        : <strong>{value?.toLocaleString('vi-VN') ?? '—'}</strong>}
    <Link className="text-link text-sm" to={href}>Mở chức năng →</Link>
  </article>;
}
