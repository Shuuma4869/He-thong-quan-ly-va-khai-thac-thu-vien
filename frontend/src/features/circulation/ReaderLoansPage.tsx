import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context';
import { Pagination } from '../catalog/CatalogStates';
import { cancelHold, getLoans, getMyHolds, renewLoan, type HoldView, type Loan } from './circulation-api';
import { CirculationError } from './CirculationStates';
import { formatTime, holdLabels, loanLabels } from './circulation-labels';
import { useCirculationCommand } from './use-circulation-command';
import { HoldEstimate } from './HoldEstimate';

export function ReaderLoansPage() {
  const { user } = useAuth();
  return user ? <ReaderLoans key={user.id} owner={user.id}/> : null;
}
function ReaderLoans({ owner }: { owner: string }) {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get('page') ?? 0), holdPage = Number(params.get('holdPage') ?? 0), status = params.get('status') ?? '';
  const valid = Number.isInteger(page) && page >= 0 && page <= 2147483647 && Number.isInteger(holdPage) && holdPage >= 0
    && holdPage <= 2147483647 && ['', 'ACTIVE', 'OVERDUE', 'RETURNED'].includes(status);
  const loans = useQuery({ queryKey: ['circulation', owner, 'loans', page, status],
    queryFn: ({ signal }) => getLoans({ page, status }, false, signal), enabled: valid, retry: false });
  const holds = useQuery({ queryKey: ['circulation', owner, 'holds', holdPage],
    queryFn: ({ signal }) => getMyHolds(holdPage, signal), enabled: valid, retry: false });
  const change = (key: string, value: string) => { const next = new URLSearchParams(params); next.set(key, value); if (key === 'status') next.set('page', '0'); setParams(next); };
  return <section className="shell py-8"><Link className="text-link" to="/thu-vien-cua-toi">← Thư viện của tôi</Link>
    <h1 className="page-title mt-5">Mượn và giữ chỗ</h1>
    <p className="text-muted my-3">Theo dõi hạn trả, gia hạn và các yêu cầu nhận sách tại thư viện.</p>
    {!valid ? <div role="alert"><p>Bộ lọc trong đường dẫn không hợp lệ.</p><button className="button-secondary" onClick={() => setParams({})}>Xóa bộ lọc</button></div> : <>
      <section className="my-8" aria-label="Lượt mượn của tôi"><h2 className="section-title">Lượt mượn của tôi</h2>
        <label className="field my-4">Trạng thái lượt mượn<select value={status} onChange={e => change('status', e.target.value)}>
          <option value="">Tất cả</option><option value="ACTIVE">Đang mượn (gồm quá hạn)</option><option value="OVERDUE">Quá hạn</option><option value="RETURNED">Đã trả</option>
        </select></label>
        {loans.isPending ? <p role="status">Đang tải lượt mượn…</p> : loans.isError ? <CirculationError error={loans.error} reload={() => void loans.refetch()}/>
          : <>{!loans.data.items.length && <p>Không có lượt mượn ở trang này.</p>}
            <div className="grid gap-4 my-4">{loans.data.items.map(loan => <LoanCard key={`${loan.loanId}:${loan.version}`} owner={owner} loan={loan} reload={() => void loans.refetch()}/>)}</div>
            <Pagination page={loans.data.page} onChange={p => change('page', String(p))}/>
            <p className="text-sm text-muted">Trạng thái tính lúc {formatTime(loans.data.asOf)}. Tải lại trước khi thực hiện nếu dữ liệu đã cũ.</p></>}
      </section>
      <section className="my-8" aria-label="Giữ chỗ của tôi"><h2 className="section-title">Giữ chỗ của tôi</h2>
        <p className="my-3 text-muted">Đặt giữ chỗ từ ấn bản trong <Link className="text-link" to="/sach">danh mục sách</Link>. Yêu cầu sẵn sàng nhận chỉ có hiệu lực trước hạn ghi bên dưới.</p>
        {holds.isPending ? <p role="status">Đang tải giữ chỗ…</p> : holds.isError ? <CirculationError error={holds.error} reload={() => void holds.refetch()}/>
          : <>{!holds.data.items.length && <p>Không có giữ chỗ ở trang này.</p>}
            <div className="grid gap-4 my-4">{holds.data.items.map(view => <HoldCard key={`${view.hold.id}:${view.hold.version}`} owner={owner} view={view} reload={() => void holds.refetch()}/>)}</div>
            <Pagination page={holds.data.page} onChange={p => change('holdPage', String(p))}/></>}
      </section>
    </>}
  </section>;
}
function LoanCard({ owner, loan, reload }: { owner: string; loan: Loan; reload: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const command = useCirculationCommand(owner, `${loan.loanId}:${loan.version}:renew`, id => renewLoan(loan.loanId, loan.version, id));
  return <article className="editorial-card"><h3 className="font-semibold">{loan.bookTitle}</h3>
    <p className="my-2">{loan.barcode} · {loan.branchName} · {loanLabels[loan.status]}</p>
    <p>Mượn lúc {formatTime(loan.borrowedAt)} · Hạn trả {formatTime(loan.dueAt)}</p>
    <p className="text-sm my-2">Đã gia hạn {loan.renewalCount} lần{loan.returnedAt ? ` · Trả lúc ${formatTime(loan.returnedAt)}` : ''}</p>
    {loan.status === 'ACTIVE' && !confirm && <button className="button-secondary" onClick={() => setConfirm(true)}>Gia hạn</button>}
    {confirm && <div role="group" aria-label="Xác nhận gia hạn"><p className="my-3">Hạn mới phụ thuộc chính sách thư viện và hàng chờ tại thời điểm xử lý.</p>
      <button className="button-primary" disabled={command.busy || !!command.result} onClick={() => void command.run()}>{command.busy ? 'Đang gia hạn…' : command.uncertain ? 'Thử lại yêu cầu gia hạn' : 'Xác nhận gia hạn'}</button>
      {!command.uncertain && <button className="button-secondary ml-3" disabled={command.busy} onClick={() => setConfirm(false)}>Đóng</button>}
    </div>}
    {command.result && <p role="status" className="my-3">Đã gia hạn đến {formatTime(command.result.dueAt)}.</p>}
    {command.error && <CirculationError error={command.error} reload={reload}/>}
  </article>;
}
function HoldCard({ owner, view, reload }: { owner: string; view: HoldView; reload: () => void }) {
  const { hold } = view; const [confirm, setConfirm] = useState(false);
  const command = useCirculationCommand(owner, `${hold.id}:${hold.version}:cancel`, id => cancelHold(hold.id, hold.version, id));
  return <article className="editorial-card"><h3 className="font-semibold"><Link className="text-link" to={`/sach/${hold.bookId}`}>{view.bookTitle}</Link></h3>
    <p className="my-2">{view.branchName} · {holdLabels[hold.status]}</p>
    <p>{hold.editionId ? 'Giữ đúng ấn bản đã chọn.' : 'Bạn đã chọn nhận bất kỳ ấn bản nào của đầu sách này.'}</p>
    {view.queuePosition && <p className="my-2">Vị trí trong hàng chờ đầu sách tại chi nhánh: {view.queuePosition}. Thứ tự nhận còn phụ thuộc ấn bản và điều kiện mượn.</p>}
    {hold.status === 'WAITING' && <HoldEstimate owner={owner} holdId={hold.id} version={hold.version}/>}
    {hold.status === 'READY' && hold.expiresAt && <p className="my-2">Hạn nhận: <strong>{formatTime(hold.expiresAt)}</strong>. Vui lòng tải lại khi đến quầy.</p>}
    {(hold.status === 'WAITING' || hold.status === 'READY') && !confirm && <button className="button-secondary mt-3" onClick={() => setConfirm(true)}>Hủy giữ chỗ</button>}
    {confirm && <div role="group" aria-label="Xác nhận hủy giữ chỗ"><p className="my-3">Hủy yêu cầu này? Nếu đặt lại, bạn sẽ vào cuối hàng chờ phù hợp.</p>
      <button className="button-primary" disabled={command.busy || !!command.result} onClick={() => void command.run()}>{command.busy ? 'Đang hủy…' : command.uncertain ? 'Thử lại yêu cầu hủy' : 'Xác nhận hủy giữ chỗ'}</button>
      {!command.uncertain && <button className="button-secondary ml-3" disabled={command.busy} onClick={() => setConfirm(false)}>Giữ yêu cầu</button>}
    </div>}
    {command.error && <CirculationError error={command.error} reload={reload}/>}
  </article>;
}
