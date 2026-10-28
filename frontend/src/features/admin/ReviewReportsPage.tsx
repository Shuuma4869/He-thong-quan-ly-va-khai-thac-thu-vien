import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { LibraryError } from '../my-library/LibraryError';
import { decideReviewReport, listReviewReports, type ReviewReport } from '../reviews/moderation-api';

export function ReviewReportsPage() {
  const [status, setStatus] = useState<'OPEN' | 'RESOLVED'>('OPEN');
  const [page, setPage] = useState(0);
  const client = useQueryClient();
  const queue = useQuery({ queryKey: ['review-reports', status, page],
    queryFn: ({ signal }) => listReviewReports(status, page, signal), retry: false });
  return <section aria-labelledby="review-reports-heading">
    <p className="eyebrow">Quản trị</p>
    <h1 id="review-reports-heading" className="page-title">Báo cáo đánh giá</h1>
    <p className="mt-2 text-muted">Xem nội dung tại thời điểm báo cáo trước khi quyết định. Mỗi quyết định cần lý do và được lưu lại.</p>
    <label className="field mt-5">Trạng thái<select value={status} onChange={event => {
      setStatus(event.target.value as 'OPEN' | 'RESOLVED'); setPage(0);
    }}><option value="OPEN">Chờ xử lý</option><option value="RESOLVED">Đã xử lý</option></select></label>
    {queue.isPending ? <p role="status">Đang tải báo cáo…</p> : queue.isError
      ? <LibraryError error={queue.error} retry={() => void queue.refetch()}/>
      : <><p className="my-4 text-sm text-muted">{queue.data.totalElements} báo cáo</p>
        {!queue.data.items.length && <p>Không có báo cáo ở trang này.</p>}
        <ul className="grid gap-4">{queue.data.items.map(item => <li key={item.id} className="editorial-card">
          <ReportCard report={item} onDone={() => void client.invalidateQueries({ queryKey: ['review-reports'] })}/>
        </li>)}</ul>
        <nav className="my-5 flex items-center gap-3" aria-label="Phân trang báo cáo">
          <button type="button" className="button-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Trước</button>
          <span>Trang {page + 1}</span>
          <button type="button" className="button-secondary" disabled={(page + 1) * 20 >= queue.data.totalElements}
            onClick={() => setPage(page + 1)}>Sau</button>
        </nav></>}
  </section>;
}

function ReportCard({ report, onDone }: { report: ReviewReport; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const decision = useMutation({ mutationFn: (action: 'HIDE' | 'DISMISS') => decideReviewReport(report.id, action, reason.trim()),
    onSuccess: () => { setNotice('Đã lưu quyết định.'); onDone(); } });
  const valid = [...reason.trim()].length >= 10 && [...reason.trim()].length <= 500;
  return <>
    <p className="font-semibold">Sách {report.bookId} · {report.ratingSnapshot}/5</p>
    <p className="mt-2 whitespace-pre-wrap break-words">{report.bodySnapshot}</p>
    <p className="mt-3">Lý do báo cáo: {report.reason}</p>
    <p className="text-sm text-muted">Gửi lúc {new Date(report.createdAt).toLocaleString('vi-VN')} · Trạng thái: {report.status === 'OPEN' ? 'Chờ xử lý' : 'Đã xử lý'}</p>
    {report.status === 'OPEN' && <div className="mt-4">
      <label className="field">Lý do quyết định<textarea rows={2} maxLength={500} value={reason}
        onChange={event => setReason(event.target.value)} disabled={decision.isPending}/></label>
      <p className="text-sm text-muted">Nêu cơ sở quyết định, 10–500 ký tự.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="button-primary" disabled={!valid || decision.isPending}
          onClick={() => decision.mutate('HIDE')}>Ẩn đánh giá</button>
        <button type="button" className="button-secondary" disabled={!valid || decision.isPending}
          onClick={() => decision.mutate('DISMISS')}>Bỏ qua báo cáo</button>
      </div>
      {decision.isError && <LibraryError error={decision.error} retry={() => decision.reset()}/>}
    </div>}
    {notice && <p role="status">{notice}</p>}
  </>;
}
