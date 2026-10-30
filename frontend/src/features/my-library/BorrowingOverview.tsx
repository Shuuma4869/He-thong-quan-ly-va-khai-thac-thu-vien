import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getLoans, getMyHolds } from '../circulation/circulation-api';
import { formatTime } from '../circulation/circulation-labels';
import { LibraryError } from './LibraryError';

const holdLabels = { WAITING: 'Đang chờ phân bổ', READY: 'Sẵn sàng nhận', FULFILLED: 'Đã nhận sách', CANCELLED: 'Đã hủy', EXPIRED: 'Hết hạn nhận' };
export function BorrowingOverview({ owner }: { owner: string }) {
  const loans = useQuery({ queryKey: ['library-overview', owner, 'loans'],
    queryFn: ({ signal }) => getLoans({ page: 0, status: 'ACTIVE' }, false, signal), retry: false });
  const holds = useQuery({ queryKey: ['library-overview', owner, 'holds'], queryFn: ({ signal }) => getMyHolds(0, signal), retry: false });
  return <section className="borrowing-overview" aria-label="Việc cần theo dõi">
    <div className="editorial-card"><p className="eyebrow">Bản sách vật lý</p><h2 className="section-title">Sách đang mượn</h2>
      {loans.isPending ? <p role="status">Đang tải sách đang mượn…</p> : loans.isError
        ? <LibraryError error={loans.error} retry={() => void loans.refetch()}/>
        : !loans.data.items.length ? <p className="account-help">Bạn chưa có lượt mượn đang hoạt động.</p>
          : <><p>{loans.data.page.totalElements} lượt đang mượn, gồm cả quá hạn.</p>
            <ul className="attention-list">{loans.data.items.slice(0, 3).map(loan => <li key={loan.loanId}><strong>{loan.bookTitle}</strong>
              <span>{loan.branchName} · {loan.barcode}</span><span className={loan.overdue ? 'overdue-label' : ''}>{loan.overdue ? 'Đã quá hạn' : 'Hạn trả'} · {formatTime(loan.dueAt)}</span></li>)}</ul></>}
      <Link className="text-link" to="/muon-va-giu-cho">Xem hạn trả và điều kiện gia hạn →</Link>
    </div>
    <div className="editorial-card"><p className="eyebrow">Yêu cầu gần đây</p><h2 className="section-title">Giữ chỗ của bạn</h2>
      {holds.isPending ? <p role="status">Đang tải giữ chỗ…</p> : holds.isError
        ? <LibraryError error={holds.error} retry={() => void holds.refetch()}/>
        : !holds.data.items.length ? <p className="account-help">Chọn ấn bản và chi nhánh ở trang chi tiết sách để tạo yêu cầu giữ chỗ.</p>
          : <ul className="attention-list">{holds.data.items.slice(0, 3).map(({ hold, bookTitle, branchName }) => <li key={hold.id}>
            <strong>{bookTitle}</strong><span>{branchName} · {holdLabels[hold.status]}</span>
            {hold.status === 'READY' && hold.expiresAt ? <span className="pickup-label">Đến quầy nhận trước {formatTime(hold.expiresAt)}.</span>
              : hold.status === 'WAITING' ? <span>Chờ thông báo sách sẵn sàng trước khi đến thư viện.</span> : null}
          </li>)}</ul>}
      <Link className="text-link" to="/muon-va-giu-cho">Xem tất cả yêu cầu và thao tác →</Link>
    </div>
  </section>;
}
