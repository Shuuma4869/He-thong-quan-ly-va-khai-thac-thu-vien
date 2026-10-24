import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { getBook, getCatalogItem, recordLabel } from '../catalog/catalog-api';
import { PickupBranchPicker } from './PickupBranchPicker';
import { createHold } from './circulation-api';
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
  const payload = { bookId, editionId: anyEdition ? null : editionId, branchId: branch, anyEdition };
  const command = useCirculationCommand(owner, JSON.stringify(payload), id => createHold(payload, id));
  const disabled = command.busy || command.uncertain || !!command.result;
  return <section className="shell py-8"><Link className="text-link" to={`/sach/${bookId}`}>← Chi tiết sách</Link>
    <h1 className="page-title mt-5">Giữ chỗ nhận sách</h1>
    {book.isPending || edition.isPending ? <p role="status">Đang tải ấn bản…</p> : book.isError || edition.isError
      ? <CirculationError error={(book.error ?? edition.error)!} reload={() => { void book.refetch(); void edition.refetch(); }}/>
      : <form className="editorial-card my-6" onSubmit={event => { event.preventDefault(); if (branch) void command.run(); }}>
        <h2 className="section-title">{book.data.title}</h2><p className="my-3">{recordLabel(edition.data)}</p>
        <p className="text-muted my-3">Mặc định bạn giữ đúng ấn bản này. Mỗi người chỉ có một yêu cầu đang chờ hoặc sẵn sàng nhận cho cùng đầu sách, kể cả ở chi nhánh khác.</p>
        <PickupBranchPicker owner={owner} value={branch} onChange={setBranch} disabled={disabled}/>
        <label className="flex gap-3 my-5"><input type="checkbox" checked={anyEdition} disabled={disabled} onChange={e => setAnyEdition(e.target.checked)}/>
          Tôi đồng ý nhận bất kỳ ấn bản nào của đầu sách này, có thể khác ISBN, năm xuất bản hoặc ngôn ngữ.</label>
        <button type="submit" className="button-primary" disabled={!branch || command.busy || !!command.result}>
          {command.busy ? 'Đang gửi giữ chỗ…' : command.uncertain ? 'Thử lại đúng yêu cầu' : 'Xác nhận giữ chỗ'}</button>
        {command.error && <CirculationError error={command.error}/>}
        {command.result && <p role="status" className="my-4">Đã ghi nhận: {holdLabels[command.result.status]}.
          {command.result.expiresAt && ` Nhận trước ${formatTime(command.result.expiresAt)}.`}</p>}
        <p className="my-4"><Link className="text-link" to="/muon-va-giu-cho">Xem các lượt mượn và giữ chỗ của tôi</Link></p>
      </form>}
  </section>;
}
