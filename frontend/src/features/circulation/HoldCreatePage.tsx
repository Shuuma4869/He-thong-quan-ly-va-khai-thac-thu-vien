import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { getBook, getBookAvailability, getCatalogItem, recordLabel } from '../catalog/catalog-api';
import { PickupBranchPicker } from './PickupBranchPicker';
import { createHold, getHold } from './circulation-api';
import { CirculationError } from './CirculationStates';
import { formatTime, holdLabels } from './circulation-labels';
import { useCirculationCommand } from './use-circulation-command';

export function HoldCreatePage() {
  const { user } = useAuth(); const { bookId = '', editionId = '' } = useParams();
  return user ? <HoldForm key={`${user.id}:${bookId}:${editionId}`} owner={user.id} bookId={bookId} editionId={editionId}/> : null;
}
function HoldForm({ owner, bookId, editionId }: { owner: string; bookId: string; editionId: string }) {
  const [branch, setBranch] = useState(''); const [anyEdition, setAnyEdition] = useState(false);
  const book = useQuery({ queryKey: ['catalog', owner, 'book', bookId], queryFn: ({ signal }) => getBook(bookId, signal), retry: false });
  const edition = useQuery({ queryKey: ['catalog', owner, 'editions', bookId, 'item', editionId],
    queryFn: ({ signal }) => getCatalogItem('editions', editionId, signal, bookId), retry: false });
  const availability = useQuery({ queryKey: ['catalog', 'availability', bookId],
    queryFn: ({ signal }) => getBookAvailability(bookId, signal), enabled: book.isSuccess && edition.isSuccess, retry: false });
  const payload = { bookId, editionId: anyEdition ? null : editionId, branchId: branch, anyEdition };
  const command = useCirculationCommand(owner, JSON.stringify(payload), id => createHold(payload, id));
  const holdDetail = useQuery({ queryKey: ['circulation', owner, 'hold', command.result?.id],
    queryFn: ({ signal }) => {
      if (!command.result) throw new Error('Chưa có yêu cầu giữ chỗ để tải chi tiết.');
      return getHold(command.result.id, signal);
    }, enabled: !!command.result, retry: false });
  const selectedEdition = availability.data?.editions.find(item => item.editionId === editionId);
  const editionBranch = selectedEdition?.branches.find(item => item.branchId === branch);
  const bookBranch = availability.data?.branches.find(item => item.branchId === branch);
  const branchCopies = anyEdition ? bookBranch?.copies : editionBranch?.copies;
  const branchWaiting = anyEdition ? bookBranch?.waitingHolds : editionBranch?.compatibleWaitingHolds;
  const hasPhysicalCopies = (branchCopies?.totalCopies ?? 0) > 0;
  const canRegisterNow = (branchCopies?.availableCopies ?? 0) > 0 && (branchWaiting ?? 0) === 0;
  const selectionDisabled = command.busy || command.uncertain || !!command.result || availability.isPending || availability.isError;
  const submitDisabled = command.busy || !!command.result || availability.isPending || availability.isError || !hasPhysicalCopies;
  return <section className="shell py-8"><Link className="text-link" to={`/sach/${bookId}`}>← Chi tiết sách</Link>
    <h1 className="page-title mt-5">{canRegisterNow ? 'Đăng ký mượn tại quầy' : 'Đặt giữ chỗ nhận sách'}</h1>
    {book.isPending || edition.isPending ? <p role="status">Đang tải ấn bản…</p> : book.isError || edition.isError
      ? <CirculationError error={(book.error ?? edition.error)!} reload={() => { void book.refetch(); void edition.refetch(); }}/>
      : <form className="editorial-card my-6" onSubmit={event => { event.preventDefault(); if (branch) void command.run(); }}>
        <h2 className="section-title">{book.data.title}</h2><p className="my-3">{recordLabel(edition.data)}</p>
        <p className="text-muted my-3">Đây là yêu cầu nhận sách tại quầy, chưa phải lượt mượn. Loan chỉ được ghi nhận sau khi thủ thư xác nhận bàn giao bản sách vật lý.</p>
        <PickupBranchPicker owner={owner} value={branch} onChange={setBranch} disabled={selectionDisabled}/>
        <label className="flex gap-3 my-5"><input type="checkbox" checked={anyEdition} disabled={selectionDisabled} onChange={e => setAnyEdition(e.target.checked)}/>
          Tôi đồng ý nhận bất kỳ ấn bản nào của đầu sách này, có thể khác ISBN, năm xuất bản hoặc ngôn ngữ.</label>
        {availability.isPending ? <p role="status">Đang kiểm tra tồn kho của chi nhánh…</p>
          : availability.isError ? <CirculationError error={availability.error} reload={() => void availability.refetch()}/>
            : branch && !hasPhysicalCopies ? <p role="status" className="my-3">Chi nhánh này chưa có bản vật lý đang quản lý cho lựa chọn ấn bản. Chọn chi nhánh khác hoặc cho phép nhận bất kỳ ấn bản nào.</p>
              : branch && <p role="status" className="my-3">
                {canRegisterNow
                  ? `Hiện có ${branchCopies?.availableCopies} bản sẵn sàng và chưa có hàng đợi phù hợp. Core sẽ kiểm tra lại rồi phân bổ trong giao dịch.`
                  : `Hiện có ${branchCopies?.availableCopies ?? 0} bản sẵn sàng; ${branchWaiting ?? 0} yêu cầu đang chờ phù hợp. Core sẽ giữ đúng thứ tự hàng đợi.`}
                {' '}Kiểm tra lúc {availability.data && new Date(availability.data.checkedAt).toLocaleString('vi-VN')}; dữ liệu có thể thay đổi trước khi gửi.</p>}
        <button type="submit" className="button-primary" disabled={!branch || submitDisabled}>
          {command.busy ? 'Đang gửi yêu cầu…' : command.uncertain ? 'Thử lại đúng yêu cầu' : canRegisterNow ? 'Đăng ký mượn tại quầy' : 'Xác nhận giữ chỗ'}</button>
        {command.error && <CirculationError error={command.error}/>}
        {command.result && <div role="status" className="editorial-card my-4">
          <strong>{holdLabels[command.result.status]}</strong>
          <p>{command.result.status === 'READY'
            ? 'Bản sách đã được phân bổ. Đến quầy tại chi nhánh nhận để thủ thư xác nhận bàn giao; lượt mượn chưa bắt đầu.'
            : 'Yêu cầu đã được ghi nhận trong hàng đợi. Core sẽ phân bổ khi có bản phù hợp và đến lượt.'}</p>
          {command.result.expiresAt && <p>Nhận trước {formatTime(command.result.expiresAt)}.</p>}
          {holdDetail.isSuccess && command.result.status === 'WAITING' && holdDetail.data.queuePosition != null
            && <p>Vị trí hàng đợi hiện tại: {holdDetail.data.queuePosition}.</p>}
          {holdDetail.isError && <p>Không tải được vị trí hàng đợi; yêu cầu đã được ghi nhận. Hãy xem lại mục Mượn và giữ chỗ.</p>}
        </div>}
        <p className="my-4"><Link className="text-link" to="/muon-va-giu-cho">Xem các lượt mượn và giữ chỗ của tôi</Link></p>
      </form>}
  </section>;
}
