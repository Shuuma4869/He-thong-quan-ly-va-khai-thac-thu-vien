import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { ReferencePicker } from '../catalog/ReferencePicker';
import { getCatalogItem } from '../catalog/catalog-api';
import { formatTime } from '../circulation/circulation-labels';
import { InventoryError, InventoryPagination } from './InventoryStates';
import { sessionLabels } from './inventory-labels';
import { listSessions, startSession } from './inventory-api';
import { ShelfPicker } from './ShelfPicker';
import { useInventoryCommand } from './use-inventory-command';
import { InventoryLocation } from './InventoryLocation';

export function InventorySessionsPage() {
  const { user } = useAuth();
  return user ? <Sessions key={user.id} owner={user.id}/> : null;
}
function Sessions({ owner }: { owner: string }) {
  const [branchId, setBranchId] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const sessions = useQuery({ queryKey: ['inventory', owner, 'sessions', branchId, status, page],
    queryFn: ({ signal }) => listSessions(branchId, status, page, signal), retry: false });
  return <section><h1 className="page-title">Kiểm kê kệ sách</h1>
    <p className="text-muted my-3">Mở phiên để chụp trạng thái bản sách, quét mã vạch và đối chiếu. Chốt phiên chỉ lưu bằng chứng; không tự sửa vị trí hoặc trạng thái bản sách.</p>
    <StartForm owner={owner}/>
    <section aria-label="Danh sách phiên kiểm kê" className="my-8"><h2 className="section-title">Các phiên đã mở</h2>
      <div className="grid gap-4 md:grid-cols-2 my-4">
        <ReferencePicker label="Chi nhánh lọc" resource="branches" value={branchId ? [branchId] : []}
          onChange={ids => { setBranchId(ids[0] ?? ''); setPage(0); }}/>
        <label className="field">Trạng thái<select value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}>
          <option value="">Tất cả</option><option value="OPEN">Đang quét</option><option value="FINALIZED">Đã chốt</option>
          <option value="CANCELLED">Đã hủy</option></select></label>
      </div>
      {sessions.isPending ? <p role="status">Đang tải phiên kiểm kê…</p>
        : sessions.isError ? <InventoryError error={sessions.error} reload={() => void sessions.refetch()}/>
        : <>{!sessions.data.items.length && <p className="my-4">Chưa có phiên phù hợp.</p>}
          <div className="grid gap-4 md:grid-cols-2 my-4">{sessions.data.items.map(session =>
            <article key={session.id} className="editorial-card"><div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold">{sessionLabels[session.status]}</h3><span className="text-sm text-muted">{formatTime(session.openedAt)}</span></div>
              <p className="text-sm my-2"><InventoryLocation owner={owner} branchId={session.branchId} shelfId={session.shelfId}/></p>
              <p className="text-sm my-2">{session.snapshotCount} bản chụp · {session.scanCount} lượt quét</p>
              <Link className="text-link" to={`/nhan-vien/kiem-ke/${session.id}`}>Mở phiên →</Link></article>)}</div>
          <InventoryPagination page={sessions.data.page} onChange={setPage}/></>}
    </section>
  </section>;
}
function StartForm({ owner }: { owner: string }) {
  const navigate = useNavigate();
  const [branchId, setBranchId] = useState('');
  const [shelfId, setShelfId] = useState('');
  const branch = useQuery({ queryKey: ['catalog', owner, 'branches', undefined, 'item', branchId],
    queryFn: ({ signal }) => getCatalogItem('branches', branchId, signal), enabled: !!branchId, retry: false });
  const active = !!branch.data && 'status' in branch.data && branch.data.status === 'ACTIVE';
  const command = useInventoryCommand(owner, JSON.stringify([branchId, shelfId]),
    requestId => startSession(branchId, shelfId || null, requestId));
  useEffect(() => { if (command.result) navigate(`/nhan-vien/kiem-ke/${command.result.id}`); }, [command.result, navigate]);
  const locked = command.busy || command.uncertain;
  return <form className="editorial-card my-6" onSubmit={event => { event.preventDefault(); if (active) void command.run(); }}>
    <h2 className="section-title">Mở phiên mới</h2>
    <p className="text-sm text-muted my-2">Mỗi chi nhánh chỉ có một phiên đang quét. Nếu hơn 5.000 bản sách, hãy kiểm kê theo từng kệ.</p>
    <ReferencePicker label="Chi nhánh" resource="branches" value={branchId ? [branchId] : []}
      onChange={ids => { setBranchId(ids[0] ?? ''); setShelfId(''); }} disabled={locked}/>
    {branchId && branch.isError && <InventoryError error={branch.error} reload={() => void branch.refetch()}/>}
    {branchId && branch.data && !active && <p className="text-sm my-2" role="alert">Chi nhánh đã ngừng hoạt động; chọn chi nhánh khác.</p>}
    {branchId && <ShelfPicker key={branchId} owner={owner} branchId={branchId} value={shelfId} onChange={setShelfId}
      allowWholeBranch disabled={locked}/>}
    <button type="submit" className="button-primary mt-4" disabled={!active || command.busy || !!command.result}>
      {command.busy ? 'Đang mở phiên…' : command.uncertain ? 'Thử lại cùng yêu cầu' : 'Mở phiên kiểm kê'}</button>
    {command.error && <InventoryError error={command.error}/>}
  </form>;
}
