import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { ReferencePicker } from '../catalog/ReferencePicker';
import { getReport, downloadReport, reportParams, type ReportQuery } from './report-api';
import { CirculationError } from './CirculationStates';
import { formatTime } from './circulation-labels';

export function CirculationReportPage() {
  const { user } = useAuth(); return user ? <Report key={user.id} owner={user.id}/> : null;
}
function Report({ owner }: { owner: string }) {
  const [draft, setDraft] = useState<ReportQuery>({ from: '', to: '', timezone: 'Asia/Ho_Chi_Minh', branchId: '' });
  const [query, setQuery] = useState<ReportQuery | null>(null); const [validation, setValidation] = useState('');
  const [downloading, setDownloading] = useState(false); const [downloadError, setDownloadError] = useState<Error | null>(null);
  const abort = useRef<AbortController | null>(null); const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; abort.current?.abort(); }; }, []);
  const report = useQuery({ queryKey: ['circulation', owner, 'report', query], queryFn: ({ signal }) => getReport(query!, signal), enabled: !!query, retry: false });
  const exportCsv = async () => {
    if (!query || abort.current) return;
    const controller = new AbortController(); abort.current = controller; setDownloading(true); setDownloadError(null);
    try {
      const blob = await downloadReport(query, controller.signal);
      if (controller.signal.aborted || !live.current) return;
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = `luu-thong-${query.from}-${query.to}.csv`; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { if (live.current && !controller.signal.aborted) setDownloadError(error instanceof Error ? error : new Error('Không tải được CSV.')); }
    finally { abort.current = null; if (live.current) setDownloading(false); }
  };
  return <section><Link className="text-link" to="/nhan-vien/luu-thong">← Quầy lưu thông</Link><h1 className="page-title my-4">Báo cáo mượn theo chi nhánh</h1>
    <p className="text-muted my-3">Chọn những lượt bắt đầu mượn trong kỳ, rồi xem trạng thái của chúng tại lúc đọc. Số đã trả không phải số lần trả phát sinh trong kỳ.</p>
    <form className="editorial-card my-5" onSubmit={e => { e.preventDefault(); try { reportParams(draft); setValidation(''); setQuery({ ...draft }); setDownloadError(null); } catch (error) { setValidation((error as Error).message); } }}>
      <fieldset disabled={downloading} className="grid gap-4 md:grid-cols-2">
        <label className="field">Từ ngày (bao gồm)<input type="date" required value={draft.from} onChange={e => setDraft({ ...draft, from: e.target.value })}/></label>
        <label className="field">Đến ngày (không bao gồm)<input type="date" required value={draft.to} onChange={e => setDraft({ ...draft, to: e.target.value })}/></label>
        <label className="field">Múi giờ<select value={draft.timezone} onChange={e => setDraft({ ...draft, timezone: e.target.value as ReportQuery['timezone'] })}><option value="Asia/Ho_Chi_Minh">Việt Nam (UTC+7)</option><option value="UTC">UTC</option></select></label>
        <ReferencePicker label="Chi nhánh báo cáo" resource="branches" value={draft.branchId ? [draft.branchId] : []} onChange={ids => setDraft({ ...draft, branchId: ids[0] ?? '' })}/>
        <button className="button-primary" type="submit">Xem báo cáo</button>
      </fieldset>
      <p className="text-sm my-3">Không chọn chi nhánh để xem toàn hệ thống. Tối đa 366 ngày và 10.000 nhóm ngày/chi nhánh.</p>
      {validation && <p role="alert">{validation}</p>}
    </form>
    {query && (report.isPending ? <p role="status">Đang tổng hợp báo cáo…</p> : report.isError ? <CirculationError error={report.error} reload={() => void report.refetch()}/>
      : <section aria-label="Kết quả báo cáo">
        <p className="my-3">Từ {query.from} đến trước {query.to} · {report.data.timezone} · Cập nhật {formatTime(report.data.asOf)}</p>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 my-4">{[
          ['Bắt đầu mượn', report.data.totals.borrowed], ['Còn đang mượn', report.data.totals.active], ['Đã trả', report.data.totals.returned], ['Quá hạn (thuộc đang mượn)', report.data.totals.overdue],
        ].map(([label, count]) => <div className="editorial-card" key={label}><dt>{label}</dt><dd className="text-2xl font-semibold mt-3">{count}</dd></div>)}</dl>
        <button className="button-secondary my-3" disabled={downloading} onClick={() => void exportCsv()}>{downloading ? 'Đang tải CSV…' : 'Tải CSV theo bộ lọc này'}</button>
        <p className="text-sm text-muted">CSV được đọc lại khi tải, có thể khác bảng nếu giao dịch vừa thay đổi. File không chứa danh tính người mượn.</p>
        {downloadError && <CirculationError error={downloadError}/>}
        {!report.data.items.length ? <p className="my-4">Không có lượt bắt đầu mượn trong khoảng này.</p> : <div className="overflow-x-auto my-5"><table className="w-full text-left">
          <thead><tr>{['Ngày mượn', 'Chi nhánh', 'Bắt đầu mượn', 'Đang mượn', 'Đã trả', 'Quá hạn'].map(label => <th className="p-3" key={label}>{label}</th>)}</tr></thead>
          <tbody>{report.data.items.map(row => <tr key={`${row.date}:${row.branchId}`}><td className="p-3 whitespace-nowrap">{row.date}</td><td className="p-3">{row.branchName}</td>
            <td className="p-3">{row.borrowed}</td><td className="p-3">{row.active}</td><td className="p-3">{row.returned}</td><td className="p-3">{row.overdue}</td></tr>)}</tbody>
        </table></div>}
      </section>)}
  </section>;
}
