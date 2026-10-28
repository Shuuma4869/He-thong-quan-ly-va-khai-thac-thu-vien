import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { getCatalogItem } from '../catalog/catalog-api';
import { copyLabels, formatTime } from '../circulation/circulation-labels';
import { ApiError } from '../../shared/api/client';
import { InventoryError, InventoryPagination } from './InventoryStates';
import { anomalyLabels, sessionLabels } from './inventory-labels';
import { addScan, closeSession, getSession, listAnomalies, listScans, listSnapshot, resolveAnomaly,
  type InventoryAnomaly, type InventorySession } from './inventory-api';
import { ShelfPicker } from './ShelfPicker';
import { useInventoryCommand } from './use-inventory-command';
import { InventoryLocation, ShelfName } from './InventoryLocation';
import { CameraBarcodeScanner } from './CameraBarcodeScanner';

export function InventorySessionPage() {
  const { user } = useAuth();
  const { sessionId } = useParams();
  return user && sessionId ? <SessionView key={`${user.id}:${sessionId}`} owner={user.id} id={sessionId}/> : null;
}
function SessionView({ owner, id }: { owner: string; id: string }) {
  const [scanPending, setScanPending] = useState(false);
  const [closePending, setClosePending] = useState(false);
  const session = useQuery({ queryKey: ['inventory', owner, 'session', id],
    queryFn: ({ signal }) => getSession(id, signal), retry: false });
  if (session.isPending) return <p role="status">Đang tải phiên kiểm kê…</p>;
  if (session.isError) return <InventoryError error={session.error} reload={() => void session.refetch()}/>;
  const value = session.data;
  return <section><Link className="text-link" to="/nhan-vien/kiem-ke">← Các phiên kiểm kê</Link>
    <div className="flex flex-wrap items-center justify-between gap-3 my-4"><h1 className="page-title">Phiên kiểm kê</h1>
      <span className="font-semibold">{sessionLabels[value.status]}</span></div>
    <div className="editorial-card my-5"><p className="break-all">Mã phiên: {value.id}</p>
      <p className="my-2"><InventoryLocation owner={owner} branchId={value.branchId} shelfId={value.shelfId}/></p>
      <p>Mở {formatTime(value.openedAt)} · {value.snapshotCount} bản trong snapshot · {value.scanCount} lượt quét · phiên bản {value.version}</p>
      {value.closedAt && <p className="mt-2">Đóng {formatTime(value.closedAt)}{value.closeReason ? ` · ${value.closeReason}` : ''}</p>}</div>
    {value.status === 'OPEN' && <><ScanForm owner={owner} session={value} blocked={closePending} onPendingChange={setScanPending}/>
      <CloseForm owner={owner} session={value} blocked={scanPending} onPendingChange={setClosePending}/></>}
    {value.status === 'FINALIZED' && <AnomalyList owner={owner} id={id}/>}
    <div className="grid gap-6 lg:grid-cols-2 my-8"><ScanList owner={owner} id={id}/><SnapshotList owner={owner} id={id}/></div>
  </section>;
}
function ScanForm({ owner, session, blocked, onPendingChange }: {
  owner: string; session: InventorySession; blocked: boolean; onPendingChange: (pending: boolean) => void;
}) {
  const client = useQueryClient();
  const [barcode, setBarcode] = useState('');
  const [shelfId, setShelfId] = useState(session.shelfId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [last, setLast] = useState('');
  const [offlineQueue, setOfflineQueue] = useState<{ id: string; barcode: string; shelfId: string; versionSeen: number }[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [versionConflict, setVersionConflict] = useState(false);
  const [confirmedVersion, setConfirmedVersion] = useState(false);
  const [queueMessage, setQueueMessage] = useState('');
  const [online, setOnline] = useState(() => navigator.onLine);
  const pending = useRef<{ id: string; barcode: string; shelfId: string } | null>(null);
  const sending = useRef(false);
  const barcodeInput = useRef<HTMLInputElement>(null);
  const uncertain = !!error && (!(error instanceof ApiError) || error.status === 0 || error.status >= 500);
  useEffect(() => { const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update); window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  useEffect(() => { if (last && !busy && !uncertain) barcodeInput.current?.focus(); }, [last, busy, uncertain]);
  const submit = async () => {
    if (blocked || offlineQueue.length || sending.current || (!pending.current && (!barcode.trim() || !shelfId))) return;
    sending.current = true; onPendingChange(true); setBusy(true); setError(null);
    if (!pending.current) pending.current = { id: crypto.randomUUID(), barcode: barcode.trim(), shelfId };
    try {
      const result = await addScan(session.id, pending.current.barcode, pending.current.shelfId, pending.current.id);
      setLast(`${result.barcode} · nhận lúc ${formatTime(result.receivedAt)}`);
      setBarcode(''); pending.current = null;
      onPendingChange(false);
      await client.cancelQueries({ queryKey: ['inventory', owner] });
      await client.invalidateQueries({ queryKey: ['inventory', owner] });
    } catch (failure) {
      const issue = failure instanceof Error ? failure : new Error('Không nhận được biên nhận quét.');
      setError(issue);
      if (issue instanceof ApiError && issue.status >= 400 && issue.status < 500) {
        pending.current = null; onPendingChange(false);
      }
    } finally { sending.current = false; setBusy(false); }
  };
  const queueScan = () => {
    const value = barcode.trim();
    if (blocked || busy || uncertain || !value || !shelfId || offlineQueue.length >= 20) return;
    setOfflineQueue(items => [...items, { id: crypto.randomUUID(), barcode: value, shelfId, versionSeen: session.version }]);
    setBarcode(''); setQueueMessage('Mã chỉ lưu tạm trong cửa sổ này. Kiểm tra và đồng bộ khi có mạng trước khi chốt phiên.');
    onPendingChange(true);
  };
  const syncQueue = async () => {
    if (!online || !offlineQueue.length || blocked || sending.current || syncing || uncertain) return;
    sending.current = true; setSyncing(true); setQueueMessage('');
    try {
      const latest = await getSession(session.id);
      if (latest.status !== 'OPEN' || latest.branchId !== session.branchId) {
        setQueueMessage('Phiên đã đóng hoặc đổi phạm vi. Không gửi các mã đang chờ; liên hệ người phụ trách kiểm kê.'); return;
      }
      if (latest.version !== offlineQueue[0].versionSeen && !confirmedVersion) {
        setVersionConflict(true);
        setQueueMessage('Phiên đã có thay đổi từ lúc lưu mã. Đọc lại lượt quét, sau đó xác nhận trước khi đồng bộ.'); return;
      }
      setVersionConflict(false); setConfirmedVersion(false);
      for (const item of offlineQueue) {
        await addScan(session.id, item.barcode, item.shelfId, item.id);
        setOfflineQueue(items => items.filter(row => row.id !== item.id));
      }
      setQueueMessage('Đã đồng bộ hết các mã đang chờ.');
      onPendingChange(false);
      await client.invalidateQueries({ queryKey: ['inventory', owner] });
    } catch (failure) {
      setQueueMessage(failure instanceof ApiError && failure.status === 409
        ? 'Có xung đột với phiên hoặc kệ. Không tự ghi đè; kiểm tra lại phiên và từng mã trước khi thử tiếp.'
        : 'Chưa nhận được biên nhận cho mã đầu hàng đợi. Thử lại giữ nguyên mã yêu cầu, không chốt phiên.');
    } finally { sending.current = false; setSyncing(false); }
  };
  return <section className="editorial-card my-6" aria-label="Quét mã vạch"><h2 className="section-title">Quét bản sách</h2>
    <p className="text-sm text-muted my-2">Mỗi lần quét tạo một biên nhận. Khi chưa rõ máy chủ đã ghi nhận hay chưa, thử lại cùng yêu cầu đang chờ.</p>
    {blocked && <p className="text-sm my-2">Đang xác minh lệnh đóng phiên; chưa nhận scan mới.</p>}
    <CameraBarcodeScanner disabled={blocked || busy || uncertain || syncing} onDetected={setBarcode}/>
    {!session.shelfId && <ShelfPicker owner={owner} branchId={session.branchId} value={shelfId} onChange={setShelfId} disabled={blocked || busy || uncertain}/>}
    <form className="flex flex-wrap items-end gap-3 my-4" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label className="field grow">Mã vạch<input ref={barcodeInput} autoComplete="off" autoFocus required maxLength={100} value={barcode}
        disabled={blocked || busy || uncertain || syncing} onChange={event => setBarcode(event.target.value)}/></label>
      <button className="button-primary" type="submit" disabled={blocked || busy || offlineQueue.length > 0 || (!uncertain && (!barcode.trim() || !shelfId))}>
        {busy ? 'Đang ghi scan…' : uncertain ? 'Thử lại scan đang chờ' : 'Ghi nhận scan'}</button></form>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="button-secondary" disabled={blocked || busy || uncertain || syncing || !barcode.trim() || !shelfId || offlineQueue.length >= 20}
        onClick={queueScan}>Lưu mã tạm thời</button>
      {offlineQueue.length > 0 && <button type="button" className="button-secondary" disabled={!online || syncing || uncertain}
        onClick={() => void syncQueue()}>{syncing ? 'Đang đồng bộ…' : 'Kiểm tra và đồng bộ'}</button>}
    </div>
    {offlineQueue.length > 0 && <section aria-label="Mã chờ đồng bộ" className="mt-4">
      <p>{offlineQueue.length} mã đang chờ trong cửa sổ này. {online ? 'Đã có mạng.' : 'Đang offline.'} Không thể chốt phiên trước khi xử lý hết.</p>
      {versionConflict && <label className="flex items-start gap-2 my-2"><input type="checkbox" checked={confirmedVersion}
        onChange={event => setConfirmedVersion(event.target.checked)}/>
        <span>Tôi đã xem lại phiên và các lượt quét mới; tiếp tục gửi các mã đang chờ.</span></label>}
      <ul className="mt-2 space-y-2">{offlineQueue.map(item => <li key={item.id} className="flex flex-wrap items-center gap-2">
        <span>{item.barcode}</span><button type="button" className="text-link" disabled={syncing}
          onClick={() => { setOfflineQueue(items => items.filter(row => row.id !== item.id));
            if (offlineQueue.length === 1) { onPendingChange(false); setVersionConflict(false); } }}>Bỏ mã</button>
      </li>)}</ul>
    </section>}
    {queueMessage && <p role="status" className="mt-3 text-sm">{queueMessage}</p>}
    {last && <p role="status">Đã nhận: {last}</p>}
    {error && <InventoryError error={error} reload={() => void client.invalidateQueries({ queryKey: ['inventory', owner] })}/>}
  </section>;
}
function CloseForm({ owner, session, blocked, onPendingChange }: {
  owner: string; session: InventorySession; blocked: boolean; onPendingChange: (pending: boolean) => void;
}) {
  const [mode, setMode] = useState<'finalize' | 'cancel'>('finalize');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const command = useInventoryCommand(owner, JSON.stringify([session.id, session.version, mode, reason]),
    requestId => closeSession(session.id, session.version, reason, requestId, mode === 'cancel'));
  const locked = command.busy || command.uncertain;
  useEffect(() => { onPendingChange(locked); }, [locked, onPendingChange]);
  return <form className="editorial-card my-6" onSubmit={event => {
    event.preventDefault(); if (blocked || !confirmed || mode === 'cancel' && !reason.trim()) return;
    onPendingChange(true); void command.run();
  }}><h2 className="section-title">Đóng phiên</h2>
    <p className="text-sm text-muted my-2">Gửi hết lượt quét trước khi chốt. Chốt sẽ tạo bằng chứng bất thường và không nhận scan mới; hủy giữ snapshot/scan nhưng không tạo bất thường.</p>
    {blocked && <p className="text-sm my-2">Scan còn chờ biên nhận; kiểm tra hoặc thử lại scan trước khi đóng phiên.</p>}
    <div className="flex flex-wrap gap-4 my-3"><label><input type="radio" name="close-mode" checked={mode === 'finalize'} disabled={blocked || locked}
      onChange={() => { setMode('finalize'); setConfirmed(false); }}/> Chốt và đối chiếu</label>
      <label><input type="radio" name="close-mode" checked={mode === 'cancel'} disabled={blocked || locked}
        onChange={() => { setMode('cancel'); setConfirmed(false); }}/> Hủy phiên</label></div>
    <label className="field">{mode === 'cancel' ? 'Lý do hủy (bắt buộc)' : 'Ghi chú khi chốt (nếu có)'}
      <textarea value={reason} maxLength={500} required={mode === 'cancel'} disabled={blocked || locked}
        onChange={event => setReason(event.target.value)}/></label>
    <label className="flex items-start gap-2 my-4"><input type="checkbox" checked={confirmed} disabled={blocked || locked}
      onChange={event => setConfirmed(event.target.checked)}/>
      <span>Đã kiểm tra các lượt quét và xác nhận {mode === 'cancel' ? 'hủy' : 'chốt'} phiên này.</span></label>
    <button className="button-primary" disabled={blocked || !confirmed || command.busy || !!command.result || (mode === 'cancel' && !reason.trim())}>
      {command.busy ? 'Đang đóng phiên…' : command.uncertain ? 'Thử lại cùng yêu cầu' : mode === 'cancel' ? 'Hủy phiên' : 'Chốt phiên'}</button>
    {command.error && <InventoryError error={command.error}/>}
  </form>;
}
function ScanList({ owner, id }: { owner: string; id: string }) {
  const [page, setPage] = useState(0);
  const rows = useQuery({ queryKey: ['inventory', owner, 'scans', id, page],
    queryFn: ({ signal }) => listScans(id, page, signal), retry: false });
  return <section aria-label="Lượt quét"><h2 className="section-title">Lượt quét đã nhận</h2>
    {rows.isPending ? <p role="status">Đang tải scan…</p> : rows.isError ? <InventoryError error={rows.error} reload={() => void rows.refetch()}/>
      : <>{!rows.data.items.length && <p className="my-3">Chưa có scan.</p>}
        <ul className="my-3 space-y-2">{rows.data.items.map(row => <li className="editorial-card" key={row.id}>
          <strong>{row.barcode}</strong><p className="text-sm"><ShelfName owner={owner} id={row.shelfId}/> · {formatTime(row.receivedAt)}</p></li>)}</ul>
        <InventoryPagination page={rows.data.page} onChange={setPage}/></>}
  </section>;
}
function SnapshotList({ owner, id }: { owner: string; id: string }) {
  const [page, setPage] = useState(0);
  const rows = useQuery({ queryKey: ['inventory', owner, 'snapshot', id, page],
    queryFn: ({ signal }) => listSnapshot(id, page, signal), retry: false });
  return <section aria-label="Bản chụp"><h2 className="section-title">Bản chụp khi mở phiên</h2>
    {rows.isPending ? <p role="status">Đang tải bản chụp…</p> : rows.isError ? <InventoryError error={rows.error} reload={() => void rows.refetch()}/>
      : <>{!rows.data.items.length && <p className="my-3">Phạm vi này không có bản sách lúc mở phiên.</p>}
        <ul className="my-3 space-y-2">{rows.data.items.map(row => <li className="editorial-card" key={row.id}>
          <strong>{row.barcode}</strong><p className="text-sm"><ShelfName owner={owner} id={row.shelfId}/> · {copyLabels[row.status] ?? row.status} · phiên bản {row.version}</p></li>)}</ul>
        <InventoryPagination page={rows.data.page} onChange={setPage}/></>}
  </section>;
}
function AnomalyList({ owner, id }: { owner: string; id: string }) {
  const [page, setPage] = useState(0);
  const rows = useQuery({ queryKey: ['inventory', owner, 'anomalies', id, page],
    queryFn: ({ signal }) => listAnomalies(id, page, signal), retry: false });
  return <section className="my-8" aria-label="Bất thường kiểm kê"><h2 className="section-title">Bằng chứng cần rà soát</h2>
    <p className="text-sm text-muted my-2">Bằng chứng chỉ phản ánh lúc chốt phiên. Kiểm tra bản sách hiện tại trước khi quyết định xử lý.</p>
    {rows.isPending ? <p role="status">Đang tải bất thường…</p> : rows.isError ? <InventoryError error={rows.error} reload={() => void rows.refetch()}/>
      : <>{!rows.data.items.length && <p className="my-3">Không phát hiện bất thường trong phiên này.</p>}
        <div className="grid gap-4 md:grid-cols-2 my-4">{rows.data.items.map(row => <AnomalyCard key={row.id} row={row} owner={owner} sessionId={id}/>)}</div>
        <InventoryPagination page={rows.data.page} onChange={setPage}/></>}
  </section>;
}
function AnomalyCard({ row, owner, sessionId }: { row: InventoryAnomaly; owner: string; sessionId: string }) {
  const { scan, snapshot, current } = row.evidence;
  return <article className="editorial-card"><h3 className="font-semibold">{anomalyLabels[row.kind]}</h3>
    <p className="text-sm my-2">Mã vạch: {scan?.barcode ?? snapshot?.barcode ?? current?.barcode ?? 'Không rõ'}</p>
    {scan && <p className="text-sm">Quét tại <ShelfName owner={owner} id={scan.shelfId}/> · {formatTime(scan.scannedAt)}</p>}
    {snapshot && <p className="text-sm">Lúc mở: <ShelfName owner={owner} id={snapshot.shelfId}/> · {copyLabels[snapshot.status] ?? snapshot.status} · phiên bản {snapshot.version}</p>}
    {current && <p className="text-sm">Lúc đối chiếu: <ShelfName owner={owner} id={current.shelfId}/> · {copyLabels[current.status] ?? current.status} · phiên bản {current.version}</p>}
    {row.evidence.firstScanId && <p className="text-sm break-all">Scan đầu: {row.evidence.firstScanId}</p>}
    {row.resolution ? <p className="mt-4 border-t border-line pt-3 text-sm">
      {row.resolution.action === 'MOVE_TO_SCANNED_SHELF' ? 'Đã chuyển về kệ quét' : 'Đã ghi nhận rà soát'}
      {' · '}{formatTime(row.resolution.resolvedAt)} · {row.resolution.reason}</p>
      : <ResolutionForm owner={owner} sessionId={sessionId} row={row}/>}
  </article>;
}
function ResolutionForm({ owner, sessionId, row }: { owner: string; sessionId: string; row: InventoryAnomaly }) {
  const [action, setAction] = useState<'REVIEWED' | 'MOVE_TO_SCANNED_SHELF'>('REVIEWED');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const current = useQuery({ queryKey: ['catalog', owner, 'copies', 'item', row.copyId],
    queryFn: ({ signal }) => getCatalogItem('copies', row.copyId!, signal), enabled: !!row.copyId, retry: false });
  const missing = current.isError && current.error instanceof ApiError && current.error.status === 404;
  const live = current.data && 'version' in current.data ? current.data : null;
  const seen = live?.version ?? null;
  const moveAllowed = !!live && (row.kind === 'WRONG_SHELF' || row.kind === 'WRONG_BRANCH')
    && !!row.evidence.scan && !!row.evidence.current && row.evidence.current.version === seen
    && row.evidence.scan.barcode === live.barcode && row.evidence.scan.shelfId !== live.shelfId
    && !['ON_LOAN', 'ON_HOLD'].includes(live.status);
  const command = useInventoryCommand(owner, JSON.stringify([sessionId, row.id, action, reason, seen]),
    requestId => resolveAnomaly(sessionId, row.id, action, reason, seen, requestId));
  const locked = command.busy || command.uncertain;
  return <form className="mt-4 border-t border-line pt-3" onSubmit={event => {
    event.preventDefault(); if (confirmed && reason.trim() && (action === 'REVIEWED' || moveAllowed)) void command.run();
  }}><h4 className="font-semibold">Rà soát bất thường</h4>
    {row.copyId && (current.isPending ? <p role="status">Đang kiểm tra bản sách hiện tại…</p>
      : missing ? <p className="text-sm my-2">Bản sách không còn trong danh mục; chỉ có thể ghi nhận đã rà soát.</p>
      : current.isError ? <InventoryError error={current.error} reload={() => void current.refetch()}/>
      : live ? <p className="text-sm my-2">Bản hiện tại: {copyLabels[live.status] ?? live.status} · kệ {live.shelfCode} · version {live.version}</p> : null)}
    {(!row.copyId || !!live || missing) && <><label className="field my-3">Cách xử lý<select value={action} disabled={locked}
      onChange={event => { setAction(event.target.value as 'REVIEWED' | 'MOVE_TO_SCANNED_SHELF'); setConfirmed(false); }}>
        <option value="REVIEWED">Ghi nhận đã rà soát, không đổi bản sách</option>
        {moveAllowed && <option value="MOVE_TO_SCANNED_SHELF">Chuyển bản sách về kệ đã quét</option>}
      </select></label>
      {!moveAllowed && (row.kind === 'WRONG_SHELF' || row.kind === 'WRONG_BRANCH') && <p className="text-sm text-muted my-2">
        Không thể chuyển kệ từ bằng chứng này khi bản sách đã đổi version, đang lưu thông hoặc kệ quét không còn khác vị trí hiện tại.</p>}
      <label className="field">Lý do và kết quả kiểm tra<textarea required maxLength={500} value={reason} disabled={locked}
        onChange={event => setReason(event.target.value)}/></label>
      <label className="flex items-start gap-2 my-3"><input type="checkbox" checked={confirmed} disabled={locked}
        onChange={event => setConfirmed(event.target.checked)}/>
        <span>Tôi đã kiểm tra bản sách hiện tại và xác nhận quyết định này.</span></label>
      <button type="submit" className="button-secondary" disabled={!confirmed || !reason.trim() || command.busy || !!command.result
        || (action === 'MOVE_TO_SCANNED_SHELF' && !moveAllowed)}>
        {command.busy ? 'Đang lưu…' : command.uncertain ? 'Thử lại cùng yêu cầu' : 'Lưu kết quả rà soát'}</button></>}
    {command.error && <InventoryError error={command.error}/>}
  </form>;
}
