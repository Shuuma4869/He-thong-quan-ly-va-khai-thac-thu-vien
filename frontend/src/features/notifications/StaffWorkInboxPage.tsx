import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Bell, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { getCatalogItem, schemas } from '../catalog/catalog-api';
import { ReferencePicker } from '../catalog/ReferencePicker';
import { Pagination } from '../catalog/CatalogStates';
import { CirculationError } from '../circulation/CirculationStates';
import { formatNotificationTime } from './notification-api';
import { listStaffWorkItems, staffWorkUnreadCount, type StaffWorkItem } from './staff-work-inbox-api';

export function StaffWorkInboxPage() {
  const { user } = useAuth();
  return user ? <WorkInbox key={user.id} owner={user.id}/> : null;
}

function WorkInbox({ owner }: { owner: string }) {
  const [draft, setDraft] = useState<{ branchId: string; workType: '' | StaffWorkItem['workType'] }>({ branchId: '', workType: '' });
  const [filters, setFilters] = useState(draft);
  const [page, setPage] = useState(0);
  const list = useQuery({ queryKey: ['staff-work-inbox', owner, filters, page],
    queryFn: ({ signal }) => listStaffWorkItems({ ...filters, page, workType: filters.workType || undefined }, signal),
    retry: false, refetchInterval: 60_000, refetchIntervalInBackground: false });
  const count = useQuery({ queryKey: ['staff-work-inbox', owner, 'unread-count', filters.branchId],
    queryFn: ({ signal }) => staffWorkUnreadCount(filters.branchId || undefined, signal), retry: false,
    staleTime: 15_000, refetchInterval: 60_000, refetchIntervalInBackground: false });
  const apply = () => { setFilters(draft); setPage(0); };
  const refresh = () => { void list.refetch(); void count.refetch(); };

  return <section className="staff-work-inbox">
    <header className="hold-operations-hero">
      <div><p className="eyebrow">Nhiệm vụ theo sự kiện Core</p><h1 className="page-title">Hộp thư công việc</h1>
        <p>Yêu cầu WAITING mới và Hold READY cần bàn giao. Danh sách cập nhật từ Outbox → Kafka → Insight, không phải dữ liệu mô phỏng.</p>
        <p className="text-sm text-muted">Hiện quyền nhân viên áp dụng toàn hệ thống; chưa có phân công Librarian theo chi nhánh.</p>
      </div>
      <div className="staff-inbox-total"><Bell size={20}/><strong>{count.isSuccess ? count.data.count : '—'}</strong><span>việc đang mở</span></div>
    </header>

    <section className="hold-filter-panel" aria-label="Lọc hộp thư công việc">
      <div className="hold-filter-heading"><div><p className="eyebrow">Phạm vi tác nghiệp</p><h2>Lọc công việc</h2></div>
        <button type="button" className="button-secondary" disabled={list.isFetching || count.isFetching}
          onClick={refresh}><RefreshCw size={16}/> Cập nhật</button></div>
      <div className="hold-filter-grid">
        <ReferencePicker label="Chi nhánh" resource="branches" value={draft.branchId ? [draft.branchId] : []}
          onChange={ids => setDraft(value => ({ ...value, branchId: ids[0] ?? '' }))}/>
        <label className="field">Loại công việc<select value={draft.workType}
          onChange={event => setDraft(value => ({ ...value, workType: event.target.value as '' | StaffWorkItem['workType'] }))}>
          <option value="">Tất cả công việc</option><option value="WAITING">Hold đang chờ</option>
          <option value="READY">Hold sẵn sàng bàn giao</option>
        </select></label>
        <button type="button" className="button-primary" onClick={apply}>Áp dụng bộ lọc</button>
      </div>
      {count.isError && <CirculationError error={count.error} reload={() => void count.refetch()}/>}
    </section>

    <section className="hold-list-panel" aria-labelledby="staff-inbox-list">
      <div className="hold-list-heading"><div><p className="eyebrow">Ưu tiên theo thời gian</p><h2 id="staff-inbox-list">Việc cần xử lý</h2></div></div>
      {list.isPending ? <p role="status" className="editorial-card">Đang đồng bộ công việc…</p>
        : list.isError ? <CirculationError error={list.error} reload={() => void list.refetch()}/>
          : <><p className="hold-list-count">{list.data.totalElements} công việc đang mở{filters.branchId ? ' tại chi nhánh đã chọn' : ' trên toàn hệ thống'}</p>
            {!list.data.items.length && <div className="staff-work-empty"><Bell size={24}/><h3>Không có công việc đang mở</h3>
              <p>Khi Core ghi nhận Hold mới hoặc phân bổ Copy sẵn sàng nhận, công việc sẽ xuất hiện ở đây.</p></div>}
            <ul className="staff-work-items">{list.data.items.map(item => <li key={`${item.aggregateId}:${item.workType}`}>
              <WorkItemCard owner={owner} item={item}/>
            </li>)}</ul>
            <Pagination page={{ number: list.data.page, size: list.data.size, totalElements: list.data.totalElements,
              totalPages: Math.ceil(list.data.totalElements / list.data.size) }} onChange={setPage}/>
          </>}
    </section>
  </section>;
}

function WorkItemCard({ owner, item }: { owner: string; item: StaffWorkItem }) {
  const branch = useQuery({ queryKey: ['catalog', owner, 'branches', 'item', item.branchId],
    queryFn: async ({ signal }) => schemas.branches.parse(await getCatalogItem('branches', item.branchId, signal)),
    retry: false, staleTime: 60_000 });
  const ready = item.workType === 'READY';
  const to = `/nhan-vien/giu-cho?status=${item.workType}&branchId=${encodeURIComponent(item.branchId)}&holdId=${encodeURIComponent(item.aggregateId)}`;
  return <article className={`staff-work-item ${ready ? 'is-ready' : ''}`}>
    <div className="staff-work-item-mark" aria-hidden="true">{ready ? '01' : '02'}</div>
    <div className="staff-work-item-content"><p className="eyebrow">{ready ? 'Cần bàn giao' : 'Hàng đợi mới'}</p>
      <h3>{ready ? 'Hold sẵn sàng nhận sách' : 'Hold mới đang chờ phân bổ'}</h3>
      <p>{branch.isPending ? 'Đang tải chi nhánh…' : branch.isError ? 'Không tải được tên chi nhánh' : branch.data.name}</p>
      <p className="staff-work-item-meta">Cập nhật {formatNotificationTime(item.updatedAt)} · Mã Hold {item.aggregateId.slice(0, 8).toUpperCase()}</p>
    </div>
    <Link className="button-primary" to={to}>Mở nghiệp vụ <ArrowUpRight size={16}/></Link>
  </article>;
}
