import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { statusLabels } from '../members/member-api';
import { MemberRequestError } from '../members/MemberRequestError';
import { ApiError } from '../../shared/api/client';
import { changeAccountRole, changeAccountStatus, getAccountAudit, getAccountDetail, listAccounts,
  type AdminRole } from './accounts-api';
import { AdminDetailDrawer } from './AdminDetailDrawer';
import { AdminConfirmationDialog } from './AdminConfirmationDialog';

const roleLabels = { READER: 'Người đọc', LIBRARIAN: 'Thủ thư', ADMIN: 'Quản trị viên' };
type AccountAction = { kind: 'status'; status: 'ACTIVE' | 'LOCKED' }
  | { kind: 'role'; role: AdminRole; grant: boolean };

export function AdminAccountsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState<AccountAction | null>(null);
  const closeDrawer = useCallback(() => setSelected(null), []);
  const accounts = useQuery({ queryKey: ['admin-accounts', query, status, page],
    queryFn: ({ signal }) => listAccounts(query, status, page, signal), retry: false });
  const detail = useQuery({ queryKey: ['admin-account', selected],
    queryFn: ({ signal }) => getAccountDetail(selected!, signal), enabled: !!selected, retry: false });
  const audit = useQuery({ queryKey: ['admin-account-audit', selected],
    queryFn: ({ signal }) => getAccountAudit(selected!, signal), enabled: !!selected, retry: false });
  const mutation = useMutation({ mutationFn: async (action: { kind: 'status'; status: 'ACTIVE' | 'LOCKED' }
    | { kind: 'role'; role: AdminRole; grant: boolean }) => {
    if (!selected || !detail.data) throw new Error('Chưa chọn tài khoản.');
    return action.kind === 'status'
      ? changeAccountStatus(selected, detail.data.version, action.status, reason)
      : changeAccountRole(selected, detail.data.version, action.role, action.grant, reason);
  }, onSuccess: async () => {
    setReason(''); setNotice('Đã lưu thay đổi và thu hồi phiên cũ của tài khoản.');
    setConfirmation(null);
    await Promise.all([client.invalidateQueries({ queryKey: ['admin-accounts'] }),
      client.invalidateQueries({ queryKey: ['admin-account', selected] }),
      client.invalidateQueries({ queryKey: ['admin-account-audit', selected] })]);
    if (selected === user?.id) { await logout(); navigate('/dang-nhap', { replace: true }); }
  }, onError: error => {
    setNotice(error instanceof ApiError ? error.message : 'Chưa lưu được thay đổi. Vui lòng thử lại.');
    if (error instanceof ApiError && error.status === 409) {
      setConfirmation(null);
      void detail.refetch();
    }
  } });
  const closeConfirmation = () => {
    setConfirmation(null);
    mutation.reset();
  };
  const submit = (event: FormEvent) => { event.preventDefault(); setPage(0); setQuery(input.trim()); setNotice(''); };
  const act = (action: AccountAction) => { setNotice(''); mutation.reset(); setConfirmation(action); };

  return <section aria-labelledby="admin-accounts-heading">
    <p className="eyebrow">Quản trị</p><h1 id="admin-accounts-heading" className="page-title">Tài khoản và phân quyền</h1>
    <p className="mt-2 text-muted">Mọi thay đổi cần lý do và được ghi lại. Tài khoản bị đổi quyền hoặc khóa phải đăng nhập lại.</p>
    <form onSubmit={submit} className="mt-5 flex flex-wrap items-end gap-3">
      <label className="field">Tên, mã hoặc email<input value={input} maxLength={150} onChange={event => setInput(event.target.value)}/></label>
      <label className="field">Trạng thái<select value={status} onChange={event => { setStatus(event.target.value); setPage(0); }}>
        <option value="">Tất cả</option><option value="ACTIVE">Đang hoạt động</option>
        <option value="LOCKED">Đã khóa</option><option value="DISABLED">Ngừng sử dụng</option>
      </select></label><button className="button-primary" type="submit">Tìm tài khoản</button>
    </form>
    {notice && <p role="status" className="account-notice">{notice}</p>}
    {accounts.isPending ? <p role="status" className="py-8">Đang tải tài khoản…</p>
      : accounts.isError ? <MemberRequestError error={accounts.error} retry={() => void accounts.refetch()}/>
        : <><p className="my-4 text-sm text-muted">{accounts.data.totalElements} tài khoản</p>
          <div className="member-table-wrap" tabIndex={0} role="region" aria-label="Danh sách tài khoản">
            <table className="member-table"><thead><tr><th>Mã</th><th>Họ tên</th><th>Email</th><th>Trạng thái</th><th></th></tr></thead>
              <tbody>{accounts.data.items.map(account => <tr key={account.id}>
                <td>{account.memberCode}</td><td>{account.fullName}</td><td>{account.email}</td>
                <td>{statusLabels[account.status]}</td><td><button type="button" className="text-link"
                  onClick={() => { setSelected(account.id); setNotice(''); }}>Chi tiết</button></td>
              </tr>)}</tbody></table>
          </div>
          <nav className="mt-4 flex gap-3" aria-label="Phân trang tài khoản">
            <button type="button" className="button-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>Trước</button>
            <span>Trang {page + 1}</span><button type="button" className="button-secondary"
              disabled={(page + 1) * 20 >= accounts.data.totalElements} onClick={() => setPage(page + 1)}>Sau</button>
          </nav></>}
    {selected && <AdminDetailDrawer title="Hồ sơ quản trị" onClose={closeDrawer}>
      {detail.isPending ? <p>Đang tải chi tiết…</p>
        : detail.isError ? <MemberRequestError error={detail.error} retry={() => void detail.refetch()}/>
          : <><h2>{detail.data.fullName}</h2><p>{detail.data.memberCode} · {detail.data.email}</p>
            <p>Trạng thái: {statusLabels[detail.data.status]} · Phiên bản: {detail.data.version}</p>
            <p>Vai trò: {detail.data.roles.map(role => roleLabels[role]).join(', ')}</p>
            <label className="field mt-4">Lý do thay đổi<input value={reason} minLength={5} maxLength={250}
              onChange={event => setReason(event.target.value)} placeholder="Ví dụ: phân công trực quầy"/></label>
            <div className="mt-4 flex flex-wrap gap-2">
              {detail.data.status === 'ACTIVE' && <button type="button" className="button-secondary"
                disabled={mutation.isPending || reason.trim().length < 5}
                onClick={() => act({ kind: 'status', status: 'LOCKED' })}>Khóa tài khoản</button>}
              {detail.data.status === 'LOCKED' && <button type="button" className="button-secondary"
                disabled={mutation.isPending || reason.trim().length < 5}
                onClick={() => act({ kind: 'status', status: 'ACTIVE' })}>Mở khóa</button>}
              {(['READER', 'LIBRARIAN', 'ADMIN'] as const).map(role => <button type="button" key={role}
                className="button-secondary" disabled={mutation.isPending || reason.trim().length < 5}
                onClick={() => act({ kind: 'role', role, grant: !detail.data.roles.includes(role) })}>
                {detail.data.roles.includes(role) ? 'Thu hồi' : 'Cấp'} {roleLabels[role]}</button>)}
            </div>
            <h3 className="mt-6">Lịch sử thay đổi</h3>
            {audit.isPending ? <p role="status">Đang tải lịch sử…</p> : audit.isError
              ? <MemberRequestError error={audit.error} retry={() => void audit.refetch()}/>
              : audit.data.length === 0 ? <p>Chưa có thay đổi quản trị.</p>
                : <ol className="admin-audit-timeline">{audit.data.map(entry => <li key={entry.id}>
                  <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</time>
                  <strong>{entry.action === 'STATUS' ? 'Thay đổi trạng thái' : entry.action === 'ROLE_GRANT' ? 'Cấp vai trò' : 'Thu hồi vai trò'}</strong>
                    <span>{entry.beforeValue} → {entry.afterValue}</span>
                    <span>Người thực hiện: {entry.actorId}</span><p>{entry.reason}</p></li>)}</ol>}
          </>}
    </AdminDetailDrawer>}
    {confirmation && <AdminConfirmationDialog
      title={confirmation.kind === 'status'
        ? confirmation.status === 'LOCKED' ? 'Khóa tài khoản?' : 'Mở khóa tài khoản?'
        : `${confirmation.grant ? 'Cấp' : 'Thu hồi'} vai trò ${roleLabels[confirmation.role]}?`}
      description="Thao tác sẽ được ghi lại cùng lý do và có thể thu hồi các phiên đăng nhập hiện tại."
      confirmLabel={confirmation.kind === 'status'
        ? confirmation.status === 'LOCKED' ? 'Xác nhận khóa' : 'Xác nhận mở khóa'
        : `Xác nhận ${confirmation.grant ? 'cấp' : 'thu hồi'}`}
      busy={mutation.isPending}
      error={mutation.isError ? notice : ''}
      onCancel={closeConfirmation}
      onConfirm={() => mutation.mutate(confirmation)}/>}
  </section>;
}
