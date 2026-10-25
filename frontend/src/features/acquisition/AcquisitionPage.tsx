import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { getBook, getCatalogItem } from '../catalog/catalog-api';
import { formatTime } from '../circulation/circulation-labels';
import { ApiError } from '../../shared/api/client';
import { decideRecommendation, getRecommendation, listRecommendations,
  type Recommendation, type RecommendationState } from './acquisition-api';

const labels = { DRAFT: 'Chờ duyệt', APPROVED: 'Đã duyệt nội bộ', REJECTED: 'Đã từ chối' } as const;
const signalNames = { waitingHolds: 'Yêu cầu giữ chỗ đang chờ', loansStarted: 'Lượt bắt đầu mượn trong kỳ',
  favoritesAdded: 'Lượt thêm yêu thích trong kỳ' } as const;
const omittedNames: Record<string, string> = {
  ZERO_RESULT_SEARCH: 'Lượt tìm kiếm không có kết quả', UNAVAILABLE_VIEW: 'Lượt xem khi hết sách',
  OPEN_ORDER: 'Sách đang đặt mua', BUDGET: 'Ngân sách',
};

export function AcquisitionPage() {
  const { user } = useAuth();
  return user ? <Content key={user.id} owner={user.id}/> : null;
}

function Content({ owner }: { owner: string }) {
  const client = useQueryClient();
  const [state, setState] = useState<RecommendationState | ''>('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const list = useQuery({ queryKey: ['acquisition', owner, 'list', state, page],
    queryFn: ({ signal }) => listRecommendations(state, page, signal), retry: false });
  const detail = useQuery({ queryKey: ['acquisition', owner, 'detail', selected],
    queryFn: ({ signal }) => getRecommendation(selected, signal), enabled: !!selected, retry: false });

  const decide = async (action: 'APPROVED' | 'REJECTED') => {
    if (!detail.data || busy) return;
    setBusy(true); setError('');
    try {
      await decideRecommendation(detail.data.id, action, reason, detail.data.version);
      setReason('');
      await Promise.all([
        client.invalidateQueries({ queryKey: ['acquisition', owner, 'list'] }),
        client.invalidateQueries({ queryKey: ['acquisition', owner, 'detail', selected] }),
      ]);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 409
        ? 'Đề xuất đã thay đổi. Hãy tải lại bằng chứng trước khi quyết định.'
        : cause instanceof Error ? cause.message : 'Không lưu được quyết định.');
    }
    finally { setBusy(false); }
  };

  return <section>
    <h1 className="page-title">Đề xuất bổ sung sách</h1>
    <p className="text-muted my-3">Nhân viên xem bằng chứng và quyết định đề xuất nội bộ. Chức năng tạo đề xuất từ số liệu Core đang chờ tích hợp nguồn dữ liệu; việc duyệt không đặt mua sách.</p>
    <label className="field my-5 max-w-sm">Trạng thái
      <select value={state} onChange={event => { setState(event.target.value as RecommendationState | ''); setPage(0); setSelected(''); }}>
        <option value="">Tất cả</option><option value="DRAFT">Chờ duyệt</option>
        <option value="APPROVED">Đã duyệt nội bộ</option><option value="REJECTED">Đã từ chối</option>
      </select>
    </label>
    {list.isPending ? <p role="status">Đang tải đề xuất…</p> : list.isError ? <ErrorView error={list.error} retry={() => void list.refetch()}/>
      : <section aria-label="Danh sách đề xuất">
        {!list.data.items.length ? <p className="editorial-card">Chưa có đề xuất phù hợp. Hệ thống chưa tự tạo đề xuất khi nguồn Core chưa được kết nối.</p>
          : <div className="grid gap-4 md:grid-cols-2">{list.data.items.map(item =>
            <article key={item.id} className="editorial-card">
              <p className="eyebrow">{labels[item.state]}</p>
              <h2 className="section-title my-2"><BookName bookId={item.bookId}/></h2>
              <p className="text-sm text-muted"><BranchName branchId={item.branchId}/> · {formatTime(item.createdAt)}</p>
              <p className="my-3">Điểm {item.score.toFixed(1)}/100 · Độ tin cậy {Math.round(item.confidence * 100)}%</p>
              <button className="button-secondary" type="button" onClick={() => { setSelected(item.id); setReason(''); setError(''); }}>Xem bằng chứng</button>
            </article>)}</div>}
        <div className="flex items-center gap-3 my-5"><button className="button-secondary" type="button" disabled={page === 0} onClick={() => setPage(page - 1)}>Trang trước</button>
          <span>Trang {page + 1}/{Math.max(1, list.data.page.totalPages)}</span>
          <button className="button-secondary" type="button" disabled={page + 1 >= list.data.page.totalPages} onClick={() => setPage(page + 1)}>Trang sau</button></div>
      </section>}
    {selected && <section aria-label="Chi tiết đề xuất" className="editorial-card my-8">
      {detail.isPending ? <p role="status">Đang tải bằng chứng…</p> : detail.isError ? <ErrorView error={detail.error} retry={() => void detail.refetch()}/>
        : <RecommendationDetail value={detail.data} reason={reason} onReason={setReason} busy={busy} error={error} onDecision={decide}/>}
    </section>}
  </section>;
}

function ErrorView({ error, retry }: { error: Error; retry: () => void }) {
  return <div role="alert" className="editorial-card"><p>{error.message}</p><button type="button" className="button-secondary mt-3" onClick={retry}>Thử lại</button></div>;
}
function BookName({ bookId }: { bookId: string }) {
  const result = useQuery({ queryKey: ['acquisition', 'book', bookId], queryFn: ({ signal }) => getBook(bookId, signal), retry: false });
  return result.data ? <Link className="text-link" to={`/sach/${bookId}`}>{result.data.title}</Link> : <>Sách {bookId}</>;
}
function BranchName({ branchId }: { branchId: string }) {
  const result = useQuery({ queryKey: ['acquisition', 'branch', branchId],
    queryFn: ({ signal }) => getCatalogItem('branches', branchId, signal), retry: false });
  return result.data && 'name' in result.data ? result.data.name : `Chi nhánh ${branchId}`;
}
function RecommendationDetail({ value, reason, onReason, busy, error, onDecision }: {
  value: Recommendation; reason: string; onReason: (value: string) => void; busy: boolean; error: string;
  onDecision: (action: 'APPROVED' | 'REJECTED') => Promise<void>;
}) {
  const signals = value.evidence;
  return <>
    <h2 className="section-title">Bằng chứng và quyết định</h2>
    <p className="my-3">{labels[value.state]} · Điểm {value.score.toFixed(1)}/100 · Độ tin cậy {Math.round(value.confidence * 100)}%</p>
    <p className="text-sm text-muted">Cửa sổ UTC: {formatTime(value.windowFrom)} đến trước {formatTime(value.windowTo)}. Snapshot {formatTime(value.snapshotAt)}.</p>
    <p className="text-sm text-muted">Nguồn {value.sourceContractVersion}, revision {value.sourceRevision}; công thức {value.scoreVersion}.</p>
    <p className="my-4">Bản sách tại snapshot: {signals.copiesAvailable} sẵn có / {signals.copiesOwned} thuộc chi nhánh.</p>
    <div className="overflow-x-auto my-5"><table className="w-full text-left"><thead><tr><th className="p-3">Tín hiệu</th><th className="p-3">Số liệu</th><th className="p-3">Đóng góp điểm</th><th className="p-3">Nguồn hoặc lý do thiếu</th></tr></thead>
      <tbody>{(Object.keys(signalNames) as Array<keyof typeof signalNames>).map(key => <tr key={key}>
        <td className="p-3">{signalNames[key]}</td><td className="p-3">{signals[key].count ?? 'Chưa có'}</td>
        <td className="p-3">{signals.components[key].contribution.toFixed(1)}</td>
        <td className="p-3">{signals[key].source ?? signals[key].unavailableReason}</td>
      </tr>)}</tbody></table></div>
    <p className="text-sm text-muted">Các tín hiệu chưa dùng: {signals.omittedSignals.map(name => omittedNames[name] ?? name).join(', ')}. Nhân viên cần kiểm tra bằng chứng trước khi quyết định.</p>
    {value.state === 'DRAFT' && <div className="my-6"><label className="field">Lý do quyết định
      <textarea value={reason} maxLength={1000} onChange={event => onReason(event.target.value)} rows={3} placeholder="Nêu căn cứ duyệt hoặc từ chối"/></label>
      <div className="flex flex-wrap gap-3 my-3"><button className="button-primary" type="button" disabled={busy || reason.trim().length < 10}
        onClick={() => void onDecision('APPROVED')}>{busy ? 'Đang lưu…' : 'Duyệt nội bộ'}</button>
        <button className="button-secondary" type="button" disabled={busy || reason.trim().length < 10}
          onClick={() => void onDecision('REJECTED')}>Từ chối</button></div>
      {error && <p role="alert">{error}</p>}</div>}
    {!!value.decisions?.length && <section aria-label="Lịch sử quyết định" className="my-6"><h3 className="section-title">Lịch sử quyết định</h3>
      <ol className="my-3">{value.decisions.map(item => <li key={item.id} className="my-2">
        {labels[item.action]} · {formatTime(item.createdAt)} · {item.reason}</li>)}</ol></section>}
  </>;
}
