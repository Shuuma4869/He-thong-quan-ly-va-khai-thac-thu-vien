import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { LibraryError } from '../my-library/LibraryError';
import { decideReviewReport, listReviewReports, type ReviewReport } from '../reviews/moderation-api';
import { AdminConfirmationDialog } from './AdminConfirmationDialog';
import { AdminDetailDrawer } from './AdminDetailDrawer';

export function ReviewReportsPage() {
  const [status, setStatus] = useState<'OPEN' | 'RESOLVED'>('OPEN');
  const [page, setPage] = useState(0);
  const [notice, setNotice] = useState('');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const client = useQueryClient();
  const queue = useQuery({ queryKey: ['review-reports', status, page],
    queryFn: ({ signal }) => listReviewReports(status, page, signal), retry: false });
  const selectedReport = queue.data?.items.find(item => item.id === selectedReportId);
  return <section aria-labelledby="review-reports-heading">
    <p className="eyebrow">Quản trị</p>
    <h1 id="review-reports-heading" className="page-title">Báo cáo đánh giá</h1>
    <p className="mt-2 text-muted">Xem nội dung tại thời điểm báo cáo trước khi quyết định. Mỗi quyết định cần lý do và được lưu lại.</p>
    <label className="field mt-5">Trạng thái<select value={status} onChange={event => {
      setStatus(event.target.value as 'OPEN' | 'RESOLVED'); setPage(0); setNotice(''); setSelectedReportId(null);
    }}><option value="OPEN">Chờ xử lý</option><option value="RESOLVED">Đã xử lý</option></select></label>
    {notice && <p role="status" className="account-notice">{notice}</p>}
    {queue.isPending ? <p role="status">Đang tải báo cáo…</p> : queue.isError
      ? <LibraryError error={queue.error} retry={() => void queue.refetch()}/>
      : <><p className="my-4 text-sm text-muted">{queue.data.totalElements} báo cáo</p>
        {!queue.data.items.length && <p>Không có báo cáo ở trang này.</p>}
        <ul className="admin-report-list">{queue.data.items.map(item => <li key={item.id} className="editorial-card">
          <ReportCard report={item} onOpen={() => setSelectedReportId(item.id)}/>
        </li>)}</ul>
        <nav className="my-5 flex items-center gap-3" aria-label="Phân trang báo cáo">
          <button type="button" className="button-secondary" disabled={page === 0}
            onClick={() => { setSelectedReportId(null); setPage(page - 1); }}>Trước</button>
          <span>Trang {page + 1}</span>
          <button type="button" className="button-secondary" disabled={(page + 1) * 20 >= queue.data.totalElements}
            onClick={() => { setSelectedReportId(null); setPage(page + 1); }}>Sau</button>
        </nav></>}
    {selectedReport && <AdminDetailDrawer title="Chi tiết báo cáo" onClose={() => setSelectedReportId(null)}>
      <ReportDetails report={selectedReport} onDone={() => {
        setSelectedReportId(null);
        setNotice('Đã lưu quyết định.');
        void client.invalidateQueries({ queryKey: ['review-reports'] });
      }}/>
    </AdminDetailDrawer>}
  </section>;
}

function ReportCard({ report, onOpen }: { report: ReviewReport; onOpen: () => void }) {
  return <>
    <p className="eyebrow">{report.status === 'OPEN' ? 'Chờ xử lý' : 'Đã xử lý'}</p>
    <h2 className="mt-2 font-semibold">Sách {report.bookId} · {report.ratingSnapshot}/5</h2>
    <p className="mt-2">Lý do báo cáo: {report.reason}</p>
    <p className="text-sm text-muted">Gửi lúc {new Date(report.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>
    <button type="button" className="button-secondary mt-4" onClick={onOpen}>Xem chi tiết</button>
  </>;
}

function ReportDetails({ report, onDone }: { report: ReviewReport; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState<'HIDE' | 'DISMISS' | null>(null);
  const decision = useMutation({ mutationFn: (action: 'HIDE' | 'DISMISS') => decideReviewReport(report.id, action, reason.trim()),
    onSuccess: () => { setConfirmation(null); onDone(); } });
  const valid = [...reason.trim()].length >= 10 && [...reason.trim()].length <= 500;
  return <>
    <h2 className="mt-4 text-xl font-semibold">Sách {report.bookId} · {report.ratingSnapshot}/5</h2>
    <section className="admin-report-snapshot mt-5" aria-labelledby="admin-review-snapshot">
      <h3 id="admin-review-snapshot" className="font-semibold">Nội dung tại thời điểm báo cáo</h3>
      <p className="mt-2 whitespace-pre-wrap break-words">{report.bodySnapshot}</p>
    </section>
    <dl className="admin-report-meta mt-5">
      <div><dt>Lý do báo cáo</dt><dd>{report.reason}</dd></div>
      <div><dt>Thời điểm gửi (giờ Việt Nam)</dt><dd>{new Date(report.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</dd></div>
      <div><dt>Trạng thái</dt><dd>{report.status === 'OPEN' ? 'Chờ xử lý' : 'Đã xử lý'}</dd></div>
    </dl>
    {report.status === 'OPEN' && <div className="mt-4">
      <label className="field">Lý do quyết định<textarea rows={2} maxLength={500} value={reason}
        onChange={event => setReason(event.target.value)} disabled={decision.isPending}/></label>
      <p className="text-sm text-muted">Nêu cơ sở quyết định, 10–500 ký tự.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="button-primary" disabled={!valid || decision.isPending}
          onClick={() => { decision.reset(); setConfirmation('HIDE'); }}>Ẩn đánh giá</button>
        <button type="button" className="button-secondary" disabled={!valid || decision.isPending}
          onClick={() => { decision.reset(); setConfirmation('DISMISS'); }}>Bỏ qua báo cáo</button>
      </div>
    </div>}
    {confirmation && <AdminConfirmationDialog
      title={confirmation === 'HIDE' ? 'Ẩn đánh giá này?' : 'Bỏ qua báo cáo này?'}
      description="Quyết định cùng lý do sẽ được ghi lại và không thể thay đổi từ màn hình này."
      confirmLabel={confirmation === 'HIDE' ? 'Xác nhận ẩn đánh giá' : 'Xác nhận bỏ qua'}
      busy={decision.isPending}
      error={decision.isError ? <LibraryError error={decision.error} retry={() => decision.reset()}/> : null}
      onCancel={() => { setConfirmation(null); decision.reset(); }}
      onConfirm={() => decision.mutate(confirmation)}/>}
  </>;
}
