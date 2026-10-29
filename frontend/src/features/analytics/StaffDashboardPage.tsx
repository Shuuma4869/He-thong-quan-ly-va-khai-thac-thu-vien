import { useQuery } from '@tanstack/react-query';
import { BookOpen, Boxes, ClipboardList, ArrowUpRight, CircleCheck, Search, Clock3, RefreshCw, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth/auth-context';
import { useAppearance } from '../appearance/appearance-context';
import { getCatalogPage } from '../catalog/catalog-api';
import { listSessions } from '../inventory/inventory-api';
import { getLoans } from '../circulation/circulation-api';
import { eventLabels, getHoldReport, localDate } from '../circulation/hold-report-api';
import { formatTime } from '../circulation/circulation-labels';
import { listRecommendations } from '../acquisition/acquisition-api';
import { useState } from 'react';

export function StaffDashboardPage() {
  const { user } = useAuth();
  const { values } = useAppearance();
  const owner = user?.id;
  const [window] = useState(() => {
    const today = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }) + 'T00:00:00Z');
    const from = new Date(today); from.setUTCDate(from.getUTCDate() - 29);
    today.setUTCDate(today.getUTCDate() + 1);
    return { from: from.toISOString().slice(0, 10), to: today.toISOString().slice(0, 10), branchId: '', bookId: '' };
  });
  const books = useQuery({ queryKey: ['staff-dashboard', owner, 'books'],
    queryFn: ({ signal }) => getCatalogPage('books', 0, signal), enabled: !!owner, retry: false });
  const copies = useQuery({ queryKey: ['staff-dashboard', owner, 'copies'],
    queryFn: ({ signal }) => getCatalogPage('copies', 0, signal), enabled: !!owner, retry: false });
  const sessions = useQuery({ queryKey: ['staff-dashboard', owner, 'open-sessions'],
    queryFn: ({ signal }) => listSessions('', 'OPEN', 0, signal), enabled: !!owner, retry: false });
  const active = useQuery({ queryKey: ['staff-dashboard', owner, 'active-loans'],
    queryFn: ({ signal }) => getLoans({ page: 0, status: 'ACTIVE' }, true, signal), enabled: !!owner, retry: false });
  const overdue = useQuery({ queryKey: ['staff-dashboard', owner, 'overdue-loans'],
    queryFn: ({ signal }) => getLoans({ page: 0, status: 'OVERDUE' }, true, signal), enabled: !!owner, retry: false });
  const proposals = useQuery({ queryKey: ['staff-dashboard', owner, 'proposals'],
    queryFn: ({ signal }) => listRecommendations('DRAFT', 0, signal), enabled: !!owner && values.widgets.includes('acquisition'), retry: false });
  const activity = useQuery({ queryKey: ['staff-dashboard', owner, 'hold-activity', window],
    queryFn: ({ signal }) => getHoldReport(window, signal), enabled: !!owner && values.widgets.includes('circulation'), retry: false });
  const queries = [books, copies, sessions, active, overdue, ...(values.widgets.includes('acquisition') ? [proposals] : []), ...(values.widgets.includes('circulation') ? [activity] : [])];
  const refreshing = queries.some(query => query.isFetching);
  const eventTotals = Object.entries(eventLabels).map(([key, label]) => ({ key, label,
    value: activity.data?.items.filter(row => row.eventType === key).reduce((sum, row) => sum + row.eventCount, 0) ?? 0 }));
  const largest = Math.max(1, ...eventTotals.map(item => item.value));
  return <section className="staff-dashboard">
    <header className="staff-dashboard-hero"><div><p className="eyebrow">{user?.roles.includes('ADMIN') ? 'Quản trị & vận hành' : 'Nhân viên thư viện'}</p>
      <h1 className="page-title">Bảng điều khiển</h1>
      <p>Nắm công việc cần xử lý, theo dõi lưu thông và mở nhanh từng nghiệp vụ.</p>
      <button className="button-secondary mt-4" disabled={refreshing} onClick={() => void Promise.all(queries.map(query => query.refetch()))}><RefreshCw size={16}/>{refreshing ? 'Đang cập nhật…' : 'Cập nhật số liệu'}</button></div>
      <BookOpen size={95} strokeWidth={1} aria-hidden="true"/></header>
    <p className="dashboard-data-note">Mỗi nguồn được đọc độc lập; các thẻ không phải một snapshot toàn hệ thống. {active.data && `Lưu thông cập nhật ${formatTime(active.data.asOf)}.`}</p>
    {values.widgets.includes('overview') && <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Metric title="Tác phẩm trong danh mục" href="/nhan-vien/danh-muc" icon={<BookOpen aria-hidden="true" />}
        value={books.data?.page.totalElements} pending={books.isPending} error={books.isError} retry={() => void books.refetch()} />
      <Metric title="Bản sách đã đăng ký" href="/nhan-vien/danh-muc" icon={<Boxes aria-hidden="true" />}
        value={copies.data?.page.totalElements} pending={copies.isPending} error={copies.isError} retry={() => void copies.refetch()} />
      <Metric title="Phiên kiểm kê đang mở" href="/nhan-vien/kiem-ke" icon={<ClipboardList aria-hidden="true" />}
        value={sessions.data?.page.totalElements} pending={sessions.isPending} error={sessions.isError} retry={() => void sessions.refetch()} />
      <Metric title="Đang mượn (gồm quá hạn)" href="/nhan-vien/luu-thong" icon={<BookOpen aria-hidden="true"/>}
        value={active.data?.page.totalElements} pending={active.isPending} error={active.isError} retry={() => void active.refetch()}/>
      <Metric title="Lượt mượn quá hạn" href="/nhan-vien/luu-thong" icon={<Clock3 aria-hidden="true"/>}
        value={overdue.data?.page.totalElements} pending={overdue.isPending} error={overdue.isError} retry={() => void overdue.refetch()}/>
      {values.widgets.includes('acquisition') && <Metric title="Đề xuất chưa xét duyệt" href="/nhan-vien/de-xuat-bo-sung" icon={<Boxes aria-hidden="true"/>}
        value={proposals.data?.page.totalElements} pending={proposals.isPending} error={proposals.isError} retry={() => void proposals.refetch()}/>}
    </div>}
    <div className="staff-dashboard-panels">
      {values.widgets.includes('circulation') && <section className="editorial-card dashboard-activity" aria-labelledby="hold-activity-title">
        <div className="staff-panel-heading"><div><p className="eyebrow">30 ngày gần đây</p><h2 id="hold-activity-title" className="section-title">Hành trình giữ chỗ</h2></div>
          <Link className="text-link" to="/nhan-vien/bao-cao-giu-cho">Xem báo cáo <ArrowUpRight size={16}/></Link></div>
        <p className="account-help">{localDate(window.from)} đến trước {localDate(window.to)} · giờ Việt Nam. Số sự kiện phát sinh, không phải số yêu cầu đang chờ.</p>
        {activity.isPending ? <p role="status">Đang đọc lịch sử giữ chỗ…</p> : activity.isError
          ? <div className="empty-message"><p>Chưa đọc được lịch sử giữ chỗ. Có thể thu hẹp kỳ tại trang báo cáo.</p><button className="text-link" onClick={() => void activity.refetch()}>Thử lại</button></div>
          : <><ul className="event-bars">{eventTotals.map(item => <li key={item.key}><div><span>{item.label}</span><strong>{item.value.toLocaleString('vi-VN')}</strong></div>
            <span className="event-bar-track" aria-hidden="true"><span style={{ width: `${item.value / largest * 100}%` }}/></span></li>)}</ul>
            {!activity.data.totalEvents && <p className="account-help">Chưa có sự kiện trong kỳ này.</p>}</>}
      </section>}
      {values.widgets.includes('circulation') && <section className="editorial-card dashboard-attention" aria-labelledby="attention-title">
        <p className="eyebrow">Cần theo dõi</p><h2 className="section-title" id="attention-title">Sách quá hạn</h2>
        {overdue.isPending ? <p role="status">Đang tải lượt quá hạn…</p> : overdue.isError
          ? <button className="button-secondary" onClick={() => void overdue.refetch()}>Tải lại lượt quá hạn</button>
          : !overdue.data.items.length ? <div className="staff-empty-session"><CircleCheck/><p>Không có lượt mượn quá hạn tại thời điểm đọc.</p></div>
            : <ul className="attention-list">{overdue.data.items.slice(0, 3).map(loan => <li key={loan.loanId}><strong>{loan.bookTitle}</strong><span>{loan.branchName} · {loan.barcode}</span>
              <span>Hạn trả {formatTime(loan.dueAt)}</span></li>)}</ul>}
        <Link className="text-link" to="/nhan-vien/luu-thong">Mở quầy lưu thông →</Link>
      </section>}
      {values.widgets.includes('inventory') && <section className="editorial-card" aria-labelledby="staff-open-sessions">
        <div className="staff-panel-heading"><div><p className="eyebrow">Theo dõi hôm nay</p><h2 id="staff-open-sessions" className="section-title">Phiên kiểm kê đang mở</h2></div>
          <Link className="text-link" to="/nhan-vien/kiem-ke">Xem tất cả <ArrowUpRight size={16}/></Link></div>
        {sessions.isPending ? <p role="status" className="mt-5">Đang tải phiên kiểm kê…</p>
          : sessions.isError ? <button type="button" className="button-secondary mt-5" onClick={() => void sessions.refetch()}>Tải lại phiên kiểm kê</button>
            : sessions.data.items.length ? <ul className="staff-session-list">{sessions.data.items.slice(0, 3).map(item =>
              <li key={item.id}><ClipboardList size={21}/><div><strong>Phiên {item.id.slice(0, 8)}</strong>
                <small>{item.scanCount.toLocaleString('vi-VN')} lượt quét · {item.snapshotCount.toLocaleString('vi-VN')} bản trong snapshot · Mở {new Date(item.openedAt).toLocaleDateString('vi-VN')}</small></div>
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
      {user?.roles.includes('ADMIN') && <section className="editorial-card dashboard-admin" aria-labelledby="admin-work-title"><ShieldCheck size={26}/>
        <p className="eyebrow">Dành cho quản trị viên</p><h2 className="section-title" id="admin-work-title">Quyền truy cập & nội dung</h2>
        <p className="account-help">Kiểm tra lý do thay đổi quyền và lịch sử tài khoản trước khi xác nhận. Báo cáo đánh giá được xử lý riêng với nội dung thư mục.</p>
        <div className="staff-quick-links"><Link to="/nhan-vien/tai-khoan">Tài khoản, phân quyền & nhật ký <ArrowUpRight size={16}/></Link>
          <Link to="/nhan-vien/bao-cao-danh-gia">Xét báo cáo đánh giá <ArrowUpRight size={16}/></Link></div>
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
