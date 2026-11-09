import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react';
import { useBlocker } from 'react-router-dom';
import { Dialog } from '../components/Dialog';
import { DraftContext, type DraftState } from './unsaved-changes';

export function UnsavedChangesProvider({ children, enabled = true }: PropsWithChildren<{ enabled?: boolean }>) {
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [local, setLocal] = useState<{ id: string; action: () => void } | null>(null);
  const request = useCallback((id: string, action: () => void) => setLocal({ id, action }), []);
  const register = useCallback((id: string, state: DraftState | null) => {
    setDrafts(previous => {
      if (state) return { ...previous, [id]: state };
      if (!(id in previous)) return previous;
      const next = { ...previous }; delete next[id]; return next;
    });
  }, []);
  const active = Object.values(drafts).filter(item => item.dirty || item.busy || item.uncertain);
  const visible = local ? [drafts[local.id]].filter(Boolean) : active;
  const busy = visible.some(item => item.busy);
  const uncertain = visible.some(item => item.uncertain);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => enabled && active.length > 0
    && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search));
  const stay = useRef<HTMLButtonElement>(null);
  // Session expiry/logout must never be trapped behind a draft confirmation.
  useEffect(() => {
    if (blocker.state === 'blocked' && (!enabled || active.length === 0)) blocker.proceed();
  }, [blocker, enabled, active.length]);
  const context = useMemo(() => ({ register, request }), [register, request]);
  const cancel = () => { if (local) setLocal(null); else if (blocker.state === 'blocked') blocker.reset(); };
  const proceed = () => {
    if (local) { const action = local.action; setLocal(null); action(); }
    else if (blocker.state === 'blocked') blocker.proceed();
  };
  return <DraftContext.Provider value={context}>{children}
    {enabled && (local || blocker.state === 'blocked' && active.length > 0) &&
      <Dialog title={local ? 'Bỏ nội dung chưa hoàn tất?' : 'Rời trang khi chưa hoàn tất?'} initialFocus={stay} onClose={cancel}>
        <p>{busy ? 'Đang gửi yêu cầu. Hãy chờ kết quả trước khi tiếp tục.'
          : uncertain ? 'Chưa xác định được máy chủ đã ghi nhận yêu cầu hay chưa. Rời trang không hủy giao dịch; hãy kiểm tra lại dữ liệu trước khi gửi yêu cầu mới.'
            : local ? 'Nội dung đang nhập chưa được lưu. Thao tác này sẽ bỏ phần thay đổi đó.'
              : 'Nội dung đang nhập chưa được lưu. Rời trang sẽ bỏ phần thay đổi này.'}</p>
        <ul className="my-3">{[...new Set(visible.map(item => item.label))].map(label => <li key={label}>{label}</li>)}</ul>
        <div className="flex flex-wrap gap-3 mt-5">
          <button ref={stay} type="button" className="button-secondary" onClick={cancel}>Tiếp tục chỉnh sửa</button>
          <button type="button" className="button-primary" disabled={busy} onClick={proceed}>
            {uncertain ? 'Rời trang và kiểm tra lại sau' : local ? 'Bỏ thay đổi và tiếp tục' : 'Bỏ thay đổi và rời trang'}
          </button>
        </div>
      </Dialog>}
  </DraftContext.Provider>;
}
