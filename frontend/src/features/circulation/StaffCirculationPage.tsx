import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/auth-context';
import { getCatalogItem, recordLabel } from '../catalog/catalog-api';
import { Pagination } from '../catalog/CatalogStates';
import { ReferencePicker } from '../catalog/ReferencePicker';
import { MemberPicker, type SelectedMember } from './MemberPicker';
import { borrowCopy, findCopy, getLoans, renewLoan, returnLoan, type Copy, type Loan } from './circulation-api';
import { CirculationError } from './CirculationStates';
import { copyLabels, formatTime, loanLabels } from './circulation-labels';
import { useCirculationCommand } from './use-circulation-command';

export function StaffCirculationPage() {
  const { user } = useAuth(); return user ? <Counter key={user.id} owner={user.id}/> : null;
}
function Counter({ owner }: { owner: string }) {
  const [member, setMember] = useState<SelectedMember | null>(null);
  const [text, setText] = useState(''); const [barcode, setBarcode] = useState(''); const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState(0); const [status, setStatus] = useState('ACTIVE'); const [branch, setBranch] = useState('');
  const [copyFilter, setCopyFilter] = useState<{ id: string; barcode: string } | null>(null);
  const [confirmation, setConfirmation] = useState<{ copy: Copy; member: SelectedMember } | null>(null);
  const copy = useQuery({ queryKey: ['circulation', owner, 'barcode', barcode, attempt],
    queryFn: ({ signal }) => findCopy(barcode, signal), enabled: !!barcode, retry: false });
  const loans = useQuery({ queryKey: ['circulation', owner, 'staff-loans', member?.userId, branch, copyFilter?.id, status, page],
    queryFn: ({ signal }) => getLoans({ readerId: member?.userId, branchId: branch, copyId: copyFilter?.id, status, page }, true, signal), retry: false });
  return <section><h1 className="page-title">Quầy lưu thông</h1>
    <p className="text-muted my-3">Đối chiếu thẻ bạn đọc và mã vạch trước khi xác nhận giao dịch. Nhận/trả tại chi nhánh của bản sách và lượt mượn.</p>
    <Link className="text-link" to="/nhan-vien/bao-cao-luu-thong">Xem báo cáo mượn theo chi nhánh</Link>
    <MemberPicker owner={owner} selected={member} onChange={value => { setMember(value); setPage(0); }} disabled={!!confirmation}/>
    <section className="editorial-card my-6" aria-label="Cho mượn bản sách"><h2 className="section-title">Cho mượn bản sách</h2>
      <form className="flex flex-wrap items-end gap-3 my-4" onSubmit={e => { e.preventDefault(); if (text.trim()) { setBarcode(text.trim()); setAttempt(n => n + 1); } }}>
        <label className="field grow">Mã vạch bản sách<input required maxLength={100} value={text} disabled={!!confirmation} onChange={e => setText(e.target.value)}/></label>
        <button className="button-secondary" disabled={!text.trim() || !!confirmation}>Tra bản sách</button>
      </form>
      {!!barcode && (copy.isPending ? <p role="status">Đang tra bản sách…</p> : copy.isError ? <CirculationError error={copy.error} reload={() => void copy.refetch()}/>
        : <div><p className="font-semibold">{copy.data.bookTitle} · {copy.data.barcode}</p>
          <p className="my-2">ISBN: {copy.data.isbn13 ?? 'Không có'} · Kệ {copy.data.shelfCode} · {copyLabels[copy.data.status] ?? copy.data.status}</p>
          <BranchName owner={owner} id={copy.data.branchId}/>
          <button className="button-secondary mt-3 mr-3" disabled={copy.isFetching || !!confirmation} onClick={() => {
            setCopyFilter({ id: copy.data.id, barcode: copy.data.barcode }); setMember(null); setBranch(''); setStatus('ACTIVE'); setPage(0);
          }}>Tìm lượt đang mượn của bản này</button>
          <button className="button-primary mt-4" disabled={!member || member.status !== 'ACTIVE' || !['AVAILABLE', 'ON_HOLD'].includes(copy.data.status) || copy.isFetching || !!confirmation}
            onClick={() => member && setConfirmation({ copy: copy.data, member })}>Cho mượn bản sách này</button>
          {copy.data.status === 'ON_HOLD' && <p className="text-sm my-3">Chỉ nhận sách khi giữ chỗ thuộc đúng người mượn và chưa hết hạn.</p>}
        </div>)}
      {confirmation && <BorrowConfirmation owner={owner} copy={confirmation.copy} member={confirmation.member}
        close={() => setConfirmation(null)} reload={() => void copy.refetch()}/>}
    </section>
    <section aria-label="Lịch sử tại quầy"><h2 className="section-title">Lịch sử tại quầy</h2>
      <p className="text-muted my-3">{member ? `Đang lọc theo ${member.memberCode} · ${member.fullName}.` : 'Đang xem mọi người mượn.'}</p>
      {copyFilter && <p className="my-3">Mã vạch đang lọc: {copyFilter.barcode}<button className="text-link ml-3" onClick={() => { setCopyFilter(null); setPage(0); }}>Bỏ lọc bản sách</button></p>}
      <div className="grid gap-4 md:grid-cols-2"><label className="field">Trạng thái lượt mượn<select value={status} onChange={e => { setStatus(e.target.value); setPage(0); }}>
        <option value="">Tất cả</option><option value="ACTIVE">Đang mượn (gồm quá hạn)</option><option value="OVERDUE">Quá hạn</option><option value="RETURNED">Đã trả</option>
      </select></label><ReferencePicker label="Chi nhánh lọc" resource="branches" value={branch ? [branch] : []} onChange={ids => { setBranch(ids[0] ?? ''); setPage(0); }}/></div>
      {loans.isPending ? <p role="status">Đang tải lịch sử…</p> : loans.isError ? <CirculationError error={loans.error} reload={() => void loans.refetch()}/>
        : <>{!loans.data.items.length && <p className="my-4">Không có lượt mượn phù hợp.</p>}
          <div className="grid gap-4 my-4">{loans.data.items.map(loan => <StaffLoan key={`${loan.loanId}:${loan.version}`} owner={owner} loan={loan} reload={() => void loans.refetch()}/>)}</div>
          <Pagination page={loans.data.page} onChange={setPage}/><p className="text-sm text-muted">Trạng thái tính lúc {formatTime(loans.data.asOf)}.</p></>}
    </section>
  </section>;
}
function BranchName({ owner, id }: { owner: string; id: string }) {
  const branch = useQuery({ queryKey: ['catalog', owner, 'branches', undefined, 'item', id], queryFn: ({ signal }) => getCatalogItem('branches', id, signal), retry: false });
  return branch.isError ? <CirculationError error={branch.error} reload={() => void branch.refetch()}/> : <p>Chi nhánh: {branch.data ? recordLabel(branch.data) : 'Đang tải…'}</p>;
}
function BorrowConfirmation({ owner, copy, member, close, reload }: { owner: string; copy: Copy; member: SelectedMember; close: () => void; reload: () => void }) {
  const command = useCirculationCommand(owner, JSON.stringify([copy.id, copy.version, member.userId]), id => borrowCopy(copy, member.userId, id));
  return <div role="group" aria-label="Xác nhận cho mượn" className="my-4 border-t border-line pt-4">
    <p>Cho {member.memberCode} · {member.fullName} mượn {copy.barcode} · {copy.bookTitle}?</p>
    <BranchName owner={owner} id={copy.branchId}/>
    <button className="button-primary mt-3" disabled={command.busy || !!command.result} onClick={() => void command.run()}>{command.busy ? 'Đang ghi nhận…' : command.uncertain ? 'Thử lại yêu cầu cho mượn' : 'Xác nhận cho mượn'}</button>
    {!command.uncertain && <button className="button-secondary ml-3" disabled={command.busy} onClick={close}>{command.result ? 'Giao dịch tiếp theo' : 'Hủy xác nhận'}</button>}
    {command.error && <CirculationError error={command.error} reload={reload}/>}
    {command.result && <p role="status" className="my-3">Đã cho mượn. Hạn trả: {formatTime(command.result.dueAt)}.</p>}
  </div>;
}
function StaffLoan({ owner, loan, reload }: { owner: string; loan: Loan; reload: () => void }) {
  const [action, setAction] = useState<'return' | 'renew' | null>(null);
  return <article className="editorial-card min-w-0"><h3 className="font-semibold">{loan.bookTitle} · {loan.barcode}</h3>
    <p className="my-2">{loan.branchName} · {loanLabels[loan.status]}</p>
    <p className="text-sm break-all">Mã lượt mượn: {loan.loanId} · Mã định danh người mượn: {loan.readerId}</p>
    <p className="my-2">Mượn {formatTime(loan.borrowedAt)} · Hạn {formatTime(loan.dueAt)} · Đã gia hạn {loan.renewalCount} lần</p>
    {loan.returnedAt && <p>Đã trả lúc {formatTime(loan.returnedAt)}</p>}
    {!loan.returnedAt && !action && <div className="flex flex-wrap gap-3 mt-3"><button className="button-primary" onClick={() => setAction('return')}>Nhận trả</button>
      {loan.status === 'ACTIVE' && <button className="button-secondary" onClick={() => setAction('renew')}>Gia hạn tại quầy</button>}</div>}
    {action && <StaffLoanAction key={action} owner={owner} loan={loan} action={action} close={() => setAction(null)} reload={reload}/>}
  </article>;
}
function StaffLoanAction({ owner, loan, action, close, reload }: { owner: string; loan: Loan; action: 'return' | 'renew'; close: () => void; reload: () => void }) {
  const command = useCirculationCommand(owner, `${loan.loanId}:${loan.version}:${action}`, id => action === 'return' ? returnLoan(loan, id) : renewLoan(loan.loanId, loan.version, id));
  return <div role="group" aria-label={action === 'return' ? 'Xác nhận nhận trả' : 'Xác nhận gia hạn tại quầy'} className="my-4">
    <p>{action === 'return' ? `Đã nhận đúng bản ${loan.barcode} tại ${loan.branchName}?` : `Gia hạn bản ${loan.barcode} theo chính sách hiện hành?`}</p>
    <button className="button-primary mt-3" disabled={command.busy || !!command.result} onClick={() => void command.run()}>
      {command.busy ? 'Đang ghi nhận…' : command.uncertain ? 'Thử lại đúng yêu cầu' : action === 'return' ? 'Xác nhận nhận trả' : 'Xác nhận gia hạn tại quầy'}</button>
    {!command.uncertain && <button className="button-secondary ml-3" disabled={command.busy} onClick={close}>Đóng xác nhận</button>}
    {command.error && <CirculationError error={command.error} reload={reload}/>}
    {command.result && <p role="status">Đã ghi nhận giao dịch.</p>}
  </div>;
}
