import { useEffect, useState } from 'react';
import { type MemberQuery, statusLabels } from './member-api';

export function MemberSearch({ value, onChange }: {
  value: MemberQuery; onChange: (patch: Partial<MemberQuery>) => void;
}) {
  const [draft, setDraft] = useState(value.query);
  const [syncedQuery, setSyncedQuery] = useState(value.query);
  if (syncedQuery !== value.query) {
    setSyncedQuery(value.query);
    setDraft(value.query);
  }
  useEffect(() => {
    if (draft.trim() === value.query) return;
    const timer = window.setTimeout(() => onChange({ query: draft.trim(), page: 0 }), 350);
    return () => window.clearTimeout(timer);
  }, [draft, value.query, onChange]);
  return <form className="member-filters" role="search" onSubmit={event => {
    event.preventDefault(); onChange({ query: draft.trim(), page: 0 });
  }}>
    <label className="field min-w-0 flex-1">Tìm theo mã hoặc họ tên
      <input type="search" value={draft} maxLength={150} onChange={event => setDraft(event.target.value)}
        placeholder="Nhập mã thành viên hoặc họ tên" />
    </label>
    <label className="field">Trạng thái
      <select value={value.status} onChange={event => onChange({
        query: draft.trim(), status: event.target.value as MemberQuery['status'], page: 0,
      })}>
        <option value="">Tất cả trạng thái</option>
        {Object.entries(statusLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
      </select>
    </label>
    <label className="field">Sắp xếp
      <select value={value.sort} onChange={event => onChange({
        query: draft.trim(), sort: event.target.value as MemberQuery['sort'], page: 0,
      })}>
        <option value="memberCode,asc">Mã thành viên tăng dần</option>
        <option value="memberCode,desc">Mã thành viên giảm dần</option>
        <option value="fullName,asc">Họ tên A–Z</option>
        <option value="fullName,desc">Họ tên Z–A</option>
      </select>
    </label>
    <button className="button-secondary" type="button" onClick={() => {
      setDraft(''); onChange({ query: '', status: '', page: 0 });
    }}>Xóa bộ lọc</button>
  </form>;
}
