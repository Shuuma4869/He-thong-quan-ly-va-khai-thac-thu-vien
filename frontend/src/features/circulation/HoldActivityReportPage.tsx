import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Download, History } from 'lucide-react';
import { useAuth } from '../auth/auth-context';
import { ReferencePicker } from '../catalog/ReferencePicker';
import { getCatalogItem, recordLabel } from '../catalog/catalog-api';
import { CirculationError } from './CirculationStates';
import { downloadHoldReport, eventLabels, getHoldReport, holdReportParams, localDate, type HoldReportQuery } from './hold-report-api';

export function HoldActivityReportPage() {
  const { user } = useAuth();
  return user ? <Report key={user.id} owner={user.id}/> : null;
}
function BranchName({ id, owner }: { id: string; owner: string }) {
  const branch = useQuery({ queryKey: ['report-branch', owner, id],
    queryFn: ({ signal }) => getCatalogItem('branches', id, signal), staleTime: 300_000, retry: false });
  return <span>{branch.data ? recordLabel(branch.data) : id}</span>;
}
function Report({ owner }: { owner: string }) {
  const [draft, setDraft] = useState<HoldReportQuery>({ from: '', to: '', branchId: '', bookId: '' });
  const [query, setQuery] = useState<HoldReportQuery | null>(null);
  const [validation, setValidation] = useState('');
  const [page, setPage] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<Error | null>(null);
  const abort = useRef<AbortController | null>(null);
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; abort.current?.abort(); }; }, []);
  const report = useQuery({ queryKey: ['hold-report', owner, query], queryFn: ({ signal }) => getHoldReport(query!, signal), enabled: !!query, retry: false });
  const exportCsv = async () => {
    if (!query || abort.current) return;
    const controller = new AbortController(); abort.current = controller; setDownloading(true); setDownloadError(null);
    try {
      const blob = await downloadHoldReport(query, controller.signal);
      if (!live.current || controller.signal.aborted) return;
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = `hoat-dong-giu-cho-${query.from}-${query.to}.csv`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { if (live.current && !controller.signal.aborted) setDownloadError(error instanceof Error ? error : new Error('Không tải được CSV.')); }
    finally { abort.current = null; if (live.current) setDownloading(false); }
  };
  const groups = report.data?.items ?? [];
  const totals = new Map<string, number>();
  for (const row of groups) totals.set(row.eventType, (totals.get(row.eventType) ?? 0) + row.eventCount);
  return <section className="operations-report" aria-labelledby="hold-report-heading">
    <header className="operations-heading"><div><p className="eyebrow">Dữ liệu vận hành · UTC+7</p>
      <h1 className="page-title" id="hold-report-heading">Hoạt động giữ chỗ</h1>
      <p>Theo dõi các sự kiện tạo, phân bổ, nhận, hủy và hết hạn của yêu cầu giữ chỗ.</p></div><History size={48} aria-hidden="true"/></header>
    <nav className="report-navigation" aria-label="Báo cáo thư viện"><Link to="/nhan-vien/bao-cao-luu-thong">Báo cáo mượn</Link><span aria-current="page">Hoạt động giữ chỗ</span></nav>
    <form className="editorial-card report-filter" onSubmit={event => {
      event.preventDefault();
      try { holdReportParams(draft); setValidation(''); setQuery({ ...draft }); setPage(0); setDownloadError(null); }
      catch (error) { setValidation((error as Error).message); }
    }}>
      <fieldset disabled={downloading} className="grid gap-4 md:grid-cols-2">
        <label className="field">Từ ngày (bao gồm)<input type="date" required value={draft.from} onChange={event => setDraft({ ...draft, from: event.target.value })}/></label>
        <label className="field">Đến ngày (không bao gồm)<input type="date" required value={draft.to} onChange={event => setDraft({ ...draft, to: event.target.value })}/></label>
        <ReferencePicker label="Chi nhánh" resource="branches" value={draft.branchId ? [draft.branchId] : []} onChange={ids => setDraft({ ...draft, branchId: ids[0] ?? '' })}/>
        <ReferencePicker label="Tác phẩm" resource="books" value={draft.bookId ? [draft.bookId] : []} onChange={ids => setDraft({ ...draft, bookId: ids[0] ?? '' })}/>
        <button className="button-primary" type="submit">Xem hoạt động giữ chỗ</button>
      </fieldset>
      <p className="account-help mt-4">Bỏ trống chi nhánh/tác phẩm để xem toàn hệ thống. Tối đa 6 tháng lịch theo UTC và 10.000 nhóm ngày/chi nhánh/sự kiện. Ngày trên báo cáo dùng giờ Việt Nam.</p>
      {validation && <p role="alert" className="my-3">{validation}</p>}
    </form>
    {!query && <p className="empty-message">Chọn kỳ báo cáo để tổng hợp lịch sử giữ chỗ.</p>}
    {query && (report.isPending ? <p role="status">Đang tổng hợp hoạt động giữ chỗ…</p>
      : report.isError ? <CirculationError error={report.error} reload={() => void report.refetch()}/>
        : <section aria-label="Kết quả hoạt động giữ chỗ">
          <div className="report-result-heading"><div><h2 className="section-title">{report.data.totalEvents.toLocaleString('vi-VN')} sự kiện</h2>
            <p>{localDate(query.from)} đến trước {localDate(query.to)} · {report.data.timezone}</p></div>
            <button className="button-secondary" disabled={downloading} onClick={() => void exportCsv()}><Download size={17}/>{downloading ? 'Đang tải CSV…' : 'Xuất CSV theo bộ lọc'}</button></div>
          <p className="account-help">Đây là số sự kiện, không phải số yêu cầu duy nhất hay số đang chờ hiện tại. CSV đọc lại dữ liệu lúc tải nên có thể khác bảng vừa xem.</p>
          {downloadError && <CirculationError error={downloadError}/>}
          <dl className="event-metrics">{Object.entries(eventLabels).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{(totals.get(key) ?? 0).toLocaleString('vi-VN')}</dd></div>)}</dl>
          {!groups.length ? <p className="empty-message">Không có sự kiện giữ chỗ trong khoảng thời gian và bộ lọc này.</p>
            : <><div className="report-table-scroll" role="region" aria-label="Bảng hoạt động giữ chỗ, cuộn ngang để xem đủ cột" tabIndex={0}>
              <table><caption>Nhóm theo ngày, chi nhánh và sự kiện · {groups.length.toLocaleString('vi-VN')} nhóm</caption>
                <thead><tr><th scope="col">Ngày</th><th scope="col">Chi nhánh</th><th scope="col">Sự kiện</th><th scope="col">Số lần</th></tr></thead>
                <tbody>{groups.slice(page * 50, (page + 1) * 50).map(row => <tr key={`${row.date}:${row.branchId}:${row.eventType}`}>
                  <td><time dateTime={row.date}>{localDate(row.date)}</time></td><td><BranchName id={row.branchId} owner={owner}/></td>
                  <td>{eventLabels[row.eventType] ?? row.eventType}</td><td>{row.eventCount.toLocaleString('vi-VN')}</td></tr>)}</tbody></table></div>
              <nav className="report-pagination" aria-label="Phân trang hoạt động giữ chỗ">
                <button className="button-secondary" disabled={!page} onClick={() => setPage(page - 1)}>Trước</button>
                <span aria-live="polite">Trang {page + 1}/{Math.ceil(groups.length / 50)} · 50 nhóm/trang</span>
                <button className="button-secondary" disabled={(page + 1) * 50 >= groups.length} onClick={() => setPage(page + 1)}>Sau</button>
              </nav></>}
        </section>)}
  </section>;
}
