import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Clock3, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { useAuth } from '../auth/auth-context';
import { getCatalogItem, schemas } from '../catalog/catalog-api';
import { Pagination } from '../catalog/CatalogStates';
import { ReferencePicker } from '../catalog/ReferencePicker';
import { CirculationError } from './CirculationStates';
import { formatTime, holdLabels } from './circulation-labels';
import { borrowCopy, getStaffHold, getStaffHolds, getStaffHoldSummary, type StaffHoldItem } from './circulation-api';
import { useCirculationCommand } from './use-circulation-command';

type Filters = { status: string; reader: string; book: string; branchId: string; from: string; to: string; expiresBefore?: string };
const emptyFilters: Filters = { status: '', reader: '', book: '', branchId: '', from: '', to: '' };
const expiryHours: Record<string, number> = { '24h': 24, '72h': 72, '7d': 168 };
const holdStatusLabels: Record<string, string> = {
  WAITING: 'Đang chờ', READY: 'Sẵn sàng nhận', FULFILLED: 'Đã bàn giao', CANCELLED: 'Đã hủy', EXPIRED: 'Đã hết hạn',
};

export function StaffHoldManagementPage() {
  const { user } = useAuth();
  return user ? <HoldWorkspace key={user.id} owner={user.id}/> : null;
}

function HoldWorkspace({ owner }: { owner: string }) {
  const [draft, setDraft] = useState({ ...emptyFilters, expiry: '' });
  const [filters, setFilters] = useState<Filters>({ ...emptyFilters });
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState('');
  const [pickupDueAt, setPickupDueAt] = useState<string | null>(null);
  const summary = useQuery({ queryKey: ['circulation', owner, 'staff-hold-summary'],
    queryFn: ({ signal }) => getStaffHoldSummary(signal), retry: false });
  const list = useQuery({ queryKey: ['circulation', owner, 'staff-holds', filters, page],
    queryFn: ({ signal }) => getStaffHolds({ ...filters, page }, signal), retry: false });
  const detail = useQuery({ queryKey: ['circulation', owner, 'staff-hold', selectedId],
    queryFn: ({ signal }) => getStaffHold(selectedId, signal), enabled: !!selectedId, retry: false });

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (invalidDateRange) return;
    const hours = expiryHours[draft.expiry];
    const endDate = draft.to ? new Date(`${draft.to}T00:00:00Z`) : null;
    endDate?.setUTCDate(endDate.getUTCDate() + 1);
    setFilters({
      status: draft.status,
      reader: draft.reader.trim(),
      book: draft.book.trim(),
      branchId: draft.branchId,
      from: draft.from ? new Date(`${draft.from}T00:00:00Z`).toISOString() : '',
      to: endDate?.toISOString() ?? '',
      expiresBefore: hours ? new Date(Date.now() + hours * 60 * 60 * 1000).toISOString() : undefined,
    });
    setPage(0);
  };
  const clearFilters = () => {
    setDraft({ ...emptyFilters, expiry: '' });
    setFilters({ ...emptyFilters });
    setPage(0);
  };
  const invalidDateRange = !!draft.from && !!draft.to && draft.from > draft.to;

  return <section className="hold-operations">
    <header className="hold-operations-hero">
      <div><p className="eyebrow">Không gian tác nghiệp · Lưu thông</p><h1 className="page-title">Quản lý giữ chỗ</h1>
        <p>Theo dõi hàng chờ, chuẩn bị bản sách và xác nhận bàn giao tại quầy. Mọi trạng thái được đọc trực tiếp từ Core.</p></div>
      <Link className="button-secondary" to="/nhan-vien/luu-thong">Mở quầy lưu thông <ArrowUpRight size={16}/></Link>
    </header>

    {summary.isPending ? <p role="status" className="editorial-card my-5">Đang tải số liệu giữ chỗ…</p>
      : summary.isError ? <CirculationError error={summary.error} reload={() => void summary.refetch()}/>
        : <dl className="hold-operations-metrics">
          <Metric label="Đang chờ" value={summary.data.waiting} detail="WAITING"/>
          <Metric label="Sẵn sàng nhận" value={summary.data.ready} detail="READY"/>
          <Metric label="Hết hạn trong 24 giờ" value={summary.data.expiringSoon} detail="Cần chuẩn bị bàn giao"/>
          <Metric label="Hoàn tất · 30 ngày" value={summary.data.fulfilledLast30Days} detail="FULFILLED"/>
          <Metric label="Cần chú ý" value={summary.data.needsAttention} detail="READY đã quá hạn"/>
        </dl>}

    <form className="hold-filter-panel" onSubmit={applyFilters} aria-label="Lọc yêu cầu giữ chỗ">
      <div className="hold-filter-heading"><div><p className="eyebrow">Tìm trong hàng đợi</p><h2>Bộ lọc nghiệp vụ</h2></div>
        <button type="button" className="button-secondary" onClick={clearFilters}>Xóa bộ lọc</button></div>
      <div className="hold-filter-grid">
        <label className="field">Trạng thái<select value={draft.status} onChange={event => setDraft(value => ({ ...value, status: event.target.value }))}>
          <option value="">Tất cả trạng thái</option>{Object.entries(holdStatusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label className="field">Người đọc / mã thành viên<input maxLength={150} value={draft.reader}
          onChange={event => setDraft(value => ({ ...value, reader: event.target.value }))} placeholder="Ví dụ: TV0001 hoặc tên"/></label>
        <label className="field">Tác phẩm<input maxLength={200} value={draft.book}
          onChange={event => setDraft(value => ({ ...value, book: event.target.value }))} placeholder="Tên sách"/></label>
        <ReferencePicker label="Chi nhánh nhận" resource="branches" value={draft.branchId ? [draft.branchId] : []}
          onChange={ids => setDraft(value => ({ ...value, branchId: ids[0] ?? '' }))}/>
        <label className="field">Tạo từ ngày<input type="date" value={draft.from}
          onChange={event => setDraft(value => ({ ...value, from: event.target.value }))}/></label>
        <label className="field">Đến hết ngày<input type="date" value={draft.to}
          onChange={event => setDraft(value => ({ ...value, to: event.target.value }))}/></label>
        <label className="field">Hạn nhận<select value={draft.expiry} onChange={event => setDraft(value => ({ ...value, expiry: event.target.value }))}>
          <option value="">Mọi thời hạn</option><option value="24h">Trong 24 giờ tới</option>
          <option value="72h">Trong 72 giờ tới</option><option value="7d">Trong 7 ngày tới</option>
        </select></label>
        <button type="submit" className="button-primary" disabled={invalidDateRange}><Search size={16}/> Áp dụng bộ lọc</button>
      </div>
      {invalidDateRange && <p role="alert" className="hold-filter-error">Ngày bắt đầu phải cùng ngày hoặc trước ngày kết thúc.</p>}
    </form>

    <div className="hold-operations-layout">
      <section className="hold-list-panel" aria-labelledby="hold-list-title">
        <div className="hold-list-heading"><div><p className="eyebrow">Danh sách giao dịch</p><h2 id="hold-list-title">Yêu cầu giữ chỗ</h2></div>
          <button type="button" className="icon-button" aria-label="Tải lại danh sách" disabled={list.isFetching}
            onClick={() => { void list.refetch(); void summary.refetch(); }}><RefreshCw size={17}/></button></div>
        {list.isPending ? <p role="status" className="editorial-card">Đang tải yêu cầu…</p>
          : list.isError ? <CirculationError error={list.error} reload={() => void list.refetch()}/>
            : <>
              <p className="hold-list-count">{list.data.page.totalElements} yêu cầu phù hợp</p>
              {!list.data.items.length && <p className="editorial-card">Không có yêu cầu phù hợp. Hãy thử xóa bớt bộ lọc.</p>}
              <ul className="hold-card-list">{list.data.items.map(item => <li key={item.hold.id}>
                <HoldListCard item={item} selected={selectedId === item.hold.id} onSelect={() => {
                  setSelectedId(item.hold.id); setPickupDueAt(null);
                }}/>
              </li>)}</ul>
              <Pagination page={list.data.page} onChange={setPage}/>
            </>}
      </section>

      <section className="hold-detail-panel" aria-label="Chi tiết yêu cầu">
        {pickupDueAt && <p role="status" className="hold-pickup-success">Đã bàn giao. Hạn trả: {formatTime(pickupDueAt)}.</p>}
        {!selectedId ? <div className="hold-detail-empty"><Clock3 size={25}/><h2>Chọn một yêu cầu</h2>
          <p>Chi tiết trạng thái, lịch sử và thao tác bàn giao sẽ xuất hiện tại đây.</p></div>
          : detail.isPending ? <p role="status" className="editorial-card">Đang tải chi tiết yêu cầu…</p>
            : detail.isError ? <CirculationError error={detail.error} reload={() => void detail.refetch()}/>
              : <HoldDetailPane owner={owner} item={detail.data.item} history={detail.data.history}
                  onPickupSuccess={setPickupDueAt}
                  reload={() => { void detail.refetch(); void list.refetch(); void summary.refetch(); }}/>}
      </section>
    </div>
  </section>;
}

function Metric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd><span>{detail}</span></div>;
}

function HoldListCard({ item, selected, onSelect }: { item: StaffHoldItem; selected: boolean; onSelect: () => void }) {
  return <article className={`hold-list-card ${selected ? 'is-selected' : ''}`}>
    <div className="hold-list-card-heading"><strong>{item.readerMemberCode}</strong>
      <span className={`hold-status hold-status--${item.hold.status.toLowerCase()}`}>{holdLabels[item.hold.status]}</span></div>
    <h3>{item.bookTitle}</h3><p>{item.readerName} · {item.branchName} ({item.branchCode})</p>
    <p className="hold-list-meta">Tạo {formatTime(item.hold.queuedAt)}
      {item.queuePosition != null && ` · Vị trí ${item.queuePosition}`}
      {item.hold.expiresAt && ` · Hạn nhận ${formatTime(item.hold.expiresAt)}`}</p>
    <button type="button" className="text-link" aria-pressed={selected} onClick={onSelect}>
      {selected ? 'Đang xem chi tiết' : 'Mở chi tiết'}
    </button>
  </article>;
}

function HoldDetailPane({ owner, item, history, reload, onPickupSuccess }: {
  owner: string; item: StaffHoldItem; history: Array<{ version: number; eventType: string; actorId: string | null; occurredAt: string }>;
  reload: () => void; onPickupSuccess: (dueAt: string) => void;
}) {
  return <article className="hold-detail-card">
    <header><p className="eyebrow">Chi tiết yêu cầu</p><h2>{item.bookTitle}</h2>
      <span className={`hold-status hold-status--${item.hold.status.toLowerCase()}`}>{holdLabels[item.hold.status]}</span></header>
    <dl className="hold-detail-facts">
      <div><dt>Mã yêu cầu</dt><dd>{item.hold.id}</dd></div>
      <div><dt>Người đọc</dt><dd>{item.readerName} · {item.readerMemberCode}</dd></div>
      <div><dt>Ấn bản</dt><dd>{item.isbn13 ?? (item.hold.editionId ? 'Chưa có ISBN' : 'Bất kỳ ấn bản tương thích')}</dd></div>
      <div><dt>Chi nhánh nhận</dt><dd>{item.branchName} ({item.branchCode})</dd></div>
      <div><dt>Thời điểm tạo</dt><dd>{formatTime(item.hold.queuedAt)}</dd></div>
      <div><dt>Vị trí hàng đợi</dt><dd>{item.queuePosition ?? 'Không còn trong hàng chờ'}</dd></div>
      <div><dt>Thời hạn nhận</dt><dd>{item.hold.expiresAt ? formatTime(item.hold.expiresAt) : 'Chưa được phân bổ'}</dd></div>
      <div><dt>Bản được phân bổ</dt><dd>{item.copyBarcode ?? 'Chưa phân bổ bản sách'}</dd></div>
    </dl>
    {item.hold.status === 'WAITING' && <p className="hold-guidance">Đang chờ bản phù hợp. Không tạo Loan trước khi Copy được phân bổ và bàn giao tại quầy.</p>}
    {item.hold.status === 'READY' && <PickupConfirmation owner={owner} item={item} onComplete={reload}
      onPickupSuccess={onPickupSuccess}/>}
    <section className="hold-history" aria-labelledby="hold-history-title"><h3 id="hold-history-title">Lịch sử trạng thái</h3>
      {!history.length ? <p>Chưa có sự kiện lịch sử.</p>
        : <ol>{history.map(change => <li key={`${change.version}:${change.eventType}`}>
          <strong>{change.eventType}</strong><span>Version {change.version} · {formatTime(change.occurredAt)}</span>
          <small>{change.actorId ? `Actor ${change.actorId}` : 'Tác vụ hệ thống'}</small>
        </li>)}</ol>}
    </section>
    <p className="hold-version">Version hiện tại: {item.hold.version}</p>
  </article>;
}

function PickupConfirmation({ owner, item, onComplete, onPickupSuccess }: {
  owner: string; item: StaffHoldItem; onComplete: () => void; onPickupSuccess: (dueAt: string) => void;
}) {
  const copyId = item.hold.copyId;
  const copy = useQuery({ queryKey: ['circulation', owner, 'hold-copy', copyId],
    queryFn: async ({ signal }) => {
      if (!copyId) throw new Error('Hold READY chưa có Copy được phân bổ.');
      return schemas.copies.parse(await getCatalogItem('copies', copyId, signal));
    }, enabled: !!copyId, retry: false });
  const command = useCirculationCommand(owner, JSON.stringify([item.hold.id,item.hold.version,item.hold.readerId,copy.data?.id,copy.data?.version]),
    requestId => {
      if (!copy.data) throw new Error('Chưa tải được Copy được phân bổ.');
      return borrowCopy(copy.data,item.hold.readerId,requestId);
    }, result => onPickupSuccess(result.dueAt));
  const expired = !!item.hold.expiresAt && Date.parse(item.hold.expiresAt) <= Date.now();
  const copyMatches = copy.isSuccess && copy.data.id === copyId && copy.data.status === 'ON_HOLD'
    && item.copyStatus === 'ON_HOLD' && item.copyVersion === copy.data.version;
  const canConfirm = item.hold.status === 'READY' && !expired && copyMatches && !command.busy && !command.result;

  return <section className="hold-pickup-panel" aria-label="Bàn giao sách tại quầy">
    <h3><ShieldAlert size={18}/> Xác nhận bàn giao</h3>
    {expired ? <p role="alert">Yêu cầu đã quá hạn nhận. Tải lại trạng thái trước khi thao tác.</p>
      : copy.isPending ? <p role="status">Đang xác minh bản được phân bổ…</p>
        : copy.isError ? <CirculationError error={copy.error} reload={() => void copy.refetch()}/>
          : !copyMatches ? <div role="alert"><p>Trạng thái hoặc phiên bản Copy đã thay đổi. Không thể bàn giao từ dữ liệu cũ.</p>
            <button type="button" className="button-secondary" onClick={() => { void copy.refetch(); onComplete(); }}>Tải lại</button></div>
            : <><p>Đối chiếu thành viên <strong>{item.readerMemberCode}</strong> và mã vạch <strong>{copy.data.barcode}</strong>.
              Loan sẽ chỉ được tạo khi Core xác nhận đúng Copy ON_HOLD và đúng người nhận.</p>
              <button type="button" className="button-primary" disabled={!canConfirm}
                onClick={() => void command.run()}>{command.busy ? 'Đang ghi nhận bàn giao…' : command.uncertain ? 'Thử lại cùng yêu cầu' : 'Xác nhận đã giao sách'}</button>
              {command.error && <CirculationError error={command.error}/>}
            </>}
  </section>;
}
