import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useAuth } from '../auth/auth-context';
import { MemberRequestError } from './MemberRequestError';
import { decideHoldNoShow, getHoldReliability } from './hold-reliability-api';

const labels = { UNREVIEWED: 'Chưa rà soát', CONFIRMED: 'Đã xác nhận', EXCUSED: 'Đã miễn trừ' };
export function HoldReliabilityPanel({ readerId }: { readerId: string }) {
  const { user } = useAuth();
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['hold-reliability', readerId],
    queryFn: ({ signal }) => getHoldReliability(readerId, signal), retry: false });
  const decision = useMutation({ mutationFn: (value: { holdId: string; version: number; action: 'CONFIRMED' | 'EXCUSED' }) =>
    decideHoldNoShow(value.holdId, value.version, value.action, reason),
  onSuccess: data => { client.setQueryData(['hold-reliability', readerId], data); setReason('');
    setNotice('Đã lưu quyết định và lý do.'); },
  onError: () => { setNotice('Chưa lưu được quyết định. Tải lại để kiểm tra phiên bản trước khi thử tiếp.'); void query.refetch(); } });
  return <section className="account-panel mt-5" aria-label="Rà soát giữ chỗ hết hạn">
    <h2>Giữ chỗ hết hạn</h2>
    <p className="mt-2 text-muted">Chỉ lần hết hạn có sự kiện nghiệp vụ được liệt kê. Chưa rà soát không bị tính là vi phạm; hệ thống không tự hạn chế tài khoản.</p>
    {notice && <p role="status" className="account-notice">{notice}</p>}
    {query.isPending ? <p role="status">Đang tải lịch sử…</p> : query.isError
      ? <MemberRequestError error={query.error} retry={() => void query.refetch()}/>
      : <><p className="mt-3">Trong {Math.round((new Date(query.data.to).getTime() - new Date(query.data.from).getTime()) / 86_400_000)} ngày: {query.data.unreviewed} chưa rà soát, {query.data.confirmed} đã xác nhận, {query.data.excused} đã miễn trừ.</p>
        <p className="text-sm text-muted">Chính sách {query.data.policyVersion} · Mức tham khảo {query.data.advisoryLevel}. Không áp dụng giảm ưu tiên hoặc chặn giữ chỗ.</p>
        {!query.data.recentIncidents.length ? <p className="mt-3">Không có lần hết hạn trong khoảng này.</p>
          : <><label className="field mt-4">Lý do quyết định
            <input value={reason} minLength={10} maxLength={1000} onChange={event => setReason(event.target.value)}
              placeholder="Ghi căn cứ đã kiểm tra tại quầy"/>
          </label><ul className="mt-4 grid gap-3">{query.data.recentIncidents.map(item => <li key={item.holdId} className="editorial-card">
            <p>Yêu cầu {item.holdId} · Hết hạn {new Date(item.expiresAt).toLocaleString('vi-VN')}</p>
            <p>{labels[item.decision]}{item.reason ? ` · ${item.reason}` : ''}
              {item.decisionPolicyVersion ? ` · ${item.decisionPolicyVersion}` : ''}</p>
            {user?.roles.includes('ADMIN') && <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className="button-secondary" disabled={decision.isPending || reason.trim().length < 10}
                onClick={() => decision.mutate({ holdId: item.holdId, version: item.decisionVersion, action: 'CONFIRMED' })}>Xác nhận</button>
              <button type="button" className="button-secondary" disabled={decision.isPending || reason.trim().length < 10}
                onClick={() => decision.mutate({ holdId: item.holdId, version: item.decisionVersion, action: 'EXCUSED' })}>Miễn trừ</button>
            </div>}
          </li>)}</ul></>}
      </>}
  </section>;
}
