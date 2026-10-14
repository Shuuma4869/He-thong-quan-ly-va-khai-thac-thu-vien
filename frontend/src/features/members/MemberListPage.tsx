import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { getMembers, memberQueryParams, parseMemberQuery, statusLabels, type MemberQuery } from './member-api';
import { MemberRequestError } from './MemberRequestError';
import { MemberSearch } from './MemberSearch';

export function MemberListPage() {
  const [params, setParams] = useSearchParams();
  const parsed = parseMemberQuery(params);
  return <section aria-labelledby="members-heading">
    <p className="eyebrow">Tra cứu</p><h1 id="members-heading" className="page-title">Thành viên</h1>
    <p className="mt-2 text-muted">Tra cứu tài khoản theo mã hoặc họ tên. Danh sách chỉ hỗ trợ xem.</p>
    {parsed.success ? <MemberResults value={parsed.data} onNavigate={setParams} />
      : <div role="alert" className="editorial-card mt-5">
        <p>Bộ lọc trong đường dẫn không hợp lệ. Kiểm tra trang, số dòng, trạng thái và cách sắp xếp.</p>
        <button type="button" className="button-secondary mt-4" onClick={() => setParams({})}>Đặt lại bộ lọc</button>
      </div>}
  </section>;
}

function MemberResults({ value, onNavigate }: {
  value: MemberQuery; onNavigate: (params: URLSearchParams) => void;
}) {
  const { user } = useAuth();
  const { query, status, page, size, sort } = value;
  const update = useCallback((patch: Partial<MemberQuery>) => {
    onNavigate(memberQueryParams({ query, status, page, size, sort, ...patch }));
  }, [query, status, page, size, sort, onNavigate]);
  const result = useQuery({
    queryKey: ['members', user?.id, query, status, page, size, sort],
    queryFn: ({ signal }) => getMembers(value, signal),
    retry: false, staleTime: 0,
  });
  return <>
    <MemberSearch value={value} onChange={update} />
    {result.isPending ? <p role="status" className="py-8">Đang tải danh sách thành viên…</p>
      : result.isError ? <MemberRequestError error={result.error} retry={() => void result.refetch()} />
      : <>
        <p role="status" className="my-4 text-sm text-muted">Tổng cộng {result.data.page.totalElements} thành viên
          {result.isFetching ? ' · Đang cập nhật…' : ''}</p>
        {result.data.items.length === 0 ? <div className="editorial-card empty-state compact">
          <h2>Không có thành viên phù hợp</h2>
          <p>Thử đổi từ khóa, xóa bộ lọc hoặc quay về trang đầu.</p>
          {page > 0 && <button type="button" className="button-secondary" onClick={() => update({ page: 0 })}>Về trang đầu</button>}
        </div> : <div className="member-table-wrap" tabIndex={0} role="region" aria-label="Danh sách thành viên, cuộn ngang để xem đủ cột">
          <table className="member-table">
            <caption className="sr-only">Thành viên theo bộ lọc hiện tại</caption>
            <thead><tr><th scope="col">Mã thành viên</th><th scope="col">Họ và tên</th><th scope="col">Trạng thái</th></tr></thead>
            <tbody>{result.data.items.map(member => <tr key={member.userId}>
              <td>{member.memberCode}</td><td>{member.fullName}</td><td>{statusLabels[member.status]}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <nav className="mt-5 flex flex-wrap items-center gap-3" aria-label="Phân trang thành viên">
          <button type="button" className="button-secondary" disabled={page === 0}
            onClick={() => update({ page: page - 1 })}>Trang trước</button>
          <span className="text-sm">Trang {page + 1} / {Math.max(1, result.data.page.totalPages)}</span>
          <button type="button" className="button-secondary" disabled={page + 1 >= result.data.page.totalPages}
            onClick={() => update({ page: page + 1 })}>Trang sau</button>
          <label className="field">Số dòng mỗi trang
            <select value={size} onChange={event => update({ size: Number(event.target.value), page: 0 })}>
              {[...new Set([10, 20, 50, 100, size])].sort((a, b) => a - b)
                .map(amount => <option key={amount} value={amount}>{amount}</option>)}
            </select>
          </label>
        </nav>
      </>}
  </>;
}
